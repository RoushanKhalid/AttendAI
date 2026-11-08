import math
import os
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from app.core.config import settings
from app.core.logging import logger


class FaceQualityResult:
    def __init__(
        self,
        is_valid: bool,
        message: str,
        bbox: Optional[Tuple[int, int, int, int]] = None,
        landmarks_5pt: Optional[np.ndarray] = None,
        yaw: float = 0.0,
        pitch: float = 0.0,
        roll: float = 0.0,
        blur_score: float = 0.0,
        brightness: float = 0.0,
        ear: float = 0.0
    ):
        self.is_valid = is_valid
        self.message = message
        self.bbox = bbox  # (x1, y1, x2, y2)
        self.landmarks_5pt = landmarks_5pt  # (5, 2) float32
        self.yaw = yaw
        self.pitch = pitch
        self.roll = roll
        self.blur_score = blur_score
        self.brightness = brightness
        self.ear = ear

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "message": self.message,
            "bbox": list(self.bbox) if self.bbox else None,
            "yaw": round(self.yaw, 2),
            "pitch": round(self.pitch, 2),
            "roll": round(self.roll, 2),
            "blur_score": round(self.blur_score, 2),
            "brightness": round(self.brightness, 2),
            "ear": round(self.ear, 3)
        }


class FaceDetectorService:
    def __init__(self):
        self._landmarker = None
        self._init_mediapipe()

    def _init_mediapipe(self):
        try:
            import mediapipe as mp
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision
            
            # Check for local model task file
            model_path = os.path.join(os.path.dirname(__file__), "..", "..", "models", "face_landmarker.task")
            model_path = os.path.abspath(model_path)
            
            if not os.path.exists(model_path):
                # Try downloading from official Google storage
                import urllib.request
                url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
                logger.info("Downloading MediaPipe face_landmarker.task model...")
                os.makedirs(os.path.dirname(model_path), exist_ok=True)
                urllib.request.urlretrieve(url, model_path)
                logger.info("MediaPipe face_landmarker.task downloaded successfully.")

            base_options = python.BaseOptions(model_asset_path=model_path)
            options = vision.FaceLandmarkerOptions(
                base_options=base_options,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=True,
                num_faces=5,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            self._landmarker = vision.FaceLandmarker.create_from_options(options)
            logger.info("MediaPipe FaceLandmarker initialized with 3D transformation matrices.")
        except Exception as e:
            logger.warning("Could not initialize MediaPipe Tasks FaceLandmarker: %s. Using OpenCV Cascade/DNN fallback.", e)
            self._landmarker = None

    def detect_and_assess(self, image: np.ndarray) -> List[FaceQualityResult]:
        """
        Runs face detection, landmark extraction, and quality gate.
        Returns a list of FaceQualityResult (one per detected face).
        """
        h, w = image.shape[:2]
        results = []

        if self._landmarker is not None:
            import mediapipe as mp
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
            detection_result = self._landmarker.detect(mp_image)

            if not detection_result.face_landmarks:
                return []

            for idx, landmarks in enumerate(detection_result.face_landmarks):
                # Extract coordinates
                pts = np.array([(lm.x * w, lm.y * h) for lm in landmarks], dtype=np.float32)
                x1, y1 = np.min(pts, axis=0)
                x2, y2 = np.max(pts, axis=0)
                
                # Expand box slightly
                pad_w = (x2 - x1) * 0.1
                pad_h = (y2 - y1) * 0.1
                bbox = (
                    int(max(0, x1 - pad_w)),
                    int(max(0, y1 - pad_h)),
                    int(min(w, x2 + pad_w)),
                    int(min(h, y2 + pad_h))
                )

                face_w = bbox[2] - bbox[0]
                face_h = bbox[3] - bbox[1]

                # Canonical 5 landmarks: Left pupil (468 or 33), Right pupil (473 or 263), Nose tip (1), Left mouth (61), Right mouth (291)
                left_eye = pts[468] if len(pts) > 468 else pts[33]
                right_eye = pts[473] if len(pts) > 473 else pts[263]
                nose = pts[1]
                left_mouth = pts[61]
                right_mouth = pts[291]
                landmarks_5pt = np.array([left_eye, right_eye, nose, left_mouth, right_mouth], dtype=np.float32)

                # Head Pose Estimation via Facial Transformation Matrix
                yaw, pitch, roll = 0.0, 0.0, 0.0
                if detection_result.facial_transformation_matrixes and len(detection_result.facial_transformation_matrixes) > idx:
                    matrix = np.array(detection_result.facial_transformation_matrixes[idx])
                    # Extract Euler angles from rotation matrix
                    r00, r01, r02 = matrix[0, 0], matrix[0, 1], matrix[0, 2]
                    r10, r11, r12 = matrix[1, 0], matrix[1, 1], matrix[1, 2]
                    r20, r21, r22 = matrix[2, 0], matrix[2, 1], matrix[2, 2]
                    
                    pitch = math.degrees(math.atan2(-r21, r22))
                    yaw = math.degrees(math.atan2(r20, math.sqrt(r21**2 + r22**2)))
                    roll = math.degrees(math.atan2(r10, r00))
                else:
                    # Geometric approximation
                    eye_dx = right_eye[0] - left_eye[0]
                    eye_dy = right_eye[1] - left_eye[1]
                    roll = math.degrees(math.atan2(eye_dy, eye_dx))
                    
                    eye_center_x = (left_eye[0] + right_eye[0]) / 2.0
                    yaw = ((nose[0] - eye_center_x) / (face_w / 2.0)) * 45.0

                # Eye Aspect Ratio (EAR)
                ear = self._compute_ear(pts)

                # Quality evaluations
                face_crop = image[bbox[1]:bbox[3], bbox[0]:bbox[2]]
                blur_score = self._compute_blur(face_crop)
                brightness = float(np.mean(cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY))) if face_crop.size > 0 else 0.0

                # Quality checks
                is_valid = True
                message = "Face Quality OK"

                if min(face_w, face_h) < settings.MIN_FACE_SIZE_PX:
                    is_valid = False
                    message = f"Face too far. Move closer to the camera (current: {min(face_w, face_h)}px, min: {settings.MIN_FACE_SIZE_PX}px)."
                elif abs(yaw) > settings.MAX_YAW_ANGLE_DEG:
                    is_valid = False
                    message = f"Please face the camera directly (Yaw turned: {round(yaw, 1)}°)."
                elif abs(pitch) > settings.MAX_PITCH_ANGLE_DEG:
                    is_valid = False
                    message = f"Please level your head (Pitch tilt: {round(pitch, 1)}°)."
                elif blur_score < 40.0:
                    is_valid = False
                    message = f"Image is blurry. Please hold steady (Sharpness: {round(blur_score, 1)})."
                elif brightness < 40.0:
                    is_valid = False
                    message = "Lighting is too dark. Increase ambient illumination."
                elif brightness > 230.0:
                    is_valid = False
                    message = "Severe glare or overexposure detected."

                results.append(FaceQualityResult(
                    is_valid=is_valid,
                    message=message,
                    bbox=bbox,
                    landmarks_5pt=landmarks_5pt,
                    yaw=yaw,
                    pitch=pitch,
                    roll=roll,
                    blur_score=blur_score,
                    brightness=brightness,
                    ear=ear
                ))

            return results

        # Fallback using OpenCV Haar Cascade if MediaPipe Landmarker is disabled
        return self._detect_opencv_fallback(image)

    def _compute_ear(self, pts: np.ndarray) -> float:
        """Computes Eye Aspect Ratio for blink / liveness check."""
        try:
            # Left Eye: indices 33, 160, 158, 133, 153, 144
            p2_p6 = np.linalg.norm(pts[160] - pts[144])
            p3_p5 = np.linalg.norm(pts[158] - pts[153])
            p1_p4 = np.linalg.norm(pts[33] - pts[133])
            ear_left = (p2_p6 + p3_p5) / (2.0 * p1_p4 + 1e-6)
            
            # Right Eye: indices 362, 385, 387, 263, 373, 380
            p2_p6_r = np.linalg.norm(pts[385] - pts[380])
            p3_p5_r = np.linalg.norm(pts[387] - pts[373])
            p1_p4_r = np.linalg.norm(pts[362] - pts[263])
            ear_right = (p2_p6_r + p3_p5_r) / (2.0 * p1_p4_r + 1e-6)
            
            return float((ear_left + ear_right) / 2.0)
        except Exception:
            return 0.30

    def _compute_blur(self, face_crop: np.ndarray) -> float:
        if face_crop.size == 0:
            return 0.0
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    def _detect_opencv_fallback(self, image: np.ndarray) -> List[FaceQualityResult]:
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(cascade_path)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
        
        results = []
        for (x, y, fw, fh) in faces:
            bbox = (int(x), int(y), int(x + fw), int(y + fh))
            # Rough synthetic 5 points for fallback
            left_eye = np.array([x + fw * 0.3, y + fh * 0.35], dtype=np.float32)
            right_eye = np.array([x + fw * 0.7, y + fh * 0.35], dtype=np.float32)
            nose = np.array([x + fw * 0.5, y + fh * 0.55], dtype=np.float32)
            left_mouth = np.array([x + fw * 0.35, y + fh * 0.75], dtype=np.float32)
            right_mouth = np.array([x + fw * 0.65, y + fh * 0.75], dtype=np.float32)
            landmarks_5pt = np.array([left_eye, right_eye, nose, left_mouth, right_mouth], dtype=np.float32)
            
            face_crop = image[bbox[1]:bbox[3], bbox[0]:bbox[2]]
            blur_score = self._compute_blur(face_crop)
            brightness = float(np.mean(gray[bbox[1]:bbox[3], bbox[0]:bbox[2]]))
            
            is_valid = fw >= settings.MIN_FACE_SIZE_PX and blur_score >= 40.0
            msg = "Face Detected (OpenCV Fallback)" if is_valid else "Face too small or blurry"
            
            results.append(FaceQualityResult(
                is_valid=is_valid,
                message=msg,
                bbox=bbox,
                landmarks_5pt=landmarks_5pt,
                blur_score=blur_score,
                brightness=brightness,
                ear=0.30
            ))
        return results


face_detector = FaceDetectorService()
