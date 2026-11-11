from datetime import date, datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.core.database import get_db
from app.models import (
    Employee, DailyAttendance, AttendanceLog, Department
)
from app.schemas.attendance import DashboardSummaryOut, AttendanceLogOut

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Metrics"])


@router.get("/summary", response_model=DashboardSummaryOut)
def get_dashboard_summary(
    target_date: date = None,
    db: Session = Depends(get_db)
):
    """
    Computes real-time executive dashboard KPIs:
    - Total employees
    - Present today
    - Absent today
    - Late employees
    - Attendance percentage
    - Department breakdown
    - Recent live punch feed
    """
    if target_date is None:
        target_date = date.today()

    # 1. Total Active Employees
    total_employees = db.query(Employee).filter(Employee.status == "ACTIVE").count()

    # 2. Daily Attendance Counts for target_date
    daily_records = (
        db.query(DailyAttendance.status, func.count(DailyAttendance.id))
        .join(Employee, DailyAttendance.employee_id == Employee.id)
        .filter(
            DailyAttendance.attendance_date == target_date,
            Employee.status == "ACTIVE"
        )
        .group_by(DailyAttendance.status)
        .all()
    )

    status_counts = {status: count for status, count in daily_records}
    
    present_count = status_counts.get("PRESENT", 0) + status_counts.get("LATE", 0) + status_counts.get("HALF_DAY", 0) + status_counts.get("EARLY_DEPARTURE", 0)
    late_count = status_counts.get("LATE", 0)
    on_leave_count = status_counts.get("ON_LEAVE", 0)
    
    # Absent count is total active employees minus those present or on approved leave
    absent_count = max(0, total_employees - present_count - on_leave_count)
    
    attendance_pct = (present_count / total_employees * 100.0) if total_employees > 0 else 0.0

    # 3. Department Breakdown
    departments = db.query(Department).all()
    dept_stats = []
    for d in departments:
        dept_total = db.query(Employee).filter(Employee.department_id == d.id, Employee.status == "ACTIVE").count()
        dept_present = (
            db.query(DailyAttendance)
            .join(Employee, DailyAttendance.employee_id == Employee.id)
            .filter(
                Employee.department_id == d.id,
                DailyAttendance.attendance_date == target_date,
                DailyAttendance.status.in_(["PRESENT", "LATE", "HALF_DAY"])
            )
            .count()
        )
        dept_late = (
            db.query(DailyAttendance)
            .join(Employee, DailyAttendance.employee_id == Employee.id)
            .filter(
                Employee.department_id == d.id,
                DailyAttendance.attendance_date == target_date,
                DailyAttendance.status == "LATE"
            )
            .count()
        )
        dept_stats.append({
            "department_id": d.id,
            "department_name": d.name,
            "total_employees": dept_total,
            "present": dept_present,
            "late": dept_late,
            "absent": max(0, dept_total - dept_present),
            "percentage": round((dept_present / dept_total * 100.0), 1) if dept_total > 0 else 0.0
        })

    # 4. Recent Live Punches (Latest 10)
    recent_logs_query = (
        db.query(AttendanceLog, Employee, Department)
        .join(Employee, AttendanceLog.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
        .order_by(desc(AttendanceLog.punch_time))
        .limit(10)
        .all()
    )

    recent_punches = [
        AttendanceLogOut(
            id=log.id,
            employee_id=emp.id,
            employee_name=emp.full_name,
            employee_code=emp.employee_code,
            department_name=dept.name,
            punch_time=log.punch_time,
            device_id=log.device_id,
            confidence_score=log.confidence_score,
            liveness_score=log.liveness_score,
            punch_type=log.punch_type,
            verification_mode=log.verification_mode
        )
        for log, emp, dept in recent_logs_query
    ]

    return DashboardSummaryOut(
        total_employees=total_employees,
        present_today=present_count,
        absent_today=absent_count,
        late_today=late_count,
        on_leave_today=on_leave_count,
        attendance_percentage=round(attendance_pct, 1),
        department_stats=dept_stats,
        recent_punches=recent_punches
    )

