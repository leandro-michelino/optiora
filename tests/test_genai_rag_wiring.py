"""Regression tests for real GenAI + RAG prompt wiring."""

from unittest.mock import patch

from finops_mcp.tools import finops_rag, genai_advisor


def test_rag_catalog_retrieves_guidance_for_optimization_roadmap() -> None:
    payload = finops_rag.retrieve_guidance(
        analysis_type="optimization_roadmap",
        cloud_provider="all",
        context={
            "current_monthly_spend_usd": 125000,
            "total_estimated_waste_usd": 18000,
            "improvement_focus": ["rightsizing", "commitment coverage"],
        },
    )

    assert payload["retrieved_count"] > 0
    assert payload["rag_brief"]
    assert payload["retrieved_docs"][0]["guidance"]


def test_backend_genai_prompt_includes_retrieved_rag_brief() -> None:
    captured_prompt = ""

    def fake_sign_and_call(prompt: str) -> str:
        nonlocal captured_prompt
        captured_prompt = prompt
        return "generated narrative"

    with patch.object(genai_advisor, "_is_configured", return_value=True), patch.object(
        genai_advisor, "_sign_and_call", side_effect=fake_sign_and_call
    ):
        narrative, prompt = genai_advisor.generate_optimization_roadmap(
            {
                "current_monthly_spend_usd": 125000,
                "overall_score": 64,
                "grade": "C",
                "total_estimated_waste_usd": 18000,
                "total_annual_opportunity_usd": 240000,
                "improvement_focus": ["rightsizing", "commitment coverage"],
                "priority_provider": "oci",
                "rag_brief": "- [opt-roadmap] Prioritize high-confidence savings first.",
            }
        )

    assert narrative == "generated narrative"
    assert prompt == captured_prompt
    assert "Retrieved FinOps guidance context (RAG):" in captured_prompt
    assert "Prioritize high-confidence savings first." in captured_prompt
