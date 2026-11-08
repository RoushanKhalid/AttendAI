from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_admin
from app.models import Employee, FaceTemplate, User
from app.cv.service import cv_service
from app.schemas.face import (
    FaceQualityCheckRequest, FaceQualityCheckResponse,
    FaceEnrollRequest, FaceEnrollResponse
)

router = APIRouter(prefix="/face", tags=["Biometric Face Management"])


@router.post("/quality-check", response_model=FaceQualityCheckResponse)
def check_face_quality(payload: FaceQualityCheckRequest):
    """
    Evaluates a live camera frame during enrollment or kiosk scanning.
    Checks pose angle, blur, illumination, and minimum face size.
    """
    res = cv_service.assess_frame(payload.image)
    return FaceQualityCheckResponse(
        success=res["success"],
        face_count=res["face_count"],
        faces=res["faces"]
    )


@router.post("/enroll", response_model=FaceEnrollResponse)
def enroll_employee_face(
    payload: FaceEnrollRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    Enrolls employee face biometric template:
    1. Validates 3-5 multi-angle webcam captures.
    2. Runs MediaPipe landmark alignment.
    3. Generates 128D/512D unit-normalized centroid embedding.
    4. Deactivates previous template (supports re-enrollment).
    5. Saves template vector and updates employee status.
    Privacy: Raw face images are discarded; only mathematical vectors are stored.
    """
    emp = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if not payload.samples or len(payload.samples) < 1:
        raise HTTPException(status_code=400, detail="At least 1 face capture sample is required (3 to 5 recommended)")

    # Process samples through CV pipeline
    proc_result = cv_service.process_enrollment_samples(payload.samples)
    if not proc_result["success"]:
        raise HTTPException(status_code=422, detail=proc_result["message"])

    # Deactivate older templates for re-enrollment
    db.query(FaceTemplate).filter(
        FaceTemplate.employee_id == emp.id,
        FaceTemplate.is_active == True
    ).update({"is_active": False})

    # Save new biometric template
    template = FaceTemplate(
        employee_id=emp.id,
        embedding=proc_result["embedding"],
        embedding_dim=proc_result["embedding_dim"],
        model_version="sface_v1_onnx",
        quality_score=1.0,
        sample_count=proc_result["sample_count"],
        is_active=True
    )
    db.add(template)

    # Update employee enrollment status
    emp.enrollment_status = "ENROLLED"
    db.commit()

    return FaceEnrollResponse(
        success=True,
        message=f"Biometric template successfully created for {emp.full_name} ({proc_result['sample_count']} samples combined).",
        employee_id=emp.id,
        sample_count=proc_result["sample_count"],
        quality_reports=proc_result["quality_reports"]
    )


@router.get("/status/{employee_id}")
def get_enrollment_status(employee_id: str, db: Session = Depends(get_db)):
    """Retrieves biometric template status for an employee without exposing vectors."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    active_template = db.query(FaceTemplate).filter(
        FaceTemplate.employee_id == employee_id,
        FaceTemplate.is_active == True
    ).first()

    return {
        "employee_id": emp.id,
        "employee_code": emp.employee_code,
        "full_name": emp.full_name,
        "enrollment_status": emp.enrollment_status,
        "has_active_template": active_template is not None,
        "model_version": active_template.model_version if active_template else None,
        "sample_count": active_template.sample_count if active_template else 0,
        "enrolled_at": active_template.created_at if active_template else None
    }

