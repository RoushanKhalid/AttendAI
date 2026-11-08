from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings
from app.core.logging import logger

Base = declarative_base()

def get_engine():
    try:
        engine = create_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300,
            connect_args={"connect_timeout": 3} if "postgresql" in settings.DATABASE_URL else {}
        )
        # Test connection
        with engine.connect() as conn:
            logger.info("Successfully connected to primary database: %s", settings.DATABASE_URL.split("@")[-1])
        return engine
    except Exception as e:
        if settings.USE_SQLITE_FALLBACK:
            logger.warning(
                "Primary database connection failed (%s). Falling back to SQLite: %s",
                e, settings.SQLITE_URL
            )
            fallback_engine = create_engine(
                settings.SQLITE_URL,
                connect_args={"check_same_thread": False}
            )
            return fallback_engine
        raise e

engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
