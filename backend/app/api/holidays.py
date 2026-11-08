from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin
from app.models.attendance import Holiday
from app.models.employee import Branch
from app.models.user import User
from app.schemas.holiday import HolidayCreate, HolidayOut

router = APIRouter(prefix="/holidays", tags=["Holiday Calendar"])


@router.get("", response_model=List[HolidayOut])
def list_holidays(
    branch_id: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve scheduled holidays."""
    query = (
        db.query(Holiday, Branch)
        .join(Branch, Holiday.branch_id == Branch.id)
    )

    if branch_id:
        query = query.filter(Holiday.branch_id == branch_id)

    records = query.order_by(Holiday.holiday_date.asc()).all()

    output = []
    for hol, branch in records:
        if year and hol.holiday_date.year != year:
            continue
        output.append(HolidayOut(
            id=hol.id,
            branch_id=hol.branch_id,
            branch_name=branch.name,
            holiday_date=hol.holiday_date,
            name=hol.name,
            is_recurring=hol.is_recurring,
            created_at=hol.created_at
        ))
    return output


@router.post("", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Create a new official holiday."""
    branch = db.query(Branch).filter(Branch.id == payload.branch_id).first()
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch with ID {payload.branch_id} not found"
        )

    # Check for duplicate holiday on the same date for the branch
    existing = db.query(Holiday).filter(
        Holiday.branch_id == payload.branch_id,
        Holiday.holiday_date == payload.holiday_date
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A holiday '{existing.name}' already exists on {payload.holiday_date} for this branch"
        )

    hol = Holiday(
        branch_id=payload.branch_id,
        holiday_date=payload.holiday_date,
        name=payload.name,
        is_recurring=payload.is_recurring
    )
    db.add(hol)
    db.commit()
    db.refresh(hol)

    return HolidayOut(
        id=hol.id,
        branch_id=hol.branch_id,
        branch_name=branch.name,
        holiday_date=hol.holiday_date,
        name=hol.name,
        is_recurring=hol.is_recurring,
        created_at=hol.created_at
    )


@router.delete("/{holiday_id}")
def delete_holiday(
    holiday_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Remove a scheduled holiday."""
    hol = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not hol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Holiday with ID {holiday_id} not found"
        )
    db.delete(hol)
    db.commit()
    return {"success": True, "message": f"Holiday '{hol.name}' deleted successfully"}

