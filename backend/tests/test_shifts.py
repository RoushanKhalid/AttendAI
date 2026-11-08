import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_admin_token():
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin@company.com", "password": "admin123"}
    )
    assert login_res.status_code == 200
    return login_res.json()["access_token"]


def test_shift_lifecycle():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a new shift (Evening Shift: 14:00 to 22:00)
    shift_payload = {
        "name": "Evening Roster",
        "code": "EVENING-14-22",
        "start_time": "14:00:00",
        "end_time": "22:00:00",
        "grace_period_mins": 20,
        "half_day_late_mins": 90,
        "break_duration_mins": 45,
        "is_overnight": False,
        "shift_day_boundary": "12:00:00"
    }
    create_res = client.post("/api/v1/shifts", json=shift_payload, headers=headers)
    assert create_res.status_code == 201, create_res.text
    shift_data = create_res.json()
    shift_id = shift_data["id"]
    assert shift_data["name"] == "Evening Roster"
    assert shift_data["code"] == "EVENING-14-22"
    assert shift_data["is_overnight"] is False

    # 2. Reject duplicate code
    dup_res = client.post("/api/v1/shifts", json=shift_payload, headers=headers)
    assert dup_res.status_code == 400

    # 3. Retrieve list and verify presence
    list_res = client.get("/api/v1/shifts", headers=headers)
    assert list_res.status_code == 200
    shifts = list_res.json()
    assert any(s["id"] == shift_id for s in shifts)

    # 4. Retrieve single shift
    get_res = client.get(f"/api/v1/shifts/{shift_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["grace_period_mins"] == 20

    # 5. Update shift (make it overnight shift 20:00 to 04:00)
    update_payload = {
        "start_time": "20:00:00",
        "end_time": "04:00:00",
        "grace_period_mins": 10
    }
    put_res = client.put(f"/api/v1/shifts/{shift_id}", json=update_payload, headers=headers)
    assert put_res.status_code == 200
    updated_data = put_res.json()
    assert updated_data["grace_period_mins"] == 10
    assert updated_data["is_overnight"] is True  # auto-detected overnight!

    # 6. Delete shift (unassigned)
    del_res = client.delete(f"/api/v1/shifts/{shift_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # 7. Verify 404 after deletion
    get_after_del = client.get(f"/api/v1/shifts/{shift_id}", headers=headers)
    assert get_after_del.status_code == 404
