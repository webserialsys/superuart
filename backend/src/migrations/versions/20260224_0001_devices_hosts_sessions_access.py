"""create devices hosts sessions access tables

Revision ID: 20260224_0001
Revises: None
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260224_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = postgresql.ENUM("student", "teacher", name="user_role", create_type=False)
    host_status = postgresql.ENUM("ONLINE", "OFFLINE", name="host_status", create_type=False)
    device_status = postgresql.ENUM("AVAILABLE", "BUSY", "OFFLINE", name="device_status", create_type=False)
    session_status = postgresql.ENUM("ACTIVE", "CLOSED", "EXPIRED", name="session_status", create_type=False)

    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    host_status.create(bind, checkfirst=True)
    device_status.create(bind, checkfirst=True)
    session_status.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("email", sa.String(length=50), nullable=False),
        sa.Column("full_name", sa.String(length=100), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="student"),
        sa.Column("uuid", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_role", "users", ["role"], unique=False)
    op.create_index("ix_users_is_deleted", "users", ["is_deleted"], unique=False)

    op.create_table(
        "hosts",
        sa.Column("uuid", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("api_key_hash", sa.String(length=200), nullable=False),
        sa.Column("status", host_status, nullable=False, server_default="OFFLINE"),
        sa.Column("user_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.ForeignKeyConstraint(["user_uuid"], ["users.uuid"], name="fk_hosts_user_uuid"),
        sa.UniqueConstraint("name", name="uq_hosts_name"),
        sa.UniqueConstraint("api_key_hash", name="uq_hosts_api_key_hash"),
    )
    op.create_index("ix_hosts_status", "hosts", ["status"], unique=False)
    op.create_index("ix_hosts_user_uuid", "hosts", ["user_uuid"], unique=False)
    op.create_index("ix_hosts_is_deleted", "hosts", ["is_deleted"], unique=False)

    op.create_table(
        "devices",
        sa.Column("uuid", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("port", sa.String(length=120), nullable=False),
        sa.Column("baudrate", sa.Integer(), nullable=False),
        sa.Column("status", device_status, nullable=False, server_default="AVAILABLE"),
        sa.Column("host_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.ForeignKeyConstraint(["host_uuid"], ["hosts.uuid"], name="fk_devices_host_uuid"),
        sa.UniqueConstraint("host_uuid", "port", name="uq_devices_host_port"),
    )
    op.create_index("ix_devices_status", "devices", ["status"], unique=False)
    op.create_index("ix_devices_host_uuid", "devices", ["host_uuid"], unique=False)
    op.create_index("ix_devices_is_deleted", "devices", ["is_deleted"], unique=False)

    op.create_table(
        "access",
        sa.Column("uuid", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_uuid"], ["users.uuid"], name="fk_access_user_uuid"),
        sa.ForeignKeyConstraint(["device_uuid"], ["devices.uuid"], name="fk_access_device_uuid"),
        sa.UniqueConstraint("device_uuid", name="uq_access_device_uuid"),
    )
    op.create_index("ix_access_user_uuid", "access", ["user_uuid"], unique=False)

    op.create_table(
        "sessions",
        sa.Column("uuid", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("status", session_status, nullable=False, server_default="ACTIVE"),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.ForeignKeyConstraint(["user_uuid"], ["users.uuid"], name="fk_sessions_user_uuid"),
        sa.ForeignKeyConstraint(["device_uuid"], ["devices.uuid"], name="fk_sessions_device_uuid"),
        sa.UniqueConstraint("connection_id", name="uq_sessions_connection_id"),
    )
    op.create_index("ix_sessions_status", "sessions", ["status"], unique=False)
    op.create_index("ix_sessions_user_uuid", "sessions", ["user_uuid"], unique=False)
    op.create_index("ix_sessions_device_uuid", "sessions", ["device_uuid"], unique=False)
    op.create_index("ix_sessions_is_deleted", "sessions", ["is_deleted"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sessions_is_deleted", table_name="sessions")
    op.drop_index("ix_sessions_device_uuid", table_name="sessions")
    op.drop_index("ix_sessions_user_uuid", table_name="sessions")
    op.drop_index("ix_sessions_status", table_name="sessions")
    op.drop_table("sessions")

    op.drop_index("ix_access_user_uuid", table_name="access")
    op.drop_table("access")

    op.drop_index("ix_devices_is_deleted", table_name="devices")
    op.drop_index("ix_devices_host_uuid", table_name="devices")
    op.drop_index("ix_devices_status", table_name="devices")
    op.drop_table("devices")

    op.drop_index("ix_hosts_is_deleted", table_name="hosts")
    op.drop_index("ix_hosts_user_uuid", table_name="hosts")
    op.drop_index("ix_hosts_status", table_name="hosts")
    op.drop_table("hosts")

    op.drop_index("ix_users_is_deleted", table_name="users")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    bind = op.get_bind()
    sa.Enum(name="session_status").drop(bind, checkfirst=True)
    sa.Enum(name="device_status").drop(bind, checkfirst=True)
    sa.Enum(name="host_status").drop(bind, checkfirst=True)
    sa.Enum(name="user_role").drop(bind, checkfirst=True)
