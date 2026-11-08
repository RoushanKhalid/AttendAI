import pytest
import numpy as np
import cv2

from app.cv.alignment import align_face_112x112, REFERENCE_FACIAL_POINTS_112x112
from app.cv.recognition import recognition_engine, MatchResult
from app.cv.anti_spoofing import anti_spoofing
from app.cv.detector import face_detector
from app.cv.service import cv_service


def create_synthetic_face(w=400, h=400):
    """Draws a clean geometric synthetic face for reliable testing."""
    img = np.full((h, w, 3), 200, dtype=np.uint8)
    center = (w // 2, h // 2)
    # Head contour
    cv2.ellipse(img, center, (100, 130), 0, 0, 360, (180, 190, 215), -1)
    # Eyes
    cv2.circle(img, (center[0] - 40, center[1] - 30), 12, (255, 255, 255), -1)
    cv2.circle(img, (center[0] - 40, center[1] - 30), 5, (20, 20, 20), -1)
    cv2.circle(img, (center[0] + 40, center[1] - 30), 12, (255, 255, 255), -1)
    cv2.circle(img, (center[0] + 40, center[1] - 30), 5, (20, 20, 20), -1)
    # Nose
    cv2.line(img, (center[0], center[1] - 15), (center[0], center[1] + 15), (100, 110, 130), 3)
    # Mouth
    cv2.ellipse(img, (center[0], center[1] + 50), (35, 15), 0, 0, 180, (50, 50, 180), 3)
    return img


def test_face_alignment_shape():
    img = create_synthetic_face()
    landmarks_5pt = np.array([
        [160.0, 170.0],  # Left eye
        [240.0, 170.0],  # Right eye
        [200.0, 215.0],  # Nose tip
        [165.0, 250.0],  # Left mouth
        [235.0, 250.0]   # Right mouth
    ], dtype=np.float32)

    aligned = align_face_112x112(img, landmarks_5pt)
    assert aligned is not None
    assert aligned.shape == (112, 112, 3)


def test_feature_embedding_normalization():
    img = create_synthetic_face()
    landmarks_5pt = np.array([
        [160.0, 170.0],
        [240.0, 170.0],
        [200.0, 215.0],
        [165.0, 250.0],
        [235.0, 250.0]
    ], dtype=np.float32)
    aligned = align_face_112x112(img, landmarks_5pt)

    emb = recognition_engine.extract_embedding(aligned)
    assert emb is not None
    assert len(emb) in [128, 512]
    # Verify unit L2 norm
    l2_norm = float(np.linalg.norm(emb))
    assert abs(l2_norm - 1.0) < 1e-3


def test_vector_cosine_matching_known_vs_unknown():
    # Create two distinct unit vectors
    dim = 128
    v_alice = np.random.RandomState(42).randn(dim).astype(np.float32)
    v_alice = v_alice / np.linalg.norm(v_alice)

    v_bob = np.random.RandomState(99).randn(dim).astype(np.float32)
    v_bob = v_bob / np.linalg.norm(v_bob)

    enrolled = [
        {"employee_id": "emp-alice", "embedding": v_alice.tolist()},
        {"employee_id": "emp-bob", "embedding": v_bob.tolist()}
    ]

    # 1. Query with Alice's vector (slight noise)
    query_alice = v_alice + np.random.RandomState(1).randn(dim) * 0.05
    query_alice = query_alice / np.linalg.norm(query_alice)

    res_alice = recognition_engine.match_1_to_n(query_alice, enrolled, threshold=0.72)
    assert res_alice.is_matched is True
    assert res_alice.employee_id == "emp-alice"
    assert res_alice.confidence > 0.85

    # 2. Query with an unknown / distinct vector
    v_unknown = np.random.RandomState(1001).randn(dim).astype(np.float32)
    v_unknown = v_unknown / np.linalg.norm(v_unknown)

    res_unknown = recognition_engine.match_1_to_n(v_unknown, enrolled, threshold=0.72)
    # Must NOT assign unknown face to registered employees!
    assert res_unknown.is_matched is False
    assert "Unknown Face" in res_unknown.message


def test_anti_spoofing_evaluation():
    face = create_synthetic_face(200, 200)
    is_live, score, msg = anti_spoofing.evaluate_liveness(face, ear=0.32)
    assert isinstance(is_live, bool)
    assert 0.0 <= score <= 1.0
    assert msg is not None
