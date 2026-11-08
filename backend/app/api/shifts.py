from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin
from app.models.employee import Shift, Employee
from app.models.user import User
from app.schemas.shift import ShiftCreate, ShiftUpdate, ShiftOut

router = APIRouter(prefix="/shifts", tags=["Shift Management"])


@router.get("", response_model=List[ShiftOut])
def list_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all configured attendance shifts."""
    return db.query(Shift).order_by(Shift.start_time.asc()).all()


@router.get("/{shift_id}", response_model=ShiftOut)
def get_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve details for a single shift."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift with ID {shift_id} not found"
        )
    return shift


@router.post("", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Create a new attendance shift (Admin/HR only)."""
    existing = db.query(Shift).filter(Shift.code == payload.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shift with code '{payload.code}' already exists"
        )

    # Automatically set is_overnight if start_time > end_time
    is_overnight = payload.is_overnight
    if payload.start_time > payload.end_time:
        is_overnight = True

    shift = Shift(
        name=payload.name,
        code=payload.code,
        start_time=payload.start_time,
        end_time=payload.end_time,
        grace_period_mins=payload.grace_period_mins,
        half_day_late_mins=payload.half_day_late_mins,
        break_duration_mins=payload.break_duration_mins,
        is_overnight=is_overnight,
        shift_day_boundary=payload.shift_day_boundary
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.put("/{shift_id}", response_model=ShiftOut)
def update_shift(
    shift_id: str,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Update an existing attendance shift."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift with ID {shift_id} not found"
        )

    if payload.code and payload.code != shift.code:
        duplicate = db.query(Shift).filter(Shift.code == payload.code).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Shift code '{payload.code}' is already used"
            )

    update_dict = payload.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(shift, key, value)

    # Re-evaluate overnight logic if times changed
    if shift.start_time > shift.end_time:
        shift.is_overnight = True

    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/{shift_id}")
def delete_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Delete a shift if no employees are currently assigned to it."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift with ID {shift_id} not found"
        )

    # Check employee references
    assigned_count = db.query(Employee).filter(Employee.default_shift_id == shift_id).count()
    if assigned_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete shift: {assigned_count} employees are currently assigned to it. Reassign them first."
        )

    db.delete(shift)
    db.commit()
    return {"success": True, "message": f"Shift '{shift.name}' deleted successfully"}

