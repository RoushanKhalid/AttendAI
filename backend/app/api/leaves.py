from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin, get_current_manager, is_manager_or_above
from app.models.attendance import LeaveRequest, DailyAttendance
from app.models.employee import Employee
from app.models.user import User
from app.schemas.leave import LeaveRequestCreate, LeaveStatusUpdate, LeaveRequestOut

router = APIRouter(prefix="/leaves", tags=["Leave Management"])


@router.get("", response_model=List[LeaveRequestOut])
def list_leaves(
    employee_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve leave requests with employee details (scoped to self for EMPLOYEE role)."""
    query = (
        db.query(LeaveRequest, Employee)
        .join(Employee, LeaveRequest.employee_id == Employee.id)
    )

    if not is_manager_or_above(current_user):
        if not current_user.employee_id:
            return []
        query = query.filter(LeaveRequest.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(LeaveRequest.employee_id == employee_id)

    if status_filter:
        query = query.filter(LeaveRequest.status == status_filter)

    records = query.order_by(desc(LeaveRequest.created_at)).all()

    output = []
    for leave, emp in records:
        output.append(LeaveRequestOut(
            id=leave.id,
            employee_id=leave.employee_id,
            employee_name=emp.full_name,
            employee_code=emp.employee_code,
            leave_type=leave.leave_type,
            start_date=leave.start_date,
            end_date=leave.end_date,
            reason=leave.reason,
            status=leave.status,
            approved_by_user_id=leave.approved_by_user_id,
            created_at=leave.created_at
        ))
    return output


@router.get("/usage-summary")
def get_leave_usage_summary(
    year: Optional[int] = None,
    employee_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Computes real approved leave days taken per employee and leave type for the selected year."""
    target_year = year or date.today().year
    start_of_year = date(target_year, 1, 1)
    end_of_year = date(target_year, 12, 31)

    query = (
        db.query(LeaveRequest, Employee)
        .join(Employee, LeaveRequest.employee_id == Employee.id)
        .filter(
            LeaveRequest.status == "APPROVED",
            LeaveRequest.start_date <= end_of_year,
            LeaveRequest.end_date >= start_of_year
        )
    )
    if not is_manager_or_above(current_user):
        if not current_user.employee_id:
            return []
        query = query.filter(LeaveRequest.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(LeaveRequest.employee_id == employee_id)

    summary_map = {}
    for leave, emp in query.all():
        s = max(leave.start_date, start_of_year)
        e = min(leave.end_date, end_of_year)
        days = (e - s).days + 1
        if emp.id not in summary_map:
            summary_map[emp.id] = {
                "employee_id": emp.id,
                "employee_name": emp.full_name,
                "employee_code": emp.employee_code,
                "ANNUAL": 0,
                "CASUAL": 0,
                "SICK": 0,
                "UNPAID": 0,
                "total_days_taken": 0,
            }
        lt = leave.leave_type.upper()
        if lt in summary_map[emp.id]:
            summary_map[emp.id][lt] += days
        summary_map[emp.id]["total_days_taken"] += days

    return list(summary_map.values())


@router.post("", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
def apply_leave(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apply for employee leave."""
    if not is_manager_or_above(current_user):
        if not current_user.employee_id or current_user.employee_id != payload.employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Employees can only submit leave requests for themselves"
            )
    emp = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee with ID {payload.employee_id} not found"
        )

    if payload.start_date > payload.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after end date"
        )

    leave = LeaveRequest(
        employee_id=payload.employee_id,
        leave_type=payload.leave_type.upper(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
        status="PENDING"
    )
    db.add(leave)
    db.commit()
    db.refresh(leave)

    return LeaveRequestOut(
        id=leave.id,
        employee_id=leave.employee_id,
        employee_name=emp.full_name,
        employee_code=emp.employee_code,
        leave_type=leave.leave_type,
        start_date=leave.start_date,
        end_date=leave.end_date,
        reason=leave.reason,
        status=leave.status,
        approved_by_user_id=leave.approved_by_user_id,
        created_at=leave.created_at
    )


@router.put("/{leave_id}/status", response_model=LeaveRequestOut)
def update_leave_status(
    leave_id: str,
    payload: LeaveStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_manager)
):
    """Approve or Reject a leave application. When approved, updates DailyAttendance to ON_LEAVE."""
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request with ID {leave_id} not found"
        )

    target_status = payload.status.upper()
    if target_status not in ["APPROVED", "REJECTED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be either APPROVED or REJECTED"
        )

    leave.status = target_status
    leave.approved_by_user_id = admin.id

    emp = db.query(Employee).filter(Employee.id == leave.employee_id).first()

    # If approved, update daily attendance records across the range
    if target_status == "APPROVED" and emp:
        curr_dt = leave.start_date
        while curr_dt <= leave.end_date:
            daily = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == emp.id,
                DailyAttendance.attendance_date == curr_dt
            ).first()

            if daily:
                if not daily.check_in_time:
                    daily.status = "ON_LEAVE"
                    daily.remarks = f"Approved Leave ({leave.leave_type})"
            else:
                new_daily = DailyAttendance(
                    employee_id=emp.id,
                    shift_id=emp.default_shift_id,
                    attendance_date=curr_dt,
                    status="ON_LEAVE",
                    remarks=f"Approved Leave ({leave.leave_type})"
                )
                db.add(new_daily)

            curr_dt += timedelta(days=1)

    db.commit()
    db.refresh(leave)

    return LeaveRequestOut(
        id=leave.id,
        employee_id=leave.employee_id,
        employee_name=emp.full_name if emp else None,
        employee_code=emp.employee_code if emp else None,
        leave_type=leave.leave_type,
        start_date=leave.start_date,
        end_date=leave.end_date,
        reason=leave.reason,
        status=leave.status,
        approved_by_user_id=leave.approved_by_user_id,
        created_at=leave.created_at
    )


@router.delete("/{leave_id}")
def delete_leave(
    leave_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Delete a leave request."""
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request with ID {leave_id} not found"
        )
    db.delete(leave)
    db.commit()
    return {"success": True, "message": "Leave request deleted successfully"}

