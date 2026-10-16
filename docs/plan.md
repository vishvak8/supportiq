# SupportIQ architecture and delivery plan

SupportIQ is a local-first, organisation-scoped support platform. The pnpm workspace contains a Next.js/React/Tailwind frontend, NestJS REST API, shared Zod contracts, PostgreSQL/Prisma with pgvector, private S3-compatible file storage (MinIO locally), SMTP email (Mailpit locally), and a durable SQL-backed ingestion worker. GitHub Actions configuration runs the same core checks and browser workflows. Hosted CI and public deployment have not been run.

The browser uses a same-origin `/api` proxy to the API. Opaque session tokens are stored as hashes. Every organisation operation checks the current active membership in PostgreSQL. Tenant IDs form composite keys on support data. Customers see only their own tickets and public messages; staff can add private notes, make assignments and change allowed states. Auditable events and optimistic versions protect concurrent edits.

## Implemented areas

1. Foundation: registration, session auth, controlled customer onboarding, ticket create/list/detail, two-tenant seeds.
2. Support workflows: agent inbox, public replies, internal notes, assignments, status transitions, tags, event history, conflict checks.
3. Identity and team: admin invitations, invitation acceptance/revocation, team deactivation/reactivation, password reset, SMTP transport.
4. Private files and knowledge: authenticated ticket attachments; editable articles; private PDF, Markdown, and TXT uploads; delete and retry controls.
5. Ingestion and search: persisted jobs with leases/retries, text extraction and chunking, locally generated embeddings, tenant-scoped pgvector search.
6. AI assistance: local Ollama provider, cited draft persistence, source and ticket-version validation, staff editing, explicit approval and separate send action.
7. Reporting and interface: status/priority/backlog, unassigned/workload, ticket volume, first response, resolution, responsive staff/customer views and accessible labelled controls.
8. Delivery: tests, CI workflow, setup and security documentation, deployment-readiness review, model setup guidance and cost research.

Each capability is connected to its persisted API workflow. AI and email require local configuration; AI drafts are never sent without an explicit staff action. OCR is not implemented. Search and AI remain unavailable until an embedding model is configured and indexed documents are ready.

## Data and trust boundaries

The database is authoritative. UI role checks are convenience only. Passwords use Argon2id; sessions, invitations, reset tokens and customer links store one-way token verifiers. Unsafe browser requests require an exact Origin and signed double-submit CSRF token. Files use random private object keys and authenticated downloads. Retrieval queries only ready chunks from the selected organisation and current document generation. Retrieved document/ticket text is marked untrusted in the model prompt, and citation IDs are checked against the query results before persistence.

The local setup is for synthetic data and review. Production requires the work listed in [deployment readiness](deployment-readiness.md). No cloud resource, public site, paid service, or model was provisioned or downloaded.
