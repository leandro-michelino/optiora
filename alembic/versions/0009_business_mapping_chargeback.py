"""Add business mapping rules and normalized cost dimensions for chargeback.

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "business_mapping_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("tag_key", sa.String(length=255), nullable=False),
        sa.Column("tag_value", sa.String(length=255), nullable=False, server_default="*"),
        sa.Column("dimension", sa.String(length=80), nullable=False),
        sa.Column("mapped_value", sa.String(length=255), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "tag_key",
            "tag_value",
            "dimension",
            name="uq_business_mapping_rule",
        ),
    )
    op.create_index("ix_business_mapping_rules_id", "business_mapping_rules", ["id"], unique=False)
    op.create_index("ix_business_mapping_rules_organization_id", "business_mapping_rules", ["organization_id"], unique=False)
    op.create_index("ix_business_mapping_rules_customer_id", "business_mapping_rules", ["customer_id"], unique=False)
    op.create_index("ix_business_mapping_rules_tag_key", "business_mapping_rules", ["tag_key"], unique=False)
    op.create_index("ix_business_mapping_rules_dimension", "business_mapping_rules", ["dimension"], unique=False)

    op.create_table(
        "normalized_cost_dimensions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("imported_cost_record_id", sa.Integer(), nullable=True),
        sa.Column("scan_id", sa.String(length=255), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("service_name", sa.String(length=255), nullable=True),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("team", sa.String(length=255), nullable=True),
        sa.Column("environment", sa.String(length=255), nullable=True),
        sa.Column("application", sa.String(length=255), nullable=True),
        sa.Column("cost_center", sa.String(length=255), nullable=True),
        sa.Column("is_mapped", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("mapping_rule_ids_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["imported_cost_record_id"], ["imported_cost_records.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_normalized_cost_dimensions_id", "normalized_cost_dimensions", ["id"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_organization_id", "normalized_cost_dimensions", ["organization_id"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_customer_id", "normalized_cost_dimensions", ["customer_id"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_provider", "normalized_cost_dimensions", ["provider"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_service_name", "normalized_cost_dimensions", ["service_name"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_team", "normalized_cost_dimensions", ["team"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_environment", "normalized_cost_dimensions", ["environment"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_application", "normalized_cost_dimensions", ["application"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_cost_center", "normalized_cost_dimensions", ["cost_center"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_is_mapped", "normalized_cost_dimensions", ["is_mapped"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_scan_id", "normalized_cost_dimensions", ["scan_id"], unique=False)
    op.create_index("ix_normalized_cost_dimensions_captured_at", "normalized_cost_dimensions", ["captured_at"], unique=False)


def downgrade() -> None:
    op.drop_table("normalized_cost_dimensions")
    op.drop_table("business_mapping_rules")
