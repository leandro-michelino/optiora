# OptiOra Roadmap

This roadmap reflects the current repository state, not an earlier pre-auth prototype.

## Implemented

- FastAPI backend with auth, refresh-token rotation, credential metadata storage, and scan-state tracking
- one-time password reset tokens with hashed persistence, expiry, refresh-token revocation, and auth rate limiting
- organization membership endpoints for the authenticated tenant context
- provider diagnostics endpoint for cloud readiness checks without leaking secrets
- backend regression tests covering auth, refresh, password reset, organization membership, customer scoping, and login throttling
- Next.js dashboard with protected routes, login/signup flows, credential/scanning setup, and operations readiness checks
- dashboard password reset request and reset completion screens
- laptop-driven OCI compute deployment
- Terraform OCI network baseline
- Ansible host provisioning for runtime packages, environment, systemd services, dashboard build, and health checks

## High-Priority Next Steps

### 1. Harden production security

- move tokens from localStorage to secure cookies if the deployment model allows it
- add distributed rate limiting for multi-process deployments
- connect password reset delivery to a transactional email provider

### 2. Complete multi-tenant behavior

- switch dashboard data endpoints from user-scoped demo data to org-scoped live data
- expose organization switcher and team-management flows
- align credential ownership with organization boundaries where needed

### 3. Replace remaining provider fallback logic

- remove SDK fallback data paths once live provider integrations are fully wired
- add deeper provider-specific permission probes and richer recommendations

### 4. Expand automated tests

- add credential CRUD tests with mocked provider validators
- add scan approval/progress tests
- add dashboard refresh-token retry tests

## Nice-To-Have

- reverse-proxy / TLS front door for the OCI deployment
- managed database migration path for higher concurrency
- persisted historical cost models after scan results are stored
