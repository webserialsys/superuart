from sqlalchemy.orm import Session
from uuid6 import uuid7

from src.app import models
from src.app.core.security import get_password_hash
from tests.conftest import fake


def create_user(db: Session, is_super_user: bool = False) -> models.User:
    _ = is_super_user

    _user = models.User(
        full_name=fake.name(),
        email=fake.email(),
        hashed_password=get_password_hash(fake.password()),
        uuid=uuid7(),
    )

    db.add(_user)
    db.commit()
    db.refresh(_user)

    return _user
