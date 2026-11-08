import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Float, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class FaceTemplate(Base):
    __tablename__ = "face_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Store normalized 512D or 128D float embedding
    embedding = Column(JSON, nullable=False)
    embedding_dim = Column(Integer, default=512)
    model_version = Column(String(50), default="sface_v1")
    quality_score = Column(Float, default=1.0)
    sample_count = Column(Integer, default=1)
    is_active = Column(Boolean, default=True, index=True)
    deactivated_at = Column(DateTime, nullable=True)
    purged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="face_templates")


class BiometricConsent(Base):
    __tablename__ = "biometric_consents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    consent_given = Column(Boolean, default=True, nullable=False)
    consent_version = Column(String(50), default="v1.0-2026", nullable=False)
    ip_address = Column(String(50), nullable=True)
    withdrawn_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="biometric_consents")
