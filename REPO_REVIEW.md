# OptiOra Repository Maintenance Notes

This file is intentionally brief. The authoritative project descriptions now live in:

- `README.md` for product scope, runtime behavior, and main validation commands
- `ARCHITECTURE.md` for system topology and processing flows
- `DEPLOYMENT.md` for OCI deployment and runtime configuration
- `TESTING.md` for backend/frontend verification details
- `NEXT_PHASE.md` for go-live gate and post-1.0 priorities

## Why this file still exists

It keeps a short record of repository-level maintenance themes without duplicating the main docs.

## Current maintenance priorities

1. Keep `finops_mcp/api.py` shrinking by extracting route-adjacent helper logic by domain.
2. Prefer one authoritative explanation per topic instead of repeating architecture or validation guidance across multiple files.
3. Keep backend verification guidance aligned with the current `unittest`-based regression flow.
4. Preserve deterministic analytics as the source of truth and keep GenAI advisory-only.
5. Keep OCI hosting guidance separate from the product's multi-cloud analysis scope.

## Cleanup rules

- Avoid adding new long-form review documents when an existing authoritative doc can be updated instead.
- Treat generated Terraform state/plan artifacts and duplicate local copies as disposable workspace outputs, not project assets.
- Keep Alembic revisions linear before running migration roundtrip tests.
- Re-run focused validation after each local refactor slice instead of batching many unverified edits.
