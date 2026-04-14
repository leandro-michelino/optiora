# Credential Management

OptiOra validates cloud credentials and stores only sanitized metadata needed for the dashboard workflow.

## Supported Providers

- AWS
- Azure
- GCP
- OCI

## Data Path

```text
Authenticated dashboard user
  |
  | POST /api/v1/credentials/validate
  v
Provider-specific API probe
  |
  | POST /api/v1/credentials/add
  v
Store sanitized metadata in credential_records
```

## Storage Model

Credentials are persisted in `credential_records`.

Stored fields:

- `customer_id`
- `provider`
- `credential_json`
- `is_active`
- `is_valid`
- `validation_message`
- `tested_at`
- `created_at`
- `updated_at`

## What Is Not Stored

- AWS secret access keys
- Azure client secrets
- raw GCP service account JSON
- OCI private keys or config secrets

The backend masks or summarizes credential payloads before writing them to the database.

## Customer Scoping

```text
JWT user -> organization membership -> server derives customer_id -> DB lookup/write
```

- the client may no longer choose an arbitrary `customer_id`
- credentials and scans are scoped to the authenticated user identity
- organization membership endpoints expose the current tenant context for future org switching

## Provider Diagnostics

`GET /api/v1/provider-diagnostics` checks whether the required environment settings are present for AWS, Azure, GCP, and OCI.

The response reports:

- provider name
- configured or missing status
- required setting names
- missing setting names
- operational recommendation

Secret values are never returned.

## Security Notes

- Credential validation is authenticated.
- Validation errors are returned for troubleshooting, but raw secrets are not persisted.
- Provider diagnostics expose configuration names only, not credential values.
- For production, use encrypted volumes and least-privilege cloud IAM roles.
- If you need long-lived secret reuse for automation, integrate Vault/KMS before enabling write actions.

## Related Endpoints

- `POST /api/v1/credentials/validate`
- `POST /api/v1/credentials/add`
- `GET /api/v1/credentials`
- `DELETE /api/v1/credentials/{provider}`
- `GET /api/v1/provider-diagnostics`
