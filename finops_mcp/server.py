"""
OptiOra MCP Server - Multi-Cloud Cost Automation
Cost analysis for AWS, Azure, GCP, and OCI
Hosted on OCI infrastructure
Main server entry point with MCP tool definitions
"""

import logging
import os
from typing import Any, Optional

from mcp.server import Server
from mcp.types import Tool, TextContent

from finops_mcp.config import Config
from finops_mcp.tools import (
    aws_costs,
    azure_costs,
    gcp_costs,
    oci_costs,
    anomalies,
    recommendations,
    actions,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

config = Config()
server = Server("optiora-mcp")


# Tool Definitions
TOOLS: list[Tool] = [
    Tool(
        name="get_cost_summary",
        description="Returns total spend, top cost drivers, and trends across cloud providers.",
        inputSchema={
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["day", "week", "month", "year"],
                    "description": "Time period for cost analysis",
                },
                "cloud_provider": {
                    "type": "string",
                    "enum": ["aws", "azure", "gcp", "oci", "all"],
                    "description": "Cloud provider(s) to analyze",
                },
                "filters": {
                    "type": "object",
                    "description": "Optional filters (e.g., department, environment, cost center)",
                },
            },
            "required": ["period", "cloud_provider"],
        },
    ),
    Tool(
        name="detect_cost_anomalies",
        description="Identifies unusual cost patterns (spikes, sudden increases, unusual resource usage).",
        inputSchema={
            "type": "object",
            "properties": {
                "window_days": {
                    "type": "integer",
                    "description": "Historical window for baseline (default: 30)",
                },
                "sensitivity": {
                    "type": "integer",
                    "description": "Anomaly sensitivity 1-10 (1=very strict, 10=lenient)",
                },
                "cloud_provider": {
                    "type": "string",
                    "enum": ["aws", "azure", "gcp", "oci", "all"],
                },
            },
            "required": ["cloud_provider"],
        },
    ),
    Tool(
        name="get_optimization_recommendations",
        description="Suggests cost-saving actions with estimated ROI and payback period.",
        inputSchema={
            "type": "object",
            "properties": {
                "cloud_provider": {
                    "type": "string",
                    "enum": ["aws", "azure", "gcp", "oci", "all"],
                },
                "min_savings_usd": {
                    "type": "number",
                    "description": "Minimum annual savings threshold (default: $100)",
                },
                "recommendation_type": {
                    "type": "string",
                    "enum": [
                        "reserved-instances",
                        "spot-instances",
                        "idle-resources",
                        "storage-optimization",
                        "network-optimization",
                        "all",
                    ],
                    "description": "Type of recommendations to return",
                },
            },
            "required": ["cloud_provider"],
        },
    ),
    Tool(
        name="execute_cost_action",
        description="Applies cost optimizations (auto-tagging, scheduling, reserved instances purchase).",
        inputSchema={
            "type": "object",
            "properties": {
                "action_type": {
                    "type": "string",
                    "enum": [
                        "schedule-resource",
                        "purchase-reserved-instance",
                        "delete-unattached-volume",
                        "auto-tag-resources",
                    ],
                },
                "resource_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "IDs of resources to apply action to",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "Preview action without executing (default: true)",
                },
                "parameters": {
                    "type": "object",
                    "description": "Action-specific parameters",
                },
            },
            "required": ["action_type", "resource_ids"],
        },
    ),
    Tool(
        name="get_cost_forecast",
        description="Predicts future cloud spend based on historical trends and growth factors.",
        inputSchema={
            "type": "object",
            "properties": {
                "months": {
                    "type": "integer",
                    "description": "Number of months to forecast (1, 3, 6, or 12)",
                },
                "adjust_for_growth": {
                    "type": "number",
                    "description": "Growth adjustment percentage (e.g., 10 for 10% growth)",
                },
                "cloud_provider": {
                    "type": "string",
                    "enum": ["aws", "azure", "gcp", "oci", "all"],
                },
            },
            "required": ["months", "cloud_provider"],
        },
    ),
    Tool(
        name="create_cost_ticket",
        description="Creates a ticket in Jira/Azure DevOps with optimization recommendations.",
        inputSchema={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Ticket title"},
                "description": {"type": "string", "description": "Detailed description"},
                "estimated_savings": {
                    "type": "number",
                    "description": "Annual savings estimate (USD)",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                },
                "ticket_system": {
                    "type": "string",
                    "enum": ["jira", "azure-devops", "github"],
                    "description": "Ticketing system to use",
                },
            },
            "required": ["title", "description", "priority"],
        },
    ),
]


@server.call_tool()
async def handle_tool_call(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Route tool calls to appropriate handlers."""
    logger.info(f"Tool called: {name} with args: {arguments}")

    try:
        if name == "get_cost_summary":
            result = await aws_costs.get_cost_summary(arguments)
        elif name == "detect_cost_anomalies":
            result = await anomalies.detect_anomalies(arguments)
        elif name == "get_optimization_recommendations":
            result = await recommendations.get_recommendations(arguments)
        elif name == "execute_cost_action":
            result = await actions.execute_action(arguments)
        elif name == "get_cost_forecast":
            result = await recommendations.forecast_costs(arguments)
        elif name == "create_cost_ticket":
            result = await actions.create_ticket(arguments)
        else:
            result = f"Unknown tool: {name}"

        return [TextContent(type="text", text=result)]

    except Exception as e:
        logger.error(f"Error in tool {name}: {str(e)}")
        return [TextContent(type="text", text=f"Error: {str(e)}")]


async def main():
    """Start the OptiOra MCP server."""
    logger.info("Starting OptiOra MCP server (deployed on OCI)...")

    # Register tools
    for tool in TOOLS:
        server.tools.append(tool)

    async with server:
        logger.info(f"OptiOra MCP server running on port {config.mcp_port}")
        logger.info("Deployment type: " + config.deployment_type)
        logger.info("Supported cloud providers: AWS, Azure, GCP, OCI")
        await server.wait_for_shutdown()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
