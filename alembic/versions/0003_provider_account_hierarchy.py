"""Provider account hierarchy foundation for Release 1.0.

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "provider_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("account_identifier", sa.String(length=255), nullable=False),
        sa.Column("account_name", sa.String(length=255), nullable=False),
        sa.Column("account_type", sa.String(length=80), nullable=False, server_default="account"),
        sa.Column("native_region", sa.String(length=100), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "customer_id",
            "provider",
            "account_identifier",
            name="uq_provider_account_scope",
        ),
    )
    op.create_index(op.f("ix_provider_accounts_id"), "provider_accounts", ["id"], unique=False)
    op.create_index(
        op.f("ix_provider_accounts_organization_id"),
        "provider_accounts",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_accounts_customer_id"),
        "provider_accounts",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_accounts_provider"),
        "provider_accounts",
        ["provider"],
        unique=False,
    )

    op.create_table(
        "provider_account_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("parent_account_id", sa.Integer(), nullable=False),
        sa.Column("child_account_id", sa.Integer(), nullable=False),
        sa.Column("relationship_type", sa.String(length=50), nullable=False, server_default="contains"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["child_account_id"], ["provider_accounts.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["parent_account_id"], ["provider_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_account_id", name="uq_provider_account_link_child"),
    )
    op.create_index(
        op.f("ix_provider_account_links_id"),
        "provider_account_links",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_links_organization_id"),
        "provider_account_links",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_links_parent_account_id"),
        "provider_account_links",
        ["parent_account_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_links_child_account_id"),
        "provider_account_links",
        ["child_account_id"],
        unique=False,
    )

    op.create_table(
        "provider_account_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("scan_id", sa.String(length=255), nullable=False),
        sa.Column("provider_account_id", sa.Integer(), nullable=False),
        sa.Column("direct_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("savings_identified_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("anomalies_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("service_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["provider_account_id"], ["provider_accounts.id"]),
        sa.ForeignKeyConstraint(["scan_id"], ["scan_runs.scan_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scan_id",
            "provider_account_id",
            name="uq_provider_account_snapshot",
        ),
    )
    op.create_index(
        op.f("ix_provider_account_snapshots_id"),
        "provider_account_snapshots",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_snapshots_organization_id"),
        "provider_account_snapshots",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_snapshots_customer_id"),
        "provider_account_snapshots",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_snapshots_scan_id"),
        "provider_account_snapshots",
        ["scan_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_snapshots_provider_account_id"),
        "provider_account_snapshots",
        ["provider_account_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_provider_account_snapshots_captured_at"),
        "provider_account_snapshots",
        ["captured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_provider_account_snapshots_captured_at"),
        table_name="provider_account_snapshots",
    )
    op.drop_index(
        op.f("ix_provider_account_snapshots_provider_account_id"),
        table_name="provider_account_snapshots",
    )
    op.drop_index(
        op.f("ix_provider_account_snapshots_scan_id"),
        table_name="provider_account_snapshots",
    )
    op.drop_index(
        op.f("ix_provider_account_snapshots_customer_id"),
        table_name="provider_account_snapshots",
    )
    op.drop_index(
        op.f("ix_provider_account_snapshots_organization_id"),
        table_name="provider_account_snapshots",
    )
    op.drop_index(op.f("ix_provider_account_snapshots_id"), table_name="provider_account_snapshots")
    op.drop_table("provider_account_snapshots")

    op.drop_index(
        op.f("ix_provider_account_links_child_account_id"),
        table_name="provider_account_links",
    )
    op.drop_index(
        op.f("ix_provider_account_links_parent_account_id"),
        table_name="provider_account_links",
    )
    op.drop_index(
        op.f("ix_provider_account_links_organization_id"),
        table_name="provider_account_links",
    )
    op.drop_index(op.f("ix_provider_account_links_id"), table_name="provider_account_links")
    op.drop_table("provider_account_links")

    op.drop_index(op.f("ix_provider_accounts_provider"), table_name="provider_accounts")
    op.drop_index(op.f("ix_provider_accounts_customer_id"), table_name="provider_accounts")
    op.drop_index(op.f("ix_provider_accounts_organization_id"), table_name="provider_accounts")
    op.drop_index(op.f("ix_provider_accounts_id"), table_name="provider_accounts")
    op.drop_table("provider_accounts")
