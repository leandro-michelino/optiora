# OptiOra Roadmap

This roadmap reflects the current repository state, not an earlier pre-auth prototype.

## Implemented

- FastAPI backend with auth, refresh-token rotation, credential metadata storage, and scan-state tracking
- Next.js dashboard with protected routes, login/signup flows, credential/scanning setup, and operations readiness checks
- laptop-driven OCI compute deployment
- Terraform OCI network baseline
- Ansible host provisioning for runtime packages, environment, systemd services, dashboard build, and health checks

## High-Priority Next Steps

### 1. Restore backend automated tests

- add API tests for auth, customer scoping, credential CRUD, and scanning progress
- add regression coverage for refresh-token retry behavior

### 2. Harden production security

- move tokens from localStorage to secure cookies if the deployment model allows it
- add rate limiting for login and password reset endpoints
- complete the password reset token flow

### 3. Complete multi-tenant behavior

- switch dashboard data endpoints from user-scoped demo data to org-scoped live data
- expose organization switcher and team-management flows
- align credential ownership with organization boundaries where needed

### 4. Replace remaining provider fallback logic

- remove SDK fallback data paths once live provider integrations are fully wired
- add provider-specific permission diagnostics and richer recommendations

## Nice-To-Have

- reverse-proxy / TLS front door for the OCI deployment
- managed database migration path for higher concurrency
- persisted historical cost models after scan results are stored
