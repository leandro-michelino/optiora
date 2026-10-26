"""Regressions found during the project review."""

import json
import os
import subprocess
import sys
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from optiora_backend import api, retention
from optiora_backend import app as app_module
from optiora_backend.auth_routes import _resolve_membership, _validate_password_strength
from optiora_backend.orm_models import Base, Organization, SessionLocal, engine


class ReviewRegressionsTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"ENABLE_AUTH": "true"})
        self.env.start()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.client = TestClient(app_module.app)
        registered = self.client.post(
            "/auth/register",
            json={
                "email": "review@example.com",
                "password": "StrongPass1!",
            },
        )
        self.assertEqual(registered.status_code, 201, registered.text)
        logged_in = self.client.post(
            "/auth/login",
            json={
                "email": "review@example.com",
                "password": "StrongPass1!",
            },
        )
        self.assertEqual(logged_in.status_code, 200, logged_in.text)
        self.tokens = logged_in.json()

    def tearDown(self):
        self.client.close()
        Base.metadata.drop_all(bind=engine)
        self.env.stop()

    def test_cookie_refresh_accepts_no_body_and_rotates_token(self):
        response = self.client.post("/auth/refresh")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotEqual(response.json()["refresh_token"], self.tokens["refresh_token"])
        replay = self.client.post(
            "/auth/refresh",
            json={
                "refresh_token": self.tokens["refresh_token"],
            },
        )
        self.assertEqual(replay.status_code, 401)

    def test_inactive_org_rejected_for_access_refresh_and_login(self):
        with SessionLocal() as db:
            org = db.query(Organization).filter(Organization.owner_id.isnot(None)).first()
            org.is_active = False
            db.commit()
        self.assertEqual(self.client.get("/auth/organization").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/credentials").status_code, 403)
        self.assertEqual(self.client.post("/auth/refresh").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/auth/login",
                json={
                    "email": "review@example.com",
                    "password": "StrongPass1!",
                },
            ).status_code,
            403,
        )

    def test_authenticated_cache_does_not_bypass_membership_checks(self):
        with patch.object(app_module, "_response_cache_enabled", True):
            first = self.client.get("/api/v1/credentials")
            self.assertEqual(first.status_code, 200, first.text)
            with SessionLocal() as db:
                org = db.query(Organization).first()
                org.is_active = False
                db.commit()
            second = self.client.get("/api/v1/credentials")
            self.assertEqual(second.status_code, 403, second.text)


class ReviewHelpersTest(unittest.TestCase):
    def test_secure_cookie_env_false_is_false(self):
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "from optiora_backend.auth_routes import _cookie_kwargs; "
                "assert _cookie_kwargs()['secure'] is False",
            ],
            env={**os.environ, "COOKIE_SECURE": "false"},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_membership_resolution_skips_inactive_org_without_changing_explicit_scope(self):
        inactive = SimpleNamespace(organization_id=1, organization=SimpleNamespace(is_active=False))
        active = SimpleNamespace(organization_id=2, organization=SimpleNamespace(is_active=True))
        user = SimpleNamespace(user_organizations=[inactive, active])
        self.assertIs(_resolve_membership(user, None), active)
        self.assertIsNone(_resolve_membership(user, 1))
        self.assertIsNone(_resolve_membership(user, 999))

    def test_passwords_exceeding_bcrypt_byte_limit_are_rejected(self):
        self.assertIsNone(_validate_password_strength("StrongPass1!"))
        self.assertIsNotNone(_validate_password_strength("StrongPass1!" + "a" * 72))
        self.assertIsNotNone(_validate_password_strength("StrongPass1!" + "é" * 32))

    def test_azure_monitor_metrics_are_queried_and_averaged(self):
        response = SimpleNamespace(
            status_code=200,
            json=lambda: {
                "value": [
                    {
                        "timeseries": [
                            {
                                "data": [
                                    {"average": 10},
                                    {"average": None},
                                    {"average": 30},
                                ]
                            }
                        ]
                    }
                ],
            },
        )
        with patch.object(api.httpx, "get", return_value=response) as get:
            self.assertEqual(
                api._azure_monitor_metric_average(
                    "token", "/subscriptions/sub/resourceGroups/rg", "Percentage CPU"
                ),
                20,
            )
            get.assert_called_once()

    def test_archive_reader_follows_pagination_and_normalizes_offsets(self):
        pages = [
            SimpleNamespace(
                data=SimpleNamespace(
                    objects=[SimpleNamespace(name="page1")], next_start_with="page2"
                )
            ),
            SimpleNamespace(
                data=SimpleNamespace(objects=[SimpleNamespace(name="page2")], next_start_with=None)
            ),
        ]
        rows = {
            "page1": {"organization_id": 7, "period_start": "2026-01-01T00:00:00Z"},
            "page2": {"organization_id": 7, "period_start": "2026-02-01T01:00:00+01:00"},
        }
        from unittest.mock import Mock

        client = Mock()
        client.list_objects.side_effect = pages
        client.get_object.side_effect = lambda **kwargs: SimpleNamespace(
            data=SimpleNamespace(content=json.dumps(rows[kwargs["object_name"]]).encode())
        )
        config = SimpleNamespace(oci_archive_bucket="archive", oci_archive_namespace="ns")
        with patch.object(retention, "_build_object_storage_client", return_value=client):
            results = retention.fetch_archived_period_summaries(
                config,
                7,
                datetime(2026, 1, 1),
                datetime(2026, 3, 1),
            )
        self.assertEqual(len(results), 2)
        self.assertEqual(client.list_objects.call_args_list[1].kwargs["start"], "page2")
