# Implementation status

Updated **2026-10-17**. SupportIQ has connected local workflows for customer support, team administration, private files, knowledge ingestion/search, optional local AI drafting, and staff reporting. Test records and screenshots use synthetic data. These results establish local readiness only; hosted CI and deployment were not run.

## Implemented

- Workspace foundation: Next.js/React/Tailwind, modular NestJS REST API and Swagger, shared Zod contracts, PostgreSQL/Prisma/pgvector, local Docker Compose services, pinned dependencies and CI workflow.
- Identity: Argon2id passwords, hashed expiring sessions, CSRF/Origin checks, throttling, registration, organisation memberships, single-use customer links, agent invitations, invitation revocation/acceptance, membership deactivation/reactivation, and password reset with session revocation.
- Support: customer ticket create/list/detail, agent inbox, public replies, staff-only notes, safe history, same-organisation assignment, tags, priorities, status transitions, optimistic versions and idempotent writes.
- Files and knowledge: private authenticated attachment downloads; article create/edit/delete; PDF, Markdown and TXT uploads to private S3-compatible storage; persisted ingestion jobs, leases/retry, generation invalidation, embeddings, pgvector search and tenant filters. Scanned PDFs receive an explicit OCR-not-supported error.
- AI drafting: Ollama integration; public-context-only retrieval; structured JSON with citations constrained to retrieved IDs and revalidated against current source generations; customer-facing style and requested-detail checks with one bounded rewrite; persisted editable drafts; separate approval and send actions; stale-ticket checks; insufficient-evidence fallback. Drafting never sends automatically.
- Reports: status/priority, active backlog age, unassigned/current workload, ticket volume, first public staff response and resolution summaries. Metric definitions are in `metrics.md`.
- UI: customer and staff workspaces, team/invitation management, account recovery, knowledge controls, AI draft editor, reports and responsive labeled forms. Five Chromium flows exercise customer persistence/private attachments, customer onboarding and workspace switching, agent assignment/notes/reply/status, invitation/password reset, reports, and durable knowledge upload through cited draft editing and explicit send.

## Checks run locally

| Check                       | Result                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`         | Passed after final documentation and code formatting.                                                                                                                                      |
| `pnpm lint`                 | Passed.                                                                                                                                                                                    |
| `pnpm typecheck`            | Passed for contracts, API and web.                                                                                                                                                         |
| `pnpm test:api`             | 36 integration tests passed against isolated `supportiq_api_verify_20261016_test`; includes durable retry, unavailable-provider, tenant-boundary and generation invalidation checks.       |
| `pnpm test:web`             | 4 React Testing Library/Vitest tests passed.                                                                                                                                               |
| `pnpm build`                | Production contracts, API and Next build passed.                                                                                                                                           |
| `pnpm exec playwright test` | 5 Chromium workflows passed against isolated `supportiq_release_check_20261016_test`; Mailpit, MinIO, PostgreSQL and the durable worker were exercised with synthetic data.                |
| `pnpm test:e2e:live`        | 5 Chromium workflows passed against isolated `_test` DB with local Ollama. Answerable, unsupported and one hostile-source prompt scenario completed; see the live evaluation limits below. |
| Fresh migrations            | All six forward migrations applied successfully to several newly created isolated `_test` databases; no reset or schema push was used.                                                     |
| Restart persistence         | API readiness and seeded-user login returned 200/201, then the pre-restart session still returned 200 after a second API process started against the same isolated test database.          |
| Local services              | PostgreSQL, Mailpit and MinIO containers were running; local frontend `/login`, API `/health/ready` and `/docs` returned HTTP 200.                                                         |
| Secret/artifact audit       | `.env` is ignored; tracked-file key-pattern scan found no credential patterns. Screenshots contain synthetic data and no invitation/reset tokens.                                          |

Hosted GitHub Actions has not run. The CI workflow now provisions PostgreSQL, Mailpit, and the same source-built private MinIO service used locally, then uses the deterministic Ollama-compatible provider. Workflow configuration was reviewed against the local commands, but remote CI success is not claimed.

## Live local AI result

After approval, `nomic-embed-text:latest` (274 MB) was installed; existing `llama3.1:8b` (4.9 GB) was reused. Real Ollama embedding returned finite 768-dimensional vectors. A live browser flow completed uploaded-document ingestion, pgvector retrieval, a cited Llama draft, edit, approval and explicit send. A live unsupported telescope query initially received an irrelevant citation at the old `0.35` cutoff. Synthetic Nomic calibration probes scored `0.8009` for an application-style billing query and `0.4844` for an unrelated telescope query; the cutoff is now `0.50`. The final live browser run passed answerable, unsupported, and one hostile-source scenario; the hostile-source draft omitted the synthetic canary and private note. This is a single sample and does not establish general prompt-injection resistance. See `ai-evaluation-results.md` for observed outputs and limits.

The existing synthetic invoice-download ticket was also checked against its ready Acme knowledge document with local Ollama. The final `DRAFT` acknowledged the customer's refresh/sign-in attempts and requested invoice month, browser name/version, and visible error. It cited the source and left the customer-visible message count unchanged. Earlier drafts created during this verification were discarded; earlier user drafts were left untouched. Cross-organisation isolation, private-note exclusion in normal retrieval, attachment/document/draft ownership, retries and deletion/replacement remain deterministic security/workflow checks, not live-model quality results. One live hostile-source case omitted an injected canary and private note, but the sample does not prove broad answer quality or prompt-injection resistance. A simulated Ollama network failure returned a generic 503; the live service itself was not stopped for an outage test.

## Local infrastructure and release status

PostgreSQL, Mailpit and source-built MinIO run locally. Email uses configurable SMTP; local messages appear in Mailpit. Attachments and knowledge objects use a private bucket and random object keys. The Ollama provider is optional. The app is currently running locally at `http://127.0.0.1:3000`; API Swagger is at `http://127.0.0.1:4000/docs`.

No public deployment, GitHub push, cloud resource, DNS record, paid service or external AI API was used. A local embedding model was downloaded after the user's approval. Hosted deployment remains unverified and production use is not approved; see `deployment-readiness.md` and `security.md` for operational and security work still required.

## Historic implementation notes

The initial foundation release and its early verification record were preserved in project commits before these additions. During that work, local PostgreSQL required a separately guarded test database; MinIO's prebuilt images were unavailable from the attempted registries, so local infrastructure builds a pinned official source release. An earlier attempt to reset local databases for a formatting-only cleanup was blocked by Prisma's consent safeguard; no reset occurred and the original migration bytes were restored. The original migration remains unchanged; later migration diffs preserve the custom HNSW vector index that Prisma does not model.

## Publication preparation

On 2026-10-17, local release checks were rerun before publishing: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:api` (36 passed), `pnpm test:web` (4 passed), `pnpm test:e2e` (5 passed), and `pnpm build` all passed. Next.js route types were generated with `pnpm --filter @supportiq/web exec next typegen`. E2E now uses a separate ignored `.next-e2e` directory, and its fixture cleanup is restricted to the guarded test database and its private test objects. The deterministic embedding mock uses token features so source selection remains meaningful across reruns. The AI screenshot was regenerated from the real local browser flow with synthetic customer data; the deterministic provider is identified in the demo guide.

The GitHub CLI browser authentication and hosted Actions run are pending. Repository creation, push and hosted CI results will be recorded only after they actually occur.
