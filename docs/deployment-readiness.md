# Deployment readiness — incomplete

No public deployment has been performed or authorised. Stage 1 builds locally but is not ready for external customer data.

Before Stage 8 completion:

- [ ] Complete stages 2–7 and their acceptance tests.
- [ ] Review dependencies, source-built local MinIO maintenance and production storage choices.
- [ ] Containerise app processes; set internal bind addresses explicitly for that topology.
- [ ] Use one HTTPS origin, private backend/database networks, secure host-only cookies, secret manager and tested trusted proxy settings.
- [ ] Use a dedicated migration role and least-privileged runtime DB role; run `prisma migrate deploy` as a release step against a backed-up database.
- [ ] Rehearse backups, restore, migration rollback/forward recovery, job recovery and storage cleanup.
- [ ] Implement production email transport, verified sender and token-safe logging.
- [ ] Provision a private storage bucket, restricted credentials, attachment authorisation, safe headers, retention policy and documented scanning limitations.
- [ ] Tighten CSP, rate limiting, expired-record cleanup, observability and bounded readiness dependency timeouts.
- [ ] Run hosted CI and deployment smoke/security checks. Local successful commands do not prove cloud CI or deployment success.
- [ ] Produce topology-specific AWS instructions, current dated pricing and cleanup commands. Research official region-specific EC2/ECS, RDS, S3, load balancer, egress, logging and DNS costs; do not assume free-tier eligibility.

An eventual AWS option could run Next and Nest behind one HTTPS reverse proxy, RDS PostgreSQL with pgvector and private S3, plus a transactional email provider. This is an architectural candidate, not a configured deployment or cost estimate. Local MinIO would be replaced by S3; local Mailpit would be replaced by a real mail transport. AI remains optional and must not break support when unavailable.
