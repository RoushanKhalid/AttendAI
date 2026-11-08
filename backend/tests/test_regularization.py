from datetime import date, datetime, timedelta
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


def test_attendance_regularization_and_audit():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch branch, department, shift
    branches = client.get("/api/v1/employees/meta/branches", headers=headers).json()
    departments = client.get("/api/v1/employees/meta/departments", headers=headers).json()
    shifts = client.get("/api/v1/employees/meta/shifts", headers=headers).json()

    # 1. Create employee for regularization test
    import uuid
    uid = uuid.uuid4().hex[:6]
    emp_payload = {
        "employee_code": f"EMP-R-{uid}",
        "first_name": "Tariq",
        "last_name": "Mahmud",
        "email": f"tariq.{uid}@company.com",
        "designation": "DevOps Engineer",
        "department_id": departments[0]["id"],
        "branch_id": branches[0]["id"],
        "default_shift_id": shifts[0]["id"]
    }
    emp_res = client.post("/api/v1/employees", json=emp_payload, headers=headers)
    assert emp_res.status_code == 201
    emp_id = emp_res.json()["id"]

    # 2. Regularize yesterday's missing punch
    yesterday = date.today() - timedelta(days=1)
    check_in = datetime.combine(yesterday, datetime.strptime("09:10:00", "%H:%M:%S").time())
    check_out = datetime.combine(yesterday, datetime.strptime("18:40:00", "%H:%M:%S").time())

    reg_payload = {
        "employee_id": emp_id,
        "attendance_date": yesterday.isoformat(),
        "check_in_time": check_in.isoformat(),
        "check_out_time": check_out.isoformat(),
        "status": "PRESENT",
        "reason": "Offsite customer deployment, could not punch at physical kiosk"
    }

    reg_res = client.post("/api/v1/attendance/regularize", json=reg_payload, headers=headers)
    assert reg_res.status_code == 200, reg_res.text
    reg_data = reg_res.json()

    assert reg_data["success"] is True
    assert reg_data["audit_log_id"] is not None
    assert reg_data["daily_attendance"]["regularization_status"] == "APPROVED"
    assert reg_data["daily_attendance"]["status"] == "PRESENT"
    assert reg_data["daily_attendance"]["total_work_minutes"] > 0

    # 3. Verify audit log retrieval
    audit_res = client.get("/api/v1/attendance/audit-logs?action=ATTENDANCE_REGULARIZATION", headers=headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) > 0
    matched_log = next((l for l in logs if l["id"] == reg_data["audit_log_id"]), None)
    assert matched_log is not None
    assert matched_log["action"] == "ATTENDANCE_REGULARIZATION"
    assert matched_log["entity_name"] == "DailyAttendance"
    assert "Offsite customer deployment" in matched_log["new_values"]["reason"]
