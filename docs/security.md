# Security model and known limits

SupportIQ is an implementation portfolio project tested with synthetic local data. These controls reduce common authorization and data-handling risks; they do not amount to a production audit or certification.

## Organisation access

An authenticated API request must resolve the user's current active membership for the requested organisation. Client-provided organisation IDs only select a scope; they do not grant it. Customer ticket queries additionally filter by customer membership, and inaccessible ticket/attachment IDs return not found. Composite database keys constrain ticket, message, event, attachment, document, chunk, AI draft, tag and invitation relationships to one organisation. Customers receive only their public messages and safe ticket fields. Agents and administrators can view staff-only notes. Team deactivation takes effect on the next request and unassigns the member's tickets.

| Action                                     | Administrator    | Agent            | Customer                           |
| ------------------------------------------ | ---------------- | ---------------- | ---------------------------------- |
| View ticket inbox and staff history        | Own organisation | Own organisation | Own tickets, public history        |
| Reply publicly / add internal note         | Yes              | Yes              | Public reply only                  |
| Assign, transition, tag                    | Yes              | Yes              | No                                 |
| Manage team, invitations, KB and AI drafts | Yes              | No               | No                                 |
| View organisation reports                  | Yes              | Yes              | No                                 |
| Download attachment                        | Own organisation | Own organisation | Own ticket and public message only |

## Credentials, sessions and request integrity

Passwords use Argon2id. Sessions, customer links, team invitations and password-reset tokens use cryptographically random bearer values; only hashes are persisted. Sessions expire and logout or password reset revokes them. Reset responses do not reveal whether an email exists. Invitation acceptance is bound to the invited email and grants Agent membership only. User-facing tokens are not logged. Email delivery failures do not expose account existence.

Cookies are HttpOnly, SameSite=Lax, host-only, and Secure in production. Unsafe requests require an allowed exact Origin and signed double-submit CSRF token. CORS is disabled. The API does not trust forwarded IP headers by default. Database-backed request limits currently use direct socket IP and action buckets; multiple users behind one proxy may share a limit. Production must configure only a known proxy that strips and replaces forwarding headers before enabling proxy trust.

## Files and documents

Attachments are limited in count and size, checked against allowed extensions and basic file signatures, assigned random object keys, and stored in a private bucket. Downloads stream only after authorization, use safe content-disposition and `nosniff`, and do not expose storage URLs. File signature checks are not malware scanning. Production needs private-bucket policies, restricted IAM, retention/deletion operations, backup rules, upload scanning policy and tested size limits. PDF text extraction does not provide OCR; scanned PDFs are rejected. Only PDF, UTF-8 Markdown and plain text are accepted for knowledge uploads.

Document content is untrusted input. It is never executed or interpreted as HTML. The retrieval query checks organisation, document status, deletion and current generation. AI sees public ticket text only; internal notes never enter prompts. Citation identifiers must match retrieved chunks. Low-evidence requests get a human-review fallback. Staff must inspect/edit, explicitly approve and separately send. No automatic send exists. A prompt-injection-resistance test verifies that hostile source text reaches the mock provider only as untrusted content while the system instruction remains intact; this is a regression check, not a guarantee that a live model cannot be manipulated.

## Operational limits and deployment work

User content renders as text. Responses are no-store; logs contain request IDs, method and status, not request bodies, paths, prompts, files, tokens or cookies. API errors avoid database details. Local `.env` is ignored by Git; use `.env.example` as the template and do not paste secrets into logs or documentation.

Before real customer use, complete a security review and address: trusted reverse-proxy behavior and per-account limits; production SMTP and verified sender; database runtime/migration least privilege; CSP nonce tightening; bounded dependency readiness; rate-limit and expired-token cleanup; alerting and retention; backups/restore; object scanning and lifecycle; provider/network isolation for Ollama; secrets manager and rotation; dependency/image review; load, accessibility and browser testing on the chosen deployment topology. No public deployment is configured or authorized.
