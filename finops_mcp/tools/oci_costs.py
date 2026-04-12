"""OCI Usage & Billing integration."""

import json
import logging
from typing import Any
from datetime import datetime, timedelta

import oci
from oci.usage_api import UsageapiClient
from oci.identity import IdentityClient

logger = logging.getLogger(__name__)


async def get_cost_summary(params: dict[str, Any]) -> str:
    """
    Get OCI cost summary for specified period using OCI Usage API.
    
    Returns: JSON string with total cost, top services, trends
    """
    try:
        period = params.get("period", "month")
        filters = params.get("filters", {})

        # Initialize OCI clients
        config = oci.config.from_file()
        usage_client = UsageapiClient(config)
        identity_client = IdentityClient(config)

        # Get tenancy info
        user = identity_client.get_user(config["user"]).data
        tenancy_id = config["tenancy"]

        # Calculate date range
        end_date = datetime.now().date()
        if period == "day":
            start_date = end_date - timedelta(days=1)
        elif period == "week":
            start_date = end_date - timedelta(days=7)
        elif period == "month":
            start_date = end_date - timedelta(days=30)
        else:  # year
            start_date = end_date - timedelta(days=365)

        # Query usage data
        request = oci.usage_api.models.RequestSummarizedUsagesDetails(
            tenant_id=tenancy_id,
            time_usage_started=datetime.combine(start_date, datetime.min.time()),
            time_usage_ended=datetime.combine(end_date, datetime.max.time()),
            granularity="DAILY",
            group_by=["service"],
            filter=oci.usage_api.models.Filter(
                dimensions=[]
            ),
        )

        response = usage_client.request_summarized_usages(request)

        # Parse response
        total_cost = 0.0
        services = {}

        for item in response.data.items:
            service_name = item.dimensions.get("service", "Unknown") if item.dimensions else "Unknown"
            cost = float(item.computed_amount or 0)
            services[service_name] = services.get(service_name, 0) + cost
            total_cost += cost

        # Sort by cost descending
        top_services = sorted(services.items(), key=lambda x: x[1], reverse=True)[:5]

        return json.dumps(
            {
                "period": period,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "total_cost_usd": round(total_cost, 2),
                "top_services": [
                    {"service": s, "cost_usd": round(c, 2)} for s, c in top_services
                ],
                "currency": "USD",
                "data_source": "OCI Usage API",
                "tenancy_id": tenancy_id,
            }
        )

    except Exception as e:
        logger.error(f"Error fetching OCI costs: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_compute_costs(account_id: str = None) -> str:
    """Get OCI Compute (Instances) costs and utilization."""
    try:
        config = oci.config.from_file()
        compute_client = oci.core.ComputeClient(config)
        
        # Get all instances in tenancy
        instances_response = compute_client.list_instances(
            compartment_id=config["tenancy"],
            lifecycle_state="RUNNING",
        )

        instances = []
        for instance in instances_response.data:
            instances.append(
                {
                    "id": instance.id,
                    "display_name": instance.display_name,
                    "shape": instance.shape,
                    "time_created": str(instance.time_created),
                    "lifecycle_state": instance.lifecycle_state,
                }
            )

        return json.dumps(
            {
                "region": config["region"],
                "running_instances": len(instances),
                "instances": instances,
            }
        )

    except Exception as e:
        logger.error(f"Error fetching OCI compute resources: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_storage_costs() -> str:
    """Get OCI Object Storage costs and usage."""
    try:
        config = oci.config.from_file()
        object_storage_client = oci.object_storage.ObjectStorageClient(config)
        namespace = object_storage_client.get_namespace().data

        # List buckets
        buckets_response = object_storage_client.list_buckets(
            namespace_name=namespace,
            compartment_id=config["tenancy"],
        )

        buckets = []
        total_size_gb = 0

        for bucket in buckets_response.data.buckets:
            bucket_size = bucket.approximate_size / (1024**3)  # Convert to GB
            total_size_gb += bucket_size
            
            buckets.append(
                {
                    "name": bucket.name,
                    "size_gb": round(bucket_size, 2),
                    "storage_tier": bucket.storage_tier,
                    "time_created": str(bucket.time_created),
                }
            )

        # Calculate cost: $0.0255/GB/month
        monthly_cost = total_size_gb * 0.0255

        return json.dumps(
            {
                "namespace": namespace,
                "total_buckets": len(buckets),
                "total_size_gb": round(total_size_gb, 2),
                "estimated_monthly_cost_usd": round(monthly_cost, 2),
                "buckets": buckets,
            }
        )

    except Exception as e:
        logger.error(f"Error fetching OCI storage costs: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_database_costs() -> str:
    """Get OCI Database (MySQL, PostgreSQL, Oracle) costs."""
    try:
        config = oci.config.from_file()
        db_client = oci.database.DatabaseClient(config)

        # List DB instances
        databases_response = db_client.list_databases(
            compartment_id=config["tenancy"],
        )

        databases = []
        for db in databases_response.data:
            databases.append(
                {
                    "id": db.id,
                    "display_name": db.display_name,
                    "db_name": db.db_name,
                    "character_set": db.character_set,
                    "ncharacter_set": db.ncharacter_set,
                }
            )

        return json.dumps(
            {
                "total_databases": len(databases),
                "databases": databases,
                "note": "Use OCI Billing API for precise costs",
            }
        )

    except Exception as e:
        logger.error(f"Error fetching OCI database resources: {str(e)}")
        return json.dumps({"error": str(e)})
