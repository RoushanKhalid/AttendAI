from datetime import time
from sqlalchemy.orm import Session
from app.core.database import engine, Base
from app.core.config import settings
from app.core.security import get_password_hash
from app.core.logging import logger
from app.models import (
    User, Role, Organization, Branch, Department, Shift, UserRole
)


def init_db(db: Session = None):
    # Create all tables
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)

    close_session_at_end = False
    if db is None:
        from app.core.database import SessionLocal
        db = SessionLocal()
        close_session_at_end = True

    try:
        # 1. Seed Roles
        roles_data = [
            ("ADMIN", "System Administrator with full access"),
            ("HR_MANAGER", "Human Resources Manager with employee & attendance management"),
            ("LINE_MANAGER", "Department / Line Manager for team supervision"),
            ("EMPLOYEE", "Standard employee self-service access"),
        ]
        created_roles = {}
        for role_name, role_desc in roles_data:
            role = db.query(Role).filter(Role.name == role_name).first()
            if not role:
                role = Role(name=role_name, description=role_desc)
                db.add(role)
                db.flush()
                logger.info("Created role: %s", role_name)
            created_roles[role_name] = role

        # 2. Seed Default Organization
        org = db.query(Organization).filter(Organization.code == "ORG-001").first()
        if not org:
            org = Organization(name="Global Enterprise Inc.", code="ORG-001")
            db.add(org)
            db.flush()
            logger.info("Created organization: %s", org.name)

        # 3. Seed Default Branch
        branch = db.query(Branch).filter(Branch.organization_id == org.id).first()
        if not branch:
            branch = Branch(
                organization_id=org.id,
                name="Main Headquarters",
                timezone="Asia/Dhaka",
                address="Gulshan Avenue, Dhaka, Bangladesh"
            )
            db.add(branch)
            db.flush()
            logger.info("Created branch: %s", branch.name)

        # 4. Seed Default Departments
        depts_data = [
            ("Engineering", "ENG"),
            ("Human Resources", "HR"),
            ("Operations", "OPS"),
            ("Finance & Accounts", "FIN")
        ]
        for dept_name, dept_code in depts_data:
            dept = db.query(Department).filter(
                Department.branch_id == branch.id,
                Department.name == dept_name
            ).first()
            if not dept:
                dept = Department(branch_id=branch.id, name=dept_name, code=dept_code)
                db.add(dept)
                logger.info("Created department: %s", dept_name)
        db.flush()

        # 5. Seed Default Shifts
        shifts_data = [
            {
                "name": "General Day Shift",
                "code": "DAY-09-18",
                "start_time": time(9, 0),
                "end_time": time(18, 0),
                "grace_period_mins": 15,
                "half_day_late_mins": 120,
                "break_duration_mins": 60,
                "is_overnight": False,
            },
            {
                "name": "Night Owl Shift",
                "code": "NIGHT-22-06",
                "start_time": time(22, 0),
                "end_time": time(6, 0),
                "grace_period_mins": 15,
                "half_day_late_mins": 120,
                "break_duration_mins": 45,
                "is_overnight": True,
            }
        ]
        for s in shifts_data:
            shift = db.query(Shift).filter(Shift.code == s["code"]).first()
            if not shift:
                shift = Shift(**s)
                db.add(shift)
                logger.info("Created shift: %s", s["name"])
        db.flush()

        # 6. Seed Super Admin User
        admin_user = db.query(User).filter(User.email == settings.DEFAULT_ADMIN_EMAIL).first()
        if not admin_user:
            admin_user = User(
                username="admin",
                email=settings.DEFAULT_ADMIN_EMAIL,
                full_name=settings.DEFAULT_ADMIN_NAME,
                password_hash=get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
                is_active=True,
                is_superuser=True
            )
            db.add(admin_user)
            db.flush()

            # Attach ADMIN role
            admin_role = created_roles.get("ADMIN")
            if admin_role:
                db.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))
            logger.info("Created default administrator: %s", settings.DEFAULT_ADMIN_EMAIL)

        db.commit()
        logger.info("Database initialization and seeding completed successfully.")
    except Exception as e:
        db.rollback()
        logger.error("Error during database initialization: %s", e)
        raise e
    finally:
        if close_session_at_end:
            db.close()


if __name__ == "__main__":
    init_db()
