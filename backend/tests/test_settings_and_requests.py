import uuid
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.models import (
    Employee, DailyAttendance, AuditLog, RegularizationRequest, User, UserRole
)

client = TestClient(app)


def login_token(username_or_email: str, password: str) -> dict:
    resp = client.post("/api/v1/auth/login", json={
        "username_or_email": username_or_email,
        "password": password
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


def get_admin_token():
    return login_token("admin@company.com", "admin123")["access_token"]


def test_settings_endpoints():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    org_res = client.get("/api/v1/settings/organization", headers=headers)
    assert org_res.status_code == 200
    assert "name" in org_res.json()

    branches_res = client.get("/api/v1/settings/branches", headers=headers)
    assert branches_res.status_code == 200
    assert len(branches_res.json()) >= 1

    depts_res = client.get("/api/v1/settings/departments", headers=headers)
    assert depts_res.status_code == 200
    assert len(depts_res.json()) >= 1

    users_res = client.get("/api/v1/settings/users", headers=headers)
    assert users_res.status_code == 200
    assert any(u["username"] == "admin" for u in users_res.json())

    prefs_res = client.get("/api/v1/settings/preferences", headers=headers)
    assert prefs_res.status_code == 200
    prefs = prefs_res.json()
    assert "kiosk" in prefs and "attendance_rules" in prefs and "system" in prefs

    # Test updating and restoring preferences
    orig_kiosk = dict(prefs["kiosk"])
    upd_res = client.put(
        "/api/v1/settings/preferences",
        json={"kiosk": {**orig_kiosk, "welcome_message": "Welcome to AttendAI"}},
        headers=headers
    )
    assert upd_res.status_code == 200
    assert upd_res.json()["kiosk"]["welcome_message"] == "Welcome to AttendAI"
    # Restore
    client.put("/api/v1/settings/preferences", json={"kiosk": orig_kiosk}, headers=headers)


def test_regularization_request_workflow_and_dashboard_fields():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    dash = client.get("/api/v1/dashboard/summary", headers=headers)
    assert dash.status_code == 200
    assert "on_leave_today" in dash.json()

    usage = client.get("/api/v1/leaves/usage-summary", headers=headers)
    assert usage.status_code == 200
    assert isinstance(usage.json(), list)

    branches = client.get("/api/v1/employees/meta/branches", headers=headers).json()
    depts = client.get("/api/v1/employees/meta/departments", headers=headers).json()
    shifts = client.get("/api/v1/employees/meta/shifts", headers=headers).json()

    uid = uuid.uuid4().hex[:6]
    emp_res = client.post("/api/v1/employees", json={
        "employee_code": f"EMP-RR-{uid}",
        "first_name": "Nadia",
        "last_name": "Karim",
        "email": f"nadia.{uid}@company.com",
        "designation": "Analyst",
        "branch_id": branches[0]["id"],
        "department_id": depts[0]["id"],
        "default_shift_id": shifts[0]["id"]
    }, headers=headers)
    assert emp_res.status_code == 201
    emp_id = emp_res.json()["id"]

    # Verify employee update endpoint used by redesigned Edit Drawer
    upd_emp = client.put(f"/api/v1/employees/{emp_id}", json={
        "designation": "Senior Analyst"
    }, headers=headers)
    assert upd_emp.status_code == 200
    assert upd_emp.json()["designation"] == "Senior Analyst"

    target_dt = date.today() - timedelta(days=2)
    req_in = datetime.combine(target_dt, datetime.strptime("09:05:00", "%H:%M:%S").time())
    req_out = datetime.combine(target_dt, datetime.strptime("18:10:00", "%H:%M:%S").time())

    create_res = client.post("/api/v1/attendance/regularization-requests", json={
        "employee_id": emp_id,
        "attendance_date": target_dt.isoformat(),
        "requested_check_in": req_in.isoformat(),
        "requested_check_out": req_out.isoformat(),
        "requested_status": "PRESENT",
        "reason": "Kiosk network maintenance during morning shift"
    }, headers=headers)
    assert create_res.status_code == 201, create_res.text
    req_id = create_res.json()["id"]
    assert create_res.json()["status"] == "PENDING"
    assert create_res.json()["original_status"] == "ABSENT"

    review_res = client.put(f"/api/v1/attendance/regularization-requests/{req_id}/review", json={
        "status": "APPROVED",
        "remarks": "Verified with team lead"
    }, headers=headers)
    assert review_res.status_code == 200, review_res.text
    assert review_res.json()["status"] == "APPROVED"

    daily_res = client.get(
        f"/api/v1/attendance/daily?target_date={target_dt.isoformat()}&employee_id={emp_id}",
        headers=headers
    )
    assert daily_res.status_code == 200
    rows = daily_res.json()
    assert len(rows) == 1
    assert rows[0]["status"] == "PRESENT"
    assert rows[0]["total_work_minutes"] > 0

    # Clean up test artifacts
    db = SessionLocal()
    db.query(RegularizationRequest).filter(RegularizationRequest.employee_id == emp_id).delete(synchronize_session=False)
    db.query(DailyAttendance).filter(DailyAttendance.employee_id == emp_id).delete(synchronize_session=False)
    db.query(Employee).filter(Employee.id == emp_id).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_role_based_access_control_scoping():
    admin_token = get_admin_token()
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    branches = client.get("/api/v1/employees/meta/branches", headers=admin_headers).json()
    depts = client.get("/api/v1/employees/meta/departments", headers=admin_headers).json()
    shifts = client.get("/api/v1/employees/meta/shifts", headers=admin_headers).json()

    uid = uuid.uuid4().hex[:6]
    # Create two employees and one EMPLOYEE user linked to emp1
    emp1_res = client.post("/api/v1/employees", json={
        "employee_code": f"EMP-RB1-{uid}",
        "first_name": "Self",
        "last_name": "Employee",
        "email": f"self.{uid}@company.com",
        "branch_id": branches[0]["id"],
        "department_id": depts[0]["id"],
        "default_shift_id": shifts[0]["id"]
    }, headers=admin_headers)
    assert emp1_res.status_code == 201
    emp1_id = emp1_res.json()["id"]

    emp2_res = client.post("/api/v1/employees", json={
        "employee_code": f"EMP-RB2-{uid}",
        "first_name": "Other",
        "last_name": "Person",
        "email": f"other.{uid}@company.com",
        "branch_id": branches[0]["id"],
        "department_id": depts[0]["id"],
        "default_shift_id": shifts[0]["id"]
    }, headers=admin_headers)
    assert emp2_res.status_code == 201
    emp2_id = emp2_res.json()["id"]

    user_res = client.post("/api/v1/settings/users", json={
        "username": f"empuser_{uid}",
        "email": f"empuser.{uid}@company.com",
        "full_name": "Self Employee",
        "password": "password123",
        "role_name": "EMPLOYEE",
        "employee_id": emp1_id
    }, headers=admin_headers)
    assert user_res.status_code == 201, user_res.text
    user_id = user_res.json()["id"]

    mgr_res = client.post("/api/v1/settings/users", json={
        "username": f"mgruser_{uid}",
        "email": f"mgruser.{uid}@company.com",
        "full_name": "Line Manager",
        "password": "password123",
        "role_name": "LINE_MANAGER"
    }, headers=admin_headers)
    assert mgr_res.status_code == 201
    mgr_id = mgr_res.json()["id"]

    try:
        # Login as EMPLOYEE
        emp_login = login_token(f"empuser.{uid}@company.com", "password123")
        assert emp_login["employee_id"] == emp1_id
        emp_headers = {"Authorization": f"Bearer {emp_login['access_token']}"}

        # Employee CANNOT list all employees, manage users, or export admin CSV
        assert client.get("/api/v1/employees", headers=emp_headers).status_code == 403
        assert client.get("/api/v1/settings/users", headers=emp_headers).status_code == 403
        assert client.get("/api/v1/reports/export/csv", headers=emp_headers).status_code == 403

        # Employee CAN submit leave for self, CANNOT submit leave for emp2
        self_leave = client.post("/api/v1/leaves", json={
            "employee_id": emp1_id,
            "leave_type": "CASUAL",
            "start_date": date.today().isoformat(),
            "end_date": date.today().isoformat(),
            "reason": "Personal"
        }, headers=emp_headers)
        assert self_leave.status_code == 201

        other_leave = client.post("/api/v1/leaves", json={
            "employee_id": emp2_id,
            "leave_type": "CASUAL",
            "start_date": date.today().isoformat(),
            "end_date": date.today().isoformat(),
            "reason": "Unauthorized"
        }, headers=emp_headers)
        assert other_leave.status_code == 403

        # Login as LINE_MANAGER
        mgr_login = login_token(f"mgruser.{uid}@company.com", "password123")
        mgr_headers = {"Authorization": f"Bearer {mgr_login['access_token']}"}
        assert client.get("/api/v1/employees", headers=mgr_headers).status_code == 200
        assert client.get("/api/v1/reports/export/csv", headers=mgr_headers).status_code == 200
        assert client.get("/api/v1/settings/users", headers=mgr_headers).status_code == 403
    finally:
        db = SessionLocal()
        db.query(UserRole).filter(UserRole.user_id.in_([user_id, mgr_id])).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_([user_id, mgr_id])).delete(synchronize_session=False)
        db.query(Employee).filter(Employee.id.in_([emp1_id, emp2_id])).delete(synchronize_session=False)
        db.commit()
        db.close()
