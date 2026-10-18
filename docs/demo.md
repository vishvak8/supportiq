# Local demonstration walkthrough

Run the README setup commands. Seeded accounts use the local `SEED_PASSWORD` in the ignored `.env` file. Existing account passwords are preserved when reseeding; changing `SEED_PASSWORD` does not reset them.

| Organisation   | Administrator             | Agent                     | Customer                     |
| -------------- | ------------------------- | ------------------------- | ---------------------------- |
| Acme Studio    | `admin@acme.example`      | `agent@acme.example`      | `customer@acme.example`      |
| Northstar Labs | `admin@northstar.example` | `agent@northstar.example` | `customer@northstar.example` |

Additional seeded users include `customer2@acme.example` and `customer2@northstar.example`; they have no initial tickets.

## Connected workflows

1. Sign in as `customer@acme.example`, open the existing sample ticket, and create a new request. Reload the page and search for it to demonstrate persistence. Sign in as `customer2@acme.example` and confirm that the other customer's tickets are absent.
2. Sign in as `agent@acme.example`. Open the sample ticket, add a public reply, change priority, assign an active agent, set a status and add a private note. Use a separate customer browser session to confirm the public reply and status are visible while the private note is hidden.
3. Sign in as `admin@acme.example`, open Team, invite an agent, then inspect the generated invitation in Mailpit at http://localhost:8025. Accepting the link creates Agent membership. Administrators can revoke pending invites and deactivate an agent; deactivation blocks access and clears current assignments.
4. Use account recovery to request a reset. The reset link appears in Mailpit. The link expires after one hour and using it invalidates existing sessions.
5. In Knowledge Base, create an article of at least 40 characters or upload a PDF, Markdown or plain-text document. With Ollama and a 768-dimensional embedding model configured, indexing moves the document to Ready and semantic search returns matching excerpts. Edit/delete immediately invalidate prior search chunks. Scanned PDFs are rejected because OCR is not implemented.
6. Open an Acme ticket and draft an AI reply. Inspect citations, edit if needed, approve, then separately send with the current ticket version. This requires `docs/ai-setup.md`; tests use deterministic mocks and do not substitute for live model evaluation.
7. Open Reports to view status and priority, unassigned workload, backlog age, daily ticket creation, first response and resolution summaries.

To demonstrate customer onboarding, administrators can still issue a private customer link from the customer-access panel. The single-use token stays in the URL fragment and grants only CUSTOMER membership.

For the AI portfolio scenario, open an Acme ticket as an agent after an administrator uploads a knowledge document and its status becomes Ready. Generate a draft, inspect its source excerpt, edit it, approve it, and separately choose Send approved reply. The browser screenshot `ai-draft-deterministic.png` is explicitly produced with the deterministic test provider; it is not a live-model result. See the [interview guide](interview-guide.md) for the technical walkthrough.

The public free-tier demo uses the explicit seed after migrations. From the Mac Terminal, `pnpm demo:hosted:verify` builds the local Prisma client, then prompts without echo for the verified Supabase URL and `PUBLIC_DEMO_PASSWORD`. Include `sslmode=verify-full` and the Mac path in `sslrootcert`; the script uses that URL to check `SELECT 1`, checks whether the two demo accounts and seeded articles already exist, and skips seeding when both accounts exist and both articles are `READY`. Otherwise it invokes the guarded additive seed, wakes the Render API, waits for both seeded articles to become `READY`, and exercises hosted customer, agent, private-attachment, and cited-AI flows in Chromium. If Playwright's browser is not installed, run `pnpm exec playwright install chromium` first. The smoke flow creates additional synthetic ticket/reply/attachment records and explicitly sends one reviewed synthetic AI reply; it does not delete data or reset passwords. The seed creates only `demo-agent@supportiq.example` and `demo-customer@supportiq.example` in the synthetic SupportIQ Public Demo organisation, with no administrator account. If either account already exists, its current password is preserved; enter that account's existing password at the prompt. The check consumes one hosted AI draft quota and is intended to be run deliberately, not repeatedly. On failure, the verifier reports the exact browser step, sanitized error, and recent HTTP/network statuses; it omits response bodies, query strings, cookies, passwords, and database URLs. Hosted AI uses Gemini Free and requires `GEMINI_API_KEY`; if the quota is exhausted the service reports temporary unavailability. Google free-tier content may be used to improve products and reviewed by people, so use synthetic data only. Hosted invitations and reset emails are disabled. See [deployment readiness](deployment-readiness.md) before setting up the free services.

## Hosted demo status and access

Live app: [https://supportiq-web-free.onrender.com](https://supportiq-web-free.onrender.com). Demo emails are `demo-agent@supportiq.example` and `demo-customer@supportiq.example`. No password is stored in this guide. Provide a dedicated random demo-only password privately to intended visitors; do not publish it in GitHub, screenshots, issues or public chat, and never reuse a personal password. Do not give visitors database credentials, API keys, invitation links or reset tokens. The hosted seed contains no administrator account.

The user reports hosted verification passed Supabase runtime connectivity and readiness, both seeded knowledge articles reaching READY, customer login and ticket creation, private attachment upload/download with anonymous-access denial, agent public reply and internal-note privacy, and a live Gemini cited draft. The inspected draft cited “Downloading an invoice” and asked the customer for the invoice month, browser name/version and error message. The user then edited it, explicitly approved it and explicitly sent it. This is recorded as user-run hosted verification, not a local check performed by this documentation update.

Hosted administrator document uploads, invitations, password recovery/email delivery, reporting, organisation switching, and other flows not listed above are **not verified**. Hosted invitation and password-reset emails are disabled, and the seeded public demo has no admin account. Render Free services sleep after idle time, so the first page/API request can take roughly a minute to wake; a free Supabase project may also pause after inactivity. Gemini Free can enforce quotas, so a real draft may temporarily be unavailable. The public deployment is a limited portfolio demonstration, not an uptime commitment.

## API and screenshots

Open http://localhost:4000/docs for Swagger UI. Unsafe API calls require the same Origin and CSRF token as the browser client. See `security.md` for the controls.

Playwright creates real screenshots from the running app using synthetic data:

- [Login](screenshots/login.png)
- [Customer requests](screenshots/customer-requests.png)
- [Ticket detail](screenshots/ticket-detail.png)
- [Mobile customer requests](screenshots/customer-mobile.png)
- [Agent reports](screenshots/agent-reports.png)
- [AI draft review (deterministic provider)](screenshots/ai-draft-deterministic.png)
- [AI draft review (real Gemini call, synthetic data)](screenshots/ai-draft-gemini-live.png)

Screenshots use synthetic data only and do not include invitation/reset links or tokens. Tests verify the narrow mobile viewport has no horizontal page overflow.
