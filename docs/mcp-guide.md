# AttendAI FastMCP Guide

AttendAI includes a built-in **Model Context Protocol (MCP)** server built with **FastMCP** (`fastmcp >= 4.1.8`), allowing AI assistants and agent frameworks to query workforce attendance, manage shifts and employees, review leaves and regularizations, and generate statutory reports with full role-based access control (RBAC).

---

## 1. Transports & Entrypoints

### Option A: Streamable HTTP (Mounted on FastAPI)

When the FastAPI backend is running (`start-backend.ps1` or `uvicorn app.main:app --host 0.0.0.0 --port 8000`), the MCP server is mounted directly at `/mcp` (`http://127.0.0.1:8000/mcp`).

```json
{
  "mcpServers": {
    "attendai-http": {
      "url": "http://127.0.0.1:8000/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_JWT_TOKEN>"
      }
    }
  }
}
```

### Option B: Local Stdio (Standalone Subprocess)

Local MCP clients (Antigravity, Claude Desktop, Cursor) can launch `backend/mcp_server.py` directly over `stdio`. The script pins its working directory and `sys.path` to `backend/` and directs logs to `stderr`, keeping `stdout` strictly clean for JSON-RPC frames.

```json
{
  "mcpServers": {
    "attendai": {
      "command": "python",
      "args": ["/path/to/AttendAI/backend/mcp_server.py", "--transport", "stdio"],
      "env": {
        "MCP_DEFAULT_USER_EMAIL": "admin@company.com"
      }
    }
  }
}
```

Standalone HTTP mode is also available on a custom port via CLI:

```powershell
python backend/mcp_server.py --transport http --host 127.0.0.1 --port 8001
```

---

## 2. Authentication & RBAC

Token resolution follows this order:

1. **Explicit `access_token` argument** passed directly to a protected tool (obtained from `auth_login` or `POST /api/v1/auth/login`).
2. **HTTP `Authorization: Bearer <token>` header** on Streamable HTTP requests (`/mcp`).
3. **Session state** set by `auth_login` (persisted across calls in legacy stateful connections and dedicated `stdio` subprocesses; cleared via `auth_logout`).
4. **Env-configured default user (`MCP_DEFAULT_USER_EMAIL` or `--user`)**:
   - Enabled for **local `stdio`** sessions when configured.
   - **Disabled by default on HTTP `/mcp`** (fail-closed) unless `MCP_ALLOW_HTTP_DEFAULT_USER=true` is explicitly set.

If an invalid or expired token is provided, all tools—including optional-auth tools—reject the call immediately.

### Role Scopes

| Role | Scope |
| :--- | :--- |
| `ADMIN` | Full access including organization settings, employee lifecycle, shifts, holidays, regularizations, and reports |
| `HR_MANAGER` | Employee management, manual punches, direct regularization, shifts, holidays, leaves, and reports |
| `LINE_MANAGER` | View employee directory, approve/reject leaves and regularization requests, view audit logs, export CSV |
| `EMPLOYEE` | View own attendance/daily logs, apply leave for self, submit regularization requests for self, view own monthly summary |

---

## 3. Environment Configuration

Configured in `backend/.env` (see `backend/.env.example`):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MCP_SERVER_NAME` | `"AttendAI MCP"` | Display name advertised during MCP initialization |
| `MCP_PATH` | `"/mcp"` | HTTP path mounted on FastAPI and standalone HTTP mode |
| `MCP_DEFAULT_USER_EMAIL` | `None` | Optional user email or username for automatic local `stdio` auth |
| `MCP_ALLOW_HTTP_DEFAULT_USER` | `false` | Allow `MCP_DEFAULT_USER_EMAIL` fallback for unauthenticated HTTP `/mcp` requests |

---

## 4. Tools Reference (35 Tools)

### Authentication & Session
| Tool | Auth | Purpose |
| :--- | :--- | :--- |
| `auth_login` | Public | Authenticate with `username_or_email` and `password`; returns JWT `access_token` and role claims |
| `auth_whoami` | Optional | Return currently resolved user profile and RBAC roles |
| `auth_logout` | Public | Clear cached session token |

### Dashboard & Organization Metadata
| Tool | Auth | Purpose |
| :--- | :--- | :--- |
| `get_dashboard_summary` | Public | Live KPIs (total, present, absent, late, on leave, attendance %), department breakdown, latest 10 punches |
| `list_org_metadata` | Public | List branches, departments, and shifts with IDs |

### Employees & Biometric Status
| Tool | Auth | Purpose |
| :--- | :--- | :--- |
| `list_employees` | Manager+ | Search and filter employees by branch, department, or status |
| `get_employee` | Manager+ | Retrieve single employee profile |
| `create_employee` | Admin / HR | Register a new employee |
| `update_employee` | Admin / HR | Update employee fields or employment status |
| `deactivate_employee` | Admin / HR | Soft-deactivate employee (disables face templates) or purge permanently |
| `get_face_enrollment_status` | Public | Check if an employee has an active face template (without exposing embeddings) |

### Attendance, Punches, Regularization & Audit
| Tool | Auth | Purpose |
| :--- | :--- | :--- |
| `get_daily_attendance` | Optional (scoped for `EMPLOYEE`) | Query daily attendance records with missing-punch, date, department, and status filters |
| `get_attendance_logs` | Optional (scoped for `EMPLOYEE`) | Query raw punch logs |
| `record_manual_punch` | Admin / HR | Record a manual check-in/check-out punch via the rules engine |
| `regularize_attendance` | Admin / HR | Directly adjust daily check-in/out/status with mandatory audit log entry |
| `list_regularization_requests` | Authenticated (scoped) | List attendance correction requests |
| `create_regularization_request` | Authenticated (scoped) | Submit a missing-punch/correction request capturing original snapshot |
| `review_regularization_request` | Manager+ | Approve (`APPROVED`) or reject (`REJECTED`) a regularization request |
| `get_audit_logs` | Manager+ | Retrieve immutable audit trail entries |

### Shifts, Leaves & Holidays
| Tool | Auth | Purpose |
| :--- | :--- | :--- |
| `list_shifts` | Authenticated | List all day and overnight shifts |
| `create_shift` | Admin / HR | Create a shift (auto-detects overnight when `start_time > end_time`) |
| `update_shift` | Admin / HR | Update shift timings, grace period, or break duration |
| `delete_shift` | Admin / HR | Delete an unassigned shift |
| `list_leaves` | Authenticated (scoped) | List leave applications |
| `get_leave_usage_summary` | Authenticated (scoped) | Compute approved YTD leave days per type (`ANNUAL`, `CASUAL`, `SICK`, `UNPAID`) |
| `apply_leave` | Authenticated (scoped) | Submit a leave request |
| `review_leave` | Manager+ | Approve or reject a leave request (syncs `ON_LEAVE` daily records on approval) |
| `list_holidays` | Authenticated | List branch holidays |
| `create_holiday` | Admin / HR | Add a holiday for a branch |
| `delete_holiday` | Admin / HR | Remove a holiday |

### Reports & Settings
| Tool | Auth | Purpose |
| :--- | :--- | :--- |
| `get_monthly_attendance_report` | Authenticated (scoped) | Monthly summary per employee (present, absent, leave, holiday, late, work hours, overtime, rate) |
| `export_attendance_csv` | Manager+ | Return statutory Form 9 / APPI monthly attendance register CSV content and row count |
| `get_organization_info` | Authenticated | Organization profile and active branch/department/employee counts |
| `get_system_preferences` | Public | Kiosk defaults, attendance rules, system preferences, and CV engine thresholds |
| `update_system_preferences` | Admin / HR | Update persisted kiosk, attendance rule, or system preference sections |

---

## 5. Resources & Prompts

### Resources (Read-Only JSON)
- `attendai://dashboard/today` — Today's dashboard KPIs, department breakdown, and recent punches.
- `attendai://organization/structure` — Branches, departments, and shifts with IDs.
- `attendai://settings/preferences` — Active kiosk, attendance rules, system preferences, and CV thresholds.
- `attendai://attendance/missing-punches/today` — Today's check-ins missing a check-out punch.

### Prompts
- `daily_attendance_briefing(target_date?)` — Guides the model to produce an executive attendance summary with missing punches and pending approvals.
- `employee_monthly_review(employee_query, year?, month?)` — Guides the model through a monthly attendance, overtime, and leave review for an employee.

---

## 6. Automated Verification

Run the MCP test suite directly or as part of the full backend test suite:

```powershell
python -m pytest backend/tests/test_mcp_server.py -v
python -m pytest -v
```
