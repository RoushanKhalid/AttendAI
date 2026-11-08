from datetime import time, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class ShiftBase(BaseModel):
    name: str
    code: str
    start_time: time
    end_time: time
    grace_period_mins: int = 15
    half_day_late_mins: int = 120
    break_duration_mins: int = 60
    is_overnight: bool = False
    shift_day_boundary: time = time(12, 0)


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    grace_period_mins: Optional[int] = None
    half_day_late_mins: Optional[int] = None
    break_duration_mins: Optional[int] = None
    is_overnight: Optional[bool] = None
    shift_day_boundary: Optional[time] = None


class ShiftOut(ShiftBase):
    id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
