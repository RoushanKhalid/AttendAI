import cv2
import numpy as np
import base64
import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_admin_token():
    resp = client.post("/api/v1/auth/login", json={
        "username_or_email": "admin@company.com",
        "password": "admin123"
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


def create_test_face_base64(eye_dist=36):
    """Generates an aligned synthetic face with eyes and mouth for CV testing."""
    img = np.full((300, 300, 3), 200, dtype=np.uint8)
    center = (150, 150)
    cv2.ellipse(img, center, (80, 100), 0, 0, 360, (160, 175, 225), -1)
    cv2.circle(img, (center[0] - eye_dist, center[1] - 20), 10, (255, 255, 255), -1)
    cv2.circle(img, (center[0] - eye_dist, center[1] - 20), 4, (10, 10, 10), -1)
    cv2.circle(img, (center[0] + eye_dist, center[1] - 20), 10, (255, 255, 255), -1)
    cv2.circle(img, (center[0] + eye_dist, center[1] - 20), 4, (10, 10, 10), -1)
    cv2.ellipse(img, (center[0], center[1] + 35), (25, 10), 0, 0, 180, (50, 50, 180), 2)
    _, buffer = cv2.imencode('.jpg', img)
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')


def test_quick_register_and_instant_face_attendance():
    # Clean up prior synthetic test templates to prevent ambiguity margin collision
    from app.core.database import SessionLocal
    from app.models.biometric import FaceTemplate
    from app.models.employee import Employee
    db = SessionLocal()
    test_emp_ids = [e.id for e in db.query(Employee).filter(
        (Employee.employee_code.like("TEST-%")) | 
        (Employee.employee_code.like("EMP-TEST-%")) |
        (Employee.first_name.in_(["Hasan", "Sarah", "TestEmp"]))
    ).all()]
    if test_emp_ids:
        from app.models.attendance import AttendanceLog, DailyAttendance
        db.query(AttendanceLog).filter(AttendanceLog.employee_id.in_(test_emp_ids)).delete(synchronize_session=False)
        db.query(DailyAttendance).filter(DailyAttendance.employee_id.in_(test_emp_ids)).delete(synchronize_session=False)
        db.query(FaceTemplate).filter(FaceTemplate.employee_id.in_(test_emp_ids)).delete(synchronize_session=False)
        db.query(Employee).filter(Employee.id.in_(test_emp_ids)).delete(synchronize_session=False)
        db.commit()
    db.close()

    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    face_b64 = create_test_face_base64()
    unique_suffix = uuid.uuid4().hex[:6]

    # 1. Single-step Quick Register + Face Enrollment
    quick_payload = {
        "first_name": "Hasan",
        "last_name": f"Ali_{unique_suffix}",
        "designation": "AI Architect",
        "face_image": face_b64
    }

    reg_res = client.post("/api/v1/employees/quick-register", json=quick_payload, headers=headers)
    assert reg_res.status_code == 201, reg_res.text
    reg_data = reg_res.json()

    assert reg_data["success"] is True
    emp = reg_data["employee"]
    emp_id = emp["id"]
    assert emp["enrollment_status"] == "ENROLLED"
    assert emp["status"] == "ACTIVE"

    # 2. Facing the camera: Immediately recognized on Kiosk and attendance logged
    rec_res = client.post("/api/v1/attendance/recognize-and-record", json={
        "image": face_b64,
        "attendance_mode": "AUTO",
        "device_id": "main_entrance_kiosk",
        "skip_liveness": True
    })
    assert rec_res.status_code == 200, rec_res.text
    rec_data = rec_res.json()

    assert rec_data["success"] is True
    assert rec_data["total_faces_detected"] >= 1
    matched_detection = next((d for d in rec_data["detections"] if d["employee_id"] == emp_id), None)
    assert matched_detection is not None
    assert matched_detection["is_matched"] is True

    # Attendance event recorded
    assert rec_data["attendance_event"] is not None
    assert rec_data["attendance_event"]["employee_id"] == emp_id
    assert rec_data["attendance_event"]["success"] is True

    # 3. Clean up the created test employee and its templates
    db = SessionLocal()
    from app.models.attendance import AttendanceLog, DailyAttendance
    db.query(AttendanceLog).filter(AttendanceLog.employee_id == emp_id).delete(synchronize_session=False)
    db.query(DailyAttendance).filter(DailyAttendance.employee_id == emp_id).delete(synchronize_session=False)
    db.query(FaceTemplate).filter(FaceTemplate.employee_id == emp_id).delete(synchronize_session=False)
    db.query(Employee).filter(Employee.id == emp_id).delete(synchronize_session=False)
    db.commit()
    db.close()
