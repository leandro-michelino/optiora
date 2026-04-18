"""Add alert routing policies table.

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_routing_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("severity", sa.String(length=30), nullable=False),
        sa.Column("channels_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "severity", name="uq_alert_routing_org_severity"),
    )
    op.create_index(op.f("ix_alert_routing_policies_id"), "alert_routing_policies", ["id"], unique=False)
    op.create_index(
        op.f("ix_alert_routing_policies_organization_id"),
        "alert_routing_policies",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_alert_routing_policies_severity"),
        "alert_routing_policies",
        ["severity"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_alert_routing_policies_severity"), table_name="alert_routing_policies")
    op.drop_index(op.f("ix_alert_routing_policies_organization_id"), table_name="alert_routing_policies")
    op.drop_index(op.f("ix_alert_routing_policies_id"), table_name="alert_routing_policies")
    op.drop_table("alert_routing_policies")
