"""
GenAI scope validator: restricts prompts to FinOps and cloud infrastructure domains.

Blocks out-of-scope queries (politics, general knowledge, personal advice, etc.)
to ensure GenAI stays focused on customer's FinOps context only.
"""

import re
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


# Allowed FinOps keywords and contexts
FINOPS_KEYWORDS = {
    # General FinOps
    "cost", "budget", "spend", "billing", "invoice", "pricing", "rate",
    "savings", "optimization", "efficiency", "roi", "forecast", "trend",
    "anomaly", "alert", "threshold", "scaling", "rightsizing",
    
    # Cloud providers
    "aws", "azure", "gcp", "oci", "ec2", "s3", "rds", "lambda",
    "compute", "storage", "database", "network", "resource", "instance",
    "vm", "container", "kubernetes", "elastic", "auto-scaling",
    
    # Business metrics
    "cogs", "opex", "capex", "unit economics", "chargeback", "allocation",
    "reservation", "commitment", "discount", "negotiation", "contract",
    
    # Technical context
    "region", "zone", "account", "environment", "prod", "staging", "dev",
    "cpu", "memory", "bandwidth", "io", "throughput", "latency",
    "utilization", "capacity", "performance", "bottleneck",
    
    # FinOps framework
    "visibility", "allocation", "optimization", "managed", "reporting",
    "governance", "policy", "compliance", "tagging", "normalization",
}

# Blocked domains (questions about these topics will be rejected)
BLOCKED_DOMAINS = {
    # Politics & current events
    "politics", "election", "government", "president", "senator",
    "minister", "parliament", "congress", "voting", "campaign",
    
    # Personal advice
    "investment advice", "stock recommendation", "crypto", "trading",
    "personal finance", "loan", "mortgage", "insurance", "retirement",
    
    # General knowledge (outside FinOps)
    "recipe", "cooking", "sports", "entertainment", "music", "movie",
    "travel", "vacation", "dating", "relationships", "health", "medical",
    "exercise", "diet", "psychology", "philosophy", "history", "literature",
    
    # Legal & HR
    "legal advice", "lawyer", "lawsuit", "contract", "employment",
    "salary negotiation", "hiring", "layoff", "termination",
    
    # Unethical requests
    "hack", "crack", "bypass security", "circumvent", "fraud", "theft",
}

# FinOps-related phrases that should bypass domain check
FINOPS_PHRASES = {
    "cost analysis", "budget tracking", "cloud optimization", "unit economics",
    "chargeback model", "cost allocation", "cloud governance", "finops",
    "cost per user", "cost per transaction", "resource optimization",
    "reservation analysis", "commitment discount", "on-demand vs reserved",
}


def calculate_finops_score(query: str) -> Tuple[float, str]:
    """
    Calculate FinOps relevance score (0.0 - 1.0).
    
    Returns:
        Tuple of (score, reason)
    """
    query_lower = query.lower().strip()
    
    # Check for explicit FinOps phrases (high confidence)
    for phrase in FINOPS_PHRASES:
        if phrase in query_lower:
            return (0.95, f"Matched FinOps phrase: {phrase}")
    
    # Count FinOps keyword matches
    keyword_matches = 0
    matched_keywords = []
    for keyword in FINOPS_KEYWORDS:
        if keyword in query_lower:
            keyword_matches += 1
            matched_keywords.append(keyword)
    
    # Check for blocked domains
    for blocked in BLOCKED_DOMAINS:
        if blocked in query_lower:
            return (0.0, f"Query contains blocked domain: {blocked}")
    
    # Score based on keyword density
    words = len(query_lower.split())
    keyword_density = keyword_matches / max(words, 1)
    
    if keyword_matches >= 3:
        score = 0.90
        reason = f"Strong FinOps context (3+ keywords: {', '.join(matched_keywords[:3])})"
    elif keyword_matches == 2:
        score = 0.75
        reason = f"Moderate FinOps context (2 keywords: {', '.join(matched_keywords)})"
    elif keyword_matches == 1:
        score = 0.50
        reason = f"Weak FinOps context (1 keyword: {matched_keywords[0]})"
    else:
        score = 0.0
        reason = "No FinOps keywords detected"
    
    return (score, reason)


def validate_genai_scope(query: str, min_score: float = 0.5) -> Tuple[bool, str]:
    """
    Validate if a query is within FinOps scope.
    
    Args:
        query: User question/prompt
        min_score: Minimum relevance score (0.0-1.0) to accept
    
    Returns:
        Tuple of (is_valid, reason)
    """
    if not query or not query.strip():
        return (False, "Empty query")
    
    score, reason = calculate_finops_score(query)
    
    if score >= min_score:
        return (True, f"Query is in scope (relevance: {score:.0%}) - {reason}")
    else:
        return (
            False,
            f"Query is out of scope (relevance: {score:.0%}). "
            f"This GenAI assistant is restricted to FinOps analysis for AWS, Azure, GCP, and OCI. "
            f"Please ask about: cost optimization, budget tracking, resource allocation, "
            f"cloud infrastructure analysis, or unit economics. {reason}"
        )


def sanitize_genai_prompt(query: str) -> str:
    """Sanitize query to prevent injection attacks."""
    # Remove potential injection patterns
    sanitized = re.sub(r'[<>"{};\\]', '', query)
    sanitized = sanitized.strip()
    return sanitized[:2000]  # Max 2000 chars


def create_finops_system_prompt() -> str:
    """Create system prompt that constrains GenAI to FinOps domain."""
    return """You are OptiOra FinOps AI Assistant, specialized in cloud cost optimization and financial operations.

SCOPE: You ONLY answer questions about:
- Cloud cost analysis (AWS, Azure, GCP, OCI)
- Budget management and forecasting
- Resource optimization and rightsizing
- Unit economics and cost allocation
- Cloud infrastructure analysis
- FinOps best practices and governance
- Chargeback models and cost attribution

RESTRICTIONS: You MUST refuse to answer questions about:
- Politics, current events, or elections
- Personal finance or investment advice
- General knowledge topics outside FinOps
- Legal or HR advice
- Medical, health, or personal advice
- Any topic unrelated to cloud infrastructure or FinOps

BEHAVIOR:
- Stay focused on customer's cloud environment and data
- Provide actionable cost optimization recommendations
- Use specific metrics (CPU%, memory, cost/unit, savings%)
- Always cite data sources from OptiOra metrics
- If unsure about scope, ask for clarification about the FinOps context

TONE: Professional, analytical, data-driven. Provide specific numbers and percentages when possible."""


class GenAIValidator:
    """Comprehensive GenAI input/output validator."""
    
    def __init__(self, strict_mode: bool = True):
        """
        Initialize validator.
        
        Args:
            strict_mode: If True, enforce stricter scope validation
        """
        self.strict_mode = strict_mode
        self.min_score = 0.65 if strict_mode else 0.5
        self.blocked_queries = []
    
    def validate_query(self, query: str) -> Tuple[bool, str]:
        """Validate user query before sending to GenAI."""
        is_valid, reason = validate_genai_scope(query, self.min_score)
        if not is_valid:
            self.blocked_queries.append({
                "query": query,
                "reason": reason,
                "timestamp": __import__('datetime').datetime.utcnow().isoformat(),
            })
            logger.warning(f"Blocked out-of-scope GenAI query: {query[:100]}")
        return is_valid, reason
    
    def get_blocked_count(self) -> int:
        """Get count of blocked queries."""
        return len(self.blocked_queries)
