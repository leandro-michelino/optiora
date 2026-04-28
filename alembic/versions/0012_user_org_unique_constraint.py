"""Add unique constraint to user_organizations (user_id, organization_id).

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-20
"""
from __future__ import annotations

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove any duplicate memberships before adding the constraint,
    # keeping only the most recent row per (user_id, organization_id) pair.
    op.execute(
        """
        DELETE FROM user_organizations
        WHERE id NOT IN (
            SELECT MAX(id)
            FROM user_organizations
            GROUP BY user_id, organization_id
        )
        """
    )
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # SQLite cannot ALTER TABLE to add a unique constraint directly.
        # Use a unique index instead so migrations remain portable in tests/dev.
        op.create_index(
            "uq_user_organization_membership",
            "user_organizations",
            ["user_id", "organization_id"],
            unique=True,
        )
    else:
        op.create_unique_constraint(
            "uq_user_organization_membership",
            "user_organizations",
            ["user_id", "organization_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        op.drop_index("uq_user_organization_membership", table_name="user_organizations")
    else:
        op.drop_constraint(
            "uq_user_organization_membership",
            "user_organizations",
            type_="unique",
        )
