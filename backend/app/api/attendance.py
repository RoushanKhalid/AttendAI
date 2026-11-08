from datetime import date, datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.database import get_db
from app.api.deps import get_current_admin
from app.models import (
    Employee, FaceTemplate, AttendanceLog, DailyAttendance, Shift, Department, User
)
from app.cv.service import cv_service
from app.services.attendance_engine import attendance_engine
from app.schemas.attendance import (
    AttendancePunchRequest, AttendancePunchResponse,
    AttendanceLogOut, DailyAttendanceOut
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
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Retrieves raw physical punch logs with employee and department metadata."""
    query = (
        db.query(AttendanceLog, Employee, Department)
        .join(Employee, AttendanceLog.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
    )

    if employee_id:
        query = query.filter(AttendanceLog.employee_id == employee_id)
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
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Retrieves aggregated daily attendance business records."""
    if target_date is None:
        target_date = date.today()

    query = (
        db.query(DailyAttendance, Employee, Department)
        .join(Employee, DailyAttendance.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
        .filter(DailyAttendance.attendance_date == target_date)
    )

    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if status:
        query = query.filter(DailyAttendance.status == status)

    results = query.order_by(Employee.first_name.asc()).offset(skip).limit(limit).all()

    items = []
    for daily, emp, dept in results:
        items.append(DailyAttendanceOut(
            id=daily.id,
            employee_id=emp.id,
            employee_name=emp.full_name,
            employee_code=emp.employee_code,
            department_name=dept.name,
            attendance_date=daily.attendance_date,
            check_in_time=daily.check_in_time,
            check_out_time=daily.check_out_time,
            late_minutes=daily.late_minutes,
            early_departure_minutes=daily.early_departure_minutes,
            total_work_minutes=daily.total_work_minutes,
            overtime_minutes=daily.overtime_minutes,
            status=daily.status,
            regularization_status=daily.regularization_status
        ))
    return items
