"""Configuration management for OptiOra MCP server."""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    """Central configuration."""

    # Server
    mcp_port: int = int(os.getenv("MCP_PORT", "8000"))
    mcp_log_level: str = os.getenv("MCP_LOG_LEVEL", "INFO")

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

    # OCI (Oracle Cloud Infrastructure)
    # Used for: (1) hosting the MCP server, (2) analyzing OCI costs via Usage API
    oci_config_file: str = os.getenv("OCI_CONFIG_FILE", "~/.oci/config")
    oci_profile: str = os.getenv("OCI_PROFILE", "DEFAULT")
    oci_region: str = os.getenv("OCI_REGION", "us-phoenix-1")

    # OCI Deployment Options
    deployment_type: str = os.getenv("DEPLOYMENT_TYPE", "oci-compute")  # oci-functions, oci-compute, docker
    oci_function_ocid: str = os.getenv("OCI_FUNCTION_OCID", "")
    oci_api_gateway_url: str = os.getenv("OCI_API_GATEWAY_URL", "")

    # OCI Database (PostgreSQL for audit logs)
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
        # Check for at least one cloud provider (for cost analysis)
        if not any(
            [self.aws_access_key_id, self.azure_subscription_id, self.google_application_credentials, self.oci_config_file]
        ):
            raise ValueError(
                "At least one cloud provider must be configured for cost analysis (AWS, Azure, GCP, or OCI)"
            )
