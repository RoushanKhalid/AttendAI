import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.api.deps import get_current_admin, get_current_manager, get_optional_admin
from app.models import (
    Employee, Department, Branch, Shift, User, FaceTemplate
)
from app.cv.service import cv_service
from app.schemas.employee import (
    EmployeeCreate, EmployeeUpdate, EmployeeOut,
    DepartmentCreate, DepartmentOut, BranchOut, ShiftOut, ShiftCreate,
    QuickRegisterRequest, QuickRegisterResponse
)

router = APIRouter(prefix="/employees", tags=["Employee Management"])


@router.get("", response_model=List[EmployeeOut])
def list_employees(
    search: Optional[str] = Query(None, description="Search by name, code or email"),
    department_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_manager)
):
    """Lists employees with optional filtering, search, and pagination."""
    query = db.query(Employee)

    if status:
        query = query.filter(Employee.status == status)
    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if branch_id:
        query = query.filter(Employee.branch_id == branch_id)
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Employee.first_name.ilike(search_filter),
                Employee.last_name.ilike(search_filter),
                Employee.employee_code.ilike(search_filter),
                Employee.email.ilike(search_filter)
            )
        )

    return query.order_by(Employee.created_at.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Registers a new employee."""
    # Check duplicate code or email
    if db.query(Employee).filter(Employee.employee_code == payload.employee_code).first():
        raise HTTPException(status_code=400, detail=f"Employee code '{payload.employee_code}' already exists")
    if db.query(Employee).filter(Employee.email == payload.email).first():
        raise HTTPException(status_code=400, detail=f"Email '{payload.email}' already registered")

    # Validate foreign keys
    if not db.query(Branch).filter(Branch.id == payload.branch_id).first():
        raise HTTPException(status_code=400, detail="Invalid branch ID")
    if not db.query(Department).filter(Department.id == payload.department_id).first():
        raise HTTPException(status_code=400, detail="Invalid department ID")
    if not db.query(Shift).filter(Shift.id == payload.default_shift_id).first():
        raise HTTPException(status_code=400, detail="Invalid shift ID")

    employee = Employee(**payload.dict())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.post("/quick-register", response_model=QuickRegisterResponse, status_code=status.HTTP_201_CREATED)
def quick_register_and_enroll(
    payload: QuickRegisterRequest,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(get_optional_admin)
):
    """
    Single-step Employee Registration & Face Enrollment:
    1. Extracts and verifies facial feature embedding from the camera frame.
    2. Resolves organizational assignments (or uses system defaults).
    3. Creates Employee record with status='ACTIVE' and enrollment_status='ENROLLED'.
    4. Saves normalized FaceTemplate vector.
    5. The employee can immediately face the Kiosk to be identified.
    """
    # 1. Validate Face Image and generate embedding
    proc_res = cv_service.process_enrollment_samples([payload.face_image])
    if not proc_res["success"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Face quality check failed: {proc_res['message']}"
        )

    # 2. Resolve default branch, department, and shift if not provided
    branch_id = payload.branch_id
    if not branch_id:
        first_branch = db.query(Branch).first()
        if not first_branch:
            raise HTTPException(status_code=400, detail="No branches found in database")
        branch_id = first_branch.id

    department_id = payload.department_id
    if not department_id:
        first_dept = db.query(Department).first()
        if not first_dept:
            raise HTTPException(status_code=400, detail="No departments found in database")
        department_id = first_dept.id

    default_shift_id = payload.default_shift_id
    if not default_shift_id:
        first_shift = db.query(Shift).first()
        if not first_shift:
            raise HTTPException(status_code=400, detail="No shifts found in database")
        default_shift_id = first_shift.id

    # 3. Generate employee_code and email if not provided
    emp_code = payload.employee_code
    if not emp_code:
        emp_code = f"EMP-{uuid.uuid4().hex[:6].upper()}"

    # Ensure uniqueness of employee_code
    if db.query(Employee).filter(Employee.employee_code == emp_code).first():
        raise HTTPException(status_code=400, detail=f"Employee code '{emp_code}' is already in use")

    email = str(payload.email) if payload.email else None
    if not email:
        clean_fn = "".join(c for c in payload.first_name if c.isalnum()).lower()
        clean_ln = "".join(c for c in payload.last_name if c.isalnum()).lower()
        email = f"{clean_fn}.{clean_ln}.{uuid.uuid4().hex[:4]}@company.com"

    if db.query(Employee).filter(Employee.email == email).first():
        raise HTTPException(status_code=400, detail=f"Email '{email}' is already registered")

    # 4. Create Employee
    employee = Employee(
        employee_code=emp_code,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=email,
        designation=payload.designation or "Staff",
        branch_id=branch_id,
        department_id=department_id,
        default_shift_id=default_shift_id,
        status="ACTIVE",
        enrollment_status="ENROLLED"
    )
    db.add(employee)
    db.flush()

    # 5. Create FaceTemplate
    template = FaceTemplate(
        employee_id=employee.id,
        embedding=proc_res["embedding"],
        embedding_dim=proc_res["embedding_dim"],
        model_version="sface_v1_onnx",
        quality_score=1.0,
        sample_count=1,
        is_active=True
    )
    db.add(template)
    db.commit()
    db.refresh(employee)

    return QuickRegisterResponse(
        success=True,
        message=f"{employee.full_name} registered and face enrolled! Ready for camera recognition.",
        employee=employee
    )


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_manager)
):
    """Retrieves single employee profile by ID."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.put("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Updates an existing employee's details."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = payload.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(emp, field, val)

    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/{employee_id}")
def delete_or_deactivate_employee(
    employee_id: str,
    permanent: bool = Query(False, description="Whether to permanently remove or soft-deactivate"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    Deactivates or permanently purges employee record according to data retention policies.
    Deactivating soft-disables their biometric templates.
    """
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if permanent:
        db.delete(emp)
        db.commit()
        return {"success": True, "message": "Employee and biometric templates permanently purged"}
    else:
        emp.status = "INACTIVE"
        # Deactivate biometric templates to prevent unauthorized recognition
        db.query(FaceTemplate).filter(FaceTemplate.employee_id == employee_id).update({"is_active": False})
        db.commit()
        return {"success": True, "message": "Employee deactivated and biometric templates suspended"}


# Helper organizational metadata endpoints
@router.get("/meta/branches", response_model=List[BranchOut])
def get_branches(db: Session = Depends(get_db)):
    return db.query(Branch).all()


@router.get("/meta/departments", response_model=List[DepartmentOut])
def get_departments(branch_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Department)
    if branch_id:
        query = query.filter(Department.branch_id == branch_id)
    return query.all()


@router.post("/meta/departments", response_model=DepartmentOut)
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    dept = Department(**payload.dict())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.get("/meta/shifts", response_model=List[ShiftOut])
def get_shifts(db: Session = Depends(get_db)):
    return db.query(Shift).all()

