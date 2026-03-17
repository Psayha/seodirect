from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.db.session import SessionLocal
from app.models import User, UserRole


def main() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.login == settings.super_admin_login))
        if existing:
            existing.email = settings.super_admin_email
            existing.password_hash = settings.super_admin_password_hash
            existing.role = UserRole.SUPER_ADMIN
            existing.is_active = True
            db.add(existing)
            db.commit()
            print(f"Updated super admin in DB: {existing.login}")
            return

        user = User(
            login=settings.super_admin_login,
            email=settings.super_admin_email,
            password_hash=settings.super_admin_password_hash,
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        db.add(user)
        db.commit()
        print(f"Created super admin in DB: {user.login}")
    except SQLAlchemyError as exc:
        db.rollback()
        raise RuntimeError("Failed to initialize super admin. Did you run migrations?") from exc
    finally:
        db.close()


if __name__ == "__main__":
    main()
