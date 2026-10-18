# SupportIQ

A full-stack, organisation-scoped customer-support application with customer and staff workspaces, team administration, a knowledge base, optional local AI drafting, and operational reporting. Built with synthetic data for local review. AI drafts are saved for human review and require separate approval and send actions.

## Live portfolio demo

Open [SupportIQ](https://supportiq-web-free.onrender.com). The hosted synthetic accounts are `demo-agent@supportiq.example` and `demo-customer@supportiq.example`. No password is published in this repository. For safe access, provide a dedicated, high-entropy demo-only password to intended visitors through a private channel; never reuse a personal password or share database credentials, API keys, reset links or invitation tokens. The public seed creates no administrator account.

The user reports successful hosted checks for Supabase runtime connectivity/readiness, both seeded knowledge articles reaching READY, customer sign-in and ticket creation, private attachment upload/download with anonymous access denied, agent public reply and internal-note privacy, and a live Gemini draft with an inspected citation followed by editing, explicit approval and explicit send. The observed draft cited **“Downloading an invoice”** and asked the customer for the invoice month, browser name/version and error message. These are user-run hosted results; they are not claims that every hosted workflow has been tested. Hosted administrator uploads, invitations, password recovery, reporting, organisation switching and other unlisted flows remain unverified.

The public services use free tiers and can sleep when idle. Expect a cold-start delay on the first visit or API request; the database provider can also pause an inactive free project. Gemini free quota is limited, so AI drafting may temporarily be unavailable. Hosted invitation and password-recovery email delivery is disabled. See [deployment limitations and verification](docs/deployment-readiness.md) and the [demo walkthrough](docs/demo.md).

![The running customer workspace](docs/screenshots/customer-requests.png)

## Local setup

Prerequisites: Node **22.18+ on the 22.x line**, pnpm **10.34.7**, Docker Desktop/Engine with Compose. Dependencies are pinned; see [version decisions](docs/versions.md). Core support features need no AI provider. Email uses local Mailpit by default. Knowledge indexing and AI drafting need Ollama plus an installed compatible embedding model; see [AI setup](docs/ai-setup.md).

```sh
npm install --global pnpm@10.34.7
pnpm install --frozen-lockfile
pnpm env:setup
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open **http://localhost:3000**. Use localhost consistently: the configured CSRF origin deliberately rejects 127.0.0.1 as a different browser origin. API Swagger UI: **http://127.0.0.1:4000/docs**, OpenAPI JSON: `/docs-json`. Readiness: `/health/ready`; liveness: `/health/live`.

`env:setup` creates `.env` only if absent, using random local credentials. Existing files are preserved. Open `.env` locally to find `SEED_PASSWORD`; do not share or commit it. Seeded accounts include `customer@acme.example`, `admin@acme.example`, and equivalents for Northstar; [full list and walkthrough](docs/demo.md). Seeding is repeatable and preserves existing passwords. Changing SEED_PASSWORD does not reset existing accounts.

MinIO is built from its official tagged source because both official prebuilt registries rejected image pulls during implementation. The first build downloads a Go toolchain image and dependencies and can take several minutes. It is local development infrastructure. PostgreSQL, Mailpit and MinIO can be started together with `pnpm infra:up`; PostgreSQL and Mailpit can also be started first:

```sh
docker compose --env-file .env -f infra/compose.yml up -d postgres mailpit
# Later, build/start storage:
docker compose --env-file .env -f infra/compose.yml up -d --build minio
```

Infrastructure is bound to loopback: PostgreSQL `5433`, Mailpit UI `8025`/SMTP `1025`, MinIO API `9100`/console `9101`. The application creates/uses a private MinIO bucket on first storage operation. Invite and password-reset messages are delivered to Mailpit; inspect them at http://localhost:8025. Do not expose Mailpit or MinIO publicly.

If a port is occupied, update Compose and the matching local configuration. Docker only runs infrastructure; the Next/Nest processes run on the host. `Ctrl+C` stops development servers. `pnpm infra:down` stops containers and preserves volumes. **Only when you intend to erase local database/storage data**, use `docker compose --env-file .env -f infra/compose.yml down -v`. PostgreSQL initialization creates the separate test database only on a new volume; on a retained pre-existing volume, create `supportiq_test` through `docker compose ... exec postgres createdb -U supportiq supportiq_test` if absent.

## Workflows

1. Register an organisation or sign in to a seeded account. Administrators can create single-use, expiring customer links; customers can join with CUSTOMER access only.
2. Customers create and follow their own tickets. Staff triage the inbox, assign active agents, set tags/priority, transition status, add public replies or private notes, and download authorised attachments.
3. Administrators manage agent invitations and active memberships, password reset, knowledge articles and uploads. Invite/reset messages appear in Mailpit locally.
4. Staff can index articles or PDF/Markdown/TXT documents, retry failed ingestion, and run organisation-scoped semantic search. Scanned PDF OCR is not supported.
5. Configure Ollama per [AI setup](docs/ai-setup.md) to generate a cited draft. Inspect/edit it, approve it, then explicitly send. No automatic send exists.
6. Staff reports show current status/priority, backlog age, workload/unassigned count, daily creation activity, first response and resolution; metric definitions are in [metrics](docs/metrics.md).

## Structure and design

```text
apps/web              Next.js, React, Tailwind; responsive customer/administrator UI
apps/api/src          NestJS identity, support, team, storage, ingestion, AI and reports modules
apps/api/prisma       Schema, checked-in SQL migration and synthetic seeds
packages/contracts    Public Zod request schemas and safe response types
infra                 PostgreSQL/pgvector, source-built MinIO, Mailpit
scripts               Safe local configuration and isolated test setup
.github/workflows     CI passed on GitHub Actions (see progress record)
docs                  Architecture, metrics, security, AI setup, cost estimate, progress and screenshots
```

The browser calls a same-origin `/api` proxy. Nest authorises every protected request against persisted sessions and memberships. Composite foreign keys add a database-level barrier against tenant mixing. Ticket/message/history creation is atomic. A unique customer/request ID makes submission retries safe. Responses project public fields rather than exposing database objects. See [architecture](docs/architecture.md) and [authorisation/security](docs/security.md).

## Verification

Use a **separate database whose name ends in `_test`** in TEST_DATABASE_URL. The API test suite truncates test tables; guards reject the configured development database. Never point either test command at valuable data. Tests replace SMTP, private storage and Ollama at their boundaries; mocked AI cases are not live-model evaluation results.

```sh
pnpm db:generate
pnpm db:test:prepare
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:api
pnpm test:web
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Jest exercises a real PostgreSQL database. React Testing Library/Vitest covers form submissions, pending/error states, and retry identity. Playwright starts isolated servers on localhost:3100 and 127.0.0.1:4100, seeds synthetic test users, and exercises actual UI/API persistence, Mailpit invitations/reset, and durable ingestion. CI uses a deterministic Ollama-compatible test provider; it does not claim live model quality. The AI workflow screenshot is labeled as deterministic. Traces are disabled to keep credentials/tokens out of artifacts. E2E uses a fixed **test-only** seed password.

For a real local provider run, install the models in [AI setup](docs/ai-setup.md), ensure Ollama is reachable, and run `pnpm test:e2e:live` with TEST_DATABASE_URL set to a separate `_test` database. This runs the same upload → ingestion → retrieval → cited draft → edit → approve → explicit send browser flow against Ollama. Results are recorded separately from CI checks.

GitHub Actions runs formatting, lint, types, clean-database migrations, backend/frontend tests, builds and Chromium flows. The latest hosted run [passed](https://github.com/vishvak8/supportiq/actions/runs/38912192489); run details and local AI limits are in the [progress record](docs/progress.md).

## Limitations and delivery

This is not production-ready. Remaining delivery work is listed in [deployment readiness](docs/deployment-readiness.md), including deployment-specific proxy, backups, retention, object scanning, least-privilege credentials, CSP, observability and independent security review. The public GitHub repository is a source-code portfolio only; no application deployment, AWS resources or paid provider was created. The approved embedding model was downloaded locally. A dated, assumption-based AWS planning range and official sources are documented in [deployment readiness](docs/deployment-readiness.md).
