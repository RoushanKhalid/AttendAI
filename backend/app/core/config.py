import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Face Recognition Attendance System"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Security
    SECRET_KEY: str = "temporary-dev-secret-change-in-production-ai-attendance-jwt"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    DATABASE_URL: str = "postgresql://postgres:root@localhost:5432/attendance_db"
    USE_SQLITE_FALLBACK: bool = True
    SQLITE_URL: str = "sqlite:///./attendance_dev.db"

    # Redis Cache & Debounce
    REDIS_URL: str = "redis://localhost:6379/0"

    # CV & AI Parameters (Calibrated for OpenCV SFace: Cosine threshold ~0.363, balanced liveness)
    FACE_RECOGNITION_THRESHOLD: float = 0.38
    FACE_AMBIGUITY_MARGIN: float = 0.08
    LIVENESS_THRESHOLD: float = 0.45
    PUNCH_DEBOUNCE_SECONDS: int = 60
    MIN_FACE_SIZE_PX: int = 120
    MAX_YAW_ANGLE_DEG: float = 20.0
    MAX_PITCH_ANGLE_DEG: float = 18.0

    # Default Admin
    DEFAULT_ADMIN_EMAIL: str = "admin@company.com"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    DEFAULT_ADMIN_NAME: str = "System Administrator"

    # Model Context Protocol (MCP)
    MCP_SERVER_NAME: str = "AttendAI MCP"
    MCP_PATH: str = "/mcp"
    MCP_DEFAULT_USER_EMAIL: Optional[str] = None
    MCP_ALLOW_HTTP_DEFAULT_USER: bool = False

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*"
    ]

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()

