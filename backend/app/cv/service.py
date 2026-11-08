import base64
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

from app.cv.detector import face_detector, FaceQualityResult
from app.cv.alignment import align_face_112x112
from app.cv.anti_spoofing import anti_spoofing
from app.cv.recognition import recognition_engine, MatchResult
from app.core.logging import logger


class ComputerVisionService:
    @staticmethod
    def decode_image(image_input: Any) -> Optional[np.ndarray]:
        """Decodes raw bytes, base64 data URL, or string into BGR numpy array."""
        try:
            if isinstance(image_input, np.ndarray):
                return image_input

            if isinstance(image_input, str):
                if image_input.startswith("data:image"):
                    image_input = image_input.split(",", 1)[1]
                raw_bytes = base64.b64decode(image_input)
            elif isinstance(image_input, (bytes, bytearray)):
                raw_bytes = image_input
            else:
                return None

            nparr = np.frombuffer(raw_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
        except Exception as e:
            logger.error("Failed to decode image: %s", e)
            return None

    def assess_frame(self, image_input: Any) -> Dict[str, Any]:
        """Assesses face presence and quality for live feedback during enrollment or kiosk scanning."""
        img = self.decode_image(image_input)
        if img is None:
            return {"success": False, "message": "Invalid image format", "faces": []}

        quality_results = face_detector.detect_and_assess(img)
        return {
            "success": True,
            "face_count": len(quality_results),
            "faces": [r.to_dict() for r in quality_results]
        }

    def process_enrollment_samples(self, sample_images: List[Any]) -> Dict[str, Any]:
        """
        Processes 3 to 5 multi-sample captures for face enrollment.
        Validates each sample, extracts aligned face, computes embeddings,
        and generates the unit-normalized centroid vector.
        """
        valid_embeddings = []
        quality_reports = []

        for idx, sample in enumerate(sample_images):
            img = self.decode_image(sample)
            if img is None:
                continue

            results = face_detector.detect_and_assess(img)
            if not results:
                quality_reports.append({"sample_index": idx, "is_valid": False, "reason": "No face detected"})
                continue

            # Take the most prominent face
            best_face = max(results, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
            
            if not best_face.is_valid:
                quality_reports.append({"sample_index": idx, "is_valid": False, "reason": best_face.message})
                continue

            # Align face
            aligned = align_face_112x112(img, best_face.landmarks_5pt)
            emb = recognition_engine.extract_embedding(aligned)
            valid_embeddings.append(emb)
            quality_reports.append({
                "sample_index": idx,
                "is_valid": True,
                "sharpness": best_face.blur_score,
                "brightness": best_face.brightness
            })

        if len(valid_embeddings) < 1:
            return {
                "success": False,
                "message": "No valid face samples met quality standards. Please ensure good lighting and look directly at the camera.",
                "quality_reports": quality_reports
            }

        # Compute centroid embedding (mean vector) and re-normalize to unit sphere
        stacked = np.array(valid_embeddings)
        centroid = np.mean(stacked, axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 1e-6:
            centroid = centroid / norm

        return {
            "success": True,
            "sample_count": len(valid_embeddings),
            "embedding": centroid.tolist(),
            "embedding_dim": len(centroid),
            "quality_reports": quality_reports
        }

    def recognize_stream_frame(
        self,
        image_input: Any,
        enrolled_templates: List[Dict[str, Any]],
        device_id: str = "kiosk_terminal_1",
        skip_liveness: bool = False
    ) -> Dict[str, Any]:
        """
        Processes a single live camera frame:
        1. Detects all faces.
        2. Evaluates anti-spoofing / liveness.
        3. Aligns face to 112x112.
        4. Extracts embedding.
        5. Matches against enrolled templates (1:N search).
        """
        img = self.decode_image(image_input)
        if img is None:
            return {"success": False, "message": "Failed to decode frame", "detections": []}

        detections = []
        quality_results = face_detector.detect_and_assess(img)

        for face in quality_results:
            bbox = face.bbox
            face_crop = img[bbox[1]:bbox[3], bbox[0]:bbox[2]]

            # 1. Anti-Spoofing Liveness Gate
            if skip_liveness:
                is_live, liveness_score, liveness_msg = True, 1.0, "Liveness Bypassed (Trusted/Test)"
            else:
                is_live, liveness_score, liveness_msg = anti_spoofing.evaluate_liveness(face_crop, face.ear)

            detection_entry = {
                "bbox": list(bbox),
                "is_live": is_live,
                "liveness_score": round(liveness_score, 3),
                "liveness_message": liveness_msg,
                "is_matched": False,
                "employee_id": None,
                "confidence": 0.0,
                "match_message": "Not evaluated"
            }

            if not is_live:
                detection_entry["match_message"] = "Rejected: Presentation attack / Spoof suspected"
                detections.append(detection_entry)
                continue

            # 2. Alignment & Feature Extraction
            aligned = align_face_112x112(img, face.landmarks_5pt)
            query_emb = recognition_engine.extract_embedding(aligned)

            # 3. 1:N Vector Cosine Search
            match_res = recognition_engine.match_1_to_n(query_emb, enrolled_templates)
            detection_entry.update({
                "is_matched": match_res.is_matched,
                "employee_id": match_res.employee_id,
                "confidence": round(match_res.confidence, 4),
                "margin_gap": round(match_res.margin_gap, 4),
                "match_message": match_res.message
            })

            detections.append(detection_entry)

        return {
            "success": True,
            "total_faces_detected": len(quality_results),
            "detections": detections
        }


cv_service = ComputerVisionService()
