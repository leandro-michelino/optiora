"""OCI Generative AI backend advisor.

Calls OCI GenAI inference from the backend to generate narratives for:
  - spend analysis summaries
  - anomaly explanations
  - optimization briefs
  - maturity assessment narration
  - budget risk alerts

Falls back gracefully to prompt-only mode when OCI GenAI is not configured,
returning the pre-built prompt so the frontend Cost Advisor can still use it.

Auth resolution order:
  1. OCI_CONFIG_FILE + OCI_PROFILE env vars (production, uses OCI SDK signer)
  2. OCI_PRIVATE_KEY_PATH or OCI_PRIVATE_KEY inline env vars (deploy-time injection)
  3. Not configured → returns None; caller uses fallback prompt
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import time
from base64 import b64encode
from datetime import datetime, timezone
from email.utils import formatdate
from typing import Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_OCI_GENAI_ENDPOINT = os.getenv("OCI_GENAI_ENDPOINT", "")
_OCI_GENAI_MODEL = os.getenv("OCI_GENAI_MODEL", "meta.llama-3.3-70b-instruct")
_OCI_COMPARTMENT_ID = os.getenv("OCI_GENAI_COMPARTMENT_ID", "").strip() or os.getenv(
    "OCI_COMPARTMENT_OCID", ""
)
_OCI_CONFIG_FILE = os.getenv("OCI_CONFIG_FILE", "")
_OCI_PROFILE = os.getenv("OCI_PROFILE", "DEFAULT")
_OCI_PRIVATE_KEY_PATH = os.getenv("OCI_PRIVATE_KEY_PATH", "")
_OCI_PRIVATE_KEY_INLINE = os.getenv("OCI_PRIVATE_KEY", "")
_OCI_TENANCY_OCID = os.getenv("OCI_TENANCY_OCID", "")
_OCI_USER_OCID = os.getenv("OCI_USER_OCID", "")
_OCI_FINGERPRINT = os.getenv("OCI_FINGERPRINT", "")
_MAX_TOKENS = int(os.getenv("OCI_GENAI_MAX_TOKENS", "800"))

# Default inference endpoint if not overridden
_DEFAULT_ENDPOINT = "https://inference.generativeai.uk-london-1.oci.oraclecloud.com"


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Best-effort numeric coercion for prompt context composition."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _with_rag(prompt: str, context: Optional[dict[str, Any]] = None) -> str:
    """Append retrieved guidance snippets to a prompt when available."""
    context = context or {}
    rag_brief = str(context.get("rag_brief") or "").strip()
    if not rag_brief:
        return prompt
    return (
        f"{prompt}\n\n"
        "Retrieved FinOps guidance context (RAG):\n"
        f"{rag_brief}\n"
        "Use this guidance to sharpen recommendations while preserving provided numeric values."
    )


def _is_configured() -> bool:
    """Return True if enough config is present to attempt an OCI GenAI call."""
    endpoint = _OCI_GENAI_ENDPOINT or _DEFAULT_ENDPOINT
    if not endpoint:
        return False
    if not _OCI_COMPARTMENT_ID:
        return False
    # Need either OCI SDK config file or direct key material
    has_sdk_config = bool(_OCI_CONFIG_FILE and os.path.isfile(_OCI_CONFIG_FILE))
    has_key = bool(_OCI_PRIVATE_KEY_PATH or _OCI_PRIVATE_KEY_INLINE)
    has_identity = bool(_OCI_TENANCY_OCID and _OCI_USER_OCID and _OCI_FINGERPRINT)
    return has_sdk_config or (has_key and has_identity)


def _load_private_key_pem() -> Optional[str]:
    """Load PEM key from file path or inline env var."""
    if _OCI_PRIVATE_KEY_PATH and os.path.isfile(_OCI_PRIVATE_KEY_PATH):
        with open(_OCI_PRIVATE_KEY_PATH) as f:
            return f.read()
    if _OCI_PRIVATE_KEY_INLINE:
        return _OCI_PRIVATE_KEY_INLINE.replace("\\n", "\n")
    return None


def _sign_and_call(prompt_text: str) -> Optional[str]:
    """Call OCI GenAI inference with request signing. Returns generated text or None."""
    try:
        import httpx
    except ImportError:
        logger.warning("httpx not available for OCI GenAI backend call")
        return None

    endpoint_base = (_OCI_GENAI_ENDPOINT or _DEFAULT_ENDPOINT).rstrip("/")
    path = "/20231130/actions/chat"
    url = f"{endpoint_base}{path}"

    payload = {
        "compartmentId": _OCI_COMPARTMENT_ID,
        "servingMode": {"modelId": _OCI_GENAI_MODEL, "servingType": "ON_DEMAND"},
        "chatRequest": {
            "apiFormat": "GENERIC",
            "messages": [{"role": "USER", "content": [{"type": "TEXT", "text": prompt_text}]}],
            "maxTokens": _MAX_TOKENS,
            "temperature": 0.4,
            "frequencyPenalty": 0.0,
            "presencePenalty": 0.0,
            "topP": 0.75,
        },
    }

    import json
    body_bytes = json.dumps(payload, separators=(",", ":")).encode()

    # Attempt OCI SDK signing first (most reliable)
    try:
        import oci
        if _OCI_CONFIG_FILE and os.path.isfile(_OCI_CONFIG_FILE):
            cfg = oci.config.from_file(_OCI_CONFIG_FILE, _OCI_PROFILE)
        else:
            pem = _load_private_key_pem()
            if not pem:
                return None
            cfg = {
                "tenancy": _OCI_TENANCY_OCID,
                "user": _OCI_USER_OCID,
                "fingerprint": _OCI_FINGERPRINT,
                "key_content": pem,
                "region": os.getenv("OCI_REGION", "uk-london-1"),
            }
        signer = oci.auth.signers.Signer(
            tenancy=cfg["tenancy"],
            user=cfg["user"],
            fingerprint=cfg["fingerprint"],
            private_key_file_location=cfg.get("key_file"),
            private_key_content=cfg.get("key_content"),
        )
        import urllib.request
        req = urllib.request.Request(url, data=body_bytes, method="POST")
        req.add_header("Content-Type", "application/json")
        signer(req)  # mutates request with Authorization header
        # Fall through to httpx below using the signed headers
        signed_headers = dict(req.headers)
        response = httpx.post(
            url, content=body_bytes, headers=signed_headers, timeout=30
        )
    except Exception as sdk_exc:
        logger.debug("OCI SDK signing failed, falling back to manual signing: %s", sdk_exc)
        # Manual RSA-SHA256 signing (mirrors dashboard/lib/ai-service.ts)
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
            from cryptography.hazmat.backends import default_backend
        except ImportError:
            logger.warning("cryptography package not available for manual OCI signing")
            return None

        pem = _load_private_key_pem()
        if not pem:
            return None
        try:
            private_key = serialization.load_pem_private_key(
                pem.encode(), password=None, backend=default_backend()
            )
        except Exception as key_exc:
            logger.warning("Failed to load OCI private key: %s", key_exc)
            return None

        date_str = formatdate(usegmt=True)
        content_sha256 = b64encode(
            hashlib.sha256(body_bytes).digest()
        ).decode()

        parsed = urlparse(url)
        host = parsed.netloc
        request_target = f"post {path}"
        content_length = str(len(body_bytes))

        signing_string = (
            f"(request-target): {request_target}\n"
            f"date: {date_str}\n"
            f"host: {host}\n"
            f"content-length: {content_length}\n"
            f"content-type: application/json\n"
            f"x-content-sha256: {content_sha256}"
        )
        signature_bytes = private_key.sign(
            signing_string.encode(), asym_padding.PKCS1v15(), hashes.SHA256()
        )
        signature_b64 = b64encode(signature_bytes).decode()
        key_id = f"{_OCI_TENANCY_OCID}/{_OCI_USER_OCID}/{_OCI_FINGERPRINT}"
        auth_header = (
            f'Signature version="1",headers="(request-target) date host content-length '
            f'content-type x-content-sha256",keyId="{key_id}",'
            f'algorithm="rsa-sha256",signature="{signature_b64}"'
        )

        try:
            response = httpx.post(
                url,
                content=body_bytes,
                headers={
                    "Content-Type": "application/json",
                    "Date": date_str,
                    "Host": host,
                    "Content-Length": content_length,
                    "x-content-sha256": content_sha256,
                    "Authorization": auth_header,
                },
                timeout=30,
            )
        except Exception as http_exc:
            logger.warning("OCI GenAI HTTP call failed: %s", http_exc)
            return None

    if response.status_code != 200:
        logger.warning(
            "OCI GenAI returned %s: %s", response.status_code, response.text[:200]
        )
        return None

    try:
        data = response.json()
        text = (
            data.get("chatResponse", {})
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content", [{}])[0]
            .get("text", "")
        )
        return text.strip() or None
    except Exception as parse_exc:
        logger.warning("Failed to parse OCI GenAI response: %s", parse_exc)
        return None


# ---------------------------------------------------------------------------
# Public functions — each returns (narrative: str | None, prompt: str)
# ---------------------------------------------------------------------------

def generate_spend_narrative(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a spend narrative for the analytics summary.

    Returns (generated_text_or_None, prompt_used).
    When generated_text is None, the caller should surface the prompt to the frontend.
    """
    monthly = context.get("current_monthly_spend_usd", 0)
    mom = context.get("mom_change_percent")
    risk_score = context.get("risk_score", 0)
    waste_usd = context.get("estimated_monthly_waste_usd", 0)
    savings_usd = context.get("identified_monthly_savings_usd", 0)
    commitment_pct = context.get("commitment_coverage_percent", 0)
    budget_usd = context.get("budget_monthly_usd", 0)

    mom_str = f"{mom:+.1f}% MoM" if mom is not None else "no prior period data"
    budget_str = (
        f"Budget is ${budget_usd:,.0f}/month (utilization: "
        f"{(monthly/budget_usd*100):.0f}%)."
        if budget_usd > 0
        else "No budget configured."
    )

    prompt = (
        f"You are a FinOps advisor. Summarize the following cloud cost metrics in 3-4 sentences "
        f"for an engineering or finance audience. Be specific and factual. Do not alter numbers.\n\n"
        f"Monthly spend: ${monthly:,.2f} ({mom_str}). "
        f"Estimated waste: ${waste_usd:,.2f}. "
        f"Identified savings: ${savings_usd:,.2f}/month. "
        f"Commitment coverage: {commitment_pct:.1f}%. "
        f"Risk score: {risk_score}/100. "
        f"{budget_str}\n\n"
        f"Highlight the most important finding and the single best next action."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_waste_insights(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate actionable waste reduction insights from a cloud waste analysis.

    ``context`` should include output from ``build_cloud_waste_analysis()`` or equivalent keys.
    Returns (generated_text_or_None, prompt_used).
    """
    monthly = context.get("current_monthly_spend_usd", 0)
    total_waste = context.get("total_estimated_waste_usd", 0)
    waste_rate = context.get("total_waste_rate_percent", 0)
    grade = context.get("waste_grade", "C")
    categories = context.get("categories", [])
    quick_wins = context.get("quick_wins", [])

    top_cats = "\n".join(
        f"- {c['category'].replace('_', ' ').title()}: ${c['estimated_waste_usd']:,.0f}/month "
        f"({c['estimated_waste_rate_percent']:.1f}% of spend, {c['effort']} effort to fix)"
        for c in categories[:4]
    )
    wins_str = ", ".join(c["category"].replace("_", " ") for c in quick_wins) or "rightsize instances"

    prompt = (
        f"You are a FinOps advisor. Summarize the cloud waste analysis for a finance and engineering "
        f"audience in 3-4 sentences. Be specific and give prioritised actions.\n\n"
        f"Total monthly spend: ${monthly:,.0f}. "
        f"Estimated waste: ${total_waste:,.0f}/month ({waste_rate:.1f}% of spend). "
        f"Waste grade: {grade}.\n\n"
        f"Top waste categories:\n{top_cats}\n\n"
        f"Quick wins (low effort): {wins_str}.\n\n"
        f"Explain the most critical waste drivers and what to fix first for maximum ROI. "
        f"End with one specific, time-bound action the team should take this week."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_optimization_roadmap(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a 30/60/90-day cost optimisation roadmap using available analytics context.

    ``context`` may contain keys from analytics, waste analysis, efficiency score, and commitment gap.
    Returns (generated_text_or_None, prompt_used).
    """
    monthly = context.get("current_monthly_spend_usd", 0)
    maturity = context.get("maturity_level", "walk")
    efficiency_score = context.get("overall_score", 0)
    efficiency_grade = context.get("grade", "C")
    total_waste = context.get("total_estimated_waste_usd", 0)
    annual_commitment_gap = context.get("total_annual_opportunity_usd", 0)
    improvement_focus = context.get("improvement_focus", [])
    top_providers = context.get("priority_provider", "")

    focus_str = ", ".join(improvement_focus[:3]) if improvement_focus else "commitment coverage, waste reduction"

    prompt = (
        f"You are a FinOps advisor creating a 30/60/90-day cloud cost optimisation roadmap. "
        f"Structure your response as three phases (30-day, 60-day, 90-day) each with 2-3 specific "
        f"actions and estimated savings impact. Be concrete, avoid generic advice.\n\n"
        f"Current state:\n"
        f"- Monthly cloud spend: ${monthly:,.0f}\n"
        f"- FinOps maturity: {maturity.upper()}\n"
        f"- Efficiency score: {efficiency_score}/100 (grade {efficiency_grade})\n"
        f"- Estimated monthly waste: ${total_waste:,.0f}\n"
        f"- Annual commitment gap opportunity: ${annual_commitment_gap:,.0f}\n"
        f"- Priority dimensions to improve: {focus_str}\n"
        f"- Top provider to focus on: {top_providers or 'AWS'}\n\n"
        f"Build the roadmap so that quick wins land in the first 30 days and structural changes "
        f"like commitment purchases land in 60-90 days."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_executive_narrative(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a board/CFO-level executive summary of cloud cost health.

    Combines spend trend, efficiency score, waste analysis, and forecast into a
    polished 4-paragraph executive narrative.
    Returns (generated_text_or_None, prompt_used).
    """
    monthly = context.get("current_monthly_spend_usd", 0)
    annual_run_rate = monthly * 12
    mom_change = context.get("mom_change_percent")
    maturity = context.get("maturity_level", "walk")
    efficiency_score = context.get("overall_score", 0)
    efficiency_grade = context.get("grade", "C")
    waste_usd = context.get("total_estimated_waste_usd", 0)
    waste_rate = context.get("total_waste_rate_percent", 0)
    annual_savings_opportunity = context.get("total_annual_opportunity_usd", waste_usd * 12)
    risk_score = context.get("risk_score", 0)
    p90_monthly = context.get("p90_monthly_usd", monthly * 1.15)
    budget_usd = context.get("budget_monthly_usd", 0)

    trend_str = f"{mom_change:+.1f}% month-over-month" if mom_change is not None else "stable"
    budget_str = (
        f"Current budget is ${budget_usd:,.0f}/month "
        f"(utilisation: {monthly/budget_usd*100:.0f}%)."
        if budget_usd > 0 else "No formal budget has been configured."
    )

    prompt = (
        f"You are a senior FinOps advisor writing a board-level executive summary on cloud cost health. "
        f"Write exactly 4 paragraphs: (1) overall cloud spend position, (2) efficiency and waste, "
        f"(3) key risks and forecast outlook, (4) recommended executive actions. "
        f"Use precise financial language. Do not alter numbers. Keep total length under 250 words.\n\n"
        f"Data:\n"
        f"- Monthly spend: ${monthly:,.0f} (annualised run rate: ${annual_run_rate:,.0f})\n"
        f"- Spend trend: {trend_str}\n"
        f"- FinOps maturity: {maturity.upper()}\n"
        f"- Efficiency score: {efficiency_score}/100 (grade {efficiency_grade})\n"
        f"- Estimated monthly waste: ${waste_usd:,.0f} ({waste_rate:.1f}% of spend)\n"
        f"- Total annual savings opportunity: ${annual_savings_opportunity:,.0f}\n"
        f"- Risk score: {risk_score}/100\n"
        f"- P90 forecast scenario: ${p90_monthly:,.0f}/month\n"
        f"- {budget_str}"
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_anomaly_explanation(anomaly: dict[str, Any], context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a plain-language explanation for a specific cost anomaly."""
    service = anomaly.get("service", "unknown service")
    provider = anomaly.get("provider", "unknown provider")
    change_usd = anomaly.get("change_usd", 0)
    change_pct = anomaly.get("change_percent", 0)
    severity = anomaly.get("severity", "medium")
    z_score = anomaly.get("z_score", 0)
    monthly = context.get("current_monthly_spend_usd", 0)

    prompt = (
        f"You are a FinOps advisor. Explain this cloud cost anomaly in 2-3 sentences for an "
        f"engineering team. Be concise and suggest 1-2 specific investigation steps.\n\n"
        f"Provider: {provider}. Service: {service}. "
        f"Cost change: ${change_usd:+,.2f} ({change_pct:+.1f}%). "
        f"Severity: {severity} (z-score: {z_score:.1f}). "
        f"Monthly spend context: ${monthly:,.2f}/month total.\n\n"
        f"What likely caused this spike and what should the team check first?"
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_optimization_brief(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate an executive-level optimization brief from analytics context."""
    monthly = context.get("current_monthly_spend_usd", 0)
    savings_usd = context.get("identified_monthly_savings_usd", 0)
    waste_usd = context.get("estimated_monthly_waste_usd", 0)
    maturity_level = context.get("maturity_level", "walk")
    commitment_pct = context.get("commitment_coverage_percent", 0)
    opportunities = context.get("top_opportunities", [])

    opp_str = (
        "; ".join(f"{o['provider']} at {o['target']} coverage" for o in opportunities[:3])
        if opportunities
        else "increase reserved instance coverage"
    )

    prompt = (
        f"You are a FinOps advisor writing an executive brief (4-5 sentences). "
        f"Focus on financial impact and business outcomes. Do not alter numbers.\n\n"
        f"Monthly cloud spend: ${monthly:,.2f}. "
        f"Identified optimization savings: ${savings_usd:,.2f}/month (${savings_usd*12:,.0f}/year). "
        f"Estimated waste: ${waste_usd:,.2f}/month. "
        f"FinOps maturity: {maturity_level.upper()}. "
        f"Commitment coverage: {commitment_pct:.1f}%. "
        f"Top commitment opportunities: {opp_str}.\n\n"
        f"Write a brief that a CFO would find actionable. Include a clear ROI statement."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_maturity_narrative(assessment: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a narrative explaining FinOps maturity level and next steps."""
    level = assessment.get("maturity_label", "Walk")
    score = assessment.get("overall_score", 0)
    next_level = assessment.get("next_level", "run")
    priority_actions = assessment.get("priority_actions", [])
    actions_str = "\n".join(f"- {a}" for a in priority_actions[:3])

    prompt = (
        f"You are a FinOps advisor. Explain this FinOps maturity assessment in plain language "
        f"for a cloud engineering team (3-4 sentences).\n\n"
        f"Current maturity: {level} (score: {score}/100). "
        f"Target level: {next_level.upper() if next_level else 'already at Optimize'}.\n\n"
        f"Lowest-scoring dimensions requiring attention:\n{actions_str}\n\n"
        f"What does this maturity level mean in practice, and what are the top 2 concrete steps "
        f"to advance to the next level?"
    )
    prompt = _with_rag(prompt, assessment)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_budget_risk_alert(guardrails: dict[str, Any], forecast_context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a budget risk alert narrative from forecast guardrails."""
    budget = guardrails.get("budget_monthly_usd", 0)
    breaches = guardrails.get("breaches", 0)
    severity = guardrails.get("breach_severity", "none")
    first_breach = guardrails.get("first_breach_month")
    avg_prob = guardrails.get("average_breach_probability", 0)
    safe_budget = guardrails.get("safe_budget_95pct_usd", budget)
    monthly = forecast_context.get("current_monthly_spend_usd", 0)
    velocity = forecast_context.get("cost_velocity_pct_mom")

    vel_str = f" Spend velocity: {velocity:+.1f}% MoM." if velocity is not None else ""
    breach_str = (
        f"Budget breach risk: {severity} — {breaches} months projected to exceed ${budget:,.0f} "
        f"(first breach: {first_breach}, avg probability: {avg_prob:.0%})."
        if breaches > 0
        else f"No budget breaches projected against ${budget:,.0f}/month budget."
    )

    prompt = (
        f"You are a FinOps advisor writing a budget risk alert (2-3 sentences). "
        f"Be direct and actionable.\n\n"
        f"Current monthly spend: ${monthly:,.2f}.{vel_str} "
        f"{breach_str} "
        f"Budget level for 95% confidence: ${safe_budget:,.0f}/month.\n\n"
        f"Summarize the risk and recommend the single most impactful budget action."
    )
    prompt = _with_rag(prompt, forecast_context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_commitment_strategy(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a commitment purchasing strategy brief for finance/engineering planning."""
    annual_opportunity = context.get("total_annual_opportunity_usd", 0)
    monthly_spend = context.get("current_monthly_spend_usd", 0)
    priority_provider = context.get("priority_provider", "aws")
    provider_gaps = context.get("provider_gaps", [])

    top_gaps = []
    for row in provider_gaps[:3]:
        provider = row.get("provider", "unknown")
        current_cov = row.get("current_commitment_percent", 0)
        target_cov = row.get("target_commitment_percent", 0)
        monthly_savings = (
            row.get("scenarios", {})
            .get("1_year", {})
            .get("monthly_savings_usd", 0)
        )
        top_gaps.append(
            f"- {provider.upper()}: {current_cov:.1f}% -> {target_cov:.1f}% coverage, "
            f"~${monthly_savings:,.0f}/month savings"
        )

    top_gap_text = "\n".join(top_gaps) if top_gaps else "- No provider gap data available"

    prompt = (
        "You are a FinOps advisor preparing a commitment strategy memo for a CFO and "
        "platform engineering lead. Write 4-6 concise bullet points with a clear phased "
        "purchase strategy and risk controls. Do not alter numeric values.\n\n"
        f"Current monthly cloud spend: ${monthly_spend:,.0f}.\n"
        f"Total annual commitment opportunity: ${annual_opportunity:,.0f}.\n"
        f"Priority provider: {priority_provider.upper()}.\n"
        f"Top provider gaps:\n{top_gap_text}\n\n"
        "Include: (1) which provider to act on first, (2) recommended 1-year vs 3-year "
        "mix, (3) guardrails for utilization and expiration risk, (4) one governance KPI."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_tagging_strategy(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a tagging enforcement strategy from tagging coverage analytics.

    ``context`` should contain output from ``build_tagging_coverage_analytics()`` or equivalent.
    Returns (generated_text_or_None, prompt_used).
    """
    coverage = context.get("coverage_percent", 0)
    grade = context.get("grade", "C")
    allocation_score = context.get("allocation_readiness_score", 0)
    critical_gaps = context.get("critical_tag_gaps", [])
    untagged_annual = context.get("untagged_spend_annual_usd", 0)
    coverage_gap = context.get("coverage_gap_percent", 0)
    recommendations = context.get("enforcement_recommendations", [])

    gaps_str = ", ".join(critical_gaps[:4]) if critical_gaps else "none identified"
    recs_str = "\n".join(f"- {r}" for r in recommendations[:3])

    prompt = (
        "You are a FinOps engineer advising a platform team on cloud tagging compliance. "
        "Write a 3-4 sentence action plan to close the tagging gap.\n\n"
        f"Current tagging coverage: {coverage:.1f}% (grade {grade}). "
        f"Allocation readiness score: {allocation_score}/100. "
        f"Coverage gap vs. benchmark: {coverage_gap:.1f}%. "
        f"Annual spend at risk from untagged resources: ${untagged_annual:,.0f}. "
        f"Missing critical tags: {gaps_str}.\n\n"
        f"Recommended enforcement actions:\n{recs_str}\n\n"
        "Explain the business impact of poor tagging and give 2 concrete enforcement steps "
        "an engineer can implement this sprint."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_sustainability_narrative(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a sustainability and carbon footprint narrative from metrics.

    ``context`` should contain output from ``build_sustainability_metrics()`` or equivalent.
    Returns (generated_text_or_None, prompt_used).
    """
    total_tonnes = context.get("total_tonnes_co2e_annual", 0)
    score = context.get("sustainability_score", 0)
    grade = context.get("sustainability_grade", "C")
    renewable_pct = context.get("current_renewable_energy_percent", 0)
    reductions = context.get("reduction_opportunities", {})
    total_reduction_pct = reductions.get("total_reduction_potential_percent", 0)
    recommendations = context.get("recommendations", [])

    recs_str = "\n".join(f"- {r}" for r in recommendations[:3])
    monthly_co2e = context.get("total_kg_co2e_monthly", 0)

    prompt = (
        "You are a cloud sustainability advisor writing a brief for a CTO preparing an "
        "ESG report. Write 3-4 sentences covering current carbon position, top reduction "
        "opportunities, and a recommended next action. Be factual and avoid alarmism.\n\n"
        f"Annual cloud carbon footprint: {total_tonnes:.2f} tonnes CO2e. "
        f"Monthly carbon: {monthly_co2e:.0f} kg CO2e. "
        f"Sustainability score: {score}/100 (grade {grade}). "
        f"Current renewable energy mix: {renewable_pct:.0f}%. "
        f"Identified reduction potential: {total_reduction_pct:.0f}% through rightsizing and "
        f"renewable region selection.\n\n"
        f"Top recommendations:\n{recs_str}"
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_chargeback_narrative(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a chargeback/showback narrative for finance reporting.

    ``context`` should contain output from ``build_chargeback_summary()`` or equivalent.
    Returns (generated_text_or_None, prompt_used).
    """
    model = context.get("model", "showback")
    total = context.get("total_monthly_spend_usd", 0)
    allocated_pct = context.get("allocation_coverage_percent", 0)
    unallocated = context.get("unallocated_usd", 0)
    unallocated_pct = context.get("unallocated_percent", 0)
    top_spenders = context.get("top_spenders", [])
    team_count = context.get("team_count", 0)

    top_str = ", ".join(
        f"{s['team']} (${s['allocated_spend_usd']:,.0f})" for s in top_spenders[:3]
    ) if top_spenders else "data not available"

    prompt = (
        f"You are a FinOps manager presenting a {model} report to finance leadership. "
        "Summarise spend allocation in 3-4 sentences. Cover coverage, top spenders, "
        "and unallocated risk. Recommend one governance action.\n\n"
        f"Total monthly cloud spend: ${total:,.0f}. "
        f"Allocation coverage: {allocated_pct:.1f}% across {team_count} teams/cost-centers. "
        f"Unallocated spend: ${unallocated:,.0f}/month ({unallocated_pct:.1f}%). "
        f"Top spenders: {top_str}.\n\n"
        f"If unallocated > 15%, emphasise urgency. Otherwise focus on top-spender accountability."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_cross_provider_comparison_brief(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a multi-cloud comparative efficiency brief.

    ``context`` should contain output from ``build_cross_provider_comparison()`` or equivalent.
    Returns (generated_text_or_None, prompt_used).
    """
    total = context.get("total_monthly_spend_usd", 0)
    best = context.get("best_performing_provider", "aws")
    worst = context.get("lowest_health_provider", "")
    concentration_risk = context.get("concentration_risk", "medium")
    arbitrage = context.get("arbitrage_opportunities", [])
    providers = context.get("providers", [])

    provider_str = "\n".join(
        f"- {p['provider'].upper()}: ${p['monthly_cost_usd']:,.0f}/month, "
        f"health {p['health_score']}/100, waste {p['waste_rate_percent']:.1f}%, "
        f"commitment {p['commitment_coverage_percent']:.0f}%"
        for p in providers[:4]
    )
    arb_str = (
        f"Arbitrage opportunity: move workloads from {arbitrage[0]['from_provider'].upper()} "
        f"to {arbitrage[0]['to_provider'].upper()} — "
        f"~${arbitrage[0]['estimated_annual_savings_usd']:,.0f}/year savings."
        if arbitrage else "No immediate arbitrage opportunity identified."
    )

    prompt = (
        "You are a FinOps strategist presenting a multi-cloud comparison to a VP of Engineering. "
        "Write 3-4 sentences comparing provider efficiency, highlighting the strongest and weakest "
        "performers, concentration risk, and any arbitrage opportunity.\n\n"
        f"Total multi-cloud spend: ${total:,.0f}/month. "
        f"Best-performing provider: {best.upper() if best else 'N/A'}. "
        f"Lowest health provider: {worst.upper() if worst else 'N/A'}. "
        f"Concentration risk: {concentration_risk}.\n\n"
        f"Provider breakdown:\n{provider_str}\n\n"
        f"{arb_str}"
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_alert_triage(alerts: list[dict[str, Any]], context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Use GenAI to classify and prioritize a batch of cost alerts to reduce alert fatigue.

    ``alerts`` is a list of alert dicts with at minimum: title, severity, amount_usd, provider.
    Returns (generated_text_or_None, prompt_used).
    """
    monthly = context.get("current_monthly_spend_usd", 0)
    critical_alerts = [a for a in alerts if str(a.get("severity", "")).lower() == "critical"]
    high_alerts = [a for a in alerts if str(a.get("severity", "")).lower() == "high"]

    alert_lines = "\n".join(
        f"- [{a.get('severity', 'medium').upper()}] {a.get('title', 'Unknown alert')}: "
        f"${_safe_float(a.get('amount_usd', 0)):,.0f} ({a.get('provider', '?').upper()})"
        for a in alerts[:10]
    )

    prompt = (
        "You are a FinOps on-call specialist performing alert triage. "
        "Review the following alerts and classify each as: IMMEDIATE (act now), "
        "INVESTIGATE (review today), or MONITOR (log and watch). "
        "Give a one-line action for each IMMEDIATE or INVESTIGATE alert. "
        "End with a 1-sentence overall risk summary.\n\n"
        f"Context: total monthly spend ${monthly:,.0f}. "
        f"{len(critical_alerts)} critical, {len(high_alerts)} high severity alerts.\n\n"
        f"Alerts:\n{alert_lines}"
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_rightsizing_brief(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate an AI-powered rightsizing recommendation brief.

    ``context`` may include: provider, total_potential_savings_usd,
    resource_count, recommendation_count, top_resources (list of dicts with
    resource_id, current_type, recommended_type, monthly_savings_usd).
    Returns (generated_text_or_None, prompt_used).
    """
    provider = context.get("provider", "multi-cloud")
    total_savings = context.get("total_potential_savings_usd", 0)
    resource_count = context.get("resource_count", 0)
    rec_count = context.get("recommendation_count", 0)
    top_resources = context.get("top_resources", [])
    monthly = context.get("current_monthly_spend_usd", 0)

    resource_lines = "\n".join(
        f"- {r.get('resource_id', 'unknown')}: {r.get('current_type', '?')} → "
        f"{r.get('recommended_type', '?')}, save ${_safe_float(r.get('monthly_savings_usd', 0)):,.0f}/month"
        for r in top_resources[:5]
    ) if top_resources else "- No specific resource data provided"

    prompt = (
        "You are a cloud architect advising on rightsizing. "
        "Write a 3-4 sentence rightsizing brief for a platform engineering team. "
        "Be specific about the opportunity size and execution risk.\n\n"
        f"Provider: {provider.upper()}. "
        f"Total monthly spend: ${monthly:,.0f}. "
        f"Total rightsizing savings: ${total_savings:,.0f}/month "
        f"(${total_savings * 12:,.0f}/year). "
        f"Resources analysed: {resource_count}. Recommendations: {rec_count}.\n\n"
        f"Top rightsizing candidates:\n{resource_lines}\n\n"
        "Highlight the highest-ROI candidate, execution risk, and testing approach."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_vendor_negotiation_brief(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate contract/vendor negotiation talking points from commitment and spend data.

    Useful for enterprise discount program (EDP) renewals, private pricing agreements,
    or annual commitment negotiations with AWS, Azure, GCP, or OCI.
    Returns (generated_text_or_None, prompt_used).
    """
    provider = context.get("provider", "aws")
    annual_spend = context.get("annual_spend_usd", 0)
    current_discount_pct = context.get("current_discount_percent", 0)
    commitment_coverage_pct = context.get("commitment_coverage_percent", 0)
    contract_renewal_months = context.get("contract_renewal_months", 6)
    growth_pct = context.get("yoy_growth_percent", 15)
    competitive_alternatives = context.get("competitive_alternatives", [])

    alt_str = ", ".join(competitive_alternatives[:3]) if competitive_alternatives else "Azure, GCP"
    projected_3yr = annual_spend * ((1 + growth_pct / 100) ** 3)

    prompt = (
        "You are a FinOps procurement advisor preparing talking points for a cloud vendor "
        "contract negotiation. Write 5-6 bullet points the customer should use in their "
        "next negotiation call. Be commercially assertive but realistic.\n\n"
        f"Provider: {provider.upper()}. "
        f"Current annual cloud spend: ${annual_spend:,.0f}. "
        f"Current discount: {current_discount_pct:.1f}%. "
        f"Commitment coverage: {commitment_coverage_pct:.0f}%. "
        f"Contract renewal in: {contract_renewal_months} months. "
        f"YoY spend growth: {growth_pct:.0f}%. "
        f"Projected 3-year total: ${projected_3yr:,.0f}. "
        f"Competitive alternatives being evaluated: {alt_str}.\n\n"
        "Cover: leverage points, minimum ask on discount %, bundled services to request, "
        "SLA improvements, and a walk-away threshold."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_forecast_model_diagnostics(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a model-risk narrative from deterministic forecast diagnostics.

    This is intentionally advisory only. The diagnostics endpoint remains the
    source of truth for model selection, accuracy, drift, and data quality.
    """
    champion = context.get("champion_model", "blended_regression")
    model_risk = context.get("model_risk_level", "medium")
    quality = context.get("data_quality_score", 0)
    history_source = context.get("history_source", "no_history")
    history_points = context.get("history_points", 0)
    drift = context.get("drift_signals", {})
    challengers = context.get("challenger_models", [])
    best_error = context.get("champion_wmape_percent")

    challenger_summary = "; ".join(
        f"{row.get('model')}: wMAPE {row.get('wmape_percent')}"
        for row in challengers[:4]
    ) or "no challenger backtest available"

    prompt = (
        "You are a FinOps forecasting reviewer. Write a concise model-risk note for finance "
        "and engineering. Explain why the champion forecast model was selected, what data "
        "quality limitations remain, and what operational action improves forecast confidence. "
        "Do not change any numbers.\n\n"
        f"Champion model: {champion}. "
        f"Champion wMAPE: {best_error}. "
        f"Model risk level: {model_risk}. "
        f"Data quality score: {quality}/100. "
        f"History source: {history_source}; history points: {history_points}. "
        f"Drift signals: {drift}. "
        f"Challenger models: {challenger_summary}."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_finops_operating_review(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a weekly FinOps operating review for engineering and finance."""
    monthly = _safe_float(context.get("current_monthly_spend_usd"), 0.0)
    budget = _safe_float(context.get("budget_monthly_usd"), 0.0)
    waste = _safe_float(
        context.get("total_estimated_waste_usd", context.get("estimated_monthly_waste_usd")),
        0.0,
    )
    spend_at_risk = _safe_float(context.get("spend_at_risk_usd"), 0.0)
    risk_score = _safe_float(context.get("risk_score"), 0.0)
    maturity = str(context.get("maturity_level", "walk") or "walk").upper()
    efficiency_grade = str(context.get("grade", "C") or "C")
    cost_velocity = context.get("cost_velocity_pct_mom")
    breach_prob = _safe_float(
        (context.get("budget_guardrails") or {}).get("average_breach_probability"),
        0.0,
    )
    coverage_gap = _safe_float(context.get("coverage_gap_percent"), 0.0)
    unallocated = _safe_float(context.get("unallocated_percent"), 0.0)
    annual_commitment_opportunity = _safe_float(context.get("total_annual_opportunity_usd"), 0.0)
    top_actions = context.get("top_opportunities", []) or context.get("quick_wins", []) or []

    top_actions_str = "\n".join(
        f"- {a.get('title') or a.get('category') or a.get('service') or 'Optimization action'}"
        for a in top_actions[:3]
        if isinstance(a, dict)
    ) or "- No prioritized actions provided"

    budget_line = (
        f"Budget: ${budget:,.0f}/month (utilization: {monthly / budget * 100:.0f}%)."
        if budget > 0
        else "Budget: not configured."
    )
    velocity_line = (
        f"Spend velocity: {cost_velocity:+.1f}% MoM."
        if isinstance(cost_velocity, (int, float))
        else "Spend velocity: not available."
    )

    prompt = (
        "You are a FinOps lead writing a weekly operating review update for engineering, finance, "
        "and platform leadership. Write exactly 5 concise bullets under these headings:\n"
        "1) Spend Position\n2) Forecast and Budget Risk\n3) Optimization Execution\n"
        "4) Governance and Allocation\n5) Next 7-Day Priorities\n\n"
        "Use all provided numbers exactly as-is. Be direct and action-oriented.\n\n"
        f"Monthly spend: ${monthly:,.0f}. {budget_line}\n"
        f"{velocity_line}\n"
        f"Estimated waste: ${waste:,.0f}/month. Spend at risk: ${spend_at_risk:,.0f}/month.\n"
        f"Risk score: {risk_score:.0f}/100. Maturity: {maturity}. Efficiency grade: {efficiency_grade}.\n"
        f"Average budget breach probability: {breach_prob:.0%}.\n"
        f"Tagging coverage gap: {coverage_gap:.1f}%.\n"
        f"Unallocated spend percent: {unallocated:.1f}%.\n"
        f"Annual commitment opportunity: ${annual_commitment_opportunity:,.0f}.\n"
        f"Top actions:\n{top_actions_str}\n\n"
        "For each bullet, include one explicit owner role (FinOps, Platform, Procurement, or App Team)."
    )
    prompt = _with_rag(prompt, context)

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt
