"""Add cost_period_summaries table for trend reporting.

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cost_period_summaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        sa.Column("period_start", sa.DateTime(), nullable=False),
        sa.Column("period_end", sa.DateTime(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("team", sa.String(length=160), nullable=True),
        sa.Column("environment", sa.String(length=160), nullable=True),
        sa.Column("total_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("mapped_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unmapped_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("service_breakdown_json", sa.Text(), nullable=True),
        sa.Column("computed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "period_type", "period_start", "provider", "team", "environment",
            name="uq_cost_period_summary",
        ),
    )
    op.create_index(op.f("ix_cost_period_summaries_id"), "cost_period_summaries", ["id"], unique=False)
    op.create_index(op.f("ix_cost_period_summaries_organization_id"), "cost_period_summaries", ["organization_id"], unique=False)
    op.create_index(op.f("ix_cost_period_summaries_customer_id"), "cost_period_summaries", ["customer_id"], unique=False)
    op.create_index(op.f("ix_cost_period_summaries_period_start"), "cost_period_summaries", ["period_start"], unique=False)
    op.create_index(op.f("ix_cost_period_summaries_provider"), "cost_period_summaries", ["provider"], unique=False)
    op.create_index(op.f("ix_cost_period_summaries_computed_at"), "cost_period_summaries", ["computed_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cost_period_summaries_computed_at"), table_name="cost_period_summaries")
    op.drop_index(op.f("ix_cost_period_summaries_provider"), table_name="cost_period_summaries")
    op.drop_index(op.f("ix_cost_period_summaries_period_start"), table_name="cost_period_summaries")
    op.drop_index(op.f("ix_cost_period_summaries_customer_id"), table_name="cost_period_summaries")
    op.drop_index(op.f("ix_cost_period_summaries_organization_id"), table_name="cost_period_summaries")
    op.drop_index(op.f("ix_cost_period_summaries_id"), table_name="cost_period_summaries")
    op.drop_table("cost_period_summaries")
