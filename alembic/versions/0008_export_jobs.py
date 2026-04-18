"""Add scheduled export jobs and execution history.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "export_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("report_type", sa.String(length=80), nullable=False, server_default="executive_summary"),
        sa.Column("export_format", sa.String(length=20), nullable=False, server_default="csv"),
        sa.Column("schedule_frequency", sa.String(length=20), nullable=False, server_default="weekly"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_export_jobs_id"), "export_jobs", ["id"], unique=False)
    op.create_index(op.f("ix_export_jobs_organization_id"), "export_jobs", ["organization_id"], unique=False)
    op.create_index(op.f("ix_export_jobs_customer_id"), "export_jobs", ["customer_id"], unique=False)

    op.create_table(
        "export_job_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("export_job_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="queued"),
        sa.Column("output_filename", sa.String(length=255), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["export_job_id"], ["export_jobs.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_export_job_runs_id"), "export_job_runs", ["id"], unique=False)
    op.create_index(op.f("ix_export_job_runs_export_job_id"), "export_job_runs", ["export_job_id"], unique=False)
    op.create_index(op.f("ix_export_job_runs_organization_id"), "export_job_runs", ["organization_id"], unique=False)
    op.create_index(op.f("ix_export_job_runs_customer_id"), "export_job_runs", ["customer_id"], unique=False)
    op.create_index(op.f("ix_export_job_runs_created_at"), "export_job_runs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_export_job_runs_created_at"), table_name="export_job_runs")
    op.drop_index(op.f("ix_export_job_runs_customer_id"), table_name="export_job_runs")
    op.drop_index(op.f("ix_export_job_runs_organization_id"), table_name="export_job_runs")
    op.drop_index(op.f("ix_export_job_runs_export_job_id"), table_name="export_job_runs")
    op.drop_index(op.f("ix_export_job_runs_id"), table_name="export_job_runs")
    op.drop_table("export_job_runs")

    op.drop_index(op.f("ix_export_jobs_customer_id"), table_name="export_jobs")
    op.drop_index(op.f("ix_export_jobs_organization_id"), table_name="export_jobs")
    op.drop_index(op.f("ix_export_jobs_id"), table_name="export_jobs")
    op.drop_table("export_jobs")
