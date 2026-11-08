from typing import List, Optional, Any, Dict
from pydantic import BaseModel


class FaceQualityCheckRequest(BaseModel):
    image: str  # Base64 string or data URL


class FaceQualityCheckResponse(BaseModel):
    success: bool
    face_count: int
    faces: List[Dict[str, Any]]


class FaceEnrollRequest(BaseModel):
    employee_id: str
    samples: List[str]  # List of 3 to 5 base64 image strings


class FaceEnrollResponse(BaseModel):
    success: bool
    message: str
    employee_id: str
    sample_count: int
    quality_reports: List[Dict[str, Any]]


class FaceRecognitionRequest(BaseModel):
    image: str  # Base64 camera frame
    device_id: str = "kiosk_terminal_1"
    attendance_mode: str = "AUTO"  # AUTO, CHECK_IN, CHECK_OUT
    skip_liveness: bool = False  # Allows test suites or trusted hardware sensors to bypass passive RGB liveness


class RecognitionDetectionOut(BaseModel):
    bbox: List[int]
    is_live: bool
    liveness_score: float
    is_matched: bool
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    confidence: float
    margin_gap: float
    match_message: str


class FaceRecognitionResponse(BaseModel):
    success: bool
    total_faces_detected: int
    detections: List[RecognitionDetectionOut]
