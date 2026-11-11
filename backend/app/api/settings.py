from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.core.security import get_password_hash
from app.api.deps import get_current_user, get_current_admin, is_admin_or_hr, get_user_roles
from app.models import (
    Organization, Branch, Department, Employee, User, Role, UserRole, SystemSetting
)

router = APIRouter(prefix="/settings", tags=["Organization & System Settings"])

DEFAULT_PREFERENCES: Dict[str, Any] = {
    "kiosk": {
        "default_terminal_id": "main_entrance_kiosk",
        "default_attendance_mode": "AUTO",
        "relaxed_lighting_mode": False,
        "audio_feedback_enabled": True,
        "voice_greeting_enabled": True,
        "allow_quick_register": True,
        "welcome_message": "Look at the camera to record your attendance",
    },
    "attendance_rules": {
        "working_days_per_week": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "overtime_threshold_mins": 30,
        "auto_deduct_break_after_mins": 300,
        "allow_employee_regularization_requests": True,
    },
    "system": {
        "date_format": "YYYY-MM-DD",
        "time_format": "12h",
        "company_tagline": "Workplace Attendance Platform",
    }
}


class OrganizationUpdate(BaseModel):
    name: str
    code: str


class BranchCreateUpdate(BaseModel):
    name: str
    timezone: str = "Asia/Dhaka"
    address: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: str
    code: Optional[str] = None
    branch_id: str


class UserCreateRequest(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    password: str
    role_name: str = "EMPLOYEE"
    employee_id: Optional[str] = None
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role_name: Optional[str] = None
    employee_id: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


def _require_superuser_or_admin(current_user: User = Depends(get_current_user)) -> User:
    roles = get_user_roles(current_user)
    if not current_user.is_superuser and "ADMIN" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can manage this setting"
        )
    return current_user


@router.get("/organization")
def get_organization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org = db.query(Organization).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "id": org.id,
        "name": org.name,
        "code": org.code,
        "created_at": org.created_at,
        "branches_count": db.query(Branch).filter(Branch.organization_id == org.id).count(),
        "departments_count": db.query(Department).count(),
        "employees_count": db.query(Employee).filter(Employee.status == "ACTIVE").count(),
    }


@router.put("/organization")
def update_organization(
    payload: OrganizationUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_superuser_or_admin)
):
    org = db.query(Organization).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.name = payload.name.strip()
    org.code = payload.code.strip().upper()
    db.commit()
    db.refresh(org)
    return {"id": org.id, "name": org.name, "code": org.code, "created_at": org.created_at}


@router.get("/branches")
def list_branches(db: Session = Depends(get_db)):
    branches = db.query(Branch).order_by(Branch.name.asc()).all()
    return [
        {
            "id": b.id,
            "organization_id": b.organization_id,
            "name": b.name,
            "timezone": b.timezone,
            "address": b.address,
            "department_count": db.query(Department).filter(Department.branch_id == b.id).count(),
            "employee_count": db.query(Employee).filter(Employee.branch_id == b.id).count(),
        }
        for b in branches
    ]


@router.post("/branches", status_code=status.HTTP_201_CREATED)
def create_branch(
    payload: BranchCreateUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    org = db.query(Organization).first()
    if not org:
        raise HTTPException(status_code=400, detail="Organization not initialized")
    branch = Branch(
        organization_id=org.id,
        name=payload.name.strip(),
        timezone=payload.timezone.strip(),
        address=payload.address.strip() if payload.address else None,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return {
        "id": branch.id,
        "organization_id": branch.organization_id,
        "name": branch.name,
        "timezone": branch.timezone,
        "address": branch.address,
        "department_count": 0,
        "employee_count": 0,
    }


@router.put("/branches/{branch_id}")
def update_branch(
    branch_id: str,
    payload: BranchCreateUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    branch.name = payload.name.strip()
    branch.timezone = payload.timezone.strip()
    branch.address = payload.address.strip() if payload.address else None
    db.commit()
    db.refresh(branch)
    return {
        "id": branch.id,
        "organization_id": branch.organization_id,
        "name": branch.name,
        "timezone": branch.timezone,
        "address": branch.address,
    }


@router.get("/departments")
def list_departments_detailed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rows = db.query(Department, Branch).join(Branch, Department.branch_id == Branch.id).order_by(Department.name.asc()).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "code": d.code,
            "branch_id": d.branch_id,
            "branch_name": b.name,
            "employee_count": db.query(Employee).filter(Employee.department_id == d.id).count(),
        }
        for d, b in rows
    ]


@router.put("/departments/{dept_id}")
def update_department(
    dept_id: str,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    dept.name = payload.name.strip()
    dept.code = payload.code.strip().upper() if payload.code else None
    dept.branch_id = payload.branch_id
    db.commit()
    db.refresh(dept)
    return {"id": dept.id, "name": dept.name, "code": dept.code, "branch_id": dept.branch_id}


@router.delete("/departments/{dept_id}")
def delete_department(
    dept_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    emp_count = db.query(Employee).filter(Employee.department_id == dept_id).count()
    if emp_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department: {emp_count} employees are assigned to it."
        )
    db.delete(dept)
    db.commit()
    return {"success": True, "message": f"Department '{dept.name}' deleted"}


@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    admin: User = Depends(_require_superuser_or_admin)
):
    roles = db.query(Role).order_by(Role.name.asc()).all()
    return [{"id": r.id, "name": r.name, "description": r.description} for r in roles]


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(_require_superuser_or_admin)
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    output = []
    for u in users:
        emp = db.query(Employee).filter(Employee.id == u.employee_id).first() if u.employee_id else None
        output.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "is_superuser": u.is_superuser,
            "roles": [r.name for r in u.roles],
            "employee_id": u.employee_id,
            "employee_name": emp.full_name if emp else None,
            "employee_code": emp.employee_code if emp else None,
            "created_at": u.created_at,
        })
    return output


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_superuser_or_admin)
):
    if db.query(User).filter(User.username == payload.username.strip()).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    role = db.query(Role).filter(Role.name == payload.role_name.upper()).first()
    if not role:
        raise HTTPException(status_code=400, detail=f"Invalid role '{payload.role_name}'")

    user = User(
        username=payload.username.strip(),
        email=payload.email,
        full_name=payload.full_name.strip() if payload.full_name else None,
        password_hash=get_password_hash(payload.password),
        is_active=payload.is_active,
        is_superuser=(role.name == "ADMIN"),
        employee_id=payload.employee_id or None,
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "roles": [role.name],
        "employee_id": user.employee_id,
        "created_at": user.created_at,
    }


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_superuser_or_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None
    if payload.email is not None:
        user.email = payload.email
    if payload.employee_id is not None:
        user.employee_id = payload.employee_id or None
    if payload.is_active is not None:
        if user.id == admin.id and not payload.is_active:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        user.is_active = payload.is_active
    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        user.password_hash = get_password_hash(payload.password)
    if payload.role_name:
        role = db.query(Role).filter(Role.name == payload.role_name.upper()).first()
        if not role:
            raise HTTPException(status_code=400, detail=f"Invalid role '{payload.role_name}'")
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        db.add(UserRole(user_id=user.id, role_id=role.id))
        user.is_superuser = (role.name == "ADMIN")

    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "roles": [r.name for r in user.roles],
        "employee_id": user.employee_id,
    }


@router.get("/preferences")
def get_preferences(db: Session = Depends(get_db)):
    """Returns persisted Kiosk, Attendance Rule, and System Preferences plus read-only engine parameters."""
    stored: Dict[str, Any] = {}
    for row in db.query(SystemSetting).all():
        stored[row.key] = row.value

    merged = {
        "kiosk": {**DEFAULT_PREFERENCES["kiosk"], **stored.get("kiosk", {})},
        "attendance_rules": {**DEFAULT_PREFERENCES["attendance_rules"], **stored.get("attendance_rules", {})},
        "system": {**DEFAULT_PREFERENCES["system"], **stored.get("system", {})},
        "engine_info": {
            "duplicate_protection_seconds": app_settings.PUNCH_DEBOUNCE_SECONDS,
            "recognition_threshold": app_settings.FACE_RECOGNITION_THRESHOLD,
            "liveness_threshold": app_settings.LIVENESS_THRESHOLD,
            "min_face_size_px": app_settings.MIN_FACE_SIZE_PX,
        }
    }
    return merged


@router.put("/preferences")
def update_preferences(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    for section in ("kiosk", "attendance_rules", "system"):
        if section in payload and isinstance(payload[section], dict):
            existing = db.query(SystemSetting).filter(SystemSetting.key == section).first()
            merged_val = {**DEFAULT_PREFERENCES[section], **payload[section]}
            if existing:
                existing.value = merged_val
            else:
                db.add(SystemSetting(key=section, value=merged_val))
    db.commit()
    return get_preferences(db)

