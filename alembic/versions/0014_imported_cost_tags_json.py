"""Add tags JSON to imported cost records.

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"]
        for column in inspector.get_columns("imported_cost_records")
    }
    if "tags_json" not in existing_columns:
        with op.batch_alter_table("imported_cost_records") as batch_op:
            batch_op.add_column(sa.Column("tags_json", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"]
        for column in inspector.get_columns("imported_cost_records")
    }
    if "tags_json" in existing_columns:
        with op.batch_alter_table("imported_cost_records") as batch_op:
            batch_op.drop_column("tags_json")
