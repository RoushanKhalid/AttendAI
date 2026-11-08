from datetime import date, timedelta
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


def test_holiday_lifecycle():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch branches to get an active branch_id
    branch_res = client.get("/api/v1/employees/meta/branches", headers=headers)
    assert branch_res.status_code == 200
    branches = branch_res.json()
    assert len(branches) > 0
    branch_id = branches[0]["id"]

    # 1. Create a holiday
    target_date = (date.today() + timedelta(days=30)).isoformat()
    hol_payload = {
        "branch_id": branch_id,
        "holiday_date": target_date,
        "name": "Victory Day",
        "is_recurring": True
    }
    create_res = client.post("/api/v1/holidays", json=hol_payload, headers=headers)
    assert create_res.status_code == 201, create_res.text
    hol_data = create_res.json()
    hol_id = hol_data["id"]
    assert hol_data["name"] == "Victory Day"

    # 2. Duplicate rejection
    dup_res = client.post("/api/v1/holidays", json=hol_payload, headers=headers)
    assert dup_res.status_code == 400

    # 3. List holidays
    list_res = client.get(f"/api/v1/holidays?branch_id={branch_id}", headers=headers)
    assert list_res.status_code == 200
    holidays = list_res.json()
    assert any(h["id"] == hol_id for h in holidays)

    # 4. Delete holiday
    del_res = client.delete(f"/api/v1/holidays/{hol_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True


def test_leave_application_and_approval():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch branches, departments & shifts
    branch_res = client.get("/api/v1/employees/meta/branches", headers=headers)
    dept_res = client.get("/api/v1/employees/meta/departments", headers=headers)
    shift_res = client.get("/api/v1/employees/meta/shifts", headers=headers)
    branch_id = branch_res.json()[0]["id"]
    dept_id = dept_res.json()[0]["id"]
    shift_id = shift_res.json()[0]["id"]

    # 1. Register test employee for leave
    emp_payload = {
        "employee_code": "EMP-LEAVE-01",
        "first_name": "Rahim",
        "last_name": "Uddin",
        "email": "rahim.leave@company.com",
        "designation": "QA Analyst",
        "department_id": dept_id,
        "branch_id": branch_id,
        "default_shift_id": shift_id
    }
    emp_res = client.post("/api/v1/employees", json=emp_payload, headers=headers)
    assert emp_res.status_code == 201
    emp_id = emp_res.json()["id"]

    # 2. Submit Leave Request (3 days)
    start_dt = (date.today() + timedelta(days=5)).isoformat()
    end_dt = (date.today() + timedelta(days=7)).isoformat()
    leave_payload = {
        "employee_id": emp_id,
        "leave_type": "CASUAL",
        "start_date": start_dt,
        "end_date": end_dt,
        "reason": "Family emergency"
    }
    leave_res = client.post("/api/v1/leaves", json=leave_payload, headers=headers)
    assert leave_res.status_code == 201
    leave_id = leave_res.json()["id"]
    assert leave_res.json()["status"] == "PENDING"

    # 3. List leaves
    list_res = client.get(f"/api/v1/leaves?employee_id={emp_id}", headers=headers)
    assert list_res.status_code == 200
    leaves = list_res.json()
    assert any(l["id"] == leave_id for l in leaves)

    # 4. Approve leave
    approve_res = client.put(
        f"/api/v1/leaves/{leave_id}/status",
        json={"status": "APPROVED", "remarks": "Approved by HR"},
        headers=headers
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "APPROVED"

    # 5. Verify daily attendance marked as ON_LEAVE
    daily_res = client.get(f"/api/v1/attendance/daily?target_date={start_dt}", headers=headers)
    assert daily_res.status_code == 200
    daily_records = daily_res.json()
    emp_record = next((r for r in daily_records if r["employee_id"] == emp_id), None)
    assert emp_record is not None
    assert emp_record["status"] == "ON_LEAVE"
