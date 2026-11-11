import asyncio
import json
import sys
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastmcp import Client
from fastmcp.client.transports import StdioTransport, StreamableHttpTransport
from fastmcp.exceptions import ToolError

from app.core.cache import cache_manager
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.main import app
from app.mcp import mcp
from app.models import (
    AttendanceLog,
    AuditLog,
    DailyAttendance,
    Employee,
    Holiday,
    LeaveRequest,
    RegularizationRequest,
    Shift,
    User,
    UserRole,
)


def _cleanup_entities(
    *,
    employee_ids: list[str] | None = None,
    user_ids: list[str] | None = None,
    shift_ids: list[str] | None = None,
    holiday_ids: list[str] | None = None,
) -> None:
    db = SessionLocal()
    try:
        if employee_ids:
            db.query(RegularizationRequest).filter(
                RegularizationRequest.employee_id.in_(employee_ids)
            ).delete(synchronize_session=False)
            db.query(LeaveRequest).filter(
                LeaveRequest.employee_id.in_(employee_ids)
            ).delete(synchronize_session=False)
            db.query(AttendanceLog).filter(
                AttendanceLog.employee_id.in_(employee_ids)
            ).delete(synchronize_session=False)
            db.query(DailyAttendance).filter(
                DailyAttendance.employee_id.in_(employee_ids)
            ).delete(synchronize_session=False)
            for emp_id in employee_ids:
                cache_manager.delete(f"attendance:debounce:{emp_id}")
        if user_ids:
            db.query(AuditLog).filter(AuditLog.user_id.in_(user_ids)).delete(
                synchronize_session=False
            )
            db.query(UserRole).filter(UserRole.user_id.in_(user_ids)).delete(
                synchronize_session=False
            )
            db.query(User).filter(User.id.in_(user_ids)).delete(
                synchronize_session=False
            )
        if employee_ids:
            db.query(Employee).filter(Employee.id.in_(employee_ids)).delete(
                synchronize_session=False
            )
        if holiday_ids:
            db.query(Holiday).filter(Holiday.id.in_(holiday_ids)).delete(
                synchronize_session=False
            )
        if shift_ids:
            db.query(Shift).filter(Shift.id.in_(shift_ids)).delete(
                synchronize_session=False
            )
        db.commit()
    finally:
        db.close()


def test_mcp_catalog_resources_and_prompts():
    async def _run():
        async with Client(mcp) as client:
            tools = await client.list_tools()
            tool_names = {t.name for t in tools}
            expected_tools = {
                "auth_login",
                "auth_whoami",
                "auth_logout",
                "get_dashboard_summary",
                "list_org_metadata",
                "list_employees",
                "create_employee",
                "get_daily_attendance",
                "record_manual_punch",
                "regularize_attendance",
                "list_shifts",
                "create_shift",
                "apply_leave",
                "review_leave",
                "list_holidays",
                "get_monthly_attendance_report",
                "export_attendance_csv",
                "get_system_preferences",
            }
            assert expected_tools.issubset(tool_names)

            resources = await client.list_resources()
            resource_uris = {str(r.uri) for r in resources}
            assert {
                "attendai://dashboard/today",
                "attendai://organization/structure",
                "attendai://settings/preferences",
                "attendai://attendance/missing-punches/today",
            }.issubset(resource_uris)

            dash_res = await client.read_resource("attendai://dashboard/today")
            dash_data = json.loads(dash_res[0].text)
            assert "total_employees" in dash_data
            assert "department_stats" in dash_data

            org_res = await client.read_resource("attendai://organization/structure")
            org_data = json.loads(org_res[0].text)
            assert len(org_data["branches"]) >= 1
            assert len(org_data["departments"]) >= 1
            assert len(org_data["shifts"]) >= 1

            prompts = await client.list_prompts()
            prompt_names = {p.name for p in prompts}
            assert {"daily_attendance_briefing", "employee_monthly_review"}.issubset(
                prompt_names
            )

            briefing = await client.get_prompt(
                "daily_attendance_briefing", {"target_date": "2026-11-11"}
            )
            assert "2026-11-11" in briefing.messages[0].content.text

    asyncio.run(_run())


def test_mcp_flexible_auth_and_rbac():
    orig_default = settings.MCP_DEFAULT_USER_EMAIL
    orig_http_default = settings.MCP_ALLOW_HTTP_DEFAULT_USER
    created_emps: list[str] = []
    created_users: list[str] = []

    async def _run():
        settings.MCP_DEFAULT_USER_EMAIL = None
        settings.MCP_ALLOW_HTTP_DEFAULT_USER = False

        async with Client(mcp) as client:
            # 1. Unauthenticated protected call fails
            with pytest.raises(ToolError):
                await client.call_tool("list_employees", {})

            # 2. Invalid token fails even on optional-auth endpoints
            with pytest.raises(ToolError):
                await client.call_tool(
                    "auth_whoami", {"access_token": "not-a-valid-jwt"}
                )

            # 3. Default env user works in local non-HTTP mode
            settings.MCP_DEFAULT_USER_EMAIL = "admin@company.com"
            whoami_default = (await client.call_tool("auth_whoami", {})).data
            assert whoami_default["authenticated"] is True
            assert "ADMIN" in whoami_default["user"]["roles"]

            # 4. Login as admin and create an EMPLOYEE user + two employees to verify RBAC
            settings.MCP_DEFAULT_USER_EMAIL = None
            login_res = (
                await client.call_tool(
                    "auth_login",
                    {
                        "username_or_email": settings.DEFAULT_ADMIN_EMAIL,
                        "password": settings.DEFAULT_ADMIN_PASSWORD,
                    },
                )
            ).data
            admin_token = login_res["access_token"]

            meta = (await client.call_tool("list_org_metadata", {})).data
            branch_id = meta["branches"][0]["id"]
            dept_id = meta["departments"][0]["id"]
            shift_id = meta["shifts"][0]["id"]

            uid = uuid.uuid4().hex[:6]
            emp1 = (
                await client.call_tool(
                    "create_employee",
                    {
                        "employee_code": f"MCP-E1-{uid}",
                        "first_name": "Self",
                        "last_name": "Worker",
                        "email": f"mcp.self.{uid}@company.com",
                        "branch_id": branch_id,
                        "department_id": dept_id,
                        "default_shift_id": shift_id,
                        "access_token": admin_token,
                    },
                )
            ).data
            emp2 = (
                await client.call_tool(
                    "create_employee",
                    {
                        "employee_code": f"MCP-E2-{uid}",
                        "first_name": "Other",
                        "last_name": "Worker",
                        "email": f"mcp.other.{uid}@company.com",
                        "branch_id": branch_id,
                        "department_id": dept_id,
                        "default_shift_id": shift_id,
                        "access_token": admin_token,
                    },
                )
            ).data
            created_emps.extend([emp1["id"], emp2["id"]])

            # Create linked EMPLOYEE user directly via DB helper
            from app.core.security import get_password_hash
            from app.models import Role

            db = SessionLocal()
            try:
                emp_role = db.query(Role).filter(Role.name == "EMPLOYEE").first()
                emp_user = User(
                    username=f"mcp_emp_{uid}",
                    email=f"mcp.user.{uid}@company.com",
                    full_name="Self Worker",
                    password_hash=get_password_hash("secret123"),
                    is_active=True,
                    is_superuser=False,
                    employee_id=emp1["id"],
                )
                db.add(emp_user)
                db.flush()
                db.add(UserRole(user_id=emp_user.id, role_id=emp_role.id))
                db.commit()
                created_users.append(emp_user.id)
            finally:
                db.close()

            emp_login = (
                await client.call_tool(
                    "auth_login",
                    {
                        "username_or_email": f"mcp.user.{uid}@company.com",
                        "password": "secret123",
                    },
                )
            ).data
            emp_token = emp_login["access_token"]

            # EMPLOYEE cannot list directory or export CSV
            with pytest.raises(ToolError):
                await client.call_tool(
                    "list_employees", {"access_token": emp_token}
                )
            with pytest.raises(ToolError):
                await client.call_tool(
                    "export_attendance_csv", {"access_token": emp_token}
                )

            # EMPLOYEE can apply leave for self, blocked for another employee
            self_leave = (
                await client.call_tool(
                    "apply_leave",
                    {
                        "employee_id": emp1["id"],
                        "start_date": date.today().isoformat(),
                        "end_date": date.today().isoformat(),
                        "leave_type": "CASUAL",
                        "reason": "Doctor visit",
                        "access_token": emp_token,
                    },
                )
            ).data
            assert self_leave["status"] == "PENDING"

            with pytest.raises(ToolError):
                await client.call_tool(
                    "apply_leave",
                    {
                        "employee_id": emp2["id"],
                        "start_date": date.today().isoformat(),
                        "end_date": date.today().isoformat(),
                        "leave_type": "CASUAL",
                        "reason": "Unauthorized",
                        "access_token": emp_token,
                    },
                )

    try:
        asyncio.run(_run())
    finally:
        settings.MCP_DEFAULT_USER_EMAIL = orig_default
        settings.MCP_ALLOW_HTTP_DEFAULT_USER = orig_http_default
        _cleanup_entities(employee_ids=created_emps, user_ids=created_users)


def test_mcp_end_to_end_workforce_workflows():
    created_emps: list[str] = []
    created_shifts: list[str] = []
    created_holidays: list[str] = []

    async def _run():
        async with Client(mcp) as client:
            login_res = (
                await client.call_tool(
                    "auth_login",
                    {
                        "username_or_email": settings.DEFAULT_ADMIN_EMAIL,
                        "password": settings.DEFAULT_ADMIN_PASSWORD,
                    },
                )
            ).data
            token = login_res["access_token"]

            meta = (await client.call_tool("list_org_metadata", {})).data
            branch_id = meta["branches"][0]["id"]
            dept_id = meta["departments"][0]["id"]
            shift_id = meta["shifts"][0]["id"]

            uid = uuid.uuid4().hex[:6]
            emp = (
                await client.call_tool(
                    "create_employee",
                    {
                        "employee_code": f"MCP-WF-{uid}",
                        "first_name": "Elena",
                        "last_name": "Rostova",
                        "email": f"elena.{uid}@company.com",
                        "designation": "Engineer",
                        "branch_id": branch_id,
                        "department_id": dept_id,
                        "default_shift_id": shift_id,
                        "access_token": token,
                    },
                )
            ).data
            emp_id = emp["id"]
            created_emps.append(emp_id)

            updated = (
                await client.call_tool(
                    "update_employee",
                    {
                        "employee_id": emp_id,
                        "designation": "Staff Engineer",
                        "access_token": token,
                    },
                )
            ).data
            assert updated["designation"] == "Staff Engineer"

            face_status = (
                await client.call_tool(
                    "get_face_enrollment_status", {"employee_id": emp_id}
                )
            ).data
            assert face_status["has_active_template"] is False

            # Manual punch + logs + daily
            punch = (
                await client.call_tool(
                    "record_manual_punch",
                    {"employee_id": emp_id, "access_token": token},
                )
            ).data
            assert punch["success"] is True

            logs = (
                await client.call_tool(
                    "get_attendance_logs",
                    {"employee_id": emp_id, "access_token": token},
                )
            ).data
            assert len(logs) >= 1

            # Regularization + audit logs
            reg_date = (date.today() - timedelta(days=3)).isoformat()
            reg = (
                await client.call_tool(
                    "regularize_attendance",
                    {
                        "employee_id": emp_id,
                        "attendance_date": reg_date,
                        "check_in_time": f"{reg_date}T09:00:00",
                        "check_out_time": f"{reg_date}T18:00:00",
                        "status": "PRESENT",
                        "reason": "MCP test correction",
                        "access_token": token,
                    },
                )
            ).data
            assert reg["success"] is True

            audits = (
                await client.call_tool(
                    "get_audit_logs",
                    {"action": "ATTENDANCE_REGULARIZATION", "access_token": token},
                )
            ).data
            assert any(a["id"] == reg["audit_log_id"] for a in audits)

            # Leave apply & approval
            leave_dt = (date.today() + timedelta(days=10)).isoformat()
            leave = (
                await client.call_tool(
                    "apply_leave",
                    {
                        "employee_id": emp_id,
                        "start_date": leave_dt,
                        "end_date": leave_dt,
                        "leave_type": "ANNUAL",
                        "reason": "Vacation",
                        "access_token": token,
                    },
                )
            ).data
            reviewed = (
                await client.call_tool(
                    "review_leave",
                    {
                        "leave_id": leave["id"],
                        "status": "APPROVED",
                        "access_token": token,
                    },
                )
            ).data
            assert reviewed["status"] == "APPROVED"

            usage = (
                await client.call_tool(
                    "get_leave_usage_summary",
                    {"employee_id": emp_id, "access_token": token},
                )
            ).data
            assert len(usage) == 1 and usage[0]["ANNUAL"] == 1

            # Shift CRUD
            shift = (
                await client.call_tool(
                    "create_shift",
                    {
                        "name": f"MCP Shift {uid}",
                        "code": f"MS-{uid}",
                        "start_time": "10:00:00",
                        "end_time": "19:00:00",
                        "access_token": token,
                    },
                )
            ).data
            created_shifts.append(shift["id"])
            shift_upd = (
                await client.call_tool(
                    "update_shift",
                    {
                        "shift_id": shift["id"],
                        "grace_period_mins": 20,
                        "access_token": token,
                    },
                )
            ).data
            assert shift_upd["grace_period_mins"] == 20
            del_shift = (
                await client.call_tool(
                    "delete_shift", {"shift_id": shift["id"], "access_token": token}
                )
            ).data
            assert del_shift["success"] is True
            created_shifts.remove(shift["id"])

            # Holiday CRUD
            hol_dt = f"{date.today().year}-12-26"
            hol = (
                await client.call_tool(
                    "create_holiday",
                    {
                        "branch_id": branch_id,
                        "holiday_date": hol_dt,
                        "name": f"MCP Holiday {uid}",
                        "access_token": token,
                    },
                )
            ).data
            created_holidays.append(hol["id"])
            del_hol = (
                await client.call_tool(
                    "delete_holiday", {"holiday_id": hol["id"], "access_token": token}
                )
            ).data
            assert del_hol["success"] is True
            created_holidays.remove(hol["id"])

            # Reports & Settings
            report = (
                await client.call_tool(
                    "get_monthly_attendance_report",
                    {
                        "year": date.today().year,
                        "month": date.today().month,
                        "access_token": token,
                    },
                )
            ).data
            assert report["total_employees"] >= 1

            csv_res = (
                await client.call_tool(
                    "export_attendance_csv",
                    {
                        "year": date.today().year,
                        "month": date.today().month,
                        "access_token": token,
                    },
                )
            ).data
            assert "Employee Code,Employee Name" in csv_res["csv_content"]

            org_info = (
                await client.call_tool("get_organization_info", {"access_token": token})
            ).data
            assert "name" in org_info

            prefs = (await client.call_tool("get_system_preferences", {})).data
            assert "kiosk" in prefs and "attendance_rules" in prefs

            # Soft deactivate
            deact = (
                await client.call_tool(
                    "deactivate_employee",
                    {"employee_id": emp_id, "permanent": False, "access_token": token},
                )
            ).data
            assert deact["success"] is True

    try:
        asyncio.run(_run())
    finally:
        _cleanup_entities(
            employee_ids=created_emps,
            shift_ids=created_shifts,
            holiday_ids=created_holidays,
        )


def test_mcp_mounted_streamable_http_endpoint():
    orig_default = settings.MCP_DEFAULT_USER_EMAIL
    orig_http_default = settings.MCP_ALLOW_HTTP_DEFAULT_USER

    async def _run():
        settings.MCP_DEFAULT_USER_EMAIL = "admin@company.com"
        settings.MCP_ALLOW_HTTP_DEFAULT_USER = False

        db = SessionLocal()
        try:
            admin = db.query(User).filter(User.email == settings.DEFAULT_ADMIN_EMAIL).first()
            assert admin is not None
            token = create_access_token(admin.id)
        finally:
            db.close()

        async with app.router.lifespan_context(app):
            # 1. Verify FastAPI root advertises /mcp and health works
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://testserver"
            ) as http_client:
                root_res = await http_client.get("/")
                assert root_res.status_code == 200
                assert root_res.json()["mcp_url"] == "/mcp"
                assert (await http_client.get("/health")).status_code == 200

            # 2. Unauthenticated HTTP /mcp refuses protected calls even when MCP_DEFAULT_USER_EMAIL is set
            unauth_transport = StreamableHttpTransport(
                url="http://testserver/mcp",
                httpx_client_factory=lambda **kw: httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app), **kw
                ),
            )
            async with Client(unauth_transport) as client:
                dash = (await client.call_tool("get_dashboard_summary", {})).data
                assert "total_employees" in dash
                with pytest.raises(ToolError):
                    await client.call_tool("list_employees", {})

            # 3. Authenticated HTTP /mcp using Authorization: Bearer <token>
            auth_transport = StreamableHttpTransport(
                url="http://testserver/mcp",
                headers={"Authorization": f"Bearer {token}"},
                httpx_client_factory=lambda **kw: httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app), **kw
                ),
            )
            async with Client(auth_transport) as client:
                whoami = (await client.call_tool("auth_whoami", {})).data
                assert whoami["authenticated"] is True
                assert whoami["user"]["email"] == settings.DEFAULT_ADMIN_EMAIL

                emps = (await client.call_tool("list_employees", {"limit": 5})).data
                assert isinstance(emps, list)

    try:
        asyncio.run(_run())
    finally:
        settings.MCP_DEFAULT_USER_EMAIL = orig_default
        settings.MCP_ALLOW_HTTP_DEFAULT_USER = orig_http_default


def test_mcp_stdio_subprocess_transport():
    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "backend" / "mcp_server.py"

    async def _run():
        # 1. With --user default local stdio user
        transport = StdioTransport(
            command=sys.executable,
            args=[str(script_path), "--transport", "stdio", "--user", "admin@company.com"],
            cwd=str(repo_root),
        )
        async with Client(transport) as client:
            whoami = (await client.call_tool("auth_whoami", {})).data
            assert whoami["authenticated"] is True
            assert whoami["user"]["email"] == "admin@company.com"

            dash = (await client.call_tool("get_dashboard_summary", {})).data
            assert "total_employees" in dash

            meta = (await client.call_tool("list_org_metadata", {})).data
            assert len(meta["branches"]) >= 1

        # 2. Without --user: auth_login persists across calls in the same stdio subprocess, and auth_logout clears it
        session_transport = StdioTransport(
            command=sys.executable,
            args=[str(script_path), "--transport", "stdio"],
            cwd=str(repo_root),
        )
        async with Client(session_transport) as client:
            before = (await client.call_tool("auth_whoami", {})).data
            assert before["authenticated"] is False

            await client.call_tool(
                "auth_login",
                {
                    "username_or_email": settings.DEFAULT_ADMIN_EMAIL,
                    "password": settings.DEFAULT_ADMIN_PASSWORD,
                },
            )
            after = (await client.call_tool("auth_whoami", {})).data
            assert after["authenticated"] is True
            assert after["user"]["email"] == settings.DEFAULT_ADMIN_EMAIL

            emps = (await client.call_tool("list_employees", {"limit": 5})).data
            assert isinstance(emps, list)

            await client.call_tool("auth_logout", {})
            logged_out = (await client.call_tool("auth_whoami", {})).data
            assert logged_out["authenticated"] is False

    asyncio.run(_run())
