"""Database models for OptiOra with SQLAlchemy ORM."""

import enum
import os
from datetime import datetime, timezone


def _utcnow() -> datetime:
    """Return current naive UTC datetime. Replaces deprecated datetime.utcnow()."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
from urllib.parse import quote_plus

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker


def _is_placeholder(value: str) -> bool:
    """Treat common example values as unset so local startup stays on SQLite."""
    normalized = value.strip().lower()
    if not normalized:
        return True
    return (
        normalized.startswith("your_")
        or normalized.startswith("replace_")
        or normalized.endswith(".example.com")
        or "oraclevcn.com" in normalized
    )


def _resolve_database_url() -> str:
    """Support explicit DATABASE_URL or derive PostgreSQL from OCI DB settings."""
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        return database_url

    db_host = os.getenv("OCI_DB_HOST", "").strip()
    db_user = os.getenv("OCI_DB_USER", "").strip()
    db_password = os.getenv("OCI_DB_PASSWORD", "").strip()
    db_name = os.getenv("OCI_DB_NAME", "optiora").strip() or "optiora"
    db_port = os.getenv("OCI_DB_PORT", "5432").strip() or "5432"

    if not any(_is_placeholder(value) for value in [db_host, db_user, db_password]):
        return (
            "postgresql+psycopg2://"
            f"{quote_plus(db_user)}:{quote_plus(db_password)}@"
            f"{db_host}:{db_port}/{quote_plus(db_name)}"
        )

    return "sqlite:///./optiora.db"


DATABASE_URL = _resolve_database_url()

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,  # Test connection before using
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# Enums
class UserRole(str, enum.Enum):
    """User roles within an organization."""
    OWNER = "owner"
    ADMIN = "admin"
    ANALYST = "analyst"
    READONLY = "readonly"


class OrganizationPlan(str, enum.Enum):
    """Organization subscription plans."""
    FREE = "free"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


# Models
class User(Base):
    """User model for authentication."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Relationships
    user_organizations = relationship("UserOrganization", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"


class Organization(Base):
    """Organization model for multi-tenant support."""
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    plan = Column(Enum(OrganizationPlan), default=OrganizationPlan.FREE)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Billing
    stripe_customer_id = Column(String(255), nullable=True, unique=True)
    active_user_count = Column(Integer, default=1)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    
    # Relationships
    user_organizations = relationship("UserOrganization", back_populates="organization", cascade="all, delete-orphan")
    credentials = relationship("StoredCredential", back_populates="organization", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Organization(id={self.id}, name={self.name})>"


class UserOrganization(Base):
    """Association model for users and organizations."""
    __tablename__ = "user_organizations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.ANALYST)
    
    # Timestamps
    added_at = Column(DateTime, default=_utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="user_organizations")
    organization = relationship("Organization", back_populates="user_organizations")
    
    def __repr__(self):
        return f"<UserOrganization(user_id={self.user_id}, org_id={self.organization_id}, role={self.role})>"


class RefreshToken(Base):
    """Refresh token model for JWT token rotation."""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(255), unique=True, nullable=False)
    is_revoked = Column(Boolean, default=False)
    
    # Expiration
    expires_at = Column(DateTime, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="refresh_tokens")
    
    def __repr__(self):
        return f"<RefreshToken(user_id={self.user_id}, revoked={self.is_revoked})>"


class PasswordResetToken(Base):
    """One-time password reset tokens stored as deterministic hashes."""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    user = relationship("User", back_populates="password_reset_tokens")

    def __repr__(self):
        return f"<PasswordResetToken(user_id={self.user_id}, used={self.used_at is not None})>"


class StoredCredential(Base):
    """Stored cloud provider credentials (encrypted)."""
    __tablename__ = "stored_credentials"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    provider = Column(String(50), nullable=False)  # aws, azure, gcp, oci
    
    # Encrypted credential data (JSON-encrypted)
    credential_data_encrypted = Column(String(2000), nullable=False)
    
    # Metadata
    description = Column(String(255), nullable=True)
    is_valid = Column(Boolean, default=False)
    validation_error = Column(String(500), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    validated_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    
    # Relationships
    organization = relationship("Organization", back_populates="credentials")
    
    def __repr__(self):
        return f"<StoredCredential(org_id={self.organization_id}, provider={self.provider})>"


class CredentialRecord(Base):
    """Credential metadata used by the dashboard credential workflow."""

    __tablename__ = "credential_records"
    __table_args__ = (
        UniqueConstraint("customer_id", "provider", name="uq_customer_provider_credential"),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String(255), index=True, nullable=False)
    provider = Column(String(50), index=True, nullable=False)
    credential_json = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    is_valid = Column(Boolean, default=False)
    validation_message = Column(String(500), nullable=True)
    tested_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    def __repr__(self):
        return f"<CredentialRecord(customer_id={self.customer_id}, provider={self.provider})>"


class ScanningPermissionRecord(Base):
    """Persisted customer scanning permission and preferences."""

    __tablename__ = "scanning_permissions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String(255), unique=True, index=True, nullable=False)
    state = Column(String(50), nullable=False, default="pending_approval")
    providers_json = Column(Text, nullable=False, default="[]")
    scan_frequency = Column(String(20), nullable=False, default="daily")
    auto_remediate = Column(Boolean, default=False)
    notification_email = Column(String(255), nullable=True)
    monthly_budget_usd = Column(Float, nullable=False, default=0.0)
    warning_threshold_percent = Column(Float, nullable=False, default=80.0)
    critical_threshold_percent = Column(Float, nullable=False, default=100.0)
    notifications_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    approved_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    def __repr__(self):
        return f"<ScanningPermissionRecord(customer_id={self.customer_id}, state={self.state})>"


class ScanRunRecord(Base):
    """Track scan jobs launched by the scanning workflow."""

    __tablename__ = "scan_runs"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String(255), unique=True, index=True, nullable=False)
    customer_id = Column(String(255), index=True, nullable=False)
    state = Column(String(50), nullable=False, default="running")
    providers_json = Column(Text, nullable=False, default="[]")
    progress = Column(Integer, default=0)
    total_resources = Column(Integer, default=0)
    anomalies_found = Column(Integer, default=0)
    savings_identified = Column(Float, default=0.0)
    started_at = Column(DateTime, default=_utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    snapshots = relationship("CostSnapshot", back_populates="scan_run", cascade="all, delete-orphan")
    provider_account_snapshots = relationship(
        "ProviderAccountSnapshot",
        back_populates="scan_run",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<ScanRunRecord(scan_id={self.scan_id}, state={self.state})>"


class CostSnapshot(Base):
    """
    Historical cost model persisted at the end of each scan run.

    One row per provider per scan, capturing the full cost breakdown and key
    FinOps metrics so trend analysis and historical comparison are possible
    without re-querying the cloud providers.
    """

    __tablename__ = "cost_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String(255), ForeignKey("scan_runs.scan_id"), nullable=False, index=True)
    customer_id = Column(String(255), index=True, nullable=False)
    provider = Column(String(50), nullable=False, index=True)  # aws | azure | gcp | oci

    # Period covered by this snapshot (from the cost summary call).
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)

    # Aggregate metrics.
    total_cost_usd = Column(Float, nullable=False, default=0.0)
    savings_identified_usd = Column(Float, nullable=False, default=0.0)
    anomalies_count = Column(Integer, nullable=False, default=0)

    # Full JSON blobs for drill-down.
    top_services_json = Column(Text, nullable=True)   # [{"service": ..., "cost_usd": ...}, ...]
    anomalies_json = Column(Text, nullable=True)       # detect_anomalies result
    recommendations_json = Column(Text, nullable=True) # get_recommendations result

    captured_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    scan_run = relationship("ScanRunRecord", back_populates="snapshots")

    def __repr__(self):
        return (
            f"<CostSnapshot(scan_id={self.scan_id}, provider={self.provider}, "
            f"cost=${self.total_cost_usd:.2f})>"
        )


class ImportedCostRecord(Base):
    """Customer-uploaded CSV cost rows used as a manual billing source."""

    __tablename__ = "imported_cost_records"
    __table_args__ = (
        UniqueConstraint("upload_id", "line_number", name="uq_imported_cost_upload_line"),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    upload_id = Column(String(64), nullable=False, index=True)
    source_filename = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=False, index=True)
    service_name = Column(String(255), nullable=True)
    account_identifier = Column(String(255), nullable=True)
    account_name = Column(String(255), nullable=True)
    account_type = Column(String(80), nullable=True)
    parent_account_identifier = Column(String(255), nullable=True)
    region = Column(String(100), nullable=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    cost_usd = Column(Float, nullable=False, default=0.0)
    currency = Column(String(10), nullable=False, default="USD")
    line_number = Column(Integer, nullable=False)
    tags_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<ImportedCostRecord(customer_id={self.customer_id}, provider={self.provider}, "
            f"cost=${self.cost_usd:.2f})>"
        )


class ProviderAccount(Base):
    """Provider hierarchy node such as account, subscription, project, or compartment."""

    __tablename__ = "provider_accounts"
    __table_args__ = (
        UniqueConstraint(
            "customer_id",
            "provider",
            "account_identifier",
            name="uq_provider_account_scope",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    provider = Column(String(50), nullable=False, index=True)
    account_identifier = Column(String(255), nullable=False)
    account_name = Column(String(255), nullable=False)
    account_type = Column(String(80), nullable=False, default="account")
    native_region = Column(String(100), nullable=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    parent_links = relationship(
        "ProviderAccountLink",
        foreign_keys="ProviderAccountLink.child_account_id",
        back_populates="child_account",
        cascade="all, delete-orphan",
    )
    child_links = relationship(
        "ProviderAccountLink",
        foreign_keys="ProviderAccountLink.parent_account_id",
        back_populates="parent_account",
        cascade="all, delete-orphan",
    )
    snapshots = relationship(
        "ProviderAccountSnapshot",
        back_populates="provider_account",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return (
            f"<ProviderAccount(provider={self.provider}, "
            f"identifier={self.account_identifier}, name={self.account_name})>"
        )


class ProviderAccountLink(Base):
    """Parent-child hierarchy links between provider accounts."""

    __tablename__ = "provider_account_links"
    __table_args__ = (
        UniqueConstraint("child_account_id", name="uq_provider_account_link_child"),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    parent_account_id = Column(Integer, ForeignKey("provider_accounts.id"), nullable=False, index=True)
    child_account_id = Column(Integer, ForeignKey("provider_accounts.id"), nullable=False, index=True)
    relationship_type = Column(String(50), nullable=False, default="contains")
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    parent_account = relationship(
        "ProviderAccount",
        foreign_keys=[parent_account_id],
        back_populates="child_links",
    )
    child_account = relationship(
        "ProviderAccount",
        foreign_keys=[child_account_id],
        back_populates="parent_links",
    )

    def __repr__(self):
        return (
            f"<ProviderAccountLink(parent_account_id={self.parent_account_id}, "
            f"child_account_id={self.child_account_id})>"
        )


class ProviderAccountSnapshot(Base):
    """Per-scan cost metrics for provider hierarchy nodes."""

    __tablename__ = "provider_account_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "scan_id",
            "provider_account_id",
            name="uq_provider_account_snapshot",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    scan_id = Column(String(255), ForeignKey("scan_runs.scan_id"), nullable=False, index=True)
    provider_account_id = Column(Integer, ForeignKey("provider_accounts.id"), nullable=False, index=True)
    direct_cost_usd = Column(Float, nullable=False, default=0.0)
    savings_identified_usd = Column(Float, nullable=False, default=0.0)
    anomalies_count = Column(Integer, nullable=False, default=0)
    service_count = Column(Integer, nullable=False, default=0)
    captured_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    scan_run = relationship("ScanRunRecord", back_populates="provider_account_snapshots")
    provider_account = relationship("ProviderAccount", back_populates="snapshots")

    def __repr__(self):
        return (
            f"<ProviderAccountSnapshot(scan_id={self.scan_id}, "
            f"provider_account_id={self.provider_account_id}, cost=${self.direct_cost_usd:.2f})>"
        )


class CostAllocationSnapshot(Base):
    """Per-scan, per-account, per-region cost breakdown for region-level drill-down."""

    __tablename__ = "cost_allocation_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "scan_id",
            "provider_account_id",
            "region",
            name="uq_cost_allocation_snapshot",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    scan_id = Column(String(255), ForeignKey("scan_runs.scan_id"), nullable=False, index=True)
    provider_account_id = Column(Integer, ForeignKey("provider_accounts.id"), nullable=False, index=True)
    provider = Column(String(50), nullable=False, index=True)
    region = Column(String(100), nullable=False, index=True)
    cost_usd = Column(Float, nullable=False, default=0.0)
    captured_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<CostAllocationSnapshot(scan_id={self.scan_id}, "
            f"provider_account_id={self.provider_account_id}, region={self.region}, "
            f"cost=${self.cost_usd:.2f})>"
        )


class AuditLog(Base):
    """Immutable organization-scoped audit trail."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(120), nullable=False, index=True)
    entity_type = Column(String(80), nullable=False, index=True)
    entity_id = Column(String(255), nullable=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<AuditLog(org_id={self.organization_id}, action={self.action}, "
            f"entity_type={self.entity_type})>"
        )


class AlertEvent(Base):
    """Persisted alert outcomes for dashboard visibility and acknowledgement."""

    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    scan_id = Column(String(255), nullable=True, index=True)
    alert_type = Column(String(80), nullable=False, index=True)
    severity = Column(String(30), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    delivered_channels_json = Column(Text, nullable=False, default="[]")
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<AlertEvent(org_id={self.organization_id}, type={self.alert_type}, "
            f"severity={self.severity})>"
        )


class AlertRoutingPolicy(Base):
    """Severity to channel routing matrix for outbound alerts."""

    __tablename__ = "alert_routing_policies"
    __table_args__ = (
        UniqueConstraint("organization_id", "severity", name="uq_alert_routing_org_severity"),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    severity = Column(String(30), nullable=False, index=True)
    channels_json = Column(Text, nullable=False, default="[]")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    def __repr__(self):
        return (
            f"<AlertRoutingPolicy(org_id={self.organization_id}, severity={self.severity}, "
            f"active={self.is_active})>"
        )


class ExportJob(Base):
    """Scheduled report export job definition."""

    __tablename__ = "export_jobs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    report_type = Column(String(80), nullable=False, default="executive_summary")
    export_format = Column(String(20), nullable=False, default="csv")
    schedule_frequency = Column(String(20), nullable=False, default="weekly")
    is_active = Column(Boolean, default=True)
    last_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    def __repr__(self):
        return (
            f"<ExportJob(org_id={self.organization_id}, name={self.name}, "
            f"report={self.report_type}, format={self.export_format})>"
        )


class BusinessMappingRule(Base):
    """Tag/label-based rules that normalize cost records to business dimensions.

    A rule matches imported or scanned cost records by *tag_key* + optional *tag_value*
    (wildcard ``*`` means any value) and assigns them to a business dimension such as
    ``team``, ``environment``, ``application``, or ``cost_center``.
    """

    __tablename__ = "business_mapping_rules"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "tag_key",
            "tag_value",
            "dimension",
            name="uq_business_mapping_rule",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    # Matching criteria
    tag_key = Column(String(255), nullable=False, index=True)
    tag_value = Column(String(255), nullable=False, default="*")  # "*" = any value
    # Business dimension type: team | environment | application | cost_center
    dimension = Column(String(80), nullable=False, index=True)
    # The normalized value to assign (e.g. "platform-team", "production", "payments")
    mapped_value = Column(String(255), nullable=False)
    priority = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    def __repr__(self):
        return (
            f"<BusinessMappingRule(org_id={self.organization_id}, "
            f"tag={self.tag_key}={self.tag_value!r}, "
            f"dim={self.dimension}={self.mapped_value!r})>"
        )


class NormalizedCostDimension(Base):
    """Normalized business-dimension assignments derived from mapping rules.

    Each row represents a single imported cost record that has been mapped to one
    or more business dimensions via the active ``BusinessMappingRule`` set.  Multiple
    rows can exist per ``imported_cost_record_id`` when a record matches rules for
    different dimension types.
    """

    __tablename__ = "normalized_cost_dimensions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    imported_cost_record_id = Column(Integer, ForeignKey("imported_cost_records.id"), nullable=True, index=True)
    scan_id = Column(String(255), nullable=True, index=True)
    provider = Column(String(50), nullable=False, index=True)
    service_name = Column(String(255), nullable=True, index=True)
    region = Column(String(100), nullable=True)
    cost_usd = Column(Float, nullable=False, default=0.0)
    # Normalized dimension fields (null = not mapped)
    team = Column(String(255), nullable=True, index=True)
    environment = Column(String(255), nullable=True, index=True)
    application = Column(String(255), nullable=True, index=True)
    cost_center = Column(String(255), nullable=True, index=True)
    is_mapped = Column(Boolean, nullable=False, default=False, index=True)
    mapping_rule_ids_json = Column(Text, nullable=False, default="[]")
    captured_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<NormalizedCostDimension(org_id={self.organization_id}, "
            f"provider={self.provider}, cost=${self.cost_usd:.2f}, "
            f"team={self.team!r}, env={self.environment!r})>"
        )


class ExportJobRun(Base):
    """Execution history for export jobs."""

    __tablename__ = "export_job_runs"

    id = Column(Integer, primary_key=True, index=True)
    export_job_id = Column(Integer, ForeignKey("export_jobs.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="queued")
    output_filename = Column(String(255), nullable=True)
    row_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False, index=True)
    completed_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return (
            f"<ExportJobRun(job_id={self.export_job_id}, status={self.status}, "
            f"rows={self.row_count})>"
        )


class CostPeriodSummary(Base):
    """Pre-aggregated weekly/monthly cost summaries per provider and business dimension.

    Computed from ImportedCostRecord and NormalizedCostDimension rows.
    Used for trend charts, executive dashboards, and scheduled report generation.
    """

    __tablename__ = "cost_period_summaries"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "period_type", "period_start", "provider", "team", "environment",
            name="uq_cost_period_summary",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    period_type = Column(String(10), nullable=False)          # "monthly" | "weekly"
    period_start = Column(DateTime, nullable=False, index=True)
    period_end = Column(DateTime, nullable=False)
    provider = Column(String(50), nullable=False, index=True)  # "aws", "azure", "gcp", "oci", "imported", "all"
    region = Column(String(100), nullable=True)
    team = Column(String(160), nullable=True)
    environment = Column(String(160), nullable=True)
    total_cost_usd = Column(Float, nullable=False, default=0.0)
    mapped_cost_usd = Column(Float, nullable=False, default=0.0)
    unmapped_cost_usd = Column(Float, nullable=False, default=0.0)
    record_count = Column(Integer, nullable=False, default=0)
    service_breakdown_json = Column(Text, nullable=True)       # JSON: {service: cost_usd}
    computed_at = Column(DateTime, default=_utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<CostPeriodSummary({self.period_type} {self.period_start} "
            f"{self.provider} ${self.total_cost_usd:.2f})>"
        )



# Dependency
def get_db():
    """FastAPI dependency for database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Initialize database
def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)


def ensure_public_workspace(db=None):
    """Create or load the single-tenant public workspace used when auth is disabled."""
    owns_session = db is None
    if owns_session:
        db = SessionLocal()

    try:
        public_email = os.getenv("PUBLIC_WORKSPACE_EMAIL", "public@optiora.local").strip().lower()
        public_name = os.getenv("PUBLIC_WORKSPACE_NAME", "OptiOra Public Workspace").strip()

        user = db.query(User).filter(User.email == public_email).first()
        if user is None:
            from .auth_utils import hash_password

            user = User(
                email=public_email,
                password_hash=hash_password(os.urandom(24).hex()),
                full_name="Public Workspace Service",
                is_active=False,
                email_verified=True,
            )
            db.add(user)
            db.flush()

        organization = (
            db.query(Organization)
            .filter(Organization.owner_id == user.id, Organization.name == public_name)
            .first()
        )
        if organization is None:
            organization = Organization(
                name=public_name,
                description="Single-tenant public workspace for anonymous dashboard access.",
                owner_id=user.id,
                plan=OrganizationPlan.ENTERPRISE,
                is_active=True,
            )
            db.add(organization)
            db.flush()

        membership = (
            db.query(UserOrganization)
            .filter(
                UserOrganization.user_id == user.id,
                UserOrganization.organization_id == organization.id,
            )
            .first()
        )
        if membership is None:
            db.add(
                UserOrganization(
                    user_id=user.id,
                    organization_id=organization.id,
                    role=UserRole.OWNER,
                )
            )

        db.commit()
        db.refresh(user)
        db.refresh(organization)
        return user, organization
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully!")
