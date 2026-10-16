# Stage 1 authorisation and security

| Operation                            | Administrator                                  | Agent              | Customer         |
| ------------------------------------ | ---------------------------------------------- | ------------------ | ---------------- |
| Read organisation ticket list/detail | All public tickets                             | All public tickets | Own tickets only |
| Create ticket                        | No                                             | No                 | Yes, as self     |
| Create/list customer links           | Yes, own organisation                          | No                 | No               |
| Join with a private link             | Adds CUSTOMER only when no existing membership | Same               | Same             |

Every organisation route authenticates a session then queries membership by userId + requested organisationId. A supplied ID selects a scope to check; it never grants access. Resource detail queries also constrain organisationId and customer ownership. A non-member receives 403; another customer's ticket receives 404. There is no public organisation discovery endpoint. Possessing a portal link gives no access until the join transaction succeeds.

## Sessions, passwords and CSRF

Passwords use Argon2id with 19 MiB memory, two iterations and one lane. Passwords are 12–128 characters. Tokens are 32 cryptographically random bytes, with only SHA-256 verifiers stored in PostgreSQL. Sessions expire after seven days; logout deletes the current session. Password-reset revocation is not implemented until Stage 3.

Cookies are HttpOnly, Path=/, SameSite=Lax. Production uses Secure and __Host- names with no Domain and requires an HTTPS APP_ORIGIN. The browser never handles the session value. A separate HttpOnly cookie holds a random, HMAC-signed CSRF value returned to same-origin JavaScript by /auth/csrf. Every unsafe request, including registration/login/logout, requires that cookie, an equal X-CSRF-Token header with valid signature, and an Origin exactly matching APP_ORIGIN. SameSite is an additional barrier, not the sole defence. CORS is disabled; do not add wildcard credentialed CORS.

The API binds 127.0.0.1 and `trust proxy` is false. Arbitrary X-Forwarded-For is ignored. Current database-backed limits are per direct socket IP and action in 15-minute buckets; proxied browser clients therefore share an IP limit. This is conservative for a local portfolio demo, and can throttle multiple users. Before internet deployment, configure a narrowly trusted reverse proxy that strips/replaces forwarded headers, test that topology, and refine per-account/IP limits. Do not simply trust all proxies. No deployment is approved or claimed.

Customer links expire after 48 hours and are single-use. Only an administrator can issue them for their organisation. The token appears in the URL fragment and POST body; it is never sent as an HTTP path/query or returned from list endpoints. Share it directly. The link is a bearer invitation to customer access, not proof of email ownership. Email verification and administrator revocation UI remain gaps for a production onboarding flow.

## Data handling

User text is rendered as React text, without arbitrary HTML or Markdown interpretation. The current CSP permits Next's inline scripts/styles and development evaluation; a nonce-based production CSP is still a deployment task. No third-party fonts, scripts, or analytics are loaded. Headers include nosniff, no-referrer and frame denial. API responses are no-store. Request logs contain generated request IDs, HTTP methods and status only; no URLs, bodies, tokens, prompts, document contents or cookies. Errors hide database details and include correlation IDs. Bodies are bounded by the framework parser; tickets also have validated text limits.

Zod strict schemas reject extra fields on auth and ticket requests; clients cannot set role, owner or ticket status. Database constraints prevent cross-organisation ticket, message and event references. Customer responses explicitly filter internal messages and omit events/author database fields. Direct API tests exercise these restrictions rather than relying on hidden UI controls.

Remaining security work: role transition table and conflict versions for updates (Stage 2); expiring invitations/reset, email delivery and reset revocation (3); safe authenticated uploads/downloads, MIME validation and scanning limitations (4); ingestion/job isolation and untrusted documents (5); AI prompt/citation isolation (6); final dependency audit, production logging policy, secret rotation, cleanup of expired auth/rate-limit rows, CSP tightening, proxy/load testing and external deployment review (8). No enterprise certification or production hardening is claimed.
