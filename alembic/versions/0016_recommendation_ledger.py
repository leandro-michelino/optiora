"""Add recommendation ledger for planned vs realized savings.

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(table_name)


def _indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if not _table_exists("recommendation_ledger"):
        op.create_table(
            "recommendation_ledger",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("organization_id", sa.Integer(), nullable=False),
            sa.Column("customer_id", sa.String(length=255), nullable=False),
            sa.Column("provider", sa.String(length=50), nullable=False),
            sa.Column("resource_id", sa.String(length=1024), nullable=False),
            sa.Column("resource_name", sa.String(length=512), nullable=True),
            sa.Column("resource_type", sa.String(length=255), nullable=True),
            sa.Column("account_id", sa.String(length=512), nullable=True),
            sa.Column("region", sa.String(length=100), nullable=True),
            sa.Column("recommendation_source", sa.String(length=120), nullable=False),
            sa.Column("recommendation_fingerprint", sa.String(length=64), nullable=False),
            sa.Column("action", sa.String(length=50), nullable=False, server_default="downsize"),
            sa.Column("confidence", sa.String(length=20), nullable=False, server_default="medium"),
            sa.Column("effort", sa.String(length=20), nullable=False, server_default="medium"),
            sa.Column("current_size", sa.String(length=255), nullable=True),
            sa.Column("recommended_size", sa.String(length=255), nullable=True),
            sa.Column("current_monthly_cost_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("projected_monthly_cost_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("planned_monthly_savings_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("planned_annual_savings_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("realized_monthly_savings_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("realized_annual_savings_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("variance_monthly_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("variance_annual_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("variance_percent", sa.Float(), nullable=False, server_default="0"),
            sa.Column("variance_reason", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="open"),
            sa.Column("owner", sa.String(length=255), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("evidence_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("resource_console_url", sa.Text(), nullable=True),
            sa.Column("first_seen_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.Column("planned_at", sa.DateTime(), nullable=True),
            sa.Column("realized_at", sa.DateTime(), nullable=True),
            sa.Column("last_exported_at", sa.DateTime(), nullable=True),
            sa.Column("times_seen", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "organization_id",
                "provider",
                "resource_id",
                "recommendation_source",
                "recommendation_fingerprint",
                name="uq_recommendation_ledger_fingerprint",
            ),
        )

    existing_indexes = _indexes("recommendation_ledger")
    for index_name, columns in {
        op.f("ix_recommendation_ledger_id"): ["id"],
        op.f("ix_recommendation_ledger_organization_id"): ["organization_id"],
        op.f("ix_recommendation_ledger_customer_id"): ["customer_id"],
        op.f("ix_recommendation_ledger_provider"): ["provider"],
        op.f("ix_recommendation_ledger_recommendation_source"): ["recommendation_source"],
        op.f("ix_recommendation_ledger_recommendation_fingerprint"): ["recommendation_fingerprint"],
        op.f("ix_recommendation_ledger_status"): ["status"],
        op.f("ix_recommendation_ledger_first_seen_at"): ["first_seen_at"],
        op.f("ix_recommendation_ledger_last_seen_at"): ["last_seen_at"],
    }.items():
        if index_name not in existing_indexes:
            op.create_index(index_name, "recommendation_ledger", columns, unique=False)


def downgrade() -> None:
    if _table_exists("recommendation_ledger"):
        op.drop_table("recommendation_ledger")
