"""Shared CSV parsing utilities for imported cost preview and upload flows."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional

MAX_CSV_BYTES = 10 * 1024 * 1024


class CsvImportError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class ParsedCostCsvRow:
    normalized_row: dict[str, str]
    provider: str
    currency: str
    cost_usd: Optional[float]
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    errors: list[str]


def load_normalized_csv_upload(filename: str, raw: bytes) -> tuple[list[str], list[dict[str, str]]]:
    normalized_filename = str(filename or "").strip() or "cost-import.csv"
    if not normalized_filename.lower().endswith(".csv"):
        raise CsvImportError(400, "Only CSV uploads are supported right now.")
    if not raw:
        raise CsvImportError(400, "Uploaded CSV file is empty.")
    if len(raw) > MAX_CSV_BYTES:
        raise CsvImportError(
            413,
            f"CSV file too large ({len(raw):,} bytes). Maximum allowed size is 10 MB.",
        )

    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CsvImportError(400, "CSV upload must be UTF-8 encoded.") from exc

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise CsvImportError(
            400,
            "CSV header row is missing. Expected columns include provider and cost_usd.",
        )

    headers = [str(name or "").strip().lower() for name in reader.fieldnames]
    reader.fieldnames = headers
    rows = [normalize_csv_row(row) for row in reader]
    return headers, rows


def normalize_csv_row(row: dict[object, object]) -> dict[str, str]:
    return {
        str(key or "").strip().lower(): str(value or "").strip()
        for key, value in row.items()
    }


def validate_cost_csv_row(
    normalized_row: dict[str, str],
    *,
    line_number: int,
    supported_providers: set[str],
    parse_required_float_value: Callable[[Optional[str], str, int], tuple[Optional[float], Optional[str]]],
    parse_optional_datetime_value: Callable[[Optional[str], str, int], tuple[Optional[datetime], Optional[str]]],
    format_provider_error: Callable[[str, int, list[str]], str],
    format_currency_error: Callable[[str, int], str],
) -> ParsedCostCsvRow:
    provider = normalized_row.get("provider", "").lower()
    currency = normalized_row.get("currency", "USD").upper() or "USD"
    errors: list[str] = []

    sorted_providers = sorted(supported_providers)
    if provider not in supported_providers:
        errors.append(format_provider_error(provider, line_number, sorted_providers))
        return ParsedCostCsvRow(normalized_row, provider, currency, None, None, None, errors)

    if currency != "USD":
        errors.append(format_currency_error(currency, line_number))
        return ParsedCostCsvRow(normalized_row, provider, currency, None, None, None, errors)

    cost_usd, cost_error = parse_required_float_value(normalized_row.get("cost_usd"), "cost_usd", line_number)
    period_start, period_start_error = parse_optional_datetime_value(
        normalized_row.get("period_start"),
        "period_start",
        line_number,
    )
    period_end, period_end_error = parse_optional_datetime_value(
        normalized_row.get("period_end"),
        "period_end",
        line_number,
    )
    for error in (cost_error, period_start_error, period_end_error):
        if error:
            errors.append(error)

    return ParsedCostCsvRow(
        normalized_row=normalized_row,
        provider=provider,
        currency=currency,
        cost_usd=cost_usd,
        period_start=period_start,
        period_end=period_end,
        errors=errors,
    )