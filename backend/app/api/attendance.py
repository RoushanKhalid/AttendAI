from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

from app.core.database import get_db
from app.api.deps import (
    get_current_admin, get_current_user, get_current_manager,
    get_optional_admin, is_manager_or_above
)
from app.models import (
    Employee, FaceTemplate, AttendanceLog, DailyAttendance, Shift, Department, User, RegularizationRequest
)
from app.models.user import AuditLog
from app.services.attendance_engine import attendance_engine
from app.schemas.attendance import (
    AttendancePunchRequest, AttendancePunchResponse,
    AttendanceLogOut, DailyAttendanceOut,
    AttendanceRegularizationRequest, AttendanceRegularizationResponse, AuditLogOut,
    RegularizationRequestCreate, RegularizationReviewRequest, RegularizationRequestOut
)
from app.schemas.face import FaceRecognitionRequest, FaceRecognitionResponse, RecognitionDetectionOut

router = APIRouter(prefix="/attendance", tags=["Attendance Recording & Logs"])


@router.post("/recognize-and-record")
def recognize_and_record(
    payload: FaceRecognitionRequest,
    db: Session = Depends(get_db)
):
    """
    Core AI Facial Recognition Attendance Endpoint:
    1. Receives video frame from terminal/webcam.
    2. Runs MediaPipe face detection & landmarks.
    3. Performs Anti-Spoofing presentation attack detection.
    4. Extracts feature embedding.
    5. Performs 1:N vector search against active employees.
    6. If confidently identified, triggers attendance rules engine with debouncing.
    7. Unknown faces are strictly rejected and not recorded.
    """
    # 1. Fetch active enrolled templates
    active_templates = (
        db.query(FaceTemplate, Employee)
        .join(Employee, FaceTemplate.employee_id == Employee.id)
        .filter(
            FaceTemplate.is_active == True,
            Employee.status == "ACTIVE"
        )
        .all()
    )

    templates_cache = [
        {
            "employee_id": t.FaceTemplate.employee_id,
            "embedding": t.FaceTemplate.embedding
        }
        for t in active_templates
    ]

    # Map employee metadata for fast lookup
    emp_map = {
        t.Employee.id: {
            "name": t.Employee.full_name,
            "code": t.Employee.employee_code
        }
        for t in active_templates
    }

    # 2. Run Computer Vision Pipeline
    from app.cv.service import cv_service

    cv_res = cv_service.recognize_stream_frame(
        payload.image,
        templates_cache,
        device_id=payload.device_id,
        skip_liveness=payload.skip_liveness
    )

    detections_output = []
    attendance_event = None

    for det in cv_res.get("detections", []):
        emp_id = det.get("employee_id")
        emp_info = emp_map.get(emp_id, {}) if emp_id else {}
        
        det_out = {
            "bbox": det["bbox"],
            "is_live": det["is_live"],
            "liveness_score": det["liveness_score"],
            "is_matched": det["is_matched"],
            "employee_id": emp_id,
            "employee_name": emp_info.get("name"),
            "employee_code": emp_info.get("code"),
            "confidence": det["confidence"],
            "margin_gap": det.get("margin_gap", 0.0),
            "match_message": det["match_message"]
        }

        # 3. If matched, process attendance recording with debouncing
        if det["is_matched"] and emp_id:
            punch_res = attendance_engine.process_punch(
                db=db,
                employee_id=emp_id,
                device_id=payload.device_id,
                punch_type=payload.attendance_mode,
                confidence_score=det["confidence"],
                liveness_score=det["liveness_score"],
                verification_mode="FACE_RECOGNITION"
            )
            attendance_event = punch_res
            det_out["attendance_result"] = punch_res

        detections_output.append(det_out)

    return {
        "success": True,
        "total_faces_detected": cv_res.get("total_faces_detected", 0),
        "detections": detections_output,
        "attendance_event": attendance_event
    }


@router.post("/punch", response_model=AttendancePunchResponse)
def manual_punch(
    payload: AttendancePunchRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Manual or administrator override punch endpoint."""
    res = attendance_engine.process_punch(
        db=db,
        employee_id=payload.employee_id,
        device_id=payload.device_id,
        punch_type=payload.punch_type,
        confidence_score=payload.confidence_score,
        liveness_score=payload.liveness_score,
        verification_mode=payload.verification_mode
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


@router.get("/logs", response_model=List[AttendanceLogOut])
def get_attendance_logs(
    employee_id: Optional[str] = None,
    department_id: Optional[str] = None,
    punch_type: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_admin)
):
    """Retrieves raw physical punch logs with employee and department metadata."""
    query = (
        db.query(AttendanceLog, Employee, Department)
        .join(Employee, AttendanceLog.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
    )

    if current_user and not is_manager_or_above(current_user):
        if not current_user.employee_id:
            return []
        query = query.filter(AttendanceLog.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(AttendanceLog.employee_id == employee_id)

    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if punch_type:
        query = query.filter(AttendanceLog.punch_type == punch_type)
    if search:
        sf = f"%{search}%"
        query = query.filter(
            or_(
                Employee.first_name.ilike(sf),
                Employee.last_name.ilike(sf),
                Employee.employee_code.ilike(sf)
            )
        )
    if start_date:
        query = query.filter(AttendanceLog.punch_time >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.filter(AttendanceLog.punch_time <= datetime.combine(end_date, datetime.max.time()))

    results = query.order_by(desc(AttendanceLog.punch_time)).offset(skip).limit(limit).all()

    logs = []
    for log, emp, dept in results:
        logs.append(AttendanceLogOut(
            id=log.id,
            employee_id=emp.id,
            employee_name=emp.full_name,
            employee_code=emp.employee_code,
            department_name=dept.name,
            punch_time=log.punch_time,
            device_id=log.device_id,
            confidence_score=log.confidence_score,
            liveness_score=log.liveness_score,
            punch_type=log.punch_type,
            verification_mode=log.verification_mode
        ))
    return logs


@router.get("/daily", response_model=List[DailyAttendanceOut])
def get_daily_attendance(
    target_date: Optional[date] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    employee_id: Optional[str] = None,
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    missing_punch_only: bool = False,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_admin)
):
    """Retrieves aggregated daily attendance business records."""
    query = (
        db.query(DailyAttendance, Employee, Department, Shift)
        .join(Employee, DailyAttendance.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
        .outerjoin(Shift, DailyAttendance.shift_id == Shift.id)
    )

    if start_date or end_date:
        if start_date:
            query = query.filter(DailyAttendance.attendance_date >= start_date)
        if end_date:
            query = query.filter(DailyAttendance.attendance_date <= end_date)
    else:
        effective_date = target_date or date.today()
        query = query.filter(DailyAttendance.attendance_date == effective_date)

    if current_user and not is_manager_or_above(current_user):
        if not current_user.employee_id:
            return []
        query = query.filter(DailyAttendance.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(DailyAttendance.employee_id == employee_id)

    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if status:
        if status == "EARLY_DEPARTURE":
            query = query.filter(DailyAttendance.early_departure_minutes > 0)
        else:
            query = query.filter(DailyAttendance.status == status)
    if missing_punch_only:
        query = query.filter(
            DailyAttendance.check_in_time.isnot(None),
            DailyAttendance.check_out_time.is_(None)
        )
    if search:
        sf = f"%{search}%"
        query = query.filter(
            or_(
                Employee.first_name.ilike(sf),
                Employee.last_name.ilike(sf),
                Employee.employee_code.ilike(sf)
            )
        )

    results = query.order_by(desc(DailyAttendance.attendance_date), Employee.first_name.asc()).offset(skip).limit(limit).all()

    items = []
    for daily, emp, dept, shift in results:
        items.append(DailyAttendanceOut(
            id=daily.id,
            employee_id=emp.id,
            employee_name=emp.full_name,
            employee_code=emp.employee_code,
            department_name=dept.name,
            shift_name=shift.name if shift else None,
            attendance_date=daily.attendance_date,
            check_in_time=daily.check_in_time,
            check_out_time=daily.check_out_time,
            late_minutes=daily.late_minutes,
            early_departure_minutes=daily.early_departure_minutes,
            total_work_minutes=daily.total_work_minutes,
            overtime_minutes=daily.overtime_minutes,
            status=daily.status,
            regularization_status=daily.regularization_status,
            remarks=daily.remarks
        ))
    return items


def _apply_daily_regularization(
    db: Session,
    emp: Employee,
    attendance_date: date,
    check_in_time: Optional[datetime],
    check_out_time: Optional[datetime],
    target_status: Optional[str],
    reason: str,
    reviewer: User,
):
    """Shared helper to update/create DailyAttendance, recalculate shift metrics, and write AuditLog."""
    daily = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp.id,
        DailyAttendance.attendance_date == attendance_date
    ).first()

    old_values = {}
    if daily:
        old_values = {
            "check_in_time": daily.check_in_time.isoformat() if daily.check_in_time else None,
            "check_out_time": daily.check_out_time.isoformat() if daily.check_out_time else None,
            "status": daily.status,
            "late_minutes": daily.late_minutes,
            "total_work_minutes": daily.total_work_minutes,
            "overtime_minutes": daily.overtime_minutes,
            "regularization_status": daily.regularization_status
        }
    else:
        daily = DailyAttendance(
            employee_id=emp.id,
            shift_id=emp.default_shift_id,
            attendance_date=attendance_date,
            status="ABSENT"
        )
        db.add(daily)
        db.flush()

    if check_in_time:
        daily.check_in_time = check_in_time
    if check_out_time:
        daily.check_out_time = check_out_time
    if target_status:
        daily.status = target_status

    shift = db.query(Shift).filter(Shift.id == daily.shift_id).first() or emp.default_shift
    if daily.check_in_time and daily.check_out_time and daily.check_out_time > daily.check_in_time:
        total_duration = int((daily.check_out_time - daily.check_in_time).total_seconds() / 60)
        daily.total_work_minutes = max(0, total_duration - (shift.break_duration_mins if shift else 60))

        if shift:
            shift_start_dt = datetime.combine(daily.attendance_date, shift.start_time)
            shift_end_dt = datetime.combine(daily.attendance_date, shift.end_time)
            if shift.is_overnight and shift_end_dt <= shift_start_dt:
                shift_end_dt += timedelta(days=1)
            standard_shift_mins = int((shift_end_dt - shift_start_dt).total_seconds() / 60) - shift.break_duration_mins
            daily.overtime_minutes = max(0, daily.total_work_minutes - standard_shift_mins)

            grace_dt = shift_start_dt + timedelta(minutes=shift.grace_period_mins)
            if daily.check_in_time > grace_dt:
                daily.late_minutes = int((daily.check_in_time - shift_start_dt).total_seconds() / 60)
            else:
                daily.late_minutes = 0

    daily.regularization_status = "APPROVED"
    daily.remarks = f"Regularized by {reviewer.username}: {reason}"

    new_values = {
        "check_in_time": daily.check_in_time.isoformat() if daily.check_in_time else None,
        "check_out_time": daily.check_out_time.isoformat() if daily.check_out_time else None,
        "status": daily.status,
        "late_minutes": daily.late_minutes,
        "total_work_minutes": daily.total_work_minutes,
        "overtime_minutes": daily.overtime_minutes,
        "regularization_status": daily.regularization_status,
        "reason": reason
    }

    audit_entry = AuditLog(
        user_id=reviewer.id,
        action="ATTENDANCE_REGULARIZATION",
        entity_name="DailyAttendance",
        entity_id=daily.id,
        old_values=old_values,
        new_values=new_values
    )
    db.add(audit_entry)
    return daily, audit_entry


@router.post("/regularize", response_model=AttendanceRegularizationResponse)
def regularize_attendance(
    payload: AttendanceRegularizationRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    Administrator / HR Attendance Regularization Endpoint:
    Allows authorized managers to manually adjust check-in/out times or status
    with mandatory audit trail logging and work minute recalculation.
    """
    emp = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee with ID {payload.employee_id} not found"
        )

    daily, audit_entry = _apply_daily_regularization(
        db=db,
        emp=emp,
        attendance_date=payload.attendance_date,
        check_in_time=payload.check_in_time,
        check_out_time=payload.check_out_time,
        target_status=payload.status,
        reason=payload.reason,
        reviewer=admin
    )
    db.commit()
    db.refresh(daily)
    db.refresh(audit_entry)

    dept = emp.department

    daily_out = DailyAttendanceOut(
        id=daily.id,
        employee_id=emp.id,
        employee_name=emp.full_name,
        employee_code=emp.employee_code,
        department_name=dept.name if dept else None,
        attendance_date=daily.attendance_date,
        check_in_time=daily.check_in_time,
        check_out_time=daily.check_out_time,
        late_minutes=daily.late_minutes,
        early_departure_minutes=daily.early_departure_minutes,
        total_work_minutes=daily.total_work_minutes,
        overtime_minutes=daily.overtime_minutes,
        status=daily.status,
        regularization_status=daily.regularization_status,
        remarks=daily.remarks
    )

    return AttendanceRegularizationResponse(
        success=True,
        message=f"Attendance record for {emp.full_name} regularized successfully",
        daily_attendance=daily_out,
        audit_log_id=audit_entry.id
    )


def _format_regularization_request(req: RegularizationRequest, emp: Employee, dept: Optional[Department], reviewer: Optional[User]) -> RegularizationRequestOut:
    return RegularizationRequestOut(
        id=req.id,
        employee_id=emp.id,
        employee_name=emp.full_name,
        employee_code=emp.employee_code,
        department_name=dept.name if dept else None,
        daily_attendance_id=req.daily_attendance_id,
        attendance_date=req.attendance_date,
        original_check_in=req.original_check_in,
        original_check_out=req.original_check_out,
        original_status=req.original_status,
        requested_check_in=req.requested_check_in,
        requested_check_out=req.requested_check_out,
        requested_status=req.requested_status,
        reason=req.reason,
        status=req.status,
        reviewed_by_user_id=req.reviewed_by_user_id,
        reviewed_by_name=(reviewer.full_name or reviewer.username) if reviewer else None,
        review_remarks=req.review_remarks,
        reviewed_at=req.reviewed_at,
        created_at=req.created_at
    )


@router.get("/regularization-requests", response_model=List[RegularizationRequestOut])
def list_regularization_requests(
    status_filter: Optional[str] = None,
    employee_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists attendance correction requests (scoped to self for EMPLOYEE role)."""
    query = (
        db.query(RegularizationRequest, Employee, Department, User)
        .join(Employee, RegularizationRequest.employee_id == Employee.id)
        .outerjoin(Department, Employee.department_id == Department.id)
        .outerjoin(User, RegularizationRequest.reviewed_by_user_id == User.id)
    )

    if not is_manager_or_above(current_user):
        if not current_user.employee_id:
            return []
        query = query.filter(RegularizationRequest.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(RegularizationRequest.employee_id == employee_id)

    if status_filter:
        query = query.filter(RegularizationRequest.status == status_filter.upper())

    rows = query.order_by(desc(RegularizationRequest.created_at)).all()
    return [_format_regularization_request(req, emp, dept, rev) for req, emp, dept, rev in rows]


@router.post("/regularization-requests", response_model=RegularizationRequestOut, status_code=status.HTTP_201_CREATED)
def create_regularization_request(
    payload: RegularizationRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Submits a missing punch or attendance correction request capturing original snapshot."""
    target_emp_id = payload.employee_id
    if not is_manager_or_above(current_user):
        if not current_user.employee_id or current_user.employee_id != target_emp_id:
            raise HTTPException(status_code=403, detail="You can only submit regularization requests for yourself")

    emp = db.query(Employee).filter(Employee.id == target_emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    daily = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp.id,
        DailyAttendance.attendance_date == payload.attendance_date
    ).first()

    req = RegularizationRequest(
        employee_id=emp.id,
        daily_attendance_id=daily.id if daily else None,
        attendance_date=payload.attendance_date,
        original_check_in=daily.check_in_time if daily else None,
        original_check_out=daily.check_out_time if daily else None,
        original_status=daily.status if daily else "ABSENT",
        requested_check_in=payload.requested_check_in,
        requested_check_out=payload.requested_check_out,
        requested_status=payload.requested_status or "PRESENT",
        reason=payload.reason,
        status="PENDING"
    )
    if daily and daily.regularization_status == "NONE":
        daily.regularization_status = "PENDING"
    db.add(req)
    db.commit()
    db.refresh(req)

    return _format_regularization_request(req, emp, emp.department, None)


@router.put("/regularization-requests/{request_id}/review", response_model=RegularizationRequestOut)
def review_regularization_request(
    request_id: str,
    payload: RegularizationReviewRequest,
    db: Session = Depends(get_db),
    manager: User = Depends(get_current_manager)
):
    """Approves or rejects a regularization request with immutable audit logging."""
    req = db.query(RegularizationRequest).filter(RegularizationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Regularization request not found")

    target_status = payload.status.upper()
    if target_status not in ["APPROVED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Status must be APPROVED or REJECTED")

    emp = db.query(Employee).filter(Employee.id == req.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    req.status = target_status
    req.reviewed_by_user_id = manager.id
    req.review_remarks = payload.remarks
    req.reviewed_at = datetime.utcnow()

    if target_status == "APPROVED":
        daily, _ = _apply_daily_regularization(
            db=db,
            emp=emp,
            attendance_date=req.attendance_date,
            check_in_time=req.requested_check_in,
            check_out_time=req.requested_check_out,
            target_status=req.requested_status,
            reason=req.reason,
            reviewer=manager
        )
        req.daily_attendance_id = daily.id
    else:
        if req.daily_attendance_id:
            daily = db.query(DailyAttendance).filter(DailyAttendance.id == req.daily_attendance_id).first()
            if daily:
                daily.regularization_status = "REJECTED"
        db.add(AuditLog(
            user_id=manager.id,
            action="ATTENDANCE_REGULARIZATION_REJECTED",
            entity_name="RegularizationRequest",
            entity_id=req.id,
            old_values={"status": "PENDING"},
            new_values={"status": "REJECTED", "reason": req.reason, "remarks": payload.remarks}
        ))

    db.commit()
    db.refresh(req)
    return _format_regularization_request(req, emp, emp.department, manager)


@router.get("/audit-logs", response_model=List[AuditLogOut])
def get_audit_logs(
    action: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_manager)
):
    """Retrieve immutable audit history of manual overrides and adjustments."""
    query = (
        db.query(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
    )
    if action:
        query = query.filter(AuditLog.action == action)

    records = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()

    logs = []
    for audit, user in records:
        logs.append(AuditLogOut(
            id=audit.id,
            user_id=audit.user_id,
            username=user.username if user else "System",
            action=audit.action,
            entity_name=audit.entity_name,
            entity_id=audit.entity_id,
            old_values=audit.old_values,
            new_values=audit.new_values,
            ip_address=audit.ip_address,
            created_at=audit.created_at
        ))
    return logs
