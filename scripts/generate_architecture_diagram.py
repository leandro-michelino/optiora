#!/usr/bin/env python3
"""Build editable OCI diagrams and PNGs from the checked-in OptiOra topology.

Requires the oci-architecture-diagrams skill and Oracle's official toolkit.
Set OCI_DIAGRAM_SKILL to its directory, or pass --skill-dir.
The exported draw.io and PNG files are standalone and need no skill to view.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "architecture"

RESOURCE_LABELS = {
    "oci_objectstorage_bucket.cost_archive": "Private archive bucket",
    "oci_objectstorage_object_lifecycle_policy.cost_archive": "Bucket lifecycle policy",
    "oci_core_vcn.main": "OptiOra VCN",
    "oci_core_internet_gateway.main": "Internet Gateway",
    "oci_core_route_table.public": "Public route table",
    "oci_core_security_list.public": "Ingress allowlist",
    "oci_core_subnet.public": "Public subnet",
    "oci_core_instance.optiora": "Optional application VM",
    "oci_core_volume.optiora_data": "Optional data volume",
    "oci_core_volume_attachment.optiora_data": "Paravirtualized attachment (optional)",
    "oci_resource_scheduler_schedule.weekday_start": "Optional START / STOP schedules",
    "oci_resource_scheduler_schedule.weekday_stop": "Optional START / STOP schedules",
    "oci_identity_policy.resource_scheduler_instance_control": "Optional scheduler IAM policy",
}


def runtime(Diagram):
    d = Diagram(title="01 - Application and data flows")
    d.text("OptiOra | Multi-cloud FinOps architecture", 30, 12, 1500, 40, size=24, bold=True)
    d.text(
        "Deterministic cost analytics with OCI Generative AI advisory", 30, 56, 1400, 24, size=14
    )
    user = d.icon("User", 110, 255, label="Operators / Finance\nBrowser", size=52)
    region = d.group(
        "region",
        "Oracle Cloud Infrastructure | UK South (London) - uk-london-1",
        300,
        115,
        1160,
        760,
    )
    host = d.group(
        "tier", "Application VM | Oracle Linux | systemd services", 30, 50, 730, 630, parent=region
    )
    nginx = d.box("nginx front door\nHTTP :80 / optional TLS :443", 40, 75, 200, 100, parent=host)
    dashboard = d.box(
        "Next.js dashboard :3000\nUser interface + /api/ai/chat", 330, 75, 340, 100, parent=host
    )
    api = d.box(
        "FastAPI :8000\nAuth / org scope / scanning / analytics\nCosts / rightsizing / exports",
        330,
        280,
        340,
        110,
        parent=host,
    )
    database = d.box(
        "SQLAlchemy persistence\nSQLite on VM by default\nPostgreSQL configurable externally",
        40,
        490,
        250,
        95,
        parent=host,
    )
    rag = d.box(
        "Local FinOps RAG catalog\nCSV-backed guidance retrieval", 380, 490, 290, 95, parent=host
    )
    genai = d.icon(
        "OCI Generative AI",
        940,
        140,
        parent=region,
        size=56,
        label="OCI Generative AI\nSigned inference requests",
    )
    oci_api = d.box(
        "OCI provider APIs\nUsage / inventory / recommendations\nOracle-managed Cost Reports",
        820,
        330,
        300,
        110,
        parent=region,
    )
    archive = d.icon(
        "OCI Object Storage",
        940,
        575,
        parent=region,
        size=56,
        label="Cost archive bucket\nRead / write when retention enabled",
    )
    clouds = d.group("thirdparty", "Customer cloud accounts", 1540, 400, 280, 210)
    aws = d.box(
        "AWS | Cost Explorer / inventory",
        20,
        42,
        240,
        42,
        parent=clouds,
        kind="thirdparty_component",
    )
    azure = d.box(
        "Azure | Cost Management / Advisor",
        20,
        96,
        240,
        42,
        parent=clouds,
        kind="thirdparty_component",
    )
    gcp = d.box(
        "GCP | BigQuery billing / inventory",
        20,
        150,
        240,
        42,
        parent=clouds,
        kind="thirdparty_component",
    )

    d.connect(user, nginx, "HTTP / HTTPS", kind="dashed", exit=(1, 0.5), entry=(0, 0.5))
    d.connect(nginx, dashboard, "Dashboard + chat", exit=(1, 0.5), entry=(0, 0.5))
    d.connect(
        nginx,
        api,
        "/auth/* and /api/v1/*",
        exit=(0.5, 1),
        entry=(0, 0.5),
        waypoints=[(470, 500), (660, 500)],
    )
    d.connect(dashboard, api, "Server-side telemetry", exit=(0.5, 1), entry=(0.5, 0))
    d.connect(dashboard, genai, "Signed chat inference", exit=(1, 0.5), entry=(0, 0.5))
    d.connect(
        api,
        genai,
        "Signed narrative inference",
        exit=(1, 0.18),
        entry=(1, 0.5),
        waypoints=[(1080, 465), (1080, 355), (1330, 355), (1330, 255)],
        label_offset=(0, -10),
    )
    d.connect(
        api,
        oci_api,
        "OCI SDK / HTTPS",
        exit=(1, 0.45),
        entry=(0, 0.5),
        waypoints=[(1040, 494.5), (1040, 500)],
    )
    d.connect(
        api,
        database,
        "Read / write",
        exit=(0.15, 1),
        entry=(0.5, 0),
        waypoints=[(711, 610), (495, 610)],
    )
    d.connect(api, rag, "Retrieve guidance", exit=(0.75, 1), entry=(0.5, 0))
    d.connect(
        api,
        archive,
        "Archive / restore NDJSON",
        exit=(1, 0.75),
        entry=(0, 0.5),
        waypoints=[(1090, 527.5), (1090, 690)],
    )
    d.connect(
        api,
        aws,
        "AWS SDK / HTTPS",
        exit=(1, 0.86),
        entry=(0, 0.5),
        waypoints=[(1050, 539.6), (1050, 805), (1490, 805), (1490, 463)],
        label_offset=(0, 12),
    )
    d.connect(
        api,
        azure,
        "Azure SDK / HTTPS",
        exit=(1, 0.93),
        entry=(0, 0.5),
        waypoints=[(1030, 547.3), (1030, 830), (1505, 830), (1505, 517)],
        label_offset=(0, 12),
    )
    d.connect(
        api,
        gcp,
        "GCP SDK / HTTPS",
        exit=(1, 1),
        entry=(0, 0.5),
        waypoints=[(1010, 555), (1010, 855), (1520, 855), (1520, 571)],
        label_offset=(0, 12),
    )
    d.text(
        "Arrows show request initiation; responses return on the same connection. No private multicloud circuits are configured.",
        30,
        905,
        1740,
        24,
        size=12,
    )
    d.text(
        "Application deployment: one OCI VM; nginx enabled; TLS requires a domain and certificate. CSV billing imports enter through the organization-scoped API.",
        30,
        939,
        1740,
        24,
        size=12,
    )
    return d


def infrastructure(Diagram):
    d = Diagram(title="02 - Terraform network and optional resources")
    d.text(
        "OptiOra | Infrastructure and declared connections", 30, 12, 1500, 40, size=24, bold=True
    )
    d.text(
        "Terraform defaults | Optional resources are explicitly marked", 30, 56, 1400, 24, size=14
    )
    user = d.icon("User", 100, 530, label="Allowed source CIDRs\nSSH :22; web :80/:443", size=50)
    region = d.group("region", "OCI | UK South (London) - uk-london-1", 240, 110, 1280, 850)
    vcn = d.group("vcn", "OptiOra VCN\n10.50.0.0/16 (default)", 30, 60, 810, 570, parent=region)
    igw = d.icon(
        "Internet Gateway",
        0,
        360,
        parent=vcn,
        size=48,
        border=True,
        label="Internet Gateway",
        label_pos="top",
    )
    rt = d.icon(
        "Route Table", 180, 135, parent=vcn, size=48, label="Public route table", label_pos="top"
    )
    sl = d.icon(
        "Security Lists",
        570,
        135,
        parent=vcn,
        size=48,
        label="Ingress allowlist\nEgress destination: 0.0.0.0/0",
        label_pos="top",
    )
    subnet = d.group(
        "subnet", "Public subnet\n10.50.1.0/24 (default)", 80, 260, 650, 260, parent=vcn
    )
    nic = d.icon("VNIC", 100, 100, parent=subnet, size=48, label="VNIC\nPublic IP configurable")
    vm = d.icon(
        "OCI Compute",
        345,
        100,
        parent=subnet,
        size=54,
        label="Optional application VM\ncompute_enabled = true",
    )
    d.text(
        "Direct ports :3000/:8000 require allow_direct_app_ingress = true",
        30,
        195,
        590,
        24,
        parent=subnet,
        size=11,
    )
    bucket = d.icon(
        "OCI Object Storage", 1050, 110, parent=region, size=54, label="Private archive bucket"
    )
    lifecycle = d.box(
        "Bucket lifecycle policy\nDelete archive/ objects after 365 days",
        920,
        200,
        310,
        70,
        parent=region,
    )
    volume = d.icon(
        "Block Storage",
        1050,
        420,
        parent=region,
        size=54,
        label="Optional data volume\ncompute_enabled && extra_block_volume_enabled",
    )
    scheduler = d.box(
        "Optional START / STOP schedules\nresource_scheduler_enabled = true\nConfigured UTC cron expressions",
        900,
        610,
        330,
        95,
        parent=region,
        kind="optional",
    )
    policy = d.icon(
        "Policies",
        1050,
        775,
        parent=region,
        size=46,
        label="Optional scheduler IAM policy\nresource_scheduler_manage_instance_policy",
    )

    d.connect(user, igw, "Permitted ingress", kind="dashed", exit=(1, 0.5), entry=(0, 0.5))
    d.connect(igw, nic, "Public subnet traffic", exit=(1, 0.5), entry=(0, 0.5))
    d.connect(nic, vm, "Instance VNIC", kind="plain", exit=(1, 0.5), entry=(0, 0.5))
    d.connect(
        rt,
        igw,
        "0.0.0.0/0 -> IGW",
        exit=(0, 0.5),
        entry=(0.5, 0),
        waypoints=[(310, 305), (310, 470), (270, 470)],
        label_offset=(0, -12),
    )
    d.connect(rt, subnet, "route_table_id", kind="plain", exit=(0.5, 1), entry=(0.15, 0))
    d.connect(sl, subnet, "security_list_ids", kind="plain", exit=(0.5, 1), entry=(0.8, 0))
    d.connect(
        bucket,
        lifecycle,
        "Lifecycle",
        kind="plain",
        exit=(1, 0.5),
        entry=(1, 0.5),
        waypoints=[(1490, 220), (1490, 345)],
        label_offset=(-40, 0),
    )
    d.connect(
        vm,
        volume,
        "Paravirtualized attachment (optional)",
        kind="dashed",
        exit=(1, 0.5),
        entry=(0, 0.5),
        waypoints=[(1080, 530), (1080, 530)],
        label_offset=(0, -12),
    )
    d.connect(
        scheduler,
        vm,
        "Target: VM + explicit resource IDs (optional)",
        kind="dashed",
        exit=(0, 0.5),
        entry=(0.5, 1),
        waypoints=[(1100, 767), (1100, 780), (990, 780), (990, 610), (695, 610)],
        label_offset=(0, 12),
    )
    d.connect(
        policy,
        scheduler,
        "Authorize schedule principals (optional)",
        kind="plain",
        exit=(0.5, 0),
        entry=(0.5, 1),
    )
    d.text(
        "Solid arrows: configured traffic / route intent. Plain lines: resource associations. Dashed arrows: user or conditional workflows.",
        30,
        990,
        1500,
        24,
        size=12,
    )
    d.text(
        "Network and archive bucket are created by default. Compute and schedules default to disabled; enabling compute also creates the data volume unless it is disabled.",
        30,
        1024,
        1500,
        24,
        size=12,
    )
    return d


def check_xml(root):
    for page in root.findall("diagram"):
        cells = page.findall("./mxGraphModel/root/mxCell")
        ids = [cell.attrib["id"] for cell in cells]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Duplicate cell IDs in {page.attrib['name']}")
        for cell in cells:
            if cell.get("edge") == "1":
                for endpoint in ("source", "target"):
                    if cell.get(endpoint) not in ids:
                        raise ValueError(f"Broken {endpoint} in {cell.attrib['id']}")


def source_coverage(diagram):
    declared = {}
    for path in (ROOT / "terraform").glob("*.tf"):
        for resource_type, name in re.findall(
            r'resource\s+"([^"]+)"\s+"([^"]+)"', path.read_text()
        ):
            declared[f"{resource_type}.{name}"] = str(path.relative_to(ROOT))
    if set(declared) != set(RESOURCE_LABELS):
        raise ValueError("Terraform declarations changed; update the diagram resource coverage.")
    labels = [node.label for node in diagram.nodes] + [edge["label"] for edge in diagram.edge_meta]
    for resource, label in RESOURCE_LABELS.items():
        if not any(item.startswith(label) for item in labels):
            raise ValueError(f"Resource has no diagram representation: {resource}")
    return [
        {"resource": key, "source": declared[key], "diagram_label": label}
        for key, label in RESOURCE_LABELS.items()
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skill-dir",
        type=Path,
        default=Path(
            os.getenv("OCI_DIAGRAM_SKILL", Path.home() / ".codex/skills/oci-architecture-diagrams")
        ),
    )
    parser.add_argument("--no-render", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(args.skill_dir / "scripts"))
    from ocidraw import Diagram, render

    OUTPUT.mkdir(parents=True, exist_ok=True)
    pages = [
        ("optiora-architecture", runtime(Diagram)),
        ("optiora-infrastructure", infrastructure(Diagram)),
    ]
    combined = ET.Element("mxfile", host="ocidraw", type="device")
    coverage = source_coverage(pages[1][1])
    summary = []
    for filename, diagram in pages:
        warnings = diagram.check()
        if warnings:
            raise ValueError("\n".join(warnings))
        page_root = ET.fromstring(diagram.xml())
        page = page_root.find("diagram")
        page.set("id", filename)
        combined.append(page)
        single = OUTPUT / f"{filename}.drawio"
        ET.indent(page_root)
        single.write_text(ET.tostring(page_root, encoding="unicode") + "\n")
        if not args.no_render and not render(
            str(single), str(OUTPUT / f"{filename}.png"), scale=1.5
        ):
            raise RuntimeError(f"PNG render failed: {single}")
        summary.append(
            {
                "page": page.get("name"),
                "nodes": len(diagram.nodes),
                "connectors": len(diagram.edge_meta),
                "layout_warnings": warnings,
            }
        )
    (OUTPUT / "source-coverage.json").write_text(
        json.dumps(
            {
                "terraform_resources": coverage,
                "pages": [
                    {
                        "name": diagram.title_text,
                        "connections": [
                            {
                                "source": edge["a"].label,
                                "target": edge["b"].label,
                                "label": edge["label"],
                            }
                            for edge in diagram.edge_meta
                        ],
                    }
                    for _, diagram in pages
                ],
            },
            indent=2,
        )
        + "\n"
    )
    check_xml(combined)
    ET.indent(combined)
    (OUTPUT / "optiora.drawio").write_text(ET.tostring(combined, encoding="unicode") + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
