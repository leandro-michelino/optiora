"""Add OCI cost report ingestion audit table.

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(table_name)


def _indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if not _table_exists("oci_cost_report_ingestions"):
        op.create_table(
            "oci_cost_report_ingestions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("object_name", sa.String(length=1024), nullable=False),
            sa.Column("namespace", sa.String(length=255), nullable=False, server_default="bling"),
            sa.Column("bucket_name", sa.String(length=255), nullable=False),
            sa.Column("object_size", sa.Integer(), nullable=True),
            sa.Column("object_etag", sa.String(length=255), nullable=True),
            sa.Column("object_time_created", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="processed"),
            sa.Column("rows_processed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rows_skipped", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("periods_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("first_seen_at", sa.DateTime(), nullable=False),
            sa.Column("last_processed_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("object_name", name="uq_oci_cost_report_ingestion_object"),
        )

    indexes = _indexes("oci_cost_report_ingestions")
    if "ix_oci_cost_report_ingestions_object_name" not in indexes:
        op.create_index(
            "ix_oci_cost_report_ingestions_object_name",
            "oci_cost_report_ingestions",
            ["object_name"],
        )
    if "ix_oci_cost_report_ingestions_status" not in indexes:
        op.create_index("ix_oci_cost_report_ingestions_status", "oci_cost_report_ingestions", ["status"])
    if "ix_oci_cost_report_ingestions_last_processed_at" not in indexes:
        op.create_index(
            "ix_oci_cost_report_ingestions_last_processed_at",
            "oci_cost_report_ingestions",
            ["last_processed_at"],
        )


def downgrade() -> None:
    if _table_exists("oci_cost_report_ingestions"):
        op.drop_table("oci_cost_report_ingestions")
