import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, Float, ForeignKey, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    punch_time = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    device_id = Column(String(100), default="kiosk_terminal_1", nullable=False)
    confidence_score = Column(Float, nullable=False)
    liveness_score = Column(Float, default=1.0)
    punch_type = Column(String(30), default="AUTO")  # CHECK_IN, CHECK_OUT, AUTO
    verification_mode = Column(String(50), default="FACE_RECOGNITION")
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="attendance_logs")


class DailyAttendance(Base):
    __tablename__ = "daily_attendance"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id = Column(String(36), ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False)
    attendance_date = Column(Date, default=date.today, nullable=False, index=True)
    
    check_in_time = Column(DateTime, nullable=True)
    check_out_time = Column(DateTime, nullable=True)
    late_minutes = Column(Integer, default=0)
    early_departure_minutes = Column(Integer, default=0)
    total_work_minutes = Column(Integer, default=0)
    overtime_minutes = Column(Integer, default=0)
    
    # Status: PRESENT, LATE, HALF_DAY, EARLY_DEPARTURE, ABSENT, ON_LEAVE, HOLIDAY, WEEKLY_OFF
    status = Column(String(50), default="ABSENT", nullable=False, index=True)
    regularization_status = Column(String(30), default="NONE")  # NONE, PENDING, APPROVED, REJECTED
    remarks = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_id", "attendance_date", name="uq_emp_attendance_date"),
    )

    employee = relationship("Employee", back_populates="daily_attendances")
    shift = relationship("Shift", back_populates="daily_attendances")


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    leave_type = Column(String(50), nullable=False)  # CASUAL, SICK, ANNUAL, UNPAID
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(30), default="PENDING")  # PENDING, APPROVED, REJECTED
    approved_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="leave_requests")


class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    branch_id = Column(String(36), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    holiday_date = Column(Date, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    is_recurring = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    branch = relationship("Branch", back_populates="holidays")


class RegularizationRequest(Base):
    __tablename__ = "regularization_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    daily_attendance_id = Column(String(36), ForeignKey("daily_attendance.id", ondelete="SET NULL"), nullable=True)
    attendance_date = Column(Date, nullable=False, index=True)

    original_check_in = Column(DateTime, nullable=True)
    original_check_out = Column(DateTime, nullable=True)
    original_status = Column(String(50), nullable=True)

    requested_check_in = Column(DateTime, nullable=True)
    requested_check_out = Column(DateTime, nullable=True)
    requested_status = Column(String(50), default="PRESENT", nullable=False)
    reason = Column(Text, nullable=False)

    status = Column(String(30), default="PENDING", nullable=False, index=True)  # PENDING, APPROVED, REJECTED
    reviewed_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    review_remarks = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee")

