# Implementation status

## Stage 1 complete — verified locally on 2026-10-16

The initial workspace was empty. No applicable AGENTS.md existed at inspection. Next dev later generated apps/web/AGENTS.md; it is retained, and its local Next documentation guidance was followed for subsequent configuration work. The project is its own local Git repository; no remote, GitHub repository or public deployment was created. No paid provider, model download, or real customer data was used.

Implemented connected behaviour:

- pnpm workspace, exact dependencies/lockfile, Next/React/Tailwind UI, modular Nest REST API and Swagger/OpenAPI.
- PostgreSQL schema and deployable SQL migration, including pgvector extension and tenant-scoped composite foreign keys.
- Organisation registration creates user + organisation + administrator membership atomically.
- Argon2id password hashing, hashed opaque sessions, HttpOnly cookies, expiry, logout revocation, secure production cookie attributes, and authenticated current-user projection.
- Signed double-submit CSRF tokens plus exact Origin checks; PostgreSQL-backed action/IP rate limits.
- Administrator-issued customer links: hashed, 48-hour expiry, single use, concurrent-claim protection. New or existing users join as CUSTOMER only. Existing roles remain unchanged.
- Customer ticket creation, safe request retries, first public message and CREATED event persisted atomically.
- Owner-scoped ticket list/detail with search, status filter, allowlisted sorting, bounded server pagination and explicit public response projections.
- Responsive auth, organisation switcher, customer request list/detail/create, administrator customer access and staff public ticket overview. Loading/error/empty/pending states and labelled forms.
- Two synthetic organisations, six local users, and a sample request per organisation. Password comes from ignored .env; seeds preserve existing accounts.
- Docker Compose infrastructure, synthetic browser screenshots, setup/security/architecture/demo/readiness documentation and GitHub Actions configuration.

## Checks actually executed

Commands were invoked using the local pnpm binary (equivalent to the pnpm commands below). Final code verification completed successfully:

| Check                                           | Observed result                                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation and lockfile generation | Completed; final offline lockfile synchronisation completed                                                                                          |
| `pnpm db:generate`                              | Generated backend-only Prisma client                                                                                                                 |
| `pnpm db:migrate`                               | Applied foundation migration to development PostgreSQL                                                                                               |
| `pnpm db:test:prepare`                          | Applied migration to a separate clean supportiq_test database                                                                                        |
| `pnpm db:seed`                                  | Seeded development data; E2E also seeded isolated test data                                                                                          |
| `pnpm format:check`                             | Passed                                                                                                                                               |
| `pnpm lint`                                     | Passed                                                                                                                                               |
| `pnpm typecheck`                                | Passed for contracts, API and web                                                                                                                    |
| `pnpm test:api`                                 | 24 tests passed against real PostgreSQL; readiness failure uses a deterministic test-only mock                                                       |
| `pnpm test:web`                                 | 3 React Testing Library/Vitest tests passed                                                                                                          |
| `pnpm build`                                    | Contracts, API and Next production build passed                                                                                                      |
| `pnpm test:e2e`                                 | 2 Chromium workflows passed against actual frontend/API/test database                                                                                |
| `pnpm dev`                                      | Both documented development processes started successfully; stopped after smoke check                                                                |
| Local HTTP smoke checks                         | Web /login 200; API /health/ready ready; OpenAPI JSON 3.0.0 with 12 paths                                                                            |
| Infrastructure                                  | PostgreSQL and Mailpit healthy; source-built MinIO running; MinIO readiness and Mailpit UI HTTP 200                                                  |
| Screenshots                                     | Actual desktop login, request list, detail and 390px mobile captures; desktop/mobile list inspected visually; mobile document-width assertion passed |

The two browser tests cover (1) customer login, creation, detail reload, subject search, mobile list, logout/re-login persistence, and (2) administrator registration, issuing a link, customer onboarding in a separate browser context, role-restricted navigation and creation. The backend tests separately attack organisation/ticket identifiers, ownership, public projections, forged CSRF, extra fields, expired/revoked sessions, expired/reused/concurrent customer tokens, and cross-tenant database relationships. They do not prove unimplemented later-stage workflows.

Hosted GitHub Actions has **not** run. No live AI evaluation, AWS estimate, cloud deployment, production security audit, attachment/document/invitation/reset test, or agent-resolution browser test is claimed.

## Encountered blockers and fixes

- Sandbox blocked creating .git; approved local-only escalation initialised the project repository.
- Restricted network blocked initial package reads; approved public-registry dependency download completed.
- Docker daemon initially stopped; Docker Desktop was started. Only SupportIQ containers were created/changed.
- MinIO Docker Hub pull failed with access denied; Quay returned 401. Replaced prebuilt dependency with a successful local build of official tagged source. The old local release is not claimed production-supported.
- Port 9001 was already owned by another application. SupportIQ MinIO uses 9100/9101; unrelated containers were left intact.
- Legacy Prisma client-js generation could not resolve the client in this workspace. Current prisma-client generator with explicit ESM backend-only output succeeded.
- First migration attempt preceded container readiness and failed. After PostgreSQL started, clean development/test migrations succeeded.
- First browser setup leaked test DATABASE_URL to workers; fixed by restoring the original environment after constructing the test database client.
- Browser test found an ambiguous priority selector name; added an explicit accessible name. Final browser workflows passed.

## Remaining stages and next step

**Stage 2 next:** implement the agent inbox actions, public replies, internal notes, eligible assignments, explicit status-transition table, version/conflict handling and customer-safe history. Extend the UI/API together, add migrations as needed, direct API permission/privacy tests, and the customer-create → agent-reply → resolve Playwright workflow.

Stages 3–8 remain incomplete: invitations/password reset/email, attachment authorisation, articles/documents, durable ingestion, retrieval/AI drafts/citations/evaluation, reporting, broad accessibility review and deployment delivery. No controls pretend to implement them. Current ticket conversations are read-only after creation; the UI says replies arrive in Stage 2. Mailpit and MinIO are infrastructure only; no application email/upload flow exists yet.

Known deployment gaps include shared-proxy IP limits, email ownership verification, customer-link revocation UI, expired-record cleanup, CSP tightening, bounded dependency readiness timeouts, least-privilege DB credentials and MinIO maintenance review. See security.md and deployment-readiness.md. No cloud cost figures are invented; current official AWS pricing research is deferred until a concrete deployable architecture exists.

## Local continuation

Read README.md, plan.md, security.md and versions.md. Existing .env is intentionally ignored. Infrastructure is left running with persisted local volumes; development and Playwright server processes were stopped. Start with `./node_modules/.bin/pnpm dev` and open http://localhost:3000. Sign in as customer@acme.example or admin@acme.example with SEED_PASSWORD from .env. The separate supportiq_test database contains synthetic test data and may be truncated by backend tests. Do not use it for valuable data.
