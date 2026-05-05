"""Repair scheduler policy schema after legacy 0013 collision.

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column_if_missing(
        "scanning_permissions",
        sa.Column("scheduler_override_enabled", sa.Boolean(), nullable=True, server_default=sa.false()),
    )
    _add_column_if_missing(
        "scanning_permissions",
        sa.Column("scheduler_override_frequency", sa.String(length=20), nullable=True),
    )
    _add_column_if_missing(
        "scanning_permissions",
        sa.Column("scheduler_retry_max_attempts", sa.Integer(), nullable=False, server_default="2"),
    )
    _add_column_if_missing(
        "scanning_permissions",
        sa.Column("scheduler_retry_backoff_seconds", sa.Integer(), nullable=False, server_default="120"),
    )
    _add_column_if_missing(
        "scanning_permissions",
        sa.Column("scheduler_overdue_alert_hours", sa.Integer(), nullable=False, server_default="24"),
    )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("alert_ops_policies"):
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

    existing_indexes = _indexes("alert_ops_policies")
    if op.f("ix_alert_ops_policies_id") not in existing_indexes:
        op.create_index(op.f("ix_alert_ops_policies_id"), "alert_ops_policies", ["id"], unique=False)
    if op.f("ix_alert_ops_policies_organization_id") not in existing_indexes:
        op.create_index(
            op.f("ix_alert_ops_policies_organization_id"),
            "alert_ops_policies",
            ["organization_id"],
            unique=False,
        )


def downgrade() -> None:
    # This repair migration only reconciles schemas that were already supposed
    # to contain these objects via 0013. Downgrade is intentionally a no-op to
    # avoid dropping columns/tables owned by that earlier migration.
    pass
