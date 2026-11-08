from datetime import date, datetime, time
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class DepartmentOut(BaseModel):
    id: str
    name: str
    code: Optional[str] = None

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    code: Optional[str] = None
    branch_id: str


class BranchOut(BaseModel):
    id: str
    name: str
    timezone: str
    address: Optional[str] = None

    class Config:
        from_attributes = True


class ShiftOut(BaseModel):
    id: str
    name: str
    code: str
    start_time: time
    end_time: time
    grace_period_mins: int
    half_day_late_mins: int
    break_duration_mins: int
    is_overnight: bool

    class Config:
        from_attributes = True


class ShiftCreate(BaseModel):
    name: str
    code: str
    start_time: time
    end_time: time
    grace_period_mins: int = 15
    half_day_late_mins: int = 120
    break_duration_mins: int = 60
    is_overnight: bool = False


class EmployeeCreate(BaseModel):
    employee_code: str
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    designation: Optional[str] = None
    branch_id: str
    department_id: str
    default_shift_id: str
    hire_date: Optional[date] = None


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    branch_id: Optional[str] = None
    department_id: Optional[str] = None
    default_shift_id: Optional[str] = None
    status: Optional[str] = None  # ACTIVE, INACTIVE, TERMINATED


class EmployeeOut(BaseModel):
    id: str
    employee_code: str
    first_name: str
    last_name: str
    full_name: str
    email: str
    phone: Optional[str] = None
    designation: Optional[str] = None
    status: str
    enrollment_status: str
    hire_date: Optional[date] = None
    department: Optional[DepartmentOut] = None
    branch: Optional[BranchOut] = None
    default_shift: Optional[ShiftOut] = None
    created_at: datetime

    class Config:
        from_attributes = True


class QuickRegisterRequest(BaseModel):
    first_name: str
    last_name: str
    employee_code: Optional[str] = None
    email: Optional[EmailStr] = None
    designation: Optional[str] = "Staff"
    department_id: Optional[str] = None
    branch_id: Optional[str] = None
    default_shift_id: Optional[str] = None
    face_image: str  # Base64 camera snapshot


class QuickRegisterResponse(BaseModel):
    success: bool
    message: str
    employee: EmployeeOut
