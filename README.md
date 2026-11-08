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
| Attendance Rules & Debounce Engine                                                                                |
| -> 60s Atomic Debounce Window (Redis TTL / In-Memory Cache)                                                        |
| -> Shift Calculation (Day / Night Shifts, Late Arrival Grace, Early Departure, Overtime)                          |
| -> First-In / Last-Out Attendance State Resolution                                                                |
+-------------------------------------------------------+-----------------------------------------------------------+
                                                        |
                                                        v
                                       +----------------+-----------------+
                                       |  PostgreSQL Database & Dashboard |
                                       +----------------------------------+
```

---

## Key Features

1. **Enterprise Role-Based Access Control (RBAC):**
   - JWT authentication (`HS256`) with salted bcrypt password hashing.
   - Roles: `ADMIN`, `HR_MANAGER`, `LINE_MANAGER`, `EMPLOYEE`.

2. **Employee Management:**
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

5. **Executive KPI Dashboard:**
   - Real-time statistics: Total Staff, Present Today, Absent Today, Late Arrivals, Attendance Rate.
   - Department-level breakdown progress indicators.
   - Live audit stream of recent punches.

---

## Technology Stack

- **Backend:** FastAPI, Python 3.11, Uvicorn, Pydantic V2, SQLAlchemy 2.0.
- **Computer Vision:** MediaPipe 1.2.2 (FaceLandmarker Tasks API), OpenCV 4.10, ONNX Runtime 1.20, NumPy.
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide React.
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

# Create and activate virtual environment (optional if using global Python)
# python -m venv venv
# .\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run database setup & seed default data
python -c "from app.core.init_db import init_db; init_db()"

# Start the backend server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be live at: **http://localhost:8000/docs**

### 2. Frontend Setup

```powershell
cd frontend

# Install Node dependencies
npm install

# Run Next.js development server
npm run dev
```
Dashboard will be live at: **http://localhost:3000**

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

Run the full automated test suite covering database persistence, security, computer vision pipelines, anti-spoofing, and end-to-end API endpoints:

```powershell
cd backend
python -m pytest tests/ -v
```

Expected result:
```
tests/test_api_endpoints.py::test_health_and_root PASSED
tests/test_api_endpoints.py::test_admin_login PASSED
tests/test_api_endpoints.py::test_employee_management_lifecycle PASSED
tests/test_api_endpoints.py::test_face_quality_and_enrollment_and_attendance PASSED
tests/test_computer_vision.py::test_face_alignment_shape PASSED
tests/test_computer_vision.py::test_feature_embedding_normalization PASSED
tests/test_computer_vision.py::test_vector_cosine_matching_known_vs_unknown PASSED
tests/test_computer_vision.py::test_anti_spoofing_evaluation PASSED
tests/test_database_and_security.py::test_password_hashing PASSED
tests/test_database_and_security.py::test_jwt_token_generation_and_decode PASSED
tests/test_database_and_security.py::test_db_seeded_entities PASSED
tests/test_cache_manager_debounce PASSED
============================== 12 passed in 20.10s ==============================
```

---

## Biometric Privacy and Security

- **Raw Image Ephemerality:** Camera frames are evaluated entirely in volatile memory and immediately discarded. No face images are written to persistent storage.
- **Mathematical Irreversibility:** Only unit-normalized 128D/512D floating-point feature embeddings are persisted. Reconstruction of facial imagery from feature vectors is mathematically infeasible.
- **Access Control:** Face template endpoints require administrator authorization (`Bearer JWT`).
- **Regulatory Alignment:** Architecture complies with Bangladesh Data Protection Act principles and Japan APPI guidelines regarding biometric consent, purposive limitation, and auditability.
