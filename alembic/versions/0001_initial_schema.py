"""Initial schema — all OptiOra tables.

Revision ID: 0001
Revises:
Create Date: 2026-04-14

Creates:
  - users
  - organizations
  - user_organizations
  - refresh_tokens
  - password_reset_tokens
  - stored_credentials
  - credential_records
  - scanning_permissions
  - scan_runs
  - cost_snapshots
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("last_login", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column(
            "plan",
            sa.Enum("free", "professional", "enterprise", name="organizationplan"),
            nullable=True,
        ),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("active_user_count", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_customer_id"),
    )
    op.create_index(op.f("ix_organizations_id"), "organizations", ["id"], unique=False)

    op.create_table(
        "user_organizations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("owner", "admin", "analyst", "readonly", name="userrole"),
            nullable=True,
        ),
        sa.Column("added_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_organizations_id"), "user_organizations", ["id"], unique=False
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_refresh_tokens_id"), "refresh_tokens", ["id"], unique=False)
    op.create_index(
        op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False
    )

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        op.f("ix_password_reset_tokens_id"), "password_reset_tokens", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_password_reset_tokens_user_id"),
        "password_reset_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_password_reset_tokens_token_hash"),
        "password_reset_tokens",
        ["token_hash"],
        unique=True,
    )

    op.create_table(
        "stored_credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("credential_data_encrypted", sa.String(2000), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=True),
        sa.Column("validation_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("validated_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_stored_credentials_id"), "stored_credentials", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_stored_credentials_organization_id"),
        "stored_credentials",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "credential_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("credential_json", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=True),
        sa.Column("validation_message", sa.String(500), nullable=True),
        sa.Column("tested_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "customer_id", "provider", name="uq_customer_provider_credential"
        ),
    )
    op.create_index(
        op.f("ix_credential_records_id"), "credential_records", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_credential_records_customer_id"),
        "credential_records",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_credential_records_provider"),
        "credential_records",
        ["provider"],
        unique=False,
    )

    op.create_table(
        "scanning_permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=False),
        sa.Column("state", sa.String(50), nullable=False),
        sa.Column("providers_json", sa.Text(), nullable=False),
        sa.Column("scan_frequency", sa.String(20), nullable=False),
        sa.Column("auto_remediate", sa.Boolean(), nullable=True),
        sa.Column("notification_email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id"),
    )
    op.create_index(
        op.f("ix_scanning_permissions_id"), "scanning_permissions", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_scanning_permissions_customer_id"),
        "scanning_permissions",
        ["customer_id"],
        unique=True,
    )

    op.create_table(
        "scan_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scan_id", sa.String(255), nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=False),
        sa.Column("state", sa.String(50), nullable=False),
        sa.Column("providers_json", sa.Text(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column("total_resources", sa.Integer(), nullable=True),
        sa.Column("anomalies_found", sa.Integer(), nullable=True),
        sa.Column("savings_identified", sa.Float(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scan_id"),
    )
    op.create_index(op.f("ix_scan_runs_id"), "scan_runs", ["id"], unique=False)
    op.create_index(
        op.f("ix_scan_runs_scan_id"), "scan_runs", ["scan_id"], unique=True
    )
    op.create_index(
        op.f("ix_scan_runs_customer_id"), "scan_runs", ["customer_id"], unique=False
    )

    op.create_table(
        "cost_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scan_id", sa.String(255), nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("period_start", sa.DateTime(), nullable=True),
        sa.Column("period_end", sa.DateTime(), nullable=True),
        sa.Column("total_cost_usd", sa.Float(), nullable=False),
        sa.Column("savings_identified_usd", sa.Float(), nullable=False),
        sa.Column("anomalies_count", sa.Integer(), nullable=False),
        sa.Column("top_services_json", sa.Text(), nullable=True),
        sa.Column("anomalies_json", sa.Text(), nullable=True),
        sa.Column("recommendations_json", sa.Text(), nullable=True),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["scan_id"], ["scan_runs.scan_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_cost_snapshots_id"), "cost_snapshots", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_cost_snapshots_scan_id"), "cost_snapshots", ["scan_id"], unique=False
    )
    op.create_index(
        op.f("ix_cost_snapshots_customer_id"),
        "cost_snapshots",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_cost_snapshots_provider"), "cost_snapshots", ["provider"], unique=False
    )
    op.create_index(
        op.f("ix_cost_snapshots_captured_at"),
        "cost_snapshots",
        ["captured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("cost_snapshots")
    op.drop_table("scan_runs")
    op.drop_table("scanning_permissions")
    op.drop_table("credential_records")
    op.drop_table("stored_credentials")
    op.drop_table("password_reset_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("user_organizations")
    op.drop_table("organizations")
    op.drop_table("users")
