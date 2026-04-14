"""Configuration management for OptiOra API backend."""

import os
from dataclasses import dataclass


@dataclass
class Config:
    """Central configuration."""

    # Server
    api_port: int = int(os.getenv("PORT", "8000"))
    api_log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # AWS
    aws_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    aws_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")

    # Azure
    azure_subscription_id: str = os.getenv("AZURE_SUBSCRIPTION_ID", "")
    azure_tenant_id: str = os.getenv("AZURE_TENANT_ID", "")
    azure_client_id: str = os.getenv("AZURE_CLIENT_ID", "")
    azure_client_secret: str = os.getenv("AZURE_CLIENT_SECRET", "")

    # GCP
    google_application_credentials: str = os.getenv(
        "GOOGLE_APPLICATION_CREDENTIALS", ""
    )
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "")

    # OCI (Oracle Cloud Infrastructure)
    # Used for: (1) hosting the API backend, (2) analyzing OCI costs via Usage API
    oci_config_file: str = os.getenv("OCI_CONFIG_FILE", "")
    oci_profile: str = os.getenv("OCI_PROFILE", "DEFAULT")
    oci_region: str = os.getenv("OCI_REGION", "af-johannesburg-1")

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

    # Business config
    revenue_share_percentage: float = float(os.getenv("REVENUE_SHARE_PERCENTAGE", "15"))
    min_anomaly_threshold_usd: float = float(
        os.getenv("MIN_ANOMALY_THRESHOLD_USD", "100")
    )
    max_auto_action_spend: float = float(
        os.getenv("MAX_AUTO_ACTION_SPEND", "1000")
    )  # Max $ to save via automation without approval

    def validate(self):
        """Validate required configuration."""
        has_aws = bool(self.aws_access_key_id and self.aws_secret_access_key)
        has_azure = bool(
            self.azure_subscription_id
            and self.azure_tenant_id
            and self.azure_client_id
            and self.azure_client_secret
        )
        has_gcp = bool(self.google_application_credentials and self.gcp_project_id)
        has_oci = bool(self.oci_config_file)
        if not any([has_aws, has_azure, has_gcp, has_oci]):
            raise ValueError(
                "At least one cloud provider must be configured for cost analysis (AWS, Azure, GCP, or OCI)"
            )
