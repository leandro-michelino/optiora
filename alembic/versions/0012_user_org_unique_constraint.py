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
    op.create_unique_constraint(
        "uq_user_organization_membership",
        "user_organizations",
        ["user_id", "organization_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_user_organization_membership",
        "user_organizations",
        type_="unique",
    )
