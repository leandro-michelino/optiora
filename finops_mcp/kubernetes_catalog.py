"""Live Kubernetes provider catalog helpers.

Fetches regions and node shape/size metadata from provider APIs when possible.
Falls back to curated defaults if credentials or permissions are missing.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from .config import Config
from .credentials import CredentialValidator

logger = logging.getLogger(__name__)

DEFAULT_MONTHLY_NODE_COST = {
    "aws": 150.0,
    "azure": 155.0,
    "gcp": 145.0,
    "oci": 120.0,
}

FALLBACK_CATALOG: Dict[str, Dict[str, Any]] = {
    "aws": {
        "regions": ["us-east-1", "us-west-2", "eu-west-1"],
        "node_types": [
            {"value": "m5.xlarge", "monthly_cost_usd": 150.0},
            {"value": "m6i.xlarge", "monthly_cost_usd": 165.0},
            {"value": "c6i.xlarge", "monthly_cost_usd": 145.0},
        ],
    },
    "azure": {
        "regions": ["eastus", "westeurope", "uksouth"],
        "node_types": [
            {"value": "Standard_D4s_v5", "monthly_cost_usd": 155.0},
            {"value": "Standard_D8s_v5", "monthly_cost_usd": 290.0},
            {"value": "Standard_F4s_v2", "monthly_cost_usd": 148.0},
        ],
    },
    "gcp": {
        "regions": ["us-central1", "europe-west1", "europe-west2"],
        "node_types": [
            {"value": "n2-standard-4", "monthly_cost_usd": 145.0},
            {"value": "e2-standard-4", "monthly_cost_usd": 120.0},
            {"value": "c3-standard-4", "monthly_cost_usd": 190.0},
        ],
    },
    "oci": {
        "regions": ["uk-london-1", "eu-frankfurt-1", "us-ashburn-1"],
        "node_types": [
            {"value": "VM.Standard.E4.Flex", "monthly_cost_usd": 120.0},
            {"value": "VM.Standard.E5.Flex", "monthly_cost_usd": 135.0},
            {"value": "VM.Standard.A1.Flex", "monthly_cost_usd": 95.0},
        ],
    },
}


def _estimate_monthly_node_cost(provider: str, vcpu: float | None, memory_gib: float | None) -> float:
    if vcpu is None and memory_gib is None:
        return DEFAULT_MONTHLY_NODE_COST.get(provider, 150.0)
    vcpu_val = float(vcpu or 0.0)
    mem_val = float(memory_gib or 0.0)
    return round(max(20.0, (vcpu_val * 16.0) + (mem_val * 1.8)), 2)


def _normalize_node_types(
    provider: str,
    rows: List[Dict[str, Any]],
    max_items: int = 80,
) -> List[Dict[str, Any]]:
    dedup: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        value = str(row.get("value") or "").strip()
        if not value:
            continue
        if value in dedup:
            continue
        vcpu = row.get("vcpu")
        memory_gib = row.get("memory_gib")
        monthly_cost = row.get("monthly_cost_usd")
        if monthly_cost is None:
            monthly_cost = _estimate_monthly_node_cost(provider, vcpu, memory_gib)
        dedup[value] = {
            "value": value,
            "monthly_cost_usd": float(monthly_cost),
            "vcpu": float(vcpu) if vcpu is not None else None,
            "memory_gib": float(memory_gib) if memory_gib is not None else None,
            "source": str(row.get("source") or "live"),
        }

    ordered = sorted(
        dedup.values(),
        key=lambda item: (
            item.get("vcpu") is None,
            item.get("vcpu") or 0.0,
            item.get("memory_gib") or 0.0,
            item["value"],
        ),
    )
    return ordered[:max_items]


def _catalog_from_fallback(provider: str, reason: str) -> Dict[str, Any]:
    fallback = FALLBACK_CATALOG[provider]
    node_types = _normalize_node_types(
        provider,
        [{**item, "source": "fallback"} for item in fallback["node_types"]],
        max_items=50,
    )
    return {
        "provider": provider,
        "source": "fallback",
        "configured": False,
        "regions": fallback["regions"],
        "node_types": node_types,
        "message": reason,
    }


def _fetch_aws(
    config: Config,
    runtime_credentials: Optional[Dict[str, Any]] = None,
) -> Tuple[List[str], List[Dict[str, Any]], str]:
    runtime_credentials = runtime_credentials or {}
    access_key_id = str(
        runtime_credentials.get("access_key_id") or config.aws_access_key_id or ""
    ).strip()
    secret_access_key = str(
        runtime_credentials.get("secret_access_key") or config.aws_secret_access_key or ""
    ).strip()
    region = str(runtime_credentials.get("region") or config.aws_region or "us-east-1").strip() or "us-east-1"
    if not (access_key_id and secret_access_key):
        raise ValueError("AWS credentials are not configured")
    import boto3

    ec2 = boto3.client(
        "ec2",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=region,
    )

    regions_raw = ec2.describe_regions(AllRegions=False).get("Regions", [])
    regions = sorted(
        str(item.get("RegionName") or "").strip()
        for item in regions_raw
        if str(item.get("RegionName") or "").strip()
    )

    rows: List[Dict[str, Any]] = []
    paginator = ec2.get_paginator("describe_instance_types")
    page_iter = paginator.paginate(
        Filters=[{"Name": "current-generation", "Values": ["true"]}],
        PaginationConfig={"PageSize": 100},
    )
    for page in page_iter:
        for instance in page.get("InstanceTypes", []):
            name = str(instance.get("InstanceType") or "")
            if not name:
                continue
            if not name.startswith(("m", "c", "r", "t")):
                continue
            vcpu = float((instance.get("VCpuInfo") or {}).get("DefaultVCpus") or 0.0)
            memory_mib = float((instance.get("MemoryInfo") or {}).get("SizeInMiB") or 0.0)
            rows.append(
                {
                    "value": name,
                    "vcpu": vcpu,
                    "memory_gib": round(memory_mib / 1024.0, 2) if memory_mib else None,
                    "source": "live",
                }
            )
            if len(rows) >= 120:
                break
        if len(rows) >= 120:
            break

    return regions, rows, "Fetched from AWS EC2 APIs."


def _fetch_azure(
    config: Config,
    runtime_credentials: Optional[Dict[str, Any]] = None,
) -> Tuple[List[str], List[Dict[str, Any]], str]:
    runtime_credentials = runtime_credentials or {}
    subscription_id = str(
        runtime_credentials.get("subscription_id") or config.azure_subscription_id or ""
    ).strip()
    tenant_id = str(runtime_credentials.get("tenant_id") or config.azure_tenant_id or "").strip()
    client_id = str(runtime_credentials.get("client_id") or config.azure_client_id or "").strip()
    client_secret = str(
        runtime_credentials.get("client_secret") or config.azure_client_secret or ""
    ).strip()
    if not (subscription_id and tenant_id and client_id and client_secret):
        raise ValueError("Azure credentials are not configured")

    from azure.identity import ClientSecretCredential
    import httpx

    credential = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )
    token = credential.get_token("https://management.azure.com/.default").token
    headers = {"Authorization": f"Bearer {token}"}
    subscription = subscription_id

    with httpx.Client(timeout=30.0) as client:
        loc_resp = client.get(
            f"https://management.azure.com/subscriptions/{subscription}/locations",
            params={"api-version": "2022-12-01"},
            headers=headers,
        )
        loc_resp.raise_for_status()
        regions = sorted(
            str(item.get("name") or "").strip()
            for item in loc_resp.json().get("value", [])
            if str(item.get("name") or "").strip()
        )
        if not regions:
            raise ValueError("Azure API returned no regions")

        primary_region = regions[0]
        size_resp = client.get(
            (
                f"https://management.azure.com/subscriptions/{subscription}"
                f"/providers/Microsoft.Compute/locations/{primary_region}/vmSizes"
            ),
            params={"api-version": "2025-04-01"},
            headers=headers,
        )
        size_resp.raise_for_status()
        rows: List[Dict[str, Any]] = []
        for item in size_resp.json().get("value", []):
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            cores = float(item.get("numberOfCores") or 0.0)
            memory_mb = float(item.get("memoryInMB") or 0.0)
            rows.append(
                {
                    "value": name,
                    "vcpu": cores if cores > 0 else None,
                    "memory_gib": round(memory_mb / 1024.0, 2) if memory_mb else None,
                    "source": "live",
                }
            )
            if len(rows) >= 120:
                break

    return regions, rows, f"Fetched from Azure ARM APIs (sizes from {primary_region})."


def _fetch_gcp(
    config: Config,
    runtime_credentials: Optional[Dict[str, Any]] = None,
) -> Tuple[List[str], List[Dict[str, Any]], str]:
    runtime_credentials = runtime_credentials or {}
    creds_path = str(
        runtime_credentials.get("service_account_file")
        or config.google_application_credentials
        or ""
    ).strip()
    service_account_json = runtime_credentials.get("service_account_json")
    service_account_info: Optional[Dict[str, Any]] = None
    if isinstance(service_account_json, str):
        try:
            parsed = json.loads(service_account_json)
            if isinstance(parsed, dict):
                service_account_info = parsed
        except Exception:
            service_account_info = None
    elif isinstance(service_account_json, dict):
        service_account_info = service_account_json
    project_id = str(
        runtime_credentials.get("project_id") or config.gcp_project_id or ""
    ).strip()
    if not project_id and isinstance(service_account_info, dict):
        project_id = str(service_account_info.get("project_id") or "").strip()
    if not project_id:
        raise ValueError("GCP project_id is not configured")

    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession

    if creds_path:
        resolved_creds = os.path.abspath(os.path.expanduser(os.path.expandvars(creds_path)))
        if not os.path.isfile(resolved_creds):
            raise ValueError(f"GCP credentials file not found: {resolved_creds}")
        credentials = service_account.Credentials.from_service_account_file(
            resolved_creds,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
    elif service_account_info:
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
    else:
        raise ValueError("GCP credentials are not configured")
    session = AuthorizedSession(credentials)
    session.timeout = 30.0

    reg_resp = session.get(
        f"https://compute.googleapis.com/compute/v1/projects/{project_id}/regions",
        params={"maxResults": 200},
    )
    reg_resp.raise_for_status()
    regions = sorted(
        str(item.get("name") or "").strip()
        for item in reg_resp.json().get("items", [])
        if str(item.get("name") or "").strip()
    )

    machine_resp = session.get(
        f"https://compute.googleapis.com/compute/v1/projects/{project_id}/aggregated/machineTypes",
        params={"maxResults": 300, "returnPartialSuccess": "true"},
    )
    machine_resp.raise_for_status()

    rows: List[Dict[str, Any]] = []
    for zone_bucket in machine_resp.json().get("items", {}).values():
        for machine in zone_bucket.get("machineTypes", []) or []:
            name = str(machine.get("name") or "").strip()
            if not name:
                continue
            rows.append(
                {
                    "value": name,
                    "vcpu": float(machine.get("guestCpus") or 0.0) or None,
                    "memory_gib": round(float(machine.get("memoryMb") or 0.0) / 1024.0, 2)
                    if machine.get("memoryMb")
                    else None,
                    "source": "live",
                }
            )
            if len(rows) >= 150:
                break
        if len(rows) >= 150:
            break

    return regions, rows, "Fetched from Google Compute Engine APIs."


def _fetch_oci(
    config: Config,
    runtime_credentials: Optional[Dict[str, Any]] = None,
) -> Tuple[List[str], List[Dict[str, Any]], str]:
    runtime_credentials = runtime_credentials or {}
    config_file = str(runtime_credentials.get("config_file") or config.oci_config_file or "").strip()
    profile = str(runtime_credentials.get("profile") or config.oci_profile or "DEFAULT").strip() or "DEFAULT"
    if not config_file:
        raise ValueError("OCI config file is not configured")

    import oci

    resolved_config, resolved_profile = CredentialValidator._normalize_oci_inputs(
        config_file=config_file,
        profile=profile,
    )
    oci_config = oci.config.from_file(resolved_config, resolved_profile)
    tenancy_id = str(oci_config.get("tenancy") or "").strip()
    if not tenancy_id:
        raise ValueError("OCI tenancy is missing in config profile")

    identity = oci.identity.IdentityClient(oci_config)
    regions_raw = identity.list_region_subscriptions(tenancy_id=tenancy_id).data
    regions = sorted(
        str(item.region_name)
        for item in regions_raw
        if str(getattr(item, "status", "")).upper() in {"READY", "SUBSCRIBED", "ACTIVE"}
    )
    if not regions:
        regions = [str(oci_config.get("region") or config.oci_region or "uk-london-1")]

    compartment_id = os.getenv("OCI_COMPARTMENT_OCID", "").strip() or tenancy_id
    availability_domains = identity.list_availability_domains(compartment_id=tenancy_id).data
    if not availability_domains:
        raise ValueError("OCI returned no availability domains for shape lookup")
    availability_domain = str(availability_domains[0].name)

    compute = oci.core.ComputeClient(oci_config)
    shapes_resp = oci.pagination.list_call_get_all_results(
        compute.list_shapes,
        compartment_id=compartment_id,
        availability_domain=availability_domain,
    )
    rows: List[Dict[str, Any]] = []
    for shape in shapes_resp.data or []:
        name = str(getattr(shape, "shape", "") or "").strip()
        if not name.startswith("VM."):
            continue
        if ".GPU." in name:
            continue
        rows.append(
            {
                "value": name,
                "vcpu": float(getattr(shape, "ocpus", 0.0) or 0.0) or None,
                "memory_gib": float(getattr(shape, "memory_in_gbs", 0.0) or 0.0) or None,
                "source": "live",
            }
        )
        if len(rows) >= 120:
            break

    return regions, rows, "Fetched from OCI Identity/Compute APIs."


def build_kubernetes_provider_catalog(
    config: Config,
    runtime_credentials_by_provider: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Dict[str, Any]]:
    """Return provider catalog entries with live API data or fallback metadata."""
    fetchers = {
        "aws": _fetch_aws,
        "azure": _fetch_azure,
        "gcp": _fetch_gcp,
        "oci": _fetch_oci,
    }
    catalog: Dict[str, Dict[str, Any]] = {}

    for provider in ("aws", "azure", "gcp", "oci"):
        fetcher = fetchers[provider]
        runtime_credentials = (
            (runtime_credentials_by_provider or {}).get(provider) or {}
        )
        try:
            regions, node_types_raw, message = fetcher(config, runtime_credentials)
            if not regions:
                raise ValueError("Provider API returned no regions")
            node_types = _normalize_node_types(provider, node_types_raw)
            if not node_types:
                raise ValueError("Provider API returned no node types")
            catalog[provider] = {
                "provider": provider,
                "source": "live",
                "configured": True,
                "regions": regions,
                "node_types": node_types,
                "message": message,
            }
        except Exception as exc:
            logger.info("Falling back to static Kubernetes catalog for %s: %s", provider, exc)
            catalog[provider] = _catalog_from_fallback(provider, str(exc))

    return catalog
