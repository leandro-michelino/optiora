"""Tests for dashboard/API response caching."""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from optiora_backend.response_cache import ApiResponseCache, ApiResponseCacheMiddleware


class ResponseCacheTest(unittest.TestCase):
    def _client(self) -> tuple[TestClient, dict[str, int]]:
        calls = {"count": 0}
        app = FastAPI()
        cache = ApiResponseCache(ttl_seconds=300, max_entries=8)
        app.add_middleware(
            ApiResponseCacheMiddleware,
            cache=cache,
            enabled=lambda: True,
        )

        @app.get("/api/v1/example")
        def example() -> dict[str, int]:
            calls["count"] += 1
            return {"count": calls["count"]}

        @app.post("/api/v1/example")
        def mutate() -> dict[str, str]:
            return {"status": "updated"}

        return TestClient(app), calls

    def test_get_json_response_is_cached(self) -> None:
        client, calls = self._client()

        first = client.get("/api/v1/example")
        second = client.get("/api/v1/example")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json(), {"count": 1})
        self.assertEqual(second.json(), {"count": 1})
        self.assertEqual(calls["count"], 1)
        self.assertEqual(second.headers.get("x-optiora-cache"), "HIT")

    def test_force_refresh_bypasses_and_repopulates_cache(self) -> None:
        client, calls = self._client()

        self.assertEqual(client.get("/api/v1/example").json(), {"count": 1})
        refreshed = client.get("/api/v1/example?force_refresh=true")
        cached_after_refresh = client.get("/api/v1/example")

        self.assertEqual(refreshed.json(), {"count": 2})
        self.assertEqual(cached_after_refresh.json(), {"count": 2})
        self.assertEqual(calls["count"], 2)
        self.assertEqual(refreshed.headers.get("x-optiora-cache"), "BYPASS")
        self.assertEqual(cached_after_refresh.headers.get("x-optiora-cache"), "HIT")

    def test_non_api_paths_are_not_cached(self) -> None:
        calls = {"count": 0}
        app = FastAPI()
        app.add_middleware(
            ApiResponseCacheMiddleware,
            cache=ApiResponseCache(ttl_seconds=300, max_entries=8),
            enabled=lambda: True,
        )

        @app.get("/health")
        def health() -> dict[str, int]:
            calls["count"] += 1
            return {"count": calls["count"]}

        client = TestClient(app)
        self.assertEqual(client.get("/health").json(), {"count": 1})
        self.assertEqual(client.get("/health").json(), {"count": 2})

    def test_successful_mutation_invalidates_cached_reads(self) -> None:
        client, calls = self._client()

        self.assertEqual(client.get("/api/v1/example").json(), {"count": 1})
        self.assertEqual(client.get("/api/v1/example").json(), {"count": 1})
        mutation = client.post("/api/v1/example")
        after_mutation = client.get("/api/v1/example")

        self.assertEqual(mutation.status_code, 200)
        self.assertEqual(mutation.headers.get("x-optiora-cache"), "INVALIDATED")
        self.assertEqual(after_mutation.json(), {"count": 2})
        self.assertEqual(calls["count"], 2)


if __name__ == "__main__":
    unittest.main()
