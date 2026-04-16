"""Add hierarchy columns for imported cost records.

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "imported_cost_records",
        sa.Column("account_type", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "imported_cost_records",
        sa.Column("parent_account_identifier", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("imported_cost_records", "parent_account_identifier")
    op.drop_column("imported_cost_records", "account_type")
