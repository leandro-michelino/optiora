"""
Connector framework for cost and resource data ingestion.

Supports multiple third-party APIs (CloudHealth, Spot, OpenCost) with a unified interface.
"""

import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum

import httpx

logger = logging.getLogger(__name__)


class ConnectorType(str, Enum):
    """Supported connector types."""
    CLOUDHEALTH = "cloudhealth"
    SPOT = "spotio"
    OPENCOST = "opencost"


class ConnectorStatus(str, Enum):
    """Connector health status indicators."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    FAILING = "failing"
    UNKNOWN = "unknown"


class CostDataPoint:
    """Represents a cost observation from a connector."""
    
    def __init__(
        self,
        connector: str,
        amount_usd: float,
        currency: str = "USD",
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        resource_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        account_id: Optional[str] = None,
        region: Optional[str] = None,
        service: Optional[str] = None,
        tags: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.connector = connector
        self.amount_usd = amount_usd
        self.currency = currency
        self.period_start = period_start or datetime.utcnow()
        self.period_end = period_end
        self.resource_id = resource_id
        self.resource_type = resource_type
        self.account_id = account_id
        self.region = region
        self.service = service
        self.tags = tags or {}
        self.metadata = metadata or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "connector": self.connector,
            "amount_usd": self.amount_usd,
            "currency": self.currency,
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat() if self.period_end else None,
            "resource_id": self.resource_id,
            "resource_type": self.resource_type,
            "account_id": self.account_id,
            "region": self.region,
            "service": self.service,
            "tags": self.tags,
            "metadata": self.metadata,
        }


class BaseConnector(ABC):
    """Abstract base class for cloud cost connectors."""
    
    def __init__(self, connector_type: ConnectorType, config: Dict[str, Any]):
        self.connector_type = connector_type
        self.config = config
        self.last_sync: Optional[datetime] = None
        self.status = ConnectorStatus.UNKNOWN
        self._http_client = httpx.Client(timeout=30.0)
    
    @abstractmethod
    async def authenticate(self) -> bool:
        """Authenticate with the connector's API. Returns True if successful."""
        pass
    
    @abstractmethod
    async def fetch_costs(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        **kwargs: Any,
    ) -> List[CostDataPoint]:
        """Fetch cost data from the connector."""
        pass
    
    @abstractmethod
    async def validate_credentials(self) -> bool:
        """Validate connector credentials. Returns True if valid."""
        pass
    
    async def get_status(self) -> ConnectorStatus:
        """Get connector health status."""
        try:
            if await self.validate_credentials():
                self.status = ConnectorStatus.HEALTHY
            else:
                self.status = ConnectorStatus.FAILING
        except Exception as e:
            logger.error(f"Error checking {self.connector_type} status: {e}")
            self.status = ConnectorStatus.FAILING
        return self.status
    
    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(type={self.connector_type}, status={self.status})>"


class CloudHealthConnector(BaseConnector):
    """VMware CloudHealth cost data connector."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(ConnectorType.CLOUDHEALTH, config)
        self.api_key = config.get("api_key")
        self.api_url = config.get("api_url", "https://chapi.cloudhealthtech.com/v1")
    
    async def authenticate(self) -> bool:
        """Authenticate with CloudHealth API."""
        if not self.api_key:
            logger.error("CloudHealth API key not configured")
            return False
        
        try:
            response = self._http_client.get(
                f"{self.api_url}/accounts",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"CloudHealth authentication failed: {e}")
            return False
    
    async def validate_credentials(self) -> bool:
        """Validate CloudHealth credentials."""
        return await self.authenticate()
    
    async def fetch_costs(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        **kwargs: Any,
    ) -> List[CostDataPoint]:
        """Fetch costs from CloudHealth."""
        if not await self.authenticate():
            raise ValueError("CloudHealth authentication failed")
        
        start_date = start_date or (datetime.utcnow() - timedelta(days=7))
        end_date = end_date or datetime.utcnow()
        
        try:
            response = self._http_client.get(
                f"{self.api_url}/costs",
                headers={"Authorization": f"Bearer {self.api_key}"},
                params={
                    "start_date": start_date.date().isoformat(),
                    "end_date": end_date.date().isoformat(),
                    "dimensions": "service,account",
                },
            )
            response.raise_for_status()
            
            costs: List[CostDataPoint] = []
            data = response.json()
            
            for item in data.get("costs", []):
                costs.append(
                    CostDataPoint(
                        connector="cloudhealth",
                        amount_usd=float(item.get("amount", 0)),
                        service=item.get("service"),
                        account_id=item.get("account_id"),
                        period_start=start_date,
                        period_end=end_date,
                        metadata={"cloudhealth_id": item.get("id")},
                    )
                )
            
            self.last_sync = datetime.utcnow()
            return costs
        except Exception as e:
            logger.error(f"CloudHealth cost fetch failed: {e}")
            raise


class SpotConnector(BaseConnector):
    """Spot by NetApp cost data connector (formerly Cloudyn)."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(ConnectorType.SPOT, config)
        self.api_token = config.get("api_token")
        self.account_id = config.get("account_id")
        self.api_url = config.get("api_url", "https://api.spotinst.io")
    
    async def authenticate(self) -> bool:
        """Authenticate with Spot API."""
        if not self.api_token or not self.account_id:
            logger.error("Spot API token or account ID not configured")
            return False
        
        try:
            response = self._http_client.get(
                f"{self.api_url}/elastigroup/costs/stats",
                headers={"Authorization": f"Bearer {self.api_token}"},
                params={"accountId": self.account_id},
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Spot authentication failed: {e}")
            return False
    
    async def validate_credentials(self) -> bool:
        """Validate Spot credentials."""
        return await self.authenticate()
    
    async def fetch_costs(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        **kwargs: Any,
    ) -> List[CostDataPoint]:
        """Fetch costs from Spot."""
        if not await self.authenticate():
            raise ValueError("Spot authentication failed")
        
        start_date = start_date or (datetime.utcnow() - timedelta(days=7))
        end_date = end_date or datetime.utcnow()
        
        try:
            response = self._http_client.get(
                f"{self.api_url}/elastigroup/costs/stats",
                headers={"Authorization": f"Bearer {self.api_token}"},
                params={
                    "accountId": self.account_id,
                    "from": start_date.timestamp(),
                    "to": end_date.timestamp(),
                },
            )
            response.raise_for_status()
            
            costs: List[CostDataPoint] = []
            data = response.json()
            
            for item in data.get("response", {}).get("items", []):
                costs.append(
                    CostDataPoint(
                        connector="spotio",
                        amount_usd=float(item.get("cost", 0)),
                        resource_id=item.get("elastigroupId"),
                        resource_type="elastigroup",
                        period_start=start_date,
                        period_end=end_date,
                        metadata={"spot_id": item.get("id")},
                    )
                )
            
            self.last_sync = datetime.utcnow()
            return costs
        except Exception as e:
            logger.error(f"Spot cost fetch failed: {e}")
            raise


class OpenCostConnector(BaseConnector):
    """OpenCost Kubernetes cost allocation connector."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(ConnectorType.OPENCOST, config)
        self.api_url = config.get("api_url", "http://localhost:9090")
        self.cluster_name = config.get("cluster_name", "default")
    
    async def authenticate(self) -> bool:
        """Verify OpenCost API connectivity."""
        try:
            response = self._http_client.get(f"{self.api_url}/api/v1/status")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"OpenCost connectivity check failed: {e}")
            return False
    
    async def validate_credentials(self) -> bool:
        """Validate OpenCost connectivity."""
        return await self.authenticate()
    
    async def fetch_costs(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        **kwargs: Any,
    ) -> List[CostDataPoint]:
        """Fetch costs from OpenCost."""
        if not await self.authenticate():
            raise ValueError("OpenCost API unreachable")
        
        start_date = start_date or (datetime.utcnow() - timedelta(days=7))
        end_date = end_date or datetime.utcnow()
        
        try:
            response = self._http_client.get(
                f"{self.api_url}/api/v1/allocation",
                params={
                    "start": start_date.date().isoformat(),
                    "end": end_date.date().isoformat(),
                    "aggregate": "namespace",
                    "step": "1d",
                },
            )
            response.raise_for_status()
            
            costs: List[CostDataPoint] = []
            data = response.json()
            
            for allocation in data.get("data", []):
                for window in allocation:
                    namespace = window.get("properties", {}).get("namespace", "unknown")
                    cost_dict = window.get("totalCost", {})
                    total_cost = sum(float(v) for v in cost_dict.values() if isinstance(v, (int, float)))
                    
                    if total_cost > 0:
                        costs.append(
                            CostDataPoint(
                                connector="opencost",
                                amount_usd=total_cost,
                                resource_id=namespace,
                                resource_type="namespace",
                                service="kubernetes",
                                account_id=self.cluster_name,
                                period_start=start_date,
                                period_end=end_date,
                                metadata={"namespace": namespace},
                            )
                        )
            
            self.last_sync = datetime.utcnow()
            return costs
        except Exception as e:
            logger.error(f"OpenCost cost fetch failed: {e}")
            raise


class ConnectorManager:
    """Factory and registry for connector instances."""
    
    _connectors: Dict[ConnectorType, type] = {
        ConnectorType.CLOUDHEALTH: CloudHealthConnector,
        ConnectorType.SPOT: SpotConnector,
        ConnectorType.OPENCOST: OpenCostConnector,
    }
    
    @classmethod
    def get_connector(
        cls,
        connector_type: ConnectorType,
        config: Dict[str, Any],
    ) -> BaseConnector:
        """Instantiate a connector of the specified type."""
        connector_class = cls._connectors.get(connector_type)
        if not connector_class:
            raise ValueError(f"Unknown connector type: {connector_type}")
        
        return connector_class(config)
    
    @classmethod
    def register_connector(
        cls,
        connector_type: ConnectorType,
        connector_class: type,
    ) -> None:
        """Register a custom connector type."""
        if not issubclass(connector_class, BaseConnector):
            raise TypeError("Connector class must inherit from BaseConnector")
        cls._connectors[connector_type] = connector_class
    
    @classmethod
    def list_supported_connectors(cls) -> List[ConnectorType]:
        """List all supported connector types."""
        return list(cls._connectors.keys())
