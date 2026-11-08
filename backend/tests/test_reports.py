from datetime import date
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


def test_monthly_summary_and_csv_export():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    current_year = date.today().year
    current_month = date.today().month

    # 1. Fetch monthly summary
    summary_res = client.get(
        f"/api/v1/reports/monthly-summary?year={current_year}&month={current_month}",
        headers=headers
    )
    assert summary_res.status_code == 200, summary_res.text
    data = summary_res.json()
    assert data["year"] == current_year
    assert data["month"] == current_month
    assert "total_employees" in data
    assert "average_attendance_rate" in data
    assert isinstance(data["summaries"], list)

    # 2. Fetch CSV export
    csv_res = client.get(
        f"/api/v1/reports/export/csv?year={current_year}&month={current_month}",
        headers=headers
    )
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "attachment; filename=" in csv_res.headers["content-disposition"]
    
    csv_content = csv_res.text
    # Verify statutory column headers exist in the CSV output
    assert "Employee Code" in csv_content
    assert "Actual Check-In" in csv_content
    assert "Total Work (Hours)" in csv_content
    assert "Overtime (Hours)" in csv_content
    assert "Status" in csv_content
