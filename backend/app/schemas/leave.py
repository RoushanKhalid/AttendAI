from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class LeaveRequestCreate(BaseModel):
    employee_id: str
    leave_type: str = "ANNUAL"  # CASUAL, SICK, ANNUAL, UNPAID, MATERNITY
    start_date: date
    end_date: date
    reason: Optional[str] = None


class LeaveStatusUpdate(BaseModel):
    status: str  # APPROVED, REJECTED
    remarks: Optional[str] = None


class LeaveRequestOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: str
    approved_by_user_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
