import pytest
import base64
import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.models import Employee, FaceTemplate, Branch, Department, Shift, DailyAttendance, AttendanceLog
from app.core.cache import cache_manager

client = TestClient(app)


def get_admin_token():
    resp = client.post("/api/v1/auth/login", json={
        "username_or_email": "admin@company.com",
        "password": "admin123"
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


def create_test_image_base64():
    """Generates a base64 encoded synthetic face."""
    img = np.full((300, 300, 3), 200, dtype=np.uint8)
    center = (150, 150)
    cv2.ellipse(img, center, (80, 100), 0, 0, 360, (180, 190, 215), -1)
    cv2.circle(img, (center[0] - 30, center[1] - 20), 10, (255, 255, 255), -1)
    cv2.circle(img, (center[0] - 30, center[1] - 20), 4, (10, 10, 10), -1)
    cv2.circle(img, (center[0] + 30, center[1] - 20), 10, (255, 255, 255), -1)
    cv2.circle(img, (center[0] + 30, center[1] - 20), 4, (10, 10, 10), -1)
    cv2.ellipse(img, (center[0], center[1] + 35), (25, 10), 0, 0, 180, (50, 50, 180), 2)
    _, buffer = cv2.imencode('.jpg', img)
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')


def test_health_and_root():
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"


def test_admin_login():
    # Valid login
    resp = client.post("/api/v1/auth/login", json={
        "username_or_email": "admin@company.com",
        "password": "admin123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "ADMIN" in data["roles"]

    # Invalid login
    bad_resp = client.post("/api/v1/auth/login", json={
        "username_or_email": "admin@company.com",
        "password": "wrongpassword"
    })
    assert bad_resp.status_code == 401


def test_employee_management_lifecycle():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetch metadata
    branches = client.get("/api/v1/employees/meta/branches", headers=headers).json()
    assert len(branches) > 0
    branch_id = branches[0]["id"]

    depts = client.get(f"/api/v1/employees/meta/departments?branch_id={branch_id}", headers=headers).json()
    assert len(depts) > 0
    dept_id = depts[0]["id"]

    shifts = client.get("/api/v1/employees/meta/shifts", headers=headers).json()
    assert len(shifts) > 0
    shift_id = shifts[0]["id"]

    # 2. Create Employee
    emp_payload = {
        "employee_code": "TEST-E01",
        "first_name": "Sarah",
        "last_name": "Connor",
        "email": "sarah.connor@test.com",
        "phone": "+8801700000000",
        "designation": "AI Safety Specialist",
        "branch_id": branch_id,
        "department_id": dept_id,
        "default_shift_id": shift_id
    }
    # Clean up if existing
    db = SessionLocal()
    existing = db.query(Employee).filter(Employee.employee_code == "TEST-E01").first()
    if existing:
        db.delete(existing)
        db.commit()
    db.close()

    create_resp = client.post("/api/v1/employees", json=emp_payload, headers=headers)
    assert create_resp.status_code == 201
    created_emp = create_resp.json()
    assert created_emp["employee_code"] == "TEST-E01"
    emp_id = created_emp["id"]

    # 3. Retrieve Employee
    get_resp = client.get(f"/api/v1/employees/{emp_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["full_name"] == "Sarah Connor"

    # 4. Search and Filter
    search_resp = client.get("/api/v1/employees?search=Sarah", headers=headers)
    assert search_resp.status_code == 200
    assert any(e["id"] == emp_id for e in search_resp.json())


def test_face_quality_and_enrollment_and_attendance():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Find test employee
    db = SessionLocal()
    emp = db.query(Employee).filter(Employee.employee_code == "TEST-E01").first()
    assert emp is not None
    emp_id = emp.id
    db.close()

    test_b64 = create_test_image_base64()

    # 1. Quality Check
    q_resp = client.post("/api/v1/face/quality-check", json={"image": test_b64})
    assert q_resp.status_code == 200
    assert "face_count" in q_resp.json()

    # 2. Face Enrollment with 3 samples
    enroll_resp = client.post("/api/v1/face/enroll", json={
        "employee_id": emp_id,
        "samples": [test_b64, test_b64, test_b64]
    }, headers=headers)
    assert enroll_resp.status_code == 200
    assert enroll_resp.json()["success"] is True

    # 3. Check Enrollment Status
    status_resp = client.get(f"/api/v1/face/status/{emp_id}")
    assert status_resp.status_code == 200
    assert status_resp.json()["enrollment_status"] == "ENROLLED"
    assert status_resp.json()["has_active_template"] is True

    # 4. Clear debounce cache for clean test
    cache_manager.delete(f"attendance:debounce:{emp_id}")

    # 5. Recognize and Record Live Attendance
    rec_resp = client.post("/api/v1/attendance/recognize-and-record", json={
        "image": test_b64,
        "device_id": "test_kiosk_camera",
        "attendance_mode": "AUTO",
        "skip_liveness": True
    })
    assert rec_resp.status_code == 200
    rec_data = rec_resp.json()
    assert rec_data["success"] is True
    assert rec_data["total_faces_detected"] >= 1
    match_entry = rec_data["detections"][0]
    assert match_entry["is_matched"] is True
    assert match_entry["employee_id"] == emp_id

    # 6. Immediate second punch must be debounced
    rec_debounce = client.post("/api/v1/attendance/recognize-and-record", json={
        "image": test_b64,
        "device_id": "test_kiosk_camera",
        "attendance_mode": "AUTO",
        "skip_liveness": True
    })
    assert rec_debounce.status_code == 200
    att_event = rec_debounce.json().get("attendance_event")
    assert att_event is not None
    assert att_event["is_duplicate"] is True

    # 7. Dashboard KPI Verification
    dash_resp = client.get("/api/v1/dashboard/summary")
    assert dash_resp.status_code == 200
    dash_data = dash_resp.json()
    assert dash_data["total_employees"] >= 1
    assert dash_data["present_today"] >= 1
    assert len(dash_data["recent_punches"]) >= 1
