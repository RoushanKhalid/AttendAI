from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class HolidayCreate(BaseModel):
    branch_id: str
    holiday_date: date
    name: str
    is_recurring: bool = False


class HolidayOut(BaseModel):
    id: str
    branch_id: str
    branch_name: Optional[str] = None
    holiday_date: date
    name: str
    is_recurring: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

