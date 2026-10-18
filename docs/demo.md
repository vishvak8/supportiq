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

The public free-tier demo uses the explicit `pnpm db:seed:demo` command after migrations. Configure `ENABLE_PUBLIC_DEMO_SEED=1` and a strong `PUBLIC_DEMO_PASSWORD` in the private server environment first. It creates only `demo-agent@supportiq.example` and `demo-customer@supportiq.example` in the synthetic SupportIQ Public Demo organisation; both share that configured password, and no administrator is seeded. Existing passwords are not reset. The pre-seeded invoice ticket and help articles are synthetic; the API's durable worker must finish indexing the articles before the AI drafting flow is ready. Hosted AI uses Gemini Free and requires `GEMINI_API_KEY`; if the quota is exhausted the service reports temporary unavailability. Google free-tier content may be used to improve products and reviewed by people, so use synthetic data only. Hosted invitations and reset emails are disabled. See [deployment readiness](deployment-readiness.md) before setting up the free services.

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
