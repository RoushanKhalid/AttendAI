from typing import List, Optional
from pydantic import BaseModel


class EmployeeMonthlySummary(BaseModel):
    employee_id: str
    employee_code: str
    full_name: str
    department_name: Optional[str] = None
    designation: Optional[str] = None
    total_calendar_days: int
    working_days: int
    present_days: int
    absent_days: int
    leave_days: int
    holiday_days: int
    late_days: int
    total_work_hours: float
    overtime_hours: float
    attendance_rate: float


class MonthlyReportResponse(BaseModel):
    year: int
    month: int
    total_employees: int
    average_attendance_rate: float
    summaries: List[EmployeeMonthlySummary]
