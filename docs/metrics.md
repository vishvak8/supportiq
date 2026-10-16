# Reporting metric definitions

The staff report endpoint is organisation-scoped and uses UTC timestamps. `docs/metrics.md` defines the current interpretation so the dashboard does not imply precision the underlying events cannot provide.

- **Status and priority:** current ticket values at query time. `totalTickets` counts all non-deleted tickets in the organisation.
- **Active backlog and age:** tickets in `OPEN`, `IN_PROGRESS`, or `WAITING_ON_CUSTOMER`; age is elapsed time from ticket creation, grouped as under 24 hours, 1–3 days, and over 3 days. Resolved and closed tickets are excluded.
- **Unassigned/workload:** current assignment, not historical ownership. Inactive agents are omitted; tickets they held are unassigned when deactivated. The unassigned total is reported as its own workload row and field.
- **Created-ticket activity:** `CREATED` events grouped by UTC calendar date for the API's configured rolling period. This measures created requests, not replies or event volume.
- **First response:** elapsed time from ticket creation to the earliest public message authored by an active organisation staff membership. Customer messages and internal notes are excluded. The average is computed only over tickets with a qualifying response; unanswered tickets are counted separately rather than assigned a zero-minute response.
- **Resolution time:** elapsed time from ticket creation to the first event transitioning the ticket to `RESOLVED` or `CLOSED`. Reopening does not erase the first resolution; tickets with no resolution event are excluded from the resolved average and remain in backlog only if their current state is active.

These are operational summaries, not SLA compliance claims. The application does not currently support per-organisation business hours, holidays, paused timers, historical assignee snapshots or an SLA calendar. Dashboard views should be interpreted with those limits in mind.
