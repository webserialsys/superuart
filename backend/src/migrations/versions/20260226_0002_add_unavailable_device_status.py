"""add UNAVAILABLE to device_status enum

Revision ID: 20260226_0002
Revises: 20260224_0001
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260226_0002"
down_revision = "20260224_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing databases may already have device_status without UNAVAILABLE.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'UNAVAILABLE'"))


def downgrade() -> None:
    # PostgreSQL does not support dropping a single enum value safely.
    pass
