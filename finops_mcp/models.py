"""Data models for OptiOra FinOps."""

from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional, List
from enum import Enum


class CloudProvider(str, Enum):
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"
    OCI = "oci"


class RecommendationType(str, Enum):
    RESERVED_INSTANCES = "reserved-instances"
    SPOT_INSTANCES = "spot-instances"
    IDLE_RESOURCES = "idle-resources"
    STORAGE_OPTIMIZATION = "storage-optimization"
    NETWORK_OPTIMIZATION = "network-optimization"


class ActionType(str, Enum):
    SCHEDULE_RESOURCE = "schedule-resource"
    PURCHASE_RESERVED_INSTANCE = "purchase-reserved-instance"
    DELETE_UNATTACHED_VOLUME = "delete-unattached-volume"
    AUTO_TAG_RESOURCES = "auto-tag-resources"


@dataclass
class CostSummary:
    """Cost summary for a period."""

    period: str
    start_date: str
    end_date: str
    total_cost_usd: float
    cloud_provider: CloudProvider
    top_services: List[dict]
    currency: str = "USD"


@dataclass
class Anomaly:
    """Detected cost anomaly."""

    service: str
    date: str
    baseline_usd: float
    actual_usd: float
    increase_percent: float
    probable_cause: str
    confidence: float  # 0-1
    recommendation: str


@dataclass
class Recommendation:
    """Cost optimization recommendation."""

    id: str
    type: RecommendationType
    service: str
    description: str
    current_annual_spend: float
    savings_annual_usd: float
    payback_months: int
    severity: str  # low, medium, high
    roi_percent: float


@dataclass
class CostAction:
    """Cost action execution log."""

    id: str
    timestamp: str
    action_type: ActionType
    dry_run: bool
    resource_count: int
    status: str  # pending_approval, simulated, executed
    results: List[dict]
    estimated_monthly_savings: float


@dataclass
class CostTicket:
    """Ticket for cost optimization."""

    id: str
    system: str  # jira, azure-devops, github
    title: str
    description: str
    priority: str  # low, medium, high, critical
    estimated_savings_annual_usd: float
    created_date: str
    status: str  # open, in_progress, closed
    assignee: Optional[str]
    labels: List[str]


@dataclass
class Customer:
    """Customer account."""

    id: str
    name: str
    email: str
    tier: str  # starter, professional, enterprise
    cloud_providers: List[CloudProvider]
    created_date: str
    annual_savings_total: float = 0.0
    api_enabled: bool = True
