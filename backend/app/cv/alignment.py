import cv2
import numpy as np
from typing import Optional

# Standard reference 5 facial points for 112x112 ArcFace alignment
REFERENCE_FACIAL_POINTS_112x112 = np.array([
    [38.2946, 51.6963],  # Left pupil
    [73.5318, 51.5014],  # Right pupil
    [56.0252, 71.7366],  # Nose tip
    [41.5493, 92.3655],  # Left mouth corner
    [70.7299, 92.2041]   # Right mouth corner
], dtype=np.float32)


def align_face_112x112(image: np.ndarray, landmarks_5pt: np.ndarray) -> np.ndarray:
    """
    Performs similarity transformation (affine alignment) using 5 canonical points
    to warp and crop the face into standard 112x112 image.
    """
    assert landmarks_5pt.shape == (5, 2), "Landmarks must be of shape (5, 2)"
    
    src = np.array(landmarks_5pt, dtype=np.float32)
    dst = REFERENCE_FACIAL_POINTS_112x112.copy()

    # Estimate 2D affine transformation matrix with similarity constraint (rotation, scale, translation)
    tfm, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)
    
    if tfm is None:
        # Fallback to standard 3-point affine if partial 2D fails
        src_3pt = src[:3]
        dst_3pt = dst[:3]
        tfm = cv2.getAffineTransform(src_3pt, dst_3pt)

    # Warp image to 112x112
    aligned = cv2.warpAffine(
        image,
        tfm,
        (112, 112),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101
    )
    return aligned
