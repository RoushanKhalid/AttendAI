import io
import csv
import calendar
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin, get_current_manager, is_manager_or_above
from app.models.employee import Employee, Department, Shift, Branch
from app.models.attendance import DailyAttendance, Holiday, LeaveRequest
from app.models.user import User
from app.schemas.report import EmployeeMonthlySummary, MonthlyReportResponse

router = APIRouter(prefix="/reports", tags=["Attendance Reports & Statutory Export"])


@router.get("/monthly-summary", response_model=MonthlyReportResponse)
def get_monthly_attendance_summary(
    year: int = Query(default=date.today().year, ge=2020, le=2100),
    month: int = Query(default=date.today().month, ge=1, le=12),
    department_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Computes aggregated monthly attendance timesheet per employee:
    Total Working Days, Present Days, Absent Days, Leaves, Holidays, Late Arrivals, Work Hours, and Overtime.
    """
    _, last_day = calendar.monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    # Fetch employees
    emp_query = db.query(Employee, Department).join(Department, Employee.department_id == Department.id)
    if not is_manager_or_above(current_user):
        if current_user.employee_id:
            emp_query = emp_query.filter(Employee.id == current_user.employee_id)
        else:
            return MonthlyReportResponse(year=year, month=month, total_employees=0, average_attendance_rate=0.0, summaries=[])
    elif department_id:
        emp_query = emp_query.filter(Employee.department_id == department_id)
    emp_records = emp_query.order_by(Employee.first_name.asc()).all()

    summaries = []
    total_rate_sum = 0.0

    for emp, dept in emp_records:
        # Fetch daily attendances in range
        dailies = (
            db.query(DailyAttendance)
            .filter(
                DailyAttendance.employee_id == emp.id,
                DailyAttendance.attendance_date >= start_date,
                DailyAttendance.attendance_date <= end_date
            )
            .all()
        )

        present_days = sum(1 for d in dailies if d.status in ["PRESENT", "LATE", "HALF_DAY", "EARLY_DEPARTURE"])
        late_days = sum(1 for d in dailies if d.late_minutes > 0)
        leave_days = sum(1 for d in dailies if d.status == "ON_LEAVE")
        holiday_days = sum(1 for d in dailies if d.status in ["HOLIDAY", "WEEKLY_OFF"])
        absent_days = sum(1 for d in dailies if d.status == "ABSENT")
        
        # Working days calculation
        total_recorded = len(dailies)
        unrecorded_days = max(0, last_day - total_recorded)
        # unrecorded past days count as absent if before today
        effective_absent = absent_days + (unrecorded_days if date.today() > end_date else 0)
        
        total_work_minutes = sum(d.total_work_minutes for d in dailies)
        overtime_minutes = sum(d.overtime_minutes for d in dailies)
        
        working_days = max(1, last_day - holiday_days)
        att_rate = round((present_days / working_days) * 100.0, 1) if working_days > 0 else 0.0
        total_rate_sum += att_rate

        summaries.append(EmployeeMonthlySummary(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            full_name=emp.full_name,
            department_name=dept.name,
            designation=emp.designation,
            total_calendar_days=last_day,
            working_days=working_days,
            present_days=present_days,
            absent_days=effective_absent,
            leave_days=leave_days,
            holiday_days=holiday_days,
            late_days=late_days,
            total_work_hours=round(total_work_minutes / 60.0, 2),
            overtime_hours=round(overtime_minutes / 60.0, 2),
            attendance_rate=min(100.0, att_rate)
        ))

    avg_rate = round(total_rate_sum / len(summaries), 1) if summaries else 0.0

    return MonthlyReportResponse(
        year=year,
        month=month,
        total_employees=len(summaries),
        average_attendance_rate=avg_rate,
        summaries=summaries
    )


def generate_attendance_csv_text(
    db: Session,
    year: int,
    month: int,
    department_id: Optional[str] = None,
) -> tuple[str, str, int]:
    """Builds the statutory attendance CSV content, filename, and data row count."""
    _, last_day = calendar.monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    query = (
        db.query(DailyAttendance, Employee, Department, Shift)
        .join(Employee, DailyAttendance.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
        .join(Shift, DailyAttendance.shift_id == Shift.id)
        .filter(
            DailyAttendance.attendance_date >= start_date,
            DailyAttendance.attendance_date <= end_date
        )
    )

    if department_id:
        query = query.filter(Employee.department_id == department_id)

    records = query.order_by(DailyAttendance.attendance_date.asc(), Employee.employee_code.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Statutory Header
    writer.writerow([
        "Employee Code",
        "Employee Name",
        "Department",
        "Designation",
        "Attendance Date",
        "Shift Name",
        "Scheduled Start",
        "Scheduled End",
        "Actual Check-In",
        "Actual Check-Out",
        "Total Work (Hours)",
        "Late (Minutes)",
        "Overtime (Hours)",
        "Status",
        "Regularization",
        "Remarks"
    ])

    for daily, emp, dept, shift in records:
        writer.writerow([
            emp.employee_code,
            emp.full_name,
            dept.name,
            emp.designation or "N/A",
            daily.attendance_date.isoformat(),
            shift.name,
            shift.start_time.strftime("%H:%M"),
            shift.end_time.strftime("%H:%M"),
            daily.check_in_time.strftime("%H:%M:%S") if daily.check_in_time else "—",
            daily.check_out_time.strftime("%H:%M:%S") if daily.check_out_time else "—",
            f"{round(daily.total_work_minutes / 60.0, 2)}",
            daily.late_minutes,
            f"{round(daily.overtime_minutes / 60.0, 2)}",
            daily.status,
            daily.regularization_status,
            daily.remarks or ""
        ])

    filename = f"attendance_register_{year}_{month:02d}.csv"
    return output.getvalue(), filename, len(records)


@router.get("/export/csv")
def export_attendance_csv(
    year: int = Query(default=date.today().year, ge=2020, le=2100),
    month: int = Query(default=date.today().month, ge=1, le=12),
    department_id: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_manager)
):
    """
    Exports full statutory attendance register to CSV format.
    Compatible with Bangladesh Labour Act 2006 (Form 9 Register) and APPI compliance reports.
    """
    csv_text, filename, _ = generate_attendance_csv_text(
        db=db, year=year, month=month, department_id=department_id
    )

    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

