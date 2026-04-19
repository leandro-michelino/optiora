"""Configuration management for OptiOra API backend."""

import os
from dataclasses import dataclass


@dataclass
class Config:
    """Central configuration."""

    auth_enabled: bool = os.getenv("ENABLE_AUTH", "false").strip().lower() in {"1", "true", "yes"}
    public_workspace_name: str = os.getenv("PUBLIC_WORKSPACE_NAME", "OptiOra Public Workspace")
    public_workspace_email: str = os.getenv("PUBLIC_WORKSPACE_EMAIL", "public@optiora.local")

    # Server
    api_port: int = int(os.getenv("PORT", "8000"))
    api_log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # AWS
    aws_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    aws_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")
    aws_organization_role_arns: str = os.getenv("AWS_ORGANIZATION_ROLE_ARNS", "")

    # Azure
    azure_subscription_id: str = os.getenv("AZURE_SUBSCRIPTION_ID", "")
    azure_subscription_ids: str = os.getenv("AZURE_SUBSCRIPTION_IDS", "")
    azure_management_group_id: str = os.getenv("AZURE_MANAGEMENT_GROUP_ID", "")
    azure_tenant_id: str = os.getenv("AZURE_TENANT_ID", "")
    azure_client_id: str = os.getenv("AZURE_CLIENT_ID", "")
    azure_client_secret: str = os.getenv("AZURE_CLIENT_SECRET", "")

    # GCP
    google_application_credentials: str = os.getenv(
        "GOOGLE_APPLICATION_CREDENTIALS", ""
    )
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "")
    gcp_project_ids: str = os.getenv("GCP_PROJECT_IDS", "")
    gcp_folder_id: str = os.getenv("GCP_FOLDER_ID", "")
    gcp_organization_id: str = os.getenv("GCP_ORGANIZATION_ID", "")
    gcp_pubsub_ingest_token: str = os.getenv("GCP_PUBSUB_INGEST_TOKEN", "")

    # OCI (Oracle Cloud Infrastructure)
    # Used for: (1) hosting the API backend, (2) analyzing OCI costs via Usage API
    oci_config_file: str = os.getenv("OCI_CONFIG_FILE", "")
    oci_profile: str = os.getenv("OCI_PROFILE", "DEFAULT")
    oci_region: str = os.getenv("OCI_REGION", "uk-london-1")
    # Comma-separated list of OCI compartment OCIDs for multi-compartment scans.
    oci_compartment_ids: str = os.getenv("OCI_COMPARTMENT_IDS", "")
    # Comma-separated list of OCI compartment OCIDs for multi-compartment scans.
    oci_compartment_ids: str = os.getenv("OCI_COMPARTMENT_IDS", "")

    # OCI Generative AI (backend-side inference for analytics narration)
    oci_genai_endpoint: str = os.getenv("OCI_GENAI_ENDPOINT", "")
    oci_genai_model: str = os.getenv("OCI_GENAI_MODEL", "meta.llama-3-70b-instruct")
    oci_genai_compartment_id: str = os.getenv("OCI_COMPARTMENT_OCID", os.getenv("OCI_GENAI_COMPARTMENT_ID", ""))
    oci_genai_max_tokens: int = int(os.getenv("OCI_GENAI_MAX_TOKENS", "800"))

    # OCI Database (PostgreSQL for audit logs)
    database_url: str = os.getenv("DATABASE_URL", "")
    oci_db_host: str = os.getenv("OCI_DB_HOST", "")
    oci_db_port: int = int(os.getenv("OCI_DB_PORT", "5432"))
    oci_db_user: str = os.getenv("OCI_DB_USER", "")
    oci_db_password: str = os.getenv("OCI_DB_PASSWORD", "")
    oci_db_name: str = os.getenv("OCI_DB_NAME", "optiora")

    # API Keys for callbacks
    jira_api_token: str = os.getenv("JIRA_API_TOKEN", "")
    slack_webhook: str = os.getenv("SLACK_WEBHOOK", "")
    teams_webhook: str = os.getenv("TEAMS_WEBHOOK", "")
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email: str = os.getenv("SMTP_FROM_EMAIL", "")
    smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").strip().lower() in {"1", "true", "yes"}

    # Business config
    revenue_share_percentage: float = float(os.getenv("REVENUE_SHARE_PERCENTAGE", "15"))
    min_anomaly_threshold_usd: float = float(
        os.getenv("MIN_ANOMALY_THRESHOLD_USD", "100")
    )
    max_auto_action_spend: float = float(
        os.getenv("MAX_AUTO_ACTION_SPEND", "1000")
    )  # Max $ to save via automation without approval

    # Scan scheduling
    enable_scan_scheduler: bool = os.getenv("ENABLE_SCAN_SCHEDULER", "false").strip().lower() in {"1", "true", "yes"}
    scan_scheduler_interval_minutes: int = int(os.getenv("SCAN_SCHEDULER_INTERVAL_MINUTES", "60"))

    # Data source policy
    require_live_provider_data: bool = os.getenv("REQUIRE_LIVE_PROVIDER_DATA", "true").strip().lower() in {"1", "true", "yes"}

    def validate(self):
        """Validate required configuration."""
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
