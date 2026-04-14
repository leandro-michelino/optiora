# Credential Management

This project validates cloud credentials and persists credential metadata for each customer/provider pair.

## Scope

- Validate: AWS, Azure, GCP, OCI
- Store: provider + customer mapping, validity status, test timestamp, message
- List/Delete: full CRUD for dashboard settings workflow

## Data Path

```text
Dashboard Settings
  |
  +--> POST /api/v1/credentials/validate
  |      - provider-specific API probe
  |
  +--> POST /api/v1/credentials/add
         - persists credential record metadata
         - marks provider active and valid
```

## Storage Model

Credential metadata is persisted in `credential_records` via SQLAlchemy model `CredentialRecord`.
Raw cloud secrets are not persisted; credentials are sanitized before save.

- `customer_id`
- `provider`
- `credential_json` (sanitized metadata only, no raw secrets)
- `is_active`
- `is_valid`
- `validation_message`
- `tested_at`
- `created_at`
- `updated_at`

## Security Notes

- Validation errors are returned to client for troubleshooting.
- Auth is JWT-based for user sessions.
- For production, use encrypted disks/volumes and least-privilege IAM on the OCI host.
- If you need long-lived secret storage, integrate KMS/Vault before enabling automated actions that require secret reuse.

## Related Endpoints

- `POST /api/v1/credentials/validate`
- `POST /api/v1/credentials/add`
- `GET /api/v1/credentials?customer_id=...`
- `DELETE /api/v1/credentials/{provider}?customer_id=...`
