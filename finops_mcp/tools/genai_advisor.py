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
import logging
import os
from base64 import b64encode
from email.utils import formatdate
from typing import Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_OCI_GENAI_ENDPOINT = os.getenv("OCI_GENAI_ENDPOINT", "")
_OCI_GENAI_MODEL = os.getenv("OCI_GENAI_MODEL", "meta.llama-3-70b-instruct")
_OCI_COMPARTMENT_ID = os.getenv("OCI_COMPARTMENT_OCID", os.getenv("OCI_GENAI_COMPARTMENT_ID", ""))
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


def _expanded_path(path: str) -> str:
    """Return a user-expanded filesystem path (supports '~')."""
    return os.path.abspath(os.path.expanduser(path)) if path else ""


def _is_configured() -> bool:
    """Return True if enough config is present to attempt an OCI GenAI call."""
    endpoint = _OCI_GENAI_ENDPOINT or _DEFAULT_ENDPOINT
    if not endpoint:
        return False
    if not _OCI_COMPARTMENT_ID:
        return False
    config_file = _expanded_path(_OCI_CONFIG_FILE)
    private_key_path = _expanded_path(_OCI_PRIVATE_KEY_PATH)
    # Need either OCI SDK config file or direct key material
    has_sdk_config = bool(config_file and os.path.isfile(config_file))
    has_key = bool(private_key_path or _OCI_PRIVATE_KEY_INLINE)
    has_identity = bool(_OCI_TENANCY_OCID and _OCI_USER_OCID and _OCI_FINGERPRINT)
    return has_sdk_config or (has_key and has_identity)


def _load_private_key_pem() -> Optional[str]:
    """Load PEM key from file path or inline env var."""
    private_key_path = _expanded_path(_OCI_PRIVATE_KEY_PATH)
    if private_key_path and os.path.isfile(private_key_path):
        with open(private_key_path) as f:
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
        config_file = _expanded_path(_OCI_CONFIG_FILE)
        if config_file and os.path.isfile(config_file):
            cfg = oci.config.from_file(config_file, _OCI_PROFILE)
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

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_forecast_sensitivity_brief(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a concise narrative for forecast sensitivity stress tests."""
    baseline_total = context.get("baseline_projected_total_usd", 0)
    stress_gap = context.get("stress_gap_usd", 0)
    growth_elasticity = context.get("growth_1pct_usd", 0)
    volatility_elasticity = context.get("volatility_1pct_usd", 0)

    prompt = (
        "You are a FinOps advisor explaining forecast sensitivity analysis to finance and engineering leaders. "
        "Write 4 concise bullet points. Do not alter numeric values.\n\n"
        f"Baseline projected spend: ${baseline_total:,.0f}.\n"
        f"Stress window gap (best to worst): ${stress_gap:,.0f}.\n"
        f"Growth elasticity (1% change): ${growth_elasticity:,.0f}.\n"
        f"Volatility elasticity (1% change): ${volatility_elasticity:,.0f}.\n\n"
        "Include: (1) what drives downside risk most, (2) budget planning implication, "
        "(3) one mitigation for growth risk, (4) one mitigation for volatility risk."
    )

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_optimization_portfolio_brief(context: dict[str, Any]) -> tuple[Optional[str], str]:
    """Generate a narrative for a risk-adjusted optimization portfolio."""
    monthly_savings = context.get("total_monthly_savings_usd", 0)
    npv = context.get("risk_adjusted_npv_12m_usd", 0)
    top_initiatives = context.get("top_initiatives", [])
    top_text = ", ".join(str(item) for item in top_initiatives[:3]) or "rightsizing, commitments, lifecycle"

    prompt = (
        "You are a FinOps advisor writing an executive portfolio brief. "
        "Use 3 short paragraphs and a final action list with 3 bullets. Do not alter numbers.\n\n"
        f"Total monthly savings potential: ${monthly_savings:,.0f}.\n"
        f"Risk-adjusted NPV (12m): ${npv:,.0f}.\n"
        f"Top initiatives: {top_text}.\n\n"
        "Explain why sequencing matters, what should happen in 30/60/90 days, "
        "and which governance KPI should be tracked weekly."
    )

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt


def generate_stakeholder_brief(
    context: dict[str, Any],
    audience: str,
) -> tuple[Optional[str], str]:
    """Generate audience-specific brief (finance, engineering, operations)."""
    audience_key = str(audience or "finance").strip().lower()
    spend = context.get("current_monthly_spend_usd", 0)
    risk_score = context.get("risk_score", 0)
    waste = context.get("estimated_monthly_waste_usd", context.get("total_estimated_waste_usd", 0))
    opportunity = context.get("total_annual_opportunity_usd", 0)

    audience_prompts = {
        "finance": (
            "Focus on budget predictability, savings realization confidence, and governance cadence. "
            "Mention cash-flow vs commitment trade-offs."
        ),
        "engineering": (
            "Focus on workload actions, ownership, and delivery sequencing. "
            "Mention reliability and performance guardrails."
        ),
        "operations": (
            "Focus on operational controls, alerting, and repeatable automation. "
            "Mention runbooks and weekly execution rhythm."
        ),
    }
    guidance = audience_prompts.get(audience_key, audience_prompts["finance"])

    prompt = (
        f"You are a FinOps advisor preparing a short brief for the {audience_key} audience. "
        "Write 5-7 bullet points. Do not alter numeric values.\n\n"
        f"Monthly cloud spend: ${spend:,.0f}.\n"
        f"Risk score: {risk_score}/100.\n"
        f"Estimated monthly waste: ${waste:,.0f}.\n"
        f"Annual opportunity: ${opportunity:,.0f}.\n\n"
        f"Additional guidance: {guidance}"
    )

    if not _is_configured():
        return None, prompt
    return _sign_and_call(prompt), prompt
