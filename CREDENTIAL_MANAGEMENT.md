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

Credential metadata is persisted in `credential_records` via SQLAlchemy model `CredentialRecord`:

- `customer_id`
- `provider`
- `credential_json`
- `is_active`
- `is_valid`
- `validation_message`
- `tested_at`
- `created_at`
- `updated_at`

## Security Notes

- Validation errors are returned to client for troubleshooting.
- Auth is JWT-based for user sessions.
- For production, secrets-at-rest should be encrypted with a managed key system (KMS/Vault). Current implementation stores serialized credential payload and should be hardened before handling sensitive production credentials.

## Related Endpoints

- `POST /api/v1/credentials/validate`
- `POST /api/v1/credentials/add`
- `GET /api/v1/credentials?customer_id=...`
- `DELETE /api/v1/credentials/{provider}?customer_id=...`
