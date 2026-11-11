import json
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Type

from fastmcp import Context, FastMCP
from fastmcp.exceptions import ToolError
from pydantic import BaseModel, ValidationError

from app.api import attendance as api_attendance
from app.api import auth as api_auth
from app.api import dashboard as api_dashboard
from app.api import employees as api_employees
from app.api import face as api_face
from app.api import holidays as api_holidays
from app.api import leaves as api_leaves
from app.api import reports as api_reports
from app.api import settings as api_settings
from app.api import shifts as api_shifts
from app.core.config import settings
from app.mcp.auth import (
    clear_stdio_session_token,
    is_http_transport,
    run_mcp_op,
    set_stdio_session_token,
)
from app.schemas.attendance import (
    AttendancePunchRequest,
    AttendanceRegularizationRequest,
    RegularizationRequestCreate,
    RegularizationReviewRequest,
)
from app.schemas.auth import LoginRequest
from app.schemas.employee import (
    BranchOut,
    DepartmentOut,
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    ShiftOut as EmployeeShiftOut,
)
from app.schemas.holiday import HolidayCreate
from app.schemas.leave import LeaveRequestCreate, LeaveStatusUpdate
from app.schemas.shift import ShiftCreate, ShiftOut, ShiftUpdate

mcp = FastMCP(
    name=settings.MCP_SERVER_NAME,
    instructions=(
        "AttendAI MCP Server for workforce attendance, employee directory, shift scheduling, "
        "leave approvals, attendance regularization, and statutory reporting. "
        "For protected operations, authenticate via auth_login, pass access_token / an "
        "Authorization Bearer header, or configure MCP_DEFAULT_USER_EMAIL for local stdio."
    ),
)


def _validate_payload(schema_cls: Type[BaseModel], **kwargs: Any) -> Any:
    """Builds a Pydantic schema and translates validation failures into ToolError."""
    try:
        return schema_cls(**kwargs)
    except ValidationError as exc:
        raise ToolError(f"Invalid input: {exc}") from exc


def _serialize_models(items: List[Any], schema_cls: Type[BaseModel]) -> List[BaseModel]:
    """Converts ORM model instances into validated Pydantic output models."""
    return [schema_cls.model_validate(item) for item in items]


# ---------------------------------------------------------------------------
# Authentication & Session Tools
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": False})
async def auth_login(
    username_or_email: str,
    password: str,
    ctx: Context,
) -> Dict[str, Any]:
    """Authenticate an AttendAI user and return a JWT access token with role claims."""
    payload = _validate_payload(
        LoginRequest,
        username_or_email=username_or_email,
        password=password,
    )
    result = await run_mcp_op(
        lambda db, _user: api_auth.login(payload=payload, db=db),
        ctx=ctx,
        auth_level="none",
    )
    token = result.get("access_token")
    if token:
        try:
            await ctx.set_state("access_token", token)
        except Exception:
            pass
        if not is_http_transport(ctx):
            set_stdio_session_token(token)
    return result


@mcp.tool(annotations={"readOnlyHint": True})
async def auth_whoami(
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Return the currently authenticated user's profile and RBAC roles, if any."""

    def _op(db, user):
        if user is None:
            return {"authenticated": False, "user": None}
        return {
            "authenticated": True,
            "user": api_auth.get_current_user_profile(current_user=user),
        }

    return await run_mcp_op(_op, ctx=ctx, access_token=access_token, auth_level="optional")


@mcp.tool(annotations={"readOnlyHint": False})
async def auth_logout(ctx: Context) -> Dict[str, Any]:
    """Clear any session-cached access token for the current MCP session."""
    clear_stdio_session_token()
    try:
        await ctx.delete_state("access_token")
    except Exception:
        pass
    return {"success": True, "message": "MCP session credentials cleared."}


# ---------------------------------------------------------------------------
# Dashboard & Organization Metadata Tools
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": True})
async def get_dashboard_summary(
    target_date: Optional[date] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Return live attendance KPIs, department breakdown, and the latest 10 punches."""
    return await run_mcp_op(
        lambda db, _user: api_dashboard.get_dashboard_summary(target_date=target_date, db=db),
        ctx=ctx,
        auth_level="none",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def list_org_metadata(
    branch_id: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """List branches, departments, and shifts so valid IDs are available for other tools."""

    def _op(db, _user):
        branches = api_employees.get_branches(db=db)
        departments = api_employees.get_departments(branch_id=branch_id, db=db)
        shifts = api_employees.get_shifts(db=db)
        return {
            "branches": _serialize_models(branches, BranchOut),
            "departments": _serialize_models(departments, DepartmentOut),
            "shifts": _serialize_models(shifts, EmployeeShiftOut),
        }

    return await run_mcp_op(_op, ctx=ctx, auth_level="none")


# ---------------------------------------------------------------------------
# Employee Directory & Biometric Status Tools
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": True})
async def list_employees(
    search: Optional[str] = None,
    department_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """List employees with optional search, branch/department/status filters (Manager+ only)."""

    def _op(db, user):
        rows = api_employees.list_employees(
            search=search,
            department_id=department_id,
            branch_id=branch_id,
            status=status,
            skip=skip,
            limit=limit,
            db=db,
            admin=user,
        )
        return _serialize_models(rows, EmployeeOut)

    return await run_mcp_op(_op, ctx=ctx, access_token=access_token, auth_level="manager")


@mcp.tool(annotations={"readOnlyHint": True})
async def get_employee(
    employee_id: str,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Get full profile details for a single employee by ID (Manager+ only)."""
    return await run_mcp_op(
        lambda db, user: EmployeeOut.model_validate(
            api_employees.get_employee(employee_id=employee_id, db=db, admin=user)
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="manager",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def create_employee(
    employee_code: str,
    first_name: str,
    last_name: str,
    email: str,
    branch_id: str,
    department_id: str,
    default_shift_id: str,
    phone: Optional[str] = None,
    designation: Optional[str] = None,
    hire_date: Optional[date] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Create a new employee record (Admin or HR Manager only)."""
    payload = _validate_payload(
        EmployeeCreate,
        employee_code=employee_code,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        designation=designation,
        branch_id=branch_id,
        department_id=department_id,
        default_shift_id=default_shift_id,
        hire_date=hire_date,
    )
    return await run_mcp_op(
        lambda db, user: EmployeeOut.model_validate(
            api_employees.create_employee(payload=payload, db=db, admin=user)
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def update_employee(
    employee_id: str,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    designation: Optional[str] = None,
    branch_id: Optional[str] = None,
    department_id: Optional[str] = None,
    default_shift_id: Optional[str] = None,
    status: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Update an existing employee's details or employment status (Admin or HR Manager only)."""
    fields = {
        k: v
        for k, v in {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "phone": phone,
            "designation": designation,
            "branch_id": branch_id,
            "department_id": department_id,
            "default_shift_id": default_shift_id,
            "status": status,
        }.items()
        if v is not None
    }
    payload = _validate_payload(EmployeeUpdate, **fields)
    return await run_mcp_op(
        lambda db, user: EmployeeOut.model_validate(
            api_employees.update_employee(
                employee_id=employee_id, payload=payload, db=db, admin=user
            )
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"destructiveHint": True})
async def deactivate_employee(
    employee_id: str,
    permanent: bool = False,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Deactivate an employee (and disable biometrics) or permanently purge them (Admin/HR only)."""
    return await run_mcp_op(
        lambda db, user: api_employees.delete_or_deactivate_employee(
            employee_id=employee_id, permanent=permanent, db=db, admin=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def get_face_enrollment_status(
    employee_id: str,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Check whether an employee has an active enrolled face template (no raw vectors exposed)."""
    return await run_mcp_op(
        lambda db, _user: api_face.get_enrollment_status(employee_id=employee_id, db=db),
        ctx=ctx,
        auth_level="none",
    )


# ---------------------------------------------------------------------------
# Attendance, Punching, Regularization & Audit Tools
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": True})
async def get_daily_attendance(
    target_date: Optional[date] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    employee_id: Optional[str] = None,
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    missing_punch_only: bool = False,
    skip: int = 0,
    limit: int = 200,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """Retrieve aggregated daily attendance records (automatically scoped to self for EMPLOYEE role)."""
    return await run_mcp_op(
        lambda db, user: api_attendance.get_daily_attendance(
            target_date=target_date,
            start_date=start_date,
            end_date=end_date,
            employee_id=employee_id,
            department_id=department_id,
            status=status,
            search=search,
            missing_punch_only=missing_punch_only,
            skip=skip,
            limit=limit,
            db=db,
            current_user=user,
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="optional",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def get_attendance_logs(
    employee_id: Optional[str] = None,
    department_id: Optional[str] = None,
    punch_type: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """Retrieve raw check-in/out punch logs (automatically scoped to self for EMPLOYEE role)."""
    return await run_mcp_op(
        lambda db, user: api_attendance.get_attendance_logs(
            employee_id=employee_id,
            department_id=department_id,
            punch_type=punch_type,
            search=search,
            start_date=start_date,
            end_date=end_date,
            skip=skip,
            limit=limit,
            db=db,
            current_user=user,
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="optional",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def record_manual_punch(
    employee_id: str,
    punch_type: str = "AUTO",
    device_id: str = "mcp_admin_console",
    verification_mode: str = "MANUAL",
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Record a manual check-in/check-out punch for an employee (Admin or HR Manager only)."""
    payload = _validate_payload(
        AttendancePunchRequest,
        employee_id=employee_id,
        device_id=device_id,
        punch_type=punch_type,
        verification_mode=verification_mode,
    )
    return await run_mcp_op(
        lambda db, user: api_attendance.manual_punch(payload=payload, db=db, admin=user),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def regularize_attendance(
    employee_id: str,
    attendance_date: date,
    reason: str,
    check_in_time: Optional[datetime] = None,
    check_out_time: Optional[datetime] = None,
    status: Optional[str] = "PRESENT",
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Directly regularize an employee's attendance record with audit logging (Admin/HR only)."""
    payload = _validate_payload(
        AttendanceRegularizationRequest,
        employee_id=employee_id,
        attendance_date=attendance_date,
        check_in_time=check_in_time,
        check_out_time=check_out_time,
        status=status,
        reason=reason,
    )
    return await run_mcp_op(
        lambda db, user: api_attendance.regularize_attendance(
            payload=payload, db=db, admin=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def list_regularization_requests(
    status_filter: Optional[str] = None,
    employee_id: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """List attendance regularization requests (scoped to self for EMPLOYEE role)."""
    return await run_mcp_op(
        lambda db, user: api_attendance.list_regularization_requests(
            status_filter=status_filter,
            employee_id=employee_id,
            db=db,
            current_user=user,
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def create_regularization_request(
    employee_id: str,
    attendance_date: date,
    reason: str,
    requested_check_in: Optional[datetime] = None,
    requested_check_out: Optional[datetime] = None,
    requested_status: str = "PRESENT",
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Submit a missing-punch or attendance correction request."""
    payload = _validate_payload(
        RegularizationRequestCreate,
        employee_id=employee_id,
        attendance_date=attendance_date,
        requested_check_in=requested_check_in,
        requested_check_out=requested_check_out,
        requested_status=requested_status,
        reason=reason,
    )
    return await run_mcp_op(
        lambda db, user: api_attendance.create_regularization_request(
            payload=payload, db=db, current_user=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def review_regularization_request(
    request_id: str,
    status: str,
    remarks: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Approve (APPROVED) or reject (REJECTED) a regularization request (Manager+ only)."""
    payload = _validate_payload(
        RegularizationReviewRequest,
        status=status,
        remarks=remarks,
    )
    return await run_mcp_op(
        lambda db, user: api_attendance.review_regularization_request(
            request_id=request_id, payload=payload, db=db, manager=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="manager",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def get_audit_logs(
    action: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """Retrieve immutable audit history of overrides and regularization reviews (Manager+ only)."""
    return await run_mcp_op(
        lambda db, user: api_attendance.get_audit_logs(
            action=action, skip=skip, limit=limit, db=db, admin=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="manager",
    )


# ---------------------------------------------------------------------------
# Shift Management Tools
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": True})
async def list_shifts(
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """List all configured work shifts."""
    return await run_mcp_op(
        lambda db, user: _serialize_models(
            api_shifts.list_shifts(db=db, current_user=user), ShiftOut
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def create_shift(
    name: str,
    code: str,
    start_time: time,
    end_time: time,
    grace_period_mins: int = 15,
    half_day_late_mins: int = 120,
    break_duration_mins: int = 60,
    is_overnight: bool = False,
    shift_day_boundary: time = time(12, 0),
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Create a new day or overnight shift (Admin or HR Manager only)."""
    payload = _validate_payload(
        ShiftCreate,
        name=name,
        code=code,
        start_time=start_time,
        end_time=end_time,
        grace_period_mins=grace_period_mins,
        half_day_late_mins=half_day_late_mins,
        break_duration_mins=break_duration_mins,
        is_overnight=is_overnight,
        shift_day_boundary=shift_day_boundary,
    )
    return await run_mcp_op(
        lambda db, user: ShiftOut.model_validate(
            api_shifts.create_shift(payload=payload, db=db, admin=user)
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def update_shift(
    shift_id: str,
    name: Optional[str] = None,
    code: Optional[str] = None,
    start_time: Optional[time] = None,
    end_time: Optional[time] = None,
    grace_period_mins: Optional[int] = None,
    half_day_late_mins: Optional[int] = None,
    break_duration_mins: Optional[int] = None,
    is_overnight: Optional[bool] = None,
    shift_day_boundary: Optional[time] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Update an existing shift schedule or grace/break policy (Admin or HR Manager only)."""
    fields = {
        k: v
        for k, v in {
            "name": name,
            "code": code,
            "start_time": start_time,
            "end_time": end_time,
            "grace_period_mins": grace_period_mins,
            "half_day_late_mins": half_day_late_mins,
            "break_duration_mins": break_duration_mins,
            "is_overnight": is_overnight,
            "shift_day_boundary": shift_day_boundary,
        }.items()
        if v is not None
    }
    payload = _validate_payload(ShiftUpdate, **fields)
    return await run_mcp_op(
        lambda db, user: ShiftOut.model_validate(
            api_shifts.update_shift(shift_id=shift_id, payload=payload, db=db, admin=user)
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"destructiveHint": True})
async def delete_shift(
    shift_id: str,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Delete an unassigned shift (Admin or HR Manager only)."""
    return await run_mcp_op(
        lambda db, user: api_shifts.delete_shift(shift_id=shift_id, db=db, admin=user),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


# ---------------------------------------------------------------------------
# Leave & Holiday Management Tools
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": True})
async def list_leaves(
    employee_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """List leave requests (scoped to self for EMPLOYEE role)."""
    return await run_mcp_op(
        lambda db, user: api_leaves.list_leaves(
            employee_id=employee_id,
            status_filter=status_filter,
            db=db,
            current_user=user,
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def get_leave_usage_summary(
    year: Optional[int] = None,
    employee_id: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """Get approved YTD leave days taken per employee and leave type."""
    return await run_mcp_op(
        lambda db, user: api_leaves.get_leave_usage_summary(
            year=year, employee_id=employee_id, db=db, current_user=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def apply_leave(
    employee_id: str,
    start_date: date,
    end_date: date,
    leave_type: str = "ANNUAL",
    reason: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Submit a leave application (EMPLOYEE role may apply only for themselves)."""
    payload = _validate_payload(
        LeaveRequestCreate,
        employee_id=employee_id,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
    )
    return await run_mcp_op(
        lambda db, user: api_leaves.apply_leave(payload=payload, db=db, current_user=user),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def review_leave(
    leave_id: str,
    status: str,
    remarks: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Approve (APPROVED) or reject (REJECTED) a leave request (Manager+ only)."""
    payload = _validate_payload(LeaveStatusUpdate, status=status, remarks=remarks)
    return await run_mcp_op(
        lambda db, user: api_leaves.update_leave_status(
            leave_id=leave_id, payload=payload, db=db, admin=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="manager",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def list_holidays(
    branch_id: Optional[str] = None,
    year: Optional[int] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> List[Dict[str, Any]]:
    """List scheduled branch holidays."""
    return await run_mcp_op(
        lambda db, user: api_holidays.list_holidays(
            branch_id=branch_id, year=year, db=db, current_user=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def create_holiday(
    branch_id: str,
    holiday_date: date,
    name: str,
    is_recurring: bool = False,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Create an official holiday for a branch (Admin or HR Manager only)."""
    payload = _validate_payload(
        HolidayCreate,
        branch_id=branch_id,
        holiday_date=holiday_date,
        name=name,
        is_recurring=is_recurring,
    )
    return await run_mcp_op(
        lambda db, user: api_holidays.create_holiday(
            payload=payload, db=db, admin=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


@mcp.tool(annotations={"destructiveHint": True})
async def delete_holiday(
    holiday_id: str,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Remove a scheduled holiday (Admin or HR Manager only)."""
    return await run_mcp_op(
        lambda db, user: api_holidays.delete_holiday(
            holiday_id=holiday_id, db=db, admin=user
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


# ---------------------------------------------------------------------------
# Reports & System Settings Tools
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": True})
async def get_monthly_attendance_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    department_id: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Compute aggregated monthly attendance summary (scoped to self for EMPLOYEE role)."""
    today = date.today()
    target_year = year or today.year
    target_month = month or today.month
    if not (2020 <= target_year <= 2100):
        raise ToolError("year must be between 2020 and 2100.")
    if not (1 <= target_month <= 12):
        raise ToolError("month must be between 1 and 12.")

    return await run_mcp_op(
        lambda db, user: api_reports.get_monthly_attendance_summary(
            year=target_year,
            month=target_month,
            department_id=department_id,
            db=db,
            current_user=user,
        ),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def export_attendance_csv(
    year: Optional[int] = None,
    month: Optional[int] = None,
    department_id: Optional[str] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Export the statutory monthly attendance register as CSV text (Manager+ only)."""
    today = date.today()
    target_year = year or today.year
    target_month = month or today.month
    if not (2020 <= target_year <= 2100):
        raise ToolError("year must be between 2020 and 2100.")
    if not (1 <= target_month <= 12):
        raise ToolError("month must be between 1 and 12.")

    def _op(db, _user):
        csv_text, filename, row_count = api_reports.generate_attendance_csv_text(
            db=db,
            year=target_year,
            month=target_month,
            department_id=department_id,
        )
        return {
            "filename": filename,
            "year": target_year,
            "month": target_month,
            "row_count": row_count,
            "csv_content": csv_text,
        }

    return await run_mcp_op(_op, ctx=ctx, access_token=access_token, auth_level="manager")


@mcp.tool(annotations={"readOnlyHint": True})
async def get_organization_info(
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Retrieve organization profile and active branch/department/employee counts."""
    return await run_mcp_op(
        lambda db, user: api_settings.get_organization(db=db, current_user=user),
        ctx=ctx,
        access_token=access_token,
        auth_level="user",
    )


@mcp.tool(annotations={"readOnlyHint": True})
async def get_system_preferences(ctx: Context = None) -> Dict[str, Any]:
    """Retrieve kiosk defaults, attendance rules, system preferences, and CV thresholds."""
    return await run_mcp_op(
        lambda db, _user: api_settings.get_preferences(db=db),
        ctx=ctx,
        auth_level="none",
    )


@mcp.tool(annotations={"readOnlyHint": False})
async def update_system_preferences(
    kiosk: Optional[Dict[str, Any]] = None,
    attendance_rules: Optional[Dict[str, Any]] = None,
    system: Optional[Dict[str, Any]] = None,
    access_token: Optional[str] = None,
    ctx: Context = None,
) -> Dict[str, Any]:
    """Update kiosk, attendance_rules, or system preferences (Admin or HR Manager only)."""
    payload: Dict[str, Any] = {}
    if kiosk is not None:
        payload["kiosk"] = kiosk
    if attendance_rules is not None:
        payload["attendance_rules"] = attendance_rules
    if system is not None:
        payload["system"] = system
    if not payload:
        raise ToolError("Provide at least one preference section: kiosk, attendance_rules, or system.")

    return await run_mcp_op(
        lambda db, user: api_settings.update_preferences(payload=payload, db=db, admin=user),
        ctx=ctx,
        access_token=access_token,
        auth_level="admin",
    )


# ---------------------------------------------------------------------------
# MCP Resources (Read-Only Live Snapshots)
# ---------------------------------------------------------------------------


@mcp.resource(
    "attendai://dashboard/today",
    name="Today's Attendance Dashboard",
    description="Real-time attendance KPIs, department breakdown, and recent punches for today.",
    mime_type="application/json",
)
async def resource_dashboard_today(ctx: Context) -> str:
    data = await run_mcp_op(
        lambda db, _user: api_dashboard.get_dashboard_summary(target_date=None, db=db),
        ctx=ctx,
        auth_level="none",
    )
    return json.dumps(data, indent=2)


@mcp.resource(
    "attendai://organization/structure",
    name="Organization Structure",
    description="Configured branches, departments, and work shifts with their IDs.",
    mime_type="application/json",
)
async def resource_org_structure(ctx: Context) -> str:
    def _op(db, _user):
        return {
            "branches": _serialize_models(api_employees.get_branches(db=db), BranchOut),
            "departments": _serialize_models(api_employees.get_departments(db=db), DepartmentOut),
            "shifts": _serialize_models(api_employees.get_shifts(db=db), EmployeeShiftOut),
        }

    data = await run_mcp_op(_op, ctx=ctx, auth_level="none")
    return json.dumps(data, indent=2)


@mcp.resource(
    "attendai://settings/preferences",
    name="Kiosk & Attendance Preferences",
    description="Active kiosk settings, attendance rules, and biometric recognition thresholds.",
    mime_type="application/json",
)
async def resource_preferences(ctx: Context) -> str:
    data = await run_mcp_op(
        lambda db, _user: api_settings.get_preferences(db=db),
        ctx=ctx,
        auth_level="none",
    )
    return json.dumps(data, indent=2)


@mcp.resource(
    "attendai://attendance/missing-punches/today",
    name="Today's Missing Check-Out Punches",
    description="Employees who checked in today without a recorded check-out punch.",
    mime_type="application/json",
)
async def resource_missing_punches_today(ctx: Context) -> str:
    data = await run_mcp_op(
        lambda db, user: api_attendance.get_daily_attendance(
            target_date=date.today(),
            missing_punch_only=True,
            db=db,
            current_user=user,
        ),
        ctx=ctx,
        auth_level="optional",
    )
    return json.dumps(data, indent=2)


# ---------------------------------------------------------------------------
# MCP Prompts (Reusable HR & Attendance Workflows)
# ---------------------------------------------------------------------------


@mcp.prompt(
    name="daily_attendance_briefing",
    description="Generate an executive daily HR attendance summary with exceptions and pending approvals.",
)
def daily_attendance_briefing_prompt(target_date: Optional[str] = None) -> str:
    date_label = target_date or date.today().isoformat()
    return (
        f"Prepare an executive workforce attendance briefing for {date_label} using the AttendAI MCP tools:\n"
        f"1. Call `get_dashboard_summary(target_date='{date_label}')` for overall KPIs and department breakdown.\n"
        f"2. Call `get_daily_attendance(target_date='{date_label}', missing_punch_only=True)` to flag missing check-outs.\n"
        f"3. Call `list_leaves(status_filter='PENDING')` and `list_regularization_requests(status_filter='PENDING')` "
        "to highlight items awaiting manager approval.\n"
        "Summarize headcount present, late arrivals, absences, leaves, department outliers, and recommended actions."
    )


@mcp.prompt(
    name="employee_monthly_review",
    description="Review an individual employee's attendance, punctuality, overtime, and leave usage for a month.",
)
def employee_monthly_review_prompt(
    employee_query: str,
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> str:
    today = date.today()
    y = year or today.year
    m = month or today.month
    return (
        f"Conduct a monthly attendance review for employee matching '{employee_query}' for {y}-{m:02d}:\n"
        f"1. Call `list_employees(search='{employee_query}')` to locate the employee ID and shift.\n"
        f"2. Call `get_monthly_attendance_report(year={y}, month={m})` and inspect their summary metrics.\n"
        f"3. Call `get_daily_attendance(employee_id=..., start_date='{y}-{m:02d}-01')` and `get_leave_usage_summary(year={y}, employee_id=...)`.\n"
        "Provide a clear breakdown of attendance rate, late arrivals, overtime hours, leaves taken, and any pending regularizations."
    )

