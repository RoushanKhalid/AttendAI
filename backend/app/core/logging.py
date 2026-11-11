import logging
import sys

def setup_logging(stream=None):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(stream or sys.stdout)
        ],
        force=stream is not None,
    )
    # Suppress verbose third-party logs
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("absl").setLevel(logging.ERROR)

logger = logging.getLogger("attendance_system")

