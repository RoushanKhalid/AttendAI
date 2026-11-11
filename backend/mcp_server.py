import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

from app.core.config import settings
from app.core.init_db import init_db
from app.core.logging import logger, setup_logging
from app.mcp.auth import enable_stdio_session_auth
from app.mcp.server import mcp


def main() -> None:
    parser = argparse.ArgumentParser(description="AttendAI FastMCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "http"],
        default="stdio",
        help="MCP transport protocol (default: stdio)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind host for HTTP transport (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8001,
        help="Bind port for standalone HTTP transport (default: 8001)",
    )
    parser.add_argument(
        "--user",
        default=None,
        help="Optional default user email/username for local stdio authentication",
    )
    args = parser.parse_args()

    # In stdio mode, stdout is strictly reserved for JSON-RPC frames.
    setup_logging(stream=sys.stderr if args.transport == "stdio" else sys.stdout)

    if args.user:
        settings.MCP_DEFAULT_USER_EMAIL = args.user

    try:
        init_db()
    except Exception as exc:
        logger.error("Database initialization warning during MCP startup: %s", exc)

    if args.transport == "stdio":
        enable_stdio_session_auth(True)
        mcp.run(transport="stdio", show_banner=False)
    else:
        mcp.run(
            transport="http",
            host=args.host,
            port=args.port,
            path=settings.MCP_PATH,
        )


if __name__ == "__main__":
    main()

