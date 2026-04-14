"""Database models for OptiOra with SQLAlchemy ORM."""

import enum
import os
from datetime import datetime
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
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
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    approved_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    snapshots = relationship("CostSnapshot", back_populates="scan_run", cascade="all, delete-orphan")

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

    captured_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    scan_run = relationship("ScanRunRecord", back_populates="snapshots")

    def __repr__(self):
        return (
            f"<CostSnapshot(scan_id={self.scan_id}, provider={self.provider}, "
            f"cost=${self.total_cost_usd:.2f})>"
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


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully!")
