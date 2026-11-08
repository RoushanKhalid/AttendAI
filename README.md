# AI Face Recognition Attendance Management System

A high-performance, privacy-centric Employee Attendance Management System built with **MediaPipe**, **Deep Face Recognition (SFace / ArcFace ONNX)**, **MiniFASNet Liveness Detection**, **FastAPI**, **PostgreSQL**, and **Next.js 14**.

---

## Architecture Overview

```
                                      +------------------------------------+
                                      |          Webcam Video Stream       |
                                      +-----------------+------------------+
                                                        |
                                                        v
+-------------------------------------------------------------------------------------------------------------------+
| MediaPipe Tasks FaceLandmarker (478 3D Landmarks)                                                                 |
| -> Head Pose Validation (Yaw/Pitch/Roll <= 15 deg)                                                                |
| -> Blur Metric (Laplacian variance >= 100)                                                                        |
| -> EAR Blink & Open Eyes Detection                                                                                |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        |
                                                        v
+-------------------------------------------------------------------------------------------------------------------+
| 5-Point Affine Similarity Alignment (112x112 Normalized RGB Face Crop)                                            |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        |
                                                        v
+-------------------------------------------------------------------------------------------------------------------+
| Multi-Layer Anti-Spoofing & Liveness Pipeline                                                                     |
| -> MiniFASNet V2 ONNX Deep Texture Classifier                                                                     |
| -> FFT High-Frequency Screen Pixel Grid / Moire Analysis                                                          |
| -> YCrCb Chrominance Skin Color Reflection Check                                                                  |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        | (Pass: Liveness Score >= 0.70)
                                                        v
+-------------------------------------------------------------------------------------------------------------------+
| Deep Face Recognition (OpenCV SFace / ArcFace ONNX)                                                               |
| -> Unit L2-Normalized Feature Embedding Extraction (128D / 512D Vector)                                           |
| -> Strict Vector Matching: Cosine Similarity >= 0.72 with Ambiguity Gap >= 0.10                                   |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        |
                                                        v
+-------------------------------------------------------------------------------------------------------------------+
| Attendance Rules, Debounce & Shift Engine                                                                         |
| -> 60s Atomic Debounce Window (Redis TTL / In-Memory Cache)                                                        |
| -> Shift Calculation (Day, Evening & Overnight Shifts, Grace Periods, Early Departure, Overtime)                   |
| -> First-In / Last-Out Attendance State Resolution                                                                |
| -> Leave & Holiday Calendar Integration (Auto ON_LEAVE / HOLIDAY status)                                          |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        |
                                                        v
+-------------------------------------------------------------------------------------------------------------------+
| Compliance & Audit Trails                                                                                         |
| -> Attendance Regularization & Manual Overrides with mandatory reason                                             |
| -> Immutable Audit Logs (user, action, old/new diffs, timestamp)                                                  |
| -> Statutory Reporting & CSV Export (Bangladesh Labour Act Form 9 / Japan APPI)                                   |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        |
                                                        v
                                       +----------------+-----------------+
                                       |  PostgreSQL Database & Dashboard |
                                       +----------------------------------+
```

---

## Enterprise Feature Suite

1. **Enterprise Role-Based Access Control (RBAC):**
   - JWT authentication (`HS256`) with salted bcrypt password hashing.
   - Roles: `ADMIN`, `HR_MANAGER`, `LINE_MANAGER`, `EMPLOYEE`.

2. **Workforce Management:**
   - Full CRUD lifecycle with Organization, Branch, Department, and Shift assignments.
   - Soft-delete and privacy retention compliance.

3. **Webcam Face Enrollment Studio:**
   - Real-time MediaPipe quality checks (sharpness, lighting, head alignment).
   - Multi-sample guided capture (3 distinct acceptable poses).
   - Instant template extraction: **Raw images are strictly discarded after computing mathematical embeddings**.

4. **Live AI Attendance Kiosk:**
   - Real-time continuous webcam processing with interactive HUD target overlay.
   - Anti-spoofing defense against printed photos, smartphone screens, and video replays.
   - Configurable modes: `Auto (First-in / Last-out)`, `Force Check-In`, `Force Check-Out`.
   - 60-second atomic debounce preventing repeated duplicate punch records.
   - **Interactive Audio Feedback:** Synthesized Web Audio chime + SpeechSynthesis voice greetings.

5. **Shifts & Schedule Configuration:**
   - Standard day shifts, evening rosters, and overnight cross-day shifts.
   - Configurable grace periods, break times, and half-day thresholds.

6. **Leave Management & Holiday Calendar:**
   - Leave applications (Annual, Casual, Sick, Unpaid) with HR approval workflow.
   - Approved leaves automatically update daily records to `ON_LEAVE`.
   - Branch-specific official holiday scheduling.

7. **Manual Regularization & Immutable Audit Logs:**
   - Authorized adjustments for missing punches or maintenance periods.
   - Automatic recalculation of work duration, overtime, and late minutes.
   - Tamper-evident audit trail capturing actor, action, old values, and new values.

8. **Statutory Reporting & One-Click CSV Export:**
   - Monthly timesheets with per-employee working days, present, late, absent, work hours, overtime.
   - Export format compatible with statutory registers (Bangladesh Labour Act 2006 Form 9 & Japan APPI).

---

## Technology Stack

- **Backend:** FastAPI, Python 3.11, Uvicorn, Pydantic V2, SQLAlchemy 2.0.
- **Computer Vision:** MediaPipe 1.2.2 (FaceLandmarker Tasks API), OpenCV 4.10, ONNX Runtime 1.20, NumPy.
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide React, Web Audio API.
- **Database:** PostgreSQL 17 (production) with automatic SQLite fallback (`attendance_dev.db`).
- **Cache:** Redis with automatic thread-safe in-memory TTL dictionary fallback.

---

## Quick Start Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- PostgreSQL 17 (or use automatic SQLite fallback)
- Webcam (built-in or USB)

### 1. Backend Setup

```powershell
cd backend
pip install -r requirements.txt
python -c "from app.core.init_db import init_db; init_db()"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation live at: **http://localhost:8000/docs**

### 2. Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```
Dashboard live at: **http://localhost:3000**

### 3. Startup Scripts (One-Click)

From the project root:
- **Backend:** `powershell -ExecutionPolicy Bypass -File .\start-backend.ps1`
- **Frontend:** `powershell -ExecutionPolicy Bypass -File .\start-frontend.ps1`

---

## Default Admin Credentials

- **Email:** `admin@company.com`
- **Password:** `admin123`

---

## Automated Test Suite

Run the full automated test suite covering all 17 test cases:

```powershell
python -m pytest
```

Expected result:
```
backend/tests/test_api_endpoints.py ....                                 [ 23%]
backend/tests/test_computer_vision.py ....                               [ 47%]
backend/tests/test_database_and_security.py ....                         [ 70%]
backend/tests/test_leaves_holidays.py ..                                 [ 82%]
backend/tests/test_regularization.py .                                   [ 88%]
backend/tests/test_reports.py .                                          [ 94%]
backend/tests/test_shifts.py .                                           [100%]
====================== 17 passed in 16.04s =======================
```
