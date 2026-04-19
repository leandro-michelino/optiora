"""Add virtual_tag_rules table.

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "virtual_tag_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("tag_key", sa.String(length=255), nullable=False),
        sa.Column("tag_value", sa.String(length=255), nullable=False),
        sa.Column("match_provider", sa.String(length=50), nullable=True),
        sa.Column("match_service", sa.String(length=255), nullable=True),
        sa.Column("match_region", sa.String(length=100), nullable=True),
        sa.Column("match_account_id", sa.String(length=255), nullable=True),
        sa.Column("match_resource_type", sa.String(length=255), nullable=True),
        sa.Column("match_resource_name_contains", sa.String(length=255), nullable=True),
        sa.Column("match_team", sa.String(length=255), nullable=True),
        sa.Column("match_environment", sa.String(length=255), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_virtual_tag_rules_organization_id_organizations"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_virtual_tag_rules")),
    )
    op.create_index(op.f("ix_virtual_tag_rules_id"), "virtual_tag_rules", ["id"], unique=False)
    op.create_index(op.f("ix_virtual_tag_rules_organization_id"), "virtual_tag_rules", ["organization_id"], unique=False)
    op.create_index(op.f("ix_virtual_tag_rules_customer_id"), "virtual_tag_rules", ["customer_id"], unique=False)
    op.create_index(op.f("ix_virtual_tag_rules_tag_key"), "virtual_tag_rules", ["tag_key"], unique=False)
    op.create_index(op.f("ix_virtual_tag_rules_is_active"), "virtual_tag_rules", ["is_active"], unique=False)
    op.create_index(op.f("ix_virtual_tag_rules_priority"), "virtual_tag_rules", ["priority"], unique=False)
    op.create_index(op.f("ix_virtual_tag_rules_created_at"), "virtual_tag_rules", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_virtual_tag_rules_created_at"), table_name="virtual_tag_rules")
    op.drop_index(op.f("ix_virtual_tag_rules_priority"), table_name="virtual_tag_rules")
    op.drop_index(op.f("ix_virtual_tag_rules_is_active"), table_name="virtual_tag_rules")
    op.drop_index(op.f("ix_virtual_tag_rules_tag_key"), table_name="virtual_tag_rules")
    op.drop_index(op.f("ix_virtual_tag_rules_customer_id"), table_name="virtual_tag_rules")
    op.drop_index(op.f("ix_virtual_tag_rules_organization_id"), table_name="virtual_tag_rules")
    op.drop_index(op.f("ix_virtual_tag_rules_id"), table_name="virtual_tag_rules")
    op.drop_table("virtual_tag_rules")
