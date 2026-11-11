from typing import Any, Callable, Literal, Optional, TypeVar
import anyio
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastmcp import Context
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_http_headers, get_http_request
from sqlalchemy.orm import Session

from app.api.deps import get_user_roles, is_admin_or_hr, is_manager_or_above
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import decode_token
from app.models import User

AuthLevel = Literal["none", "optional", "user", "manager", "admin", "superuser"]
T = TypeVar("T")

_stdio_mode_enabled: bool = False
_stdio_session_token: Optional[str] = None


def enable_stdio_session_auth(enabled: bool = True) -> None:
    """Enables process-scoped session token caching for dedicated local stdio sessions."""
    global _stdio_mode_enabled
    _stdio_mode_enabled = enabled


def set_stdio_session_token(token: Optional[str]) -> None:
    global _stdio_session_token
    if _stdio_mode_enabled:
        _stdio_session_token = token


def clear_stdio_session_token() -> None:
    global _stdio_session_token
    _stdio_session_token = None


def is_http_transport(ctx: Optional[Context]) -> bool:
    if ctx is not None and ctx.transport in ("http", "streamable-http", "sse"):
        return True
    try:
        get_http_request()
        return True
    except RuntimeError:
        return False


def _extract_bearer_token() -> Optional[str]:
    headers = get_http_headers(include={"authorization"})
    auth_header = headers.get("authorization")
    if not auth_header:
        return None
    parts = auth_header.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise ToolError("Invalid Authorization header; expected 'Bearer <token>'.")
    return parts[1].strip()


def _normalize_token(raw_token: Optional[str]) -> Optional[str]:
    if not raw_token:
        return None
    cleaned = raw_token.strip()
    if cleaned.lower().startswith("bearer "):
        cleaned = cleaned[7:].strip()
    return cleaned or None


async def _gather_auth_context(
    ctx: Optional[Context],
    access_token: Optional[str],
) -> tuple[Optional[str], bool]:
    is_http = is_http_transport(ctx)
    token = _normalize_token(access_token)
    if not token:
        token = _extract_bearer_token()
    if not token and ctx is not None:
        try:
            state_token = await ctx.get_state("access_token")
            if isinstance(state_token, str):
                token = _normalize_token(state_token)
        except Exception:
            pass
    if not token and not is_http and _stdio_mode_enabled:
        token = _normalize_token(_stdio_session_token)
    return token, is_http


def _resolve_user_from_db(
    db: Session,
    token: Optional[str],
    is_http: bool,
    auth_level: AuthLevel,
) -> Optional[User]:
    if auth_level == "none":
        return None

    user: Optional[User] = None
    if token:
        payload = decode_token(token)
        if not payload or not payload.get("sub"):
            raise ToolError("Invalid or expired access token.")
        user = db.query(User).filter(User.id == payload["sub"]).first()
        if not user:
            raise ToolError("Authenticated user no longer exists.")
        if not user.is_active:
            raise ToolError("Inactive user account.")
    elif settings.MCP_DEFAULT_USER_EMAIL and (
        not is_http or settings.MCP_ALLOW_HTTP_DEFAULT_USER
    ):
        identifier = settings.MCP_DEFAULT_USER_EMAIL.strip()
        user = (
            db.query(User)
            .filter((User.email == identifier) | (User.username == identifier))
            .first()
        )
        if not user:
            raise ToolError(
                f"Configured MCP_DEFAULT_USER_EMAIL '{identifier}' was not found."
            )
        if not user.is_active:
            raise ToolError("Configured default MCP user account is inactive.")

    if user is None:
        if auth_level == "optional":
            return None
        raise ToolError(
            "Authentication required. Call auth_login(username_or_email, password), "
            "pass access_token / Authorization Bearer header, or set MCP_DEFAULT_USER_EMAIL "
            "for local stdio."
        )

    if auth_level == "manager" and not is_manager_or_above(user):
        raise ToolError("Manager privileges required (LINE_MANAGER, HR_MANAGER, or ADMIN).")
    if auth_level == "admin" and not is_admin_or_hr(user):
        raise ToolError("Administrative privileges required (HR_MANAGER or ADMIN).")
    if auth_level == "superuser":
        roles = get_user_roles(user)
        if not user.is_superuser and "ADMIN" not in roles:
            raise ToolError("Only system administrators (ADMIN) can perform this action.")

    return user


async def run_mcp_op(
    fn: Callable[[Session, Optional[User]], T],
    *,
    ctx: Optional[Context] = None,
    access_token: Optional[str] = None,
    auth_level: AuthLevel = "user",
) -> Any:
    """Executes a synchronous database/service operation safely with RBAC and error mapping."""
    token, is_http = await _gather_auth_context(ctx, access_token)

    def _execute() -> Any:
        db = SessionLocal()
        try:
            user = _resolve_user_from_db(db, token, is_http, auth_level)
            result = fn(db, user)
            return jsonable_encoder(result)
        except HTTPException as exc:
            raise ToolError(str(exc.detail)) from exc
        finally:
            db.close()

    return await anyio.to_thread.run_sync(_execute)

