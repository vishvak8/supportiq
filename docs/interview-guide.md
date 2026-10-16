# SupportIQ interview guide

Use this guide alongside the architecture, security and metrics documents. All demo accounts and records are synthetic.

## Architecture

The web app is a Next.js client backed by a NestJS REST API. Shared Zod contracts define request and response shapes. PostgreSQL stores tenant-scoped tickets, memberships, audit events, knowledge metadata and drafts; pgvector stores 768-dimensional document embeddings. Prisma migrations are forward-only. A database-polling worker claims durable ingestion jobs with row locks, leases, retries and generation checks.

## Sessions, CSRF and organisation isolation

Passwords use Argon2id. The server stores only a hash of each opaque session token and sends the raw token in an HttpOnly, SameSite cookie. Unsafe browser requests also require an Origin check and a CSRF token. Controllers resolve the active organisation and membership on each request; tenant IDs are included in database filters and composite relations. Customers can access only their own tickets. Internal notes are excluded from customer and AI context. Invitations and password-reset tokens are single-use, expiring, and stored as hashes.

## Private files and durable ingestion

Attachments and uploaded knowledge files are stored in a private S3-compatible bucket under random keys. Downloads require an authenticated, authorized API request. Upload creates a database document and ingestion job; the worker claims the job, extracts supported text, writes chunks and embeddings, and marks the current generation Ready. Leases recover abandoned work, bounded retries handle transient provider errors, and replacing or deleting a document invalidates stale chunks. PDF OCR is not implemented; scanned PDFs receive a clear error.

## Retrieval, citations and human approval

Retrieval uses a tenant-filtered pgvector query against Ready documents and current generations. Only public conversation context is provided to the model. The API validates generated JSON and requires every citation to reference a retrieved source. Drafts are persisted separately from messages, remain editable, and do not send when generated or approved. A human must approve and then explicitly send against the current ticket version; stale tickets require a fresh draft.

## Testing and operational boundaries

Jest integration tests use an isolated PostgreSQL database and replace SMTP, object storage and Ollama at provider boundaries. Playwright exercises real browser/API flows and the durable worker with a deterministic local Ollama-compatible test provider. The deterministic provider verifies wiring and workflow assertions, not model quality. Live Ollama evaluation is recorded separately in `ai-setup.md` and `ai-evaluation-results.md`. Local checks do not establish hosted CI, production security, backup recovery or deployment readiness; see `deployment-readiness.md`.
