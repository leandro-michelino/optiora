"""Add alert ops policies and scheduler tuning fields.

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scanning_permissions",
        sa.Column("scheduler_override_enabled", sa.Boolean(), nullable=True, server_default=sa.false()),
    )
    op.add_column(
        "scanning_permissions",
        sa.Column("scheduler_override_frequency", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "scanning_permissions",
        sa.Column("scheduler_retry_max_attempts", sa.Integer(), nullable=False, server_default="2"),
    )
    op.add_column(
        "scanning_permissions",
        sa.Column("scheduler_retry_backoff_seconds", sa.Integer(), nullable=False, server_default="120"),
    )
    op.add_column(
        "scanning_permissions",
        sa.Column("scheduler_overdue_alert_hours", sa.Integer(), nullable=False, server_default="24"),
    )

    op.create_table(
        "alert_ops_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("mute_window_enabled", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("mute_start_hour_utc", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mute_end_hour_utc", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mute_weekends", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"),
        sa.Column("escalation_enabled", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("escalation_after_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("escalation_channels_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("escalation_severity", sa.String(length=30), nullable=False, server_default="critical"),
        sa.Column("ack_sla_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("dedupe_window_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("min_severity", sa.String(length=30), nullable=False, server_default="low"),
        sa.Column("daily_summary_enabled", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("weekly_summary_enabled", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", name="uq_alert_ops_policy_org"),
    )
    op.create_index(op.f("ix_alert_ops_policies_id"), "alert_ops_policies", ["id"], unique=False)
    op.create_index(
        op.f("ix_alert_ops_policies_organization_id"),
        "alert_ops_policies",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_alert_ops_policies_organization_id"), table_name="alert_ops_policies")
    op.drop_index(op.f("ix_alert_ops_policies_id"), table_name="alert_ops_policies")
    op.drop_table("alert_ops_policies")

    op.drop_column("scanning_permissions", "scheduler_overdue_alert_hours")
    op.drop_column("scanning_permissions", "scheduler_retry_backoff_seconds")
    op.drop_column("scanning_permissions", "scheduler_retry_max_attempts")
    op.drop_column("scanning_permissions", "scheduler_override_frequency")
    op.drop_column("scanning_permissions", "scheduler_override_enabled")
