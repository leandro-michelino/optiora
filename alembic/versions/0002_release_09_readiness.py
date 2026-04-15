"""Release 0.9 readiness tables and alert settings.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scanning_permissions",
        sa.Column("monthly_budget_usd", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "scanning_permissions",
        sa.Column("warning_threshold_percent", sa.Float(), nullable=False, server_default="80"),
    )
    op.add_column(
        "scanning_permissions",
        sa.Column("critical_threshold_percent", sa.Float(), nullable=False, server_default="100"),
    )
    op.add_column(
        "scanning_permissions",
        sa.Column("notifications_enabled", sa.Boolean(), nullable=True, server_default=sa.true()),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_id"), "audit_logs", ["id"], unique=False)
    op.create_index(
        op.f("ix_audit_logs_organization_id"),
        "audit_logs",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_audit_logs_actor_user_id"),
        "audit_logs",
        ["actor_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(
        op.f("ix_audit_logs_entity_type"),
        "audit_logs",
        ["entity_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_audit_logs_created_at"),
        "audit_logs",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "alert_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("scan_id", sa.String(length=255), nullable=True),
        sa.Column("alert_type", sa.String(length=80), nullable=False),
        sa.Column("severity", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("delivered_channels_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
        sa.Column("acknowledged_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["acknowledged_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_alert_events_id"), "alert_events", ["id"], unique=False)
    op.create_index(
        op.f("ix_alert_events_organization_id"),
        "alert_events",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_alert_events_customer_id"),
        "alert_events",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_alert_events_scan_id"),
        "alert_events",
        ["scan_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_alert_events_alert_type"),
        "alert_events",
        ["alert_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_alert_events_severity"),
        "alert_events",
        ["severity"],
        unique=False,
    )
    op.create_index(
        op.f("ix_alert_events_created_at"),
        "alert_events",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_alert_events_created_at"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_severity"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_alert_type"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_scan_id"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_customer_id"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_organization_id"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_id"), table_name="alert_events")
    op.drop_table("alert_events")

    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_entity_type"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_user_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_organization_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_id"), table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_column("scanning_permissions", "notifications_enabled")
    op.drop_column("scanning_permissions", "critical_threshold_percent")
    op.drop_column("scanning_permissions", "warning_threshold_percent")
    op.drop_column("scanning_permissions", "monthly_budget_usd")
