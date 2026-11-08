import uuid
from datetime import datetime, time, date
from sqlalchemy import Column, String, Boolean, DateTime, Time, Date, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    branches = relationship("Branch", back_populates="organization", cascade="all, delete-orphan")


class Branch(Base):
    __tablename__ = "branches"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    timezone = Column(String(50), default="Asia/Dhaka")
    address = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="branches")
    departments = relationship("Department", back_populates="branch", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="branch")
    holidays = relationship("Holiday", back_populates="branch", cascade="all, delete-orphan")


class Department(Base):
    __tablename__ = "departments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    branch_id = Column(String(36), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    code = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    branch = relationship("Branch", back_populates="departments")
    employees = relationship("Employee", back_populates="department")


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    start_time = Column(Time, nullable=False, default=time(9, 0))
    end_time = Column(Time, nullable=False, default=time(18, 0))
    grace_period_mins = Column(Integer, default=15)
    half_day_late_mins = Column(Integer, default=120)
    break_duration_mins = Column(Integer, default=60)
    is_overnight = Column(Boolean, default=False)
    shift_day_boundary = Column(Time, default=time(12, 0))
    created_at = Column(DateTime, default=datetime.utcnow)

    employees = relationship("Employee", back_populates="default_shift")
    daily_attendances = relationship("DailyAttendance", back_populates="shift")


class Employee(Base):
    __tablename__ = "employees"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_code = Column(String(50), unique=True, index=True, nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    phone = Column(String(50), nullable=True)
    designation = Column(String(100), nullable=True)
    status = Column(String(30), default="ACTIVE", index=True)  # ACTIVE, INACTIVE, TERMINATED
    enrollment_status = Column(String(30), default="NOT_ENROLLED", index=True)  # NOT_ENROLLED, ENROLLED
    hire_date = Column(Date, default=date.today)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Foreign Keys
    branch_id = Column(String(36), ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False)
    default_shift_id = Column(String(36), ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False)

    # Relationships
    branch = relationship("Branch", back_populates="employees")
    department = relationship("Department", back_populates="employees")
    default_shift = relationship("Shift", back_populates="employees")
    user_account = relationship("User", back_populates="employee", uselist=False)
    face_templates = relationship("FaceTemplate", back_populates="employee", cascade="all, delete-orphan")
    attendance_logs = relationship("AttendanceLog", back_populates="employee", cascade="all, delete-orphan")
    daily_attendances = relationship("DailyAttendance", back_populates="employee", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="employee", cascade="all, delete-orphan")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

