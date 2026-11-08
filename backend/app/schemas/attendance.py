from datetime import datetime, date, time
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class AttendancePunchRequest(BaseModel):
    employee_id: str
    device_id: str = "kiosk_terminal_1"
    punch_type: str = "AUTO"  # CHECK_IN, CHECK_OUT, AUTO
    confidence_score: float = 1.0
    liveness_score: float = 1.0
    verification_mode: str = "FACE_RECOGNITION"


class AttendancePunchResponse(BaseModel):
    success: bool
    is_duplicate: bool
    message: str
    punch_time: datetime
    employee_id: str
    employee_name: str
    employee_code: str
    punch_type: str
    daily_status: str
    late_minutes: int = 0
    total_work_minutes: int = 0


class AttendanceLogOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    department_name: Optional[str] = None
    punch_time: datetime
    device_id: str
    confidence_score: float
    liveness_score: float
    punch_type: str
    verification_mode: str

    class Config:
        from_attributes = True


class DailyAttendanceOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    department_name: Optional[str] = None
    attendance_date: date
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    late_minutes: int
    early_departure_minutes: int
    total_work_minutes: int
    overtime_minutes: int
    status: str
    regularization_status: str

    class Config:
        from_attributes = True


class DashboardSummaryOut(BaseModel):
    total_employees: int
    present_today: int
    absent_today: int
    late_today: int
    attendance_percentage: float
    department_stats: List[Dict[str, Any]]
    recent_punches: List[AttendanceLogOut]


class AttendanceRegularizationRequest(BaseModel):
    employee_id: str
    attendance_date: date
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    status: Optional[str] = "PRESENT"
    reason: str


class AttendanceRegularizationResponse(BaseModel):
    success: bool
    message: str
    daily_attendance: DailyAttendanceOut
    audit_log_id: str


class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    username: Optional[str] = None
    action: str
    entity_name: str
    entity_id: Optional[str] = None
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


