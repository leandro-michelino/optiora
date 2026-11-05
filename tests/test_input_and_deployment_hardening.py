"""Security and deployment regressions found in the November project review."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import jinja2
import pytest
from jose import jwt
from starlette.requests import Request

from optiora_backend import api, auth_utils
from optiora_backend.auth_routes import _client_ip
from optiora_backend.imported_cost_csv import CsvImportError, load_normalized_csv_upload

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    "raw",
    [
        b"provider,cost_usd,Cost_USD\naws,10,999\n",
        b"provider,,cost_usd\naws,unused,10\n",
        b"provider,cost_usd\naws,10,999\n",
        b'provider,cost_usd\naws,"10\n',
        b'provider,cost_usd\naws,"10"garbage\n',
    ],
)
def test_ambiguous_or_malformed_csv_is_a_client_error(raw):
    with pytest.raises(CsvImportError) as error:
        load_normalized_csv_upload("costs.csv", raw)
    assert error.value.status_code == 400


@pytest.mark.parametrize("value", ["nan", "NaN", "inf", "-inf", "1e309"])
def test_imported_numbers_must_be_finite(value):
    parsed, error = api._parse_required_float_value(value, "cost_usd", 2)
    assert parsed is None
    assert "finite number" in error


@pytest.mark.parametrize("value", ["=1+1", "+SUM(1)", "-SUM(1)", "@SUM(1)", "\t=1+1"])
def test_csv_exports_neutralize_text_formulas(value):
    assert api._csv_escape(value) == "\"'" + value + '"'
    assert api._csv_escape(-12.5) == '"-12.5"'


@pytest.mark.parametrize("missing", ["exp", "iat", "sub"])
def test_signed_tokens_require_expiration_issued_at_and_subject(missing):
    now = datetime.now(timezone.utc)
    payload = {"sub": "1", "iat": now, "exp": now + timedelta(minutes=10)}
    del payload[missing]
    token = jwt.encode(payload, auth_utils.SECRET_KEY, algorithm=auth_utils.ALGORITHM)
    assert auth_utils.verify_access_token(token) is None


def test_oversized_login_password_cannot_match_truncated_bcrypt_prefix():
    password = "StrongPass1!" + "x" * 60
    assert len(password.encode()) == 72
    hashed = auth_utils.hash_password(password)
    assert auth_utils.verify_password(password, hashed)
    assert not auth_utils.verify_password(password + "different", hashed)


def test_untrusted_forwarded_header_cannot_change_rate_limit_identity():
    def request(forwarded):
        return Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/login",
                "headers": [(b"x-forwarded-for", forwarded.encode())],
                "client": ("192.0.2.10", 1234),
            }
        )

    assert _client_ip(request("198.51.100.1")) == "192.0.2.10"
    assert _client_ip(request("203.0.113.9")) == "192.0.2.10"


def render_environment(**overrides):
    env = jinja2.Environment(undefined=jinja2.StrictUndefined)
    env.filters["ternary"] = lambda value, yes, no: yes if value else no
    env.filters["bool"] = lambda value: str(value).lower() in {"true", "yes", "1"}
    values = {
        "optiora_secret_key": "test-only",
        "optiora_frontend_url": "http://example.test",
        "optiora_api_url": "http://example.test",
        "optiora_api_port": 8000,
        "optiora_app_dir": "/opt/optiora",
    }
    values.update(overrides)
    template = ROOT / "ansible/roles/optiora_app/templates/optiora.env.j2"
    return dict(
        line.split("=", 1)
        for line in env.from_string(template.read_text()).render(values).splitlines()
        if "=" in line
    )


def test_deployment_explicit_false_disables_default_enabled_features():
    for false_value in (False, "false"):
        rendered = render_environment(
            optiora_generated_secret=SimpleNamespace(stdout="unused"),
            optiora_require_live_provider_data=false_value,
            optiora_oci_runtime_required=false_value,
            optiora_oci_cost_reports_enabled=false_value,
            optiora_enable_scan_scheduler=false_value,
            optiora_enable_api_response_cache=false_value,
        )
        for key in [
            "REQUIRE_LIVE_PROVIDER_DATA",
            "OCI_RUNTIME_REQUIRED",
            "OCI_COST_REPORTS_ENABLED",
            "ENABLE_SCAN_SCHEDULER",
            "ENABLE_API_RESPONSE_CACHE",
        ]:
            assert rendered[key] == "false", key


@pytest.mark.parametrize(
    "tls,domain,expected",
    [
        (False, "", "false"),
        (False, "example.test", "false"),
        (True, "", "false"),
        (True, "example.test", "true"),
    ],
)
def test_cookie_security_matches_configured_tls_front_door(tls, domain, expected):
    rendered = render_environment(
        optiora_generated_secret=SimpleNamespace(stdout="unused"),
        optiora_enable_tls=tls,
        optiora_domain=domain,
    )
    assert rendered["COOKIE_SECURE"] == expected
