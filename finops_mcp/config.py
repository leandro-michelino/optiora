"""Configuration management for OptiOra API backend."""

import logging
import os
from dataclasses import dataclass, field

_logger = logging.getLogger(__name__)


def _env_bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes"}


def _env_str(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _env_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def _env_upper_str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().upper()


def _genai_compartment_id() -> str:
    return os.getenv("OCI_GENAI_COMPARTMENT_ID", "").strip() or os.getenv(
        "OCI_COMPARTMENT_OCID", ""
    )


@dataclass
class Config:
    """Central configuration."""

    auth_enabled: bool = field(default_factory=lambda: _env_bool("ENABLE_AUTH"))
    public_workspace_name: str = field(
        default_factory=lambda: _env_str(
            "PUBLIC_WORKSPACE_NAME", "OptiOra Public Workspace"
        )
    )
    public_workspace_email: str = field(
        default_factory=lambda: _env_str(
            "PUBLIC_WORKSPACE_EMAIL", "public@optiora.local"
        )
    )

    # Server
    api_port: int = field(default_factory=lambda: _env_int("PORT", 8000))
    api_log_level: str = field(default_factory=lambda: _env_str("LOG_LEVEL", "INFO"))

    # AWS
    aws_access_key_id: str = field(
        default_factory=lambda: _env_str("AWS_ACCESS_KEY_ID")
    )
    aws_secret_access_key: str = field(
        default_factory=lambda: _env_str("AWS_SECRET_ACCESS_KEY")
    )
    aws_region: str = field(default_factory=lambda: _env_str("AWS_REGION", "us-east-1"))
    aws_organization_role_arns: str = field(
        default_factory=lambda: _env_str("AWS_ORGANIZATION_ROLE_ARNS")
    )

    # Azure
    azure_subscription_id: str = field(
        default_factory=lambda: _env_str("AZURE_SUBSCRIPTION_ID")
    )
    azure_subscription_ids: str = field(
        default_factory=lambda: _env_str("AZURE_SUBSCRIPTION_IDS")
    )
    azure_management_group_id: str = field(
        default_factory=lambda: _env_str("AZURE_MANAGEMENT_GROUP_ID")
    )
    azure_tenant_id: str = field(default_factory=lambda: _env_str("AZURE_TENANT_ID"))
    azure_client_id: str = field(default_factory=lambda: _env_str("AZURE_CLIENT_ID"))
    azure_client_secret: str = field(
        default_factory=lambda: _env_str("AZURE_CLIENT_SECRET")
    )

    # GCP
    google_application_credentials: str = field(
        default_factory=lambda: _env_str("GOOGLE_APPLICATION_CREDENTIALS")
    )
    gcp_project_id: str = field(default_factory=lambda: _env_str("GCP_PROJECT_ID"))
    gcp_project_ids: str = field(default_factory=lambda: _env_str("GCP_PROJECT_IDS"))
    gcp_folder_id: str = field(default_factory=lambda: _env_str("GCP_FOLDER_ID"))
    gcp_organization_id: str = field(
        default_factory=lambda: _env_str("GCP_ORGANIZATION_ID")
    )
    gcp_pubsub_ingest_token: str = field(
        default_factory=lambda: _env_str("GCP_PUBSUB_INGEST_TOKEN")
    )

    # OCI (Oracle Cloud Infrastructure)
    # Used for: (1) hosting the API backend, (2) analyzing OCI costs via Usage API
    oci_config_file: str = field(default_factory=lambda: _env_str("OCI_CONFIG_FILE"))
    oci_profile: str = field(default_factory=lambda: _env_str("OCI_PROFILE", "DEFAULT"))
    oci_region: str = field(default_factory=lambda: _env_str("OCI_REGION", "uk-london-1"))
    # Comma-separated list of OCI compartment OCIDs for multi-compartment scans.
    oci_compartment_ids: str = field(
        default_factory=lambda: _env_str("OCI_COMPARTMENT_IDS")
    )

    # OCI Generative AI (backend-side inference for analytics narration)
    oci_genai_endpoint: str = field(
        default_factory=lambda: _env_str("OCI_GENAI_ENDPOINT")
    )
    oci_genai_model: str = field(
        default_factory=lambda: _env_str(
            "OCI_GENAI_MODEL", "meta.llama-3-70b-instruct"
        )
    )
    oci_genai_compartment_id: str = field(default_factory=_genai_compartment_id)
    oci_genai_max_tokens: int = field(
        default_factory=lambda: _env_int("OCI_GENAI_MAX_TOKENS", 800)
    )

    # OCI Database (PostgreSQL for audit logs)
    database_url: str = field(default_factory=lambda: _env_str("DATABASE_URL"))
    oci_db_host: str = field(default_factory=lambda: _env_str("OCI_DB_HOST"))
    oci_db_port: int = field(default_factory=lambda: _env_int("OCI_DB_PORT", 5432))
    oci_db_user: str = field(default_factory=lambda: _env_str("OCI_DB_USER"))
    oci_db_password: str = field(default_factory=lambda: _env_str("OCI_DB_PASSWORD"))
    oci_db_name: str = field(default_factory=lambda: _env_str("OCI_DB_NAME", "optiora"))
    oci_db_license_model: str = field(
        default_factory=lambda: _env_upper_str("OCI_DB_LICENSE_MODEL", "BYOL")
        or "BYOL"
    )

    # API Keys for callbacks
    jira_api_token: str = field(default_factory=lambda: _env_str("JIRA_API_TOKEN"))
    slack_webhook: str = field(default_factory=lambda: _env_str("SLACK_WEBHOOK"))
    teams_webhook: str = field(default_factory=lambda: _env_str("TEAMS_WEBHOOK"))
    smtp_host: str = field(default_factory=lambda: _env_str("SMTP_HOST"))
    smtp_port: int = field(default_factory=lambda: _env_int("SMTP_PORT", 587))
    smtp_user: str = field(default_factory=lambda: _env_str("SMTP_USER"))
    smtp_password: str = field(default_factory=lambda: _env_str("SMTP_PASSWORD"))
    smtp_from_email: str = field(default_factory=lambda: _env_str("SMTP_FROM_EMAIL"))
    smtp_use_tls: bool = field(default_factory=lambda: _env_bool("SMTP_USE_TLS", "true"))

    # Business config
    revenue_share_percentage: float = field(
        default_factory=lambda: _env_float("REVENUE_SHARE_PERCENTAGE", 15)
    )
    min_anomaly_threshold_usd: float = field(
        default_factory=lambda: _env_float("MIN_ANOMALY_THRESHOLD_USD", 100)
    )
    # Max $ to save via automation without approval.
    max_auto_action_spend: float = field(
        default_factory=lambda: _env_float("MAX_AUTO_ACTION_SPEND", 1000)
    )

    # Scan scheduling
    enable_scan_scheduler: bool = field(
        default_factory=lambda: _env_bool("ENABLE_SCAN_SCHEDULER")
    )
    scan_scheduler_interval_minutes: int = field(
        default_factory=lambda: _env_int("SCAN_SCHEDULER_INTERVAL_MINUTES", 60)
    )

    # Data retention / archival
    # Rows older than retention_hot_months are archived to OCI Object Storage then deleted from DB.
    # The bucket lifecycle rule (Terraform) handles deletion after 1 year in object storage.
    retention_enabled: bool = field(
        default_factory=lambda: _env_bool("RETENTION_ENABLED")
    )
    retention_hot_months: int = field(
        default_factory=lambda: _env_int("RETENTION_HOT_MONTHS", 3)
    )
    retention_run_interval_hours: int = field(
        default_factory=lambda: _env_int("RETENTION_RUN_INTERVAL_HOURS", 24)
    )
    oci_archive_bucket: str = field(
        default_factory=lambda: _env_str("OCI_ARCHIVE_BUCKET")
    )
    oci_archive_namespace: str = field(
        default_factory=lambda: _env_str("OCI_ARCHIVE_NAMESPACE")
    )

    # Data source policy
    require_live_provider_data: bool = field(
        default_factory=lambda: _env_bool("REQUIRE_LIVE_PROVIDER_DATA", "true")
    )

    def validate(self):
        """Validate required configuration."""
        valid_license_models = {"BYOL", "LICENSE_INCLUDED"}
        if self.oci_db_license_model not in valid_license_models:
            raise ValueError(
                "OCI_DB_LICENSE_MODEL must be BYOL or LICENSE_INCLUDED"
            )
        if self.oci_db_license_model != "BYOL":
            _logger.warning(
                "OCI_DB_LICENSE_MODEL=%s. BYOL is the current recommended default "
                "when OCI database licensing choice is available.",
                self.oci_db_license_model,
            )

        has_aws = bool(
            (self.aws_access_key_id and self.aws_secret_access_key)
            or self.aws_organization_role_arns
        )
        has_azure = bool(
            (self.azure_subscription_id or self.azure_subscription_ids or self.azure_management_group_id)
            and self.azure_tenant_id
            and self.azure_client_id
            and self.azure_client_secret
        )
        has_gcp = bool(
            self.google_application_credentials
            and (self.gcp_project_id or self.gcp_project_ids)
        )
        has_oci = bool(self.oci_config_file)
        if not any([has_aws, has_azure, has_gcp, has_oci]):
            raise ValueError(
                "At least one cloud provider must be configured for cost analysis (AWS, Azure, GCP, or OCI)"
            )
        # Warn clearly about insecure runtime defaults
        _env = os.getenv("ENVIRONMENT", "development").strip().lower()
        if not self.auth_enabled and _env == "production":
            _logger.warning(
                "SECURITY WARNING: ENABLE_AUTH=false in a production environment. "
                "All API endpoints are publicly accessible without authentication. "
                "Set ENABLE_AUTH=true before exposing this instance to the internet."
            )
