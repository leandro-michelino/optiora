"""Add CSV cost import storage.

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "imported_cost_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("upload_id", sa.String(length=64), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("service_name", sa.String(length=255), nullable=True),
        sa.Column("account_identifier", sa.String(length=255), nullable=True),
        sa.Column("account_name", sa.String(length=255), nullable=True),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("period_start", sa.DateTime(), nullable=True),
        sa.Column("period_end", sa.DateTime(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("line_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("upload_id", "line_number", name="uq_imported_cost_upload_line"),
    )
    op.create_index(
        op.f("ix_imported_cost_records_id"),
        "imported_cost_records",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_imported_cost_records_organization_id"),
        "imported_cost_records",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_imported_cost_records_customer_id"),
        "imported_cost_records",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_imported_cost_records_upload_id"),
        "imported_cost_records",
        ["upload_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_imported_cost_records_provider"),
        "imported_cost_records",
        ["provider"],
        unique=False,
    )
    op.create_index(
        op.f("ix_imported_cost_records_created_at"),
        "imported_cost_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_imported_cost_records_created_at"),
        table_name="imported_cost_records",
    )
    op.drop_index(
        op.f("ix_imported_cost_records_provider"),
        table_name="imported_cost_records",
    )
    op.drop_index(
        op.f("ix_imported_cost_records_upload_id"),
        table_name="imported_cost_records",
    )
    op.drop_index(
        op.f("ix_imported_cost_records_customer_id"),
        table_name="imported_cost_records",
    )
    op.drop_index(
        op.f("ix_imported_cost_records_organization_id"),
        table_name="imported_cost_records",
    )
    op.drop_index(op.f("ix_imported_cost_records_id"), table_name="imported_cost_records")
    op.drop_table("imported_cost_records")
