import pytest
from app.core.security import get_password_hash, verify_password, create_access_token, decode_token
from app.core.cache import cache_manager
from app.core.database import SessionLocal
from app.models import User, Role, Shift, Organization, Branch, Department


def test_password_hashing():
    pwd = "SecurePassword123!"
    hashed = get_password_hash(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_token_generation_and_decode():
    subject = "user-12345"
    token = create_access_token(subject)
    assert token is not None
    payload = decode_token(token)
    assert payload is not None
    assert payload.get("sub") == subject
    assert "exp" in payload


def test_db_seeded_entities():
    db = SessionLocal()
    try:
        # Check Admin User
        admin = db.query(User).filter(User.username == "admin").first()
        assert admin is not None
        assert admin.is_superuser is True
        assert verify_password("admin123", admin.password_hash) is True

        # Check Roles
        roles = db.query(Role).all()
        role_names = [r.name for r in roles]
        assert "ADMIN" in role_names
        assert "HR_MANAGER" in role_names

        # Check Shifts
        shifts = db.query(Shift).all()
        assert len(shifts) >= 2
        day_shift = next((s for s in shifts if not s.is_overnight), None)
        assert day_shift is not None
        assert day_shift.grace_period_mins == 15

        # Check Organization & Branch
        org = db.query(Organization).first()
        assert org is not None
        branch = db.query(Branch).first()
        assert branch is not None
        assert branch.organization_id == org.id

        # Check Departments
        depts = db.query(Department).all()
        assert len(depts) >= 4
    finally:
        db.close()


def test_cache_manager_debounce():
    test_key = "test:debounce:emp-999"
    # First punch should succeed (returns True)
    assert cache_manager.set_if_not_exists(test_key, "recorded", ttl_seconds=2) is True
    
    # Immediate second punch should be debounced (returns False)
    assert cache_manager.set_if_not_exists(test_key, "recorded", ttl_seconds=2) is False
    
    # Clean up
    cache_manager.delete(test_key)
    # Should succeed again after deletion
    assert cache_manager.set_if_not_exists(test_key, "recorded", ttl_seconds=2) is True
    cache_manager.delete(test_key)

