"""Unit tests for imported cost CSV helper extraction."""

import unittest

from optiora_backend.imported_cost_csv import CsvImportError, load_normalized_csv_upload, validate_cost_csv_row


class ImportedCostCsvHelperTest(unittest.TestCase):
    def test_load_normalized_csv_upload_normalizes_headers_and_rows(self) -> None:
        headers, rows = load_normalized_csv_upload(
            "costs.csv",
            b"Provider,Cost_USD,Region\nAWS,10,us-east-1\n",
        )

        self.assertEqual(headers, ["provider", "cost_usd", "region"])
        self.assertEqual(rows, [{"provider": "AWS", "cost_usd": "10", "region": "us-east-1"}])

    def test_load_normalized_csv_upload_rejects_non_csv_filename(self) -> None:
        with self.assertRaises(CsvImportError) as ctx:
            load_normalized_csv_upload("costs.txt", b"provider,cost_usd\naws,1\n")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_validate_cost_csv_row_returns_parsed_values(self) -> None:
        parsed = validate_cost_csv_row(
            {"provider": "aws", "cost_usd": "12.5", "currency": "USD", "period_start": "2026-04-01T00:00:00Z"},
            line_number=2,
            supported_providers={"aws", "oci"},
            parse_required_float_value=lambda value, field, line: (float(value), None),
            parse_optional_datetime_value=lambda value, field, line: (value, None),
            format_provider_error=lambda provider, line, allowed: f"bad provider {provider}",
            format_currency_error=lambda currency, line: f"bad currency {currency}",
        )

        self.assertEqual(parsed.provider, "aws")
        self.assertEqual(parsed.cost_usd, 12.5)
        self.assertEqual(parsed.currency, "USD")
        self.assertEqual(parsed.period_start, "2026-04-01T00:00:00Z")
        self.assertEqual(parsed.errors, [])

    def test_validate_cost_csv_row_collects_currency_error(self) -> None:
        parsed = validate_cost_csv_row(
            {"provider": "aws", "cost_usd": "", "currency": "EUR"},
            line_number=3,
            supported_providers={"aws", "oci"},
            parse_required_float_value=lambda value, field, line: (None, f"Missing {field} at CSV line {line}."),
            parse_optional_datetime_value=lambda value, field, line: (None, None),
            format_provider_error=lambda provider, line, allowed: f"bad provider {provider}",
            format_currency_error=lambda currency, line: f"bad currency {currency} at line {line}",
        )

        self.assertEqual(parsed.errors, ["bad currency EUR at line 3"])

    def test_validate_cost_csv_row_rejects_unsupported_provider(self) -> None:
        parsed = validate_cost_csv_row(
            {"provider": "gcp", "cost_usd": "1", "currency": "USD"},
            line_number=5,
            supported_providers={"aws", "oci"},
            parse_required_float_value=lambda value, field, line: (1.0, None),
            parse_optional_datetime_value=lambda value, field, line: (None, None),
            format_provider_error=lambda provider, line, allowed: f"Unsupported provider '{provider}' at {line}: {', '.join(allowed)}",
            format_currency_error=lambda currency, line: f"bad currency {currency}",
        )

        self.assertEqual(parsed.errors, ["Unsupported provider 'gcp' at 5: aws, oci"])