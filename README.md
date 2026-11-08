# AI Face Recognition Attendance Management System

A high-performance, privacy-centric Employee Attendance Management System built with **MediaPipe**, **Deep Face Recognition (SFace / ArcFace ONNX)**, **MiniFASNet Liveness Detection**, **FastAPI**, **PostgreSQL**, and **Next.js 14**.

---

## Architecture Overview

```Haskell
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
| Multi-Modal Anti-Spoofing & Liveness Pipeline                                                                     |
| -> MiniFASNet V2 ONNX Deep Texture Classifier (Standard [0.0, 1.0] Tensor Normalization)                          |
| -> FFT High-Frequency Screen Pixel Grid / Moire Spectrum Analysis                                                 |
| -> Multi-Ethnic YCrCb Chrominance Skin Color Reflection Verification                                              |
| -> Eye Aspect Ratio (EAR) Live Blink / Eye Openness Geometry Check                                                |
| -> Configurable Kiosk Operation: Shielded (Active Anti-Spoof) vs. Office/Testing Bypass                          |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        | (Pass: Liveness Score >= 0.45 or Office Bypass)
                                                        v
+-------------------------------------------------------------------------------------------------------------------+
| Deep Face Recognition (OpenCV SFace / ArcFace ONNX)                                                               |
| -> Unit L2-Normalized Feature Embedding Extraction (128D SFace SphereFace Vector)                                 |
| -> Calibrated Vector Matching: Cosine Similarity >= 0.38 (SFace Spec: 0.363) with Ambiguity Gap >= 0.08           |
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

3. **Webcam Face Enrollment Studio & 1-Step Quick Register:**
   - **Studio Enrollment:** Multi-angle guided capture (3 distinct poses) with real-time pose, blur, and lighting feedback.
   - **Instant Quick Register:** 5-second single-snapshot auto-enrollment modal directly accessible from the Kiosk HUD.
   - **Privacy First:** Raw camera images are immediately discarded; only 128D mathematical feature vectors are saved.
4. **Live AI Attendance Kiosk:**

   - Real-time continuous webcam processing with interactive targeting HUD.
   - **Dual Anti-Spoofing Controls:**
     - `Shielded (Active Anti-Spoof)`: Multi-modal defense combining MiniFASNet V2, FFT spectrum, and YCrCb chrominance.
     - `Office / Testing Bypass Mode`: Disables liveness gate for testing or environments with strong monitor glare.
   - Configurable punch modes: `Auto (First-in / Last-out)`, `Force Check-In`, `Force Check-Out`.
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

### 3. Startup Scripts (Zero-Hassle & One-Click)

From the project root:

- **All-in-One Startup (Backend + Frontend together):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\start-all.ps1
  ```
- **Stop All Running Services cleanly:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\stop-all.ps1
  ```
- **Dedicated Individual Services:**
  - **Backend Only:** `powershell -ExecutionPolicy Bypass -File .\start-backend.ps1`
  - **Frontend Only:** `powershell -ExecutionPolicy Bypass -File .\start-frontend.ps1`

---

## Default Admin Credentials

- **Email:** `admin@company.com`
- **Password:** `admin123`

---

## Automated Test Suite

Run the full automated test suite covering all 18 test cases across Computer Vision, Biometrics, Attendance Engine, Shifts, Regularization, and Reports:

```powershell
python -m pytest
```

Expected result:

```
backend/tests/test_api_endpoints.py ....                                 [ 22%]
backend/tests/test_computer_vision.py ....                               [ 44%]
backend/tests/test_database_and_security.py ....                         [ 66%]
backend/tests/test_leaves_holidays.py ..                                 [ 77%]
backend/tests/test_quick_register.py .                                   [ 83%]
backend/tests/test_regularization.py .                                   [ 88%]
backend/tests/test_reports.py .                                          [ 94%]
backend/tests/test_shifts.py .                                           [100%]
====================== 18 passed in 48.20s =======================
```

---

## Diagnostics & Troubleshooting: "Why Can't I Be Identified?"

If an employee or user stands in front of the kiosk webcam and is not recognized, check the following diagnostic factors:

### 1. Calibrated Cosine Similarity Threshold (OpenCV SFace)
- **Model:** `face_recognition_sface_2021dec.onnx` (128D SphereFace embedding).
- **OpenCV Official Specification:** A cosine similarity score $\ge 0.363$ indicates the same person.
- **Configured Threshold:** `FACE_RECOGNITION_THRESHOLD=0.38` in `backend/.env`.
- **Diagnostic Note:** If threshold was previously set to legacy `0.72`, live webcam captures under varied angles/lighting scoring between `0.45` and `0.65` were falsely classified as unknown faces. Ensure `FACE_RECOGNITION_THRESHOLD=0.38` in `.env`.

### 2. Anti-Spoofing & Webcam Lighting (Liveness Gate)
- On laptop webcams, bright monitor reflection or uneven ambient lighting can trigger false positive spoof rejections.
- **Resolution:**
  - Position yourself in a naturally illuminated area without strong backlight.
  - In the Kiosk UI top navigation bar, toggle the Anti-Spoof dropdown from `🛡️ Anti-Spoof: Active` to `⚡ Office / Bypass Mode` for development or indoor testing.
  - Or calibrate `LIVENESS_THRESHOLD=0.45` in `backend/.env`.

### 3. Face Reticle & Head Alignment
- MediaPipe requires:
  - **Face Size:** Minimum 120 pixels (stand 50–80 cm from the camera so your face comfortably fills the green reticle).
  - **Head Pose:** Face the camera directly ($\text{Yaw} \le 20^\circ$, $\text{Pitch} \le 18^\circ$).
  - **Hold Steady:** Wait ~0.5 seconds for auto-focus to stabilize blur variance ($\ge 40$).

### 4. Ambiguity Margin Gap & Duplicate Profiles
- The recognition engine strictly enforces `FACE_AMBIGUITY_MARGIN=0.08`: if two distinct employee profiles in the database match the same face with nearly identical similarity ($\Delta < 0.08$), verification is safely rejected to prevent identity confusion.
- **Resolution:** Verify that the employee does not have duplicate accounts registered with the same face.

### 5. Biometric Template Verification in Database
- Verify that the employee has an active biometric template:
  ```powershell
  python -c "from app.core.database import SessionLocal; from app.models import FaceTemplate, Employee; db = SessionLocal(); [print(f'{e.full_name} ({e.employee_code}) - active={t.is_active}') for t, e in db.query(FaceTemplate, Employee).join(Employee).all()]"
  ```
- If an employee shows `active=False`, re-enroll their face from the **Employees** tab or **Face Enrollment Studio**.
```
