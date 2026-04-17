"""Add cost_allocation_snapshots for per-account, per-region cost breakdown.

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cost_allocation_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("scan_id", sa.String(length=255), nullable=False),
        sa.Column("provider_account_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["provider_account_id"], ["provider_accounts.id"]),
        sa.ForeignKeyConstraint(["scan_id"], ["scan_runs.scan_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scan_id",
            "provider_account_id",
            "region",
            name="uq_cost_allocation_snapshot",
        ),
    )
    op.create_index("ix_cost_allocation_snapshots_id", "cost_allocation_snapshots", ["id"])
    op.create_index("ix_cost_allocation_snapshots_organization_id", "cost_allocation_snapshots", ["organization_id"])
    op.create_index("ix_cost_allocation_snapshots_customer_id", "cost_allocation_snapshots", ["customer_id"])
    op.create_index("ix_cost_allocation_snapshots_scan_id", "cost_allocation_snapshots", ["scan_id"])
    op.create_index("ix_cost_allocation_snapshots_provider_account_id", "cost_allocation_snapshots", ["provider_account_id"])
    op.create_index("ix_cost_allocation_snapshots_provider", "cost_allocation_snapshots", ["provider"])
    op.create_index("ix_cost_allocation_snapshots_region", "cost_allocation_snapshots", ["region"])
    op.create_index("ix_cost_allocation_snapshots_captured_at", "cost_allocation_snapshots", ["captured_at"])


def downgrade() -> None:
    op.drop_index("ix_cost_allocation_snapshots_captured_at", "cost_allocation_snapshots")
    op.drop_index("ix_cost_allocation_snapshots_region", "cost_allocation_snapshots")
    op.drop_index("ix_cost_allocation_snapshots_provider", "cost_allocation_snapshots")
    op.drop_index("ix_cost_allocation_snapshots_provider_account_id", "cost_allocation_snapshots")
    op.drop_index("ix_cost_allocation_snapshots_scan_id", "cost_allocation_snapshots")
    op.drop_index("ix_cost_allocation_snapshots_customer_id", "cost_allocation_snapshots")
    op.drop_index("ix_cost_allocation_snapshots_organization_id", "cost_allocation_snapshots")
    op.drop_index("ix_cost_allocation_snapshots_id", "cost_allocation_snapshots")
    op.drop_table("cost_allocation_snapshots")
