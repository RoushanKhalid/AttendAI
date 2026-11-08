import os
import cv2
import numpy as np
from typing import Tuple
from app.core.config import settings
from app.core.logging import logger


class AntiSpoofingService:
    def __init__(self):
        self._onnx_session = None
        self._init_minifasnet()

    def _init_minifasnet(self):
        try:
            import onnxruntime as ort
            model_path = os.path.join(os.path.dirname(__file__), "..", "..", "models", "minifasnet_v2.onnx")
            model_path = os.path.abspath(model_path)
            
            if not os.path.exists(model_path):
                # Try downloading from open Hugging Face repository
                import urllib.request
                url = "https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx"
                logger.info("Downloading MiniFASNet V2 anti-spoofing ONNX model...")
                os.makedirs(os.path.dirname(model_path), exist_ok=True)
                urllib.request.urlretrieve(url, model_path)
                logger.info("MiniFASNet V2 downloaded successfully.")

            self._onnx_session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            logger.info("MiniFASNet anti-spoofing ONNX session initialized.")
        except Exception as e:
            logger.info("Using multi-scale texture & frequency anti-spoofing fallback: %s", e)
            self._onnx_session = None

    def evaluate_liveness(self, face_crop: np.ndarray, ear: float = 0.3) -> Tuple[bool, float, str]:
        """
        Evaluates whether the presented face is a live human or a presentation attack (photo/screen).
        Combines deep feature anti-spoofing, FFT frequency spectrum, YCrCb skin distribution,
        and natural eye geometry (EAR).
        Returns: (is_live: bool, liveness_score: float, details: str)
        """
        if face_crop is None or face_crop.size == 0:
            return False, 0.0, "Empty face region"

        # 1. Texture & Frequency Domain Analysis (FFT Spectrum)
        fft_score = self._compute_fft_texture_score(face_crop)
        
        # 2. Color Balance & Chrominance Divergence (Real skin has characteristic YCrCb distribution)
        ycrcb_score = self._compute_skin_chroma_score(face_crop)

        # 3. Eye Aspect Ratio (EAR) live eye openness score
        ear_score = float(np.clip(1.0 - abs(ear - 0.28) / 0.22, 0.35, 1.0)) if ear > 0 else 0.50

        # 4. MiniFASNet Deep Network (if model session loaded)
        deep_score = fft_score
        if self._onnx_session is not None:
            try:
                deep_score = self._run_minifasnet(face_crop)
            except Exception as e:
                logger.debug("MiniFASNet inference fallback: %s", e)
                deep_score = fft_score

        # Multi-modal weighted ensemble:
        # Deep network: 35%, FFT Texture: 25%, Chroma: 20%, Natural Eye/Geometry: 20%
        final_score = (0.35 * deep_score) + (0.25 * fft_score) + (0.20 * ycrcb_score) + (0.20 * ear_score)
        final_score = float(np.clip(final_score, 0.0, 1.0))

        is_live = final_score >= settings.LIVENESS_THRESHOLD
        reason = "Live Face Verified" if is_live else f"Potential Presentation Attack (Score: {round(final_score, 2)} < {settings.LIVENESS_THRESHOLD})"

        return is_live, final_score, reason

    def _run_minifasnet(self, face_crop: np.ndarray) -> float:
        # Resize to 80x80 as expected by MiniFASNet V2
        resized = cv2.resize(face_crop, (80, 80))
        # Convert BGR to RGB and scale to [0.0, 1.0] (Silent-Face-Anti-Spoofing ToTensor standard)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tensor = np.transpose(rgb, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0)  # Shape: (1, 3, 80, 80)

        input_name = self._onnx_session.get_inputs()[0].name
        outputs = self._onnx_session.run(None, {input_name: tensor})
        probs = outputs[0][0]  # Logits: [spoof_print, REAL_FACE, spoof_screen]
        
        # Apply stable softmax
        exp_probs = np.exp(probs - np.max(probs))
        softmax_probs = exp_probs / np.sum(exp_probs)
        return float(softmax_probs[1]) if len(softmax_probs) > 1 else float(softmax_probs[0])

    def _compute_fft_texture_score(self, face_crop: np.ndarray) -> float:
        """Analyzes high-frequency Fourier components (screen pixels/print Moire create unnatural spikes)."""
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        f = np.fft.fft2(gray)
        fshift = np.fft.fftshift(f)
        magnitude_spectrum = 20 * np.log(np.abs(fshift) + 1e-6)

        # High frequency ring energy vs low frequency center
        cy, cx = h // 2, w // 2
        r_inner = min(h, w) // 8
        r_outer = min(h, w) // 3

        y, x = np.ogrid[:h, :w]
        mask_center = (x - cx)**2 + (y - cy)**2 <= r_inner**2
        mask_ring = ((x - cx)**2 + (y - cy)**2 <= r_outer**2) & ~mask_center

        center_energy = np.mean(magnitude_spectrum[mask_center])
        ring_energy = np.mean(magnitude_spectrum[mask_ring])
        
        ratio = ring_energy / (center_energy + 1e-6)
        # Natural human skin has smooth attenuation (ratio ~ 0.65 to 0.90)
        score = 1.0 - abs(ratio - 0.78) / 0.78
        return float(np.clip(score, 0.25, 0.98))

    def _compute_skin_chroma_score(self, face_crop: np.ndarray) -> float:
        """Evaluates human skin distribution in YCrCb color space across diverse ethnicities."""
        ycrcb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2YCrCb)
        cr = ycrcb[:, :, 1]
        cb = ycrcb[:, :, 2]
        # Human skin range across diverse skin tones: 125 <= Cr <= 185 and 70 <= Cb <= 138
        skin_mask = (cr >= 125) & (cr <= 185) & (cb >= 70) & (cb <= 138)
        skin_ratio = np.sum(skin_mask) / (face_crop.shape[0] * face_crop.shape[1])
        return float(np.clip(skin_ratio * 1.5 + 0.15, 0.25, 1.0))


anti_spoofing = AntiSpoofingService()

