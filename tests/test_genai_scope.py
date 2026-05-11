"""
Unit tests for GenAI scope validation and enforcement.
"""

import unittest
from optiora_backend.genai_scope import (
    validate_genai_scope,
    calculate_finops_score,
    GenAIValidator,
    sanitize_genai_prompt,
    create_finops_system_prompt,
)


class GenAIScopeTest(unittest.TestCase):
    """Test GenAI scope validation."""

    def test_01_finops_keywords_in_scope(self):
        """Test that queries with FinOps keywords are accepted."""
        query = "How can we reduce our AWS EC2 costs in production?"
        is_valid, reason = validate_genai_scope(query, min_score=0.5)
        self.assertTrue(is_valid, f"Expected valid, got: {reason}")

    def test_02_multiple_finops_keywords_high_score(self):
        """Test that multiple FinOps keywords increase score."""
        query = "Analyze our AWS and Azure cloud costs across regions"
        score, reason = calculate_finops_score(query)
        self.assertGreaterEqual(score, 0.75, f"Expected high score, got {score}: {reason}")

    def test_03_blocked_domain_rejected(self):
        """Test that blocked domains are rejected."""
        query = "What's the best investment strategy for crypto?"
        is_valid, reason = validate_genai_scope(query)
        self.assertFalse(is_valid, "Expected blocked query")
        self.assertIn("blocked domain", reason.lower())

    def test_04_politics_blocked(self):
        """Test that political questions are blocked."""
        query = "Who should win the next election?"
        is_valid, reason = validate_genai_scope(query)
        self.assertFalse(is_valid, "Expected politics blocked")

    def test_05_medical_advice_blocked(self):
        """Test that medical advice requests are blocked."""
        query = "I have lower back pain, what should I do?"
        is_valid, reason = validate_genai_scope(query)
        self.assertFalse(is_valid, "Expected medical blocked")

    def test_06_legal_advice_blocked(self):
        """Test that legal advice requests are blocked."""
        query = "What legal structure should my company use?"
        is_valid, reason = validate_genai_scope(query)
        self.assertFalse(is_valid, "Expected legal advice blocked")

    def test_07_finops_phrase_match(self):
        """Test that explicit FinOps phrases get high scores."""
        query = "How do I implement a chargeback model?"
        score, reason = calculate_finops_score(query)
        self.assertEqual(score, 0.95, f"Expected 0.95 for explicit phrase, got {score}")

    def test_08_budget_tracking_accepted(self):
        """Test budget tracking query is accepted."""
        query = "Set up budget alerts for AWS spending"
        is_valid, reason = validate_genai_scope(query)
        self.assertTrue(is_valid, f"Expected valid budget query: {reason}")

    def test_09_unit_economics_accepted(self):
        """Test unit economics query is accepted."""
        query = "Calculate cost per transaction for our payment processing"
        is_valid, reason = validate_genai_scope(query)
        self.assertTrue(is_valid, f"Expected valid unit economics query: {reason}")

    def test_10_reservation_analysis_accepted(self):
        """Test reservation analysis is accepted."""
        query = "Compare Reserved Instances vs On-Demand pricing"
        is_valid, reason = validate_genai_scope(query)
        self.assertTrue(is_valid, f"Expected valid reservation query: {reason}")

    def test_11_out_of_scope_no_keywords(self):
        """Test query with no FinOps keywords is rejected."""
        query = "Tell me about ancient Rome history"
        is_valid, reason = validate_genai_scope(query, min_score=0.5)
        self.assertFalse(is_valid, "Expected out of scope query to be rejected")

    def test_12_empty_query_rejected(self):
        """Test that empty queries are rejected."""
        query = ""
        is_valid, reason = validate_genai_scope(query)
        self.assertFalse(is_valid, "Expected empty query to be rejected")

    def test_13_sanitize_removes_dangerous_chars(self):
        """Test prompt sanitization removes injection characters."""
        prompt = 'SELECT * FROM users; DROP TABLE users; <script>alert("xss")</script>'
        sanitized = sanitize_genai_prompt(prompt)
        self.assertNotIn(";", sanitized)
        self.assertNotIn("<", sanitized)
        self.assertNotIn(">", sanitized)

    def test_14_sanitize_max_length(self):
        """Test prompt sanitization enforces max length."""
        prompt = "x" * 5000
        sanitized = sanitize_genai_prompt(prompt)
        self.assertLessEqual(len(sanitized), 2000)

    def test_15_finops_system_prompt_generated(self):
        """Test that system prompt is properly generated."""
        prompt = create_finops_system_prompt()
        self.assertIn("FinOps", prompt)
        self.assertIn("AWS", prompt)
        self.assertIn("Azure", prompt)
        self.assertIn("GCP", prompt)
        self.assertIn("OCI", prompt)

    def test_16_validator_strict_mode(self):
        """Test GenAIValidator in strict mode."""
        validator = GenAIValidator(strict_mode=True)
        is_valid, reason = validator.validate_query(
            "What's a good recipe for cookies?"
        )
        self.assertFalse(is_valid, "Expected strict mode to block recipe query")

    def test_17_validator_blocked_count(self):
        """Test GenAIValidator tracks blocked queries."""
        validator = GenAIValidator(strict_mode=True)
        validator.validate_query("Tell me a joke")
        validator.validate_query("What's the weather?")
        self.assertEqual(validator.get_blocked_count(), 2)

    def test_18_cost_optimization_phrase_accepted(self):
        """Test 'cost optimization' phrase is accepted."""
        query = "Cost optimization recommendations for our infrastructure"
        is_valid, reason = validate_genai_scope(query)
        self.assertTrue(is_valid, f"Expected cost optimization accepted: {reason}")

    def test_19_kubernetes_cost_accepted(self):
        """Test Kubernetes cost analysis is accepted."""
        query = "Analyze Kubernetes resource utilization and associated costs"
        is_valid, reason = validate_genai_scope(query)
        self.assertTrue(is_valid, f"Expected Kubernetes cost query accepted: {reason}")

    def test_20_oci_cloud_integration_accepted(self):
        """Test OCI cloud integration is accepted."""
        query = "How do we optimize OCI compute and storage costs?"
        is_valid, reason = validate_genai_scope(query)
        self.assertTrue(is_valid, f"Expected OCI query accepted: {reason}")


if __name__ == "__main__":
    unittest.main()
