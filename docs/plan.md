# SupportIQ implementation plan

## Architecture

A pnpm workspace with Next.js/React/Tailwind in apps/web, a modular NestJS REST API in apps/api, safe Zod contracts in packages/contracts, local infrastructure in infra, and decisions/status in docs. PostgreSQL and Prisma migrations are the system of record. MinIO and Mailpit are provisioned locally for later stages; no paid services or public deployment.

Browser requests use a same-origin /api proxy to a loopback-only API. Opaque session tokens are hashed in PostgreSQL. Unsafe requests require an allowed Origin plus a signed double-submit CSRF token. Roles come from current database memberships, never client claims. Customer tickets are filtered by organisation and owner before projection.

## Stage 1 entities

User -> Membership <- Organisation; User -> Session. CustomerAccessLink belongs to Organisation and stores only a token hash, expiry, and use limit. Ticket references a customer membership through an organisation-scoped composite foreign key. Ticket creation writes a public Message and TicketEvent transactionally. Future stages add invitations/reset tokens, assignments, attachments, tags, documents/versions/chunks/jobs, and cited AI drafts through migrations.

## Stages

1. Foundation: infrastructure, migrations, registration/session auth, controlled customer joining, own-ticket create/list/detail, two-tenant seeds, security and UI tests.
2. Agent inbox, replies, notes, assignments, transitions and history.
3. Team invitations, password reset and further authentication hardening.
4. Private attachments and knowledge articles.
5. Durable ingestion and tenant-scoped retrieval.
6. Optional local AI drafts, citations, explicit sending and evaluation.
7. Real reporting, accessibility and UI refinement.
8. Final security/CI/deployment documentation, screenshots and demo.

## Stage 1 acceptance

Connected UI/API flows for organisation registration, login/logout/current user, administrator customer links, customer registration/joining, ticket creation and paginated own-ticket list/detail. Persisted sessions expire/revoke. Reject CSRF, unknown fields, unauthenticated access, cross-tenant IDs and another customer's ticket IDs. Seed two synthetic organisations. Run migration, persistence/security tests, frontend interaction tests and customer Playwright flow where available; report actual results.

## Boundaries

No public deployment, GitHub push, paid APIs or model downloads. AI is absent until core workflows are verified. Stage 1 does not claim remaining stages are implemented.
