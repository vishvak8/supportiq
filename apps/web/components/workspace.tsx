'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Inbox,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  LifeBuoy,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Search,
  Clock3,
  CheckCheck,
  Ticket,
  KeyRound,
  Copy,
  Check,
  LoaderCircle,
  Users,
  BookOpen,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import type {
  CurrentUser,
  MembershipView,
  TicketPage,
  TicketDetail,
  TicketSummary,
} from '@supportiq/contracts';
import { api, apiMethod, apiMultipart, ApiError } from '../lib/api';
import { AuthForm, NewTicketForm, ReplyForm, ErrorBox } from './forms';
const readable = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const date = (value: string) =>
  new Date(value).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <LifeBuoy size={22} />
      </span>
      Support<span className="brand-iq">IQ</span>
    </span>
  );
}
export function Workspace() {
  const router = useRouter();
  const path = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [joining, setJoining] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const value = await api<CurrentUser>('/auth/me');
      setUser(value);
      const stored = sessionStorage.getItem('supportiq-org');
      setActive((old) =>
        value.memberships.some((m) => m.organisation.id === old)
          ? old
          : value.memberships.find((m) => m.organisation.id === stored)
              ?.organisation.id ||
            value.memberships[0]?.organisation.id ||
            '',
      );
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setError(e instanceof Error ? e.message : 'Unable to connect');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (path === '/join' || path === '/invite') {
      setJoinToken(window.location.hash.slice(1));
    }
  }, [path]);
  useEffect(() => {
    if (
      !loading &&
      !error &&
      !user &&
      ![
        '/login',
        '/register',
        '/join',
        '/invite',
        '/forgot-password',
        '/reset',
      ].includes(path)
    )
      router.replace('/login');
  }, [loading, error, user, path, router]);
  async function auth(data: Record<string, string>, mode: string) {
    const result = await api<CurrentUser>(
      '/auth/' + mode,
      mode === 'join' ? { ...data, token: joinToken } : data,
    );
    setUser(result);
    setActive(result.memberships[0]?.organisation.id || '');
    router.push('/');
  }
  if (loading)
    return (
      <main className="loading-screen" role="status">
        <Brand />
        <LoaderCircle className="spin" /> Opening your workspace…
        {process.env.NEXT_PUBLIC_GEMINI_DEMO === 'true' && (
          <span className="cold-start-note">
            Free services can take about a minute to wake after idle.
          </span>
        )}
      </main>
    );
  if (!user) {
    if (path === '/forgot-password' || path === '/reset')
      return <RecoveryPage path={path} />;
    if (path === '/invite') return <InvitationPage token={joinToken} />;
    const mode =
      path === '/register' ? 'register' : path === '/join' ? 'join' : 'login';
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <Link href="/login">
            <Brand />
          </Link>
          <div>
            <span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span>
            <h1>
              Good support.
              <br />
              Starts with a<br />
              <span>conversation.</span>
            </h1>
            <p>
              A shared place for questions, answers, and the people behind them.
            </p>
            <div className="story-card">
              <span className="story-avatar">JC</span>
              <div>
                <strong>One request. All the context.</strong>
                <p>Your conversations, kept together.</p>
              </div>
              <CheckCheck size={22} />
            </div>
          </div>
          <p className="story-footer">
            SupportIQ / Customer support, connected.
          </p>
        </section>
        <section className="auth-main">
          <div className="auth-card">
            <span className="small-label">
              {mode === 'login'
                ? 'WELCOME BACK'
                : mode === 'register'
                  ? 'YOUR TEAM’S NEXT CHAPTER'
                  : 'YOU’RE IN THE RIGHT PLACE'}
            </span>
            <h2>
              {mode === 'login'
                ? 'Sign in to your workspace'
                : mode === 'register'
                  ? 'Make room for better support'
                  : 'Let’s get you connected'}
            </h2>
            <p className="muted">
              {mode === 'login'
                ? 'Pick up the conversation where you left off.'
                : mode === 'register'
                  ? 'Create an organisation and its administrator account.'
                  : 'Use your private invitation to join as a customer.'}
            </p>
            {error && (
              <>
                <ErrorBox message={error} />
                <button
                  className="text-button"
                  onClick={() => {
                    setError('');
                    void refresh();
                  }}
                >
                  Retry connection
                </button>
              </>
            )}
            {mode === 'join' && !/^[a-f0-9]{64}$/.test(joinToken) ? (
              <ErrorBox message="A valid private join link is required. Ask your support team for a new link." />
            ) : (
              <AuthForm
                mode={mode}
                submit={(data) =>
                  auth(data, mode === 'register' ? 'register' : mode)
                }
              />
            )}
            <p className="auth-note">
              <ShieldCheck size={15} /> Your workspace stays private.
            </p>
            {mode === 'login' && (
              <p className="field-help">
                Joining a support portal? Open the private link your support
                team shared.
              </p>
            )}
          </div>
          <span className="auth-bottom">
            A portfolio application · Synthetic data only
          </span>
        </section>
      </main>
    );
  }
  if (path === '/join')
    return (
      <main className="join-existing">
        <Brand />
        <h1>Join a support portal</h1>
        <p>Signed in as {user.email}. This link grants customer access only.</p>
        {error && <ErrorBox message={error} />}
        <button
          className="primary"
          disabled={joining || !/^[a-f0-9]{64}$/.test(joinToken)}
          onClick={async () => {
            setJoining(true);
            setError('');
            try {
              const u = await api<CurrentUser>('/auth/join-existing', {
                token: joinToken,
              });
              setUser(u);
              setActive(u.memberships.at(-1)?.organisation.id || active);
              router.push('/');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unable to join');
            } finally {
              setJoining(false);
            }
          }}
        >
          Join as customer
        </button>
        <Link href="/">Back to workspace</Link>
      </main>
    );
  const member = user.memberships.find((m) => m.organisation.id === active);
  if (!member)
    return (
      <main className="loading-screen">
        <ErrorBox message="No organisation membership found. Sign out and contact your support team." />
        <button
          onClick={async () => {
            await api('/auth/logout', {});
            setUser(null);
          }}
        >
          Sign out
        </button>
      </main>
    );
  const isCustomer = member.role === 'CUSTOMER';
  if (path === '/invite')
    return <InvitationPage token={joinToken} currentUser={user} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="logo-link">
          <Brand />
        </Link>
        <div className="org-picker">
          <label htmlFor="organisation">WORKSPACE</label>
          <select
            id="organisation"
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              sessionStorage.setItem('supportiq-org', e.target.value);
              router.push('/');
            }}
          >
            {user.memberships.map((m) => (
              <option value={m.organisation.id} key={m.id}>
                {m.organisation.name}
              </option>
            ))}
          </select>
          <span className="role-tag">{readable(member.role)}</span>
        </div>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <Link className={path !== '/access' ? 'active' : ''} href="/">
            <Inbox size={19} />
            {isCustomer ? 'My requests' : 'Ticket overview'}
            <ChevronRight size={15} />
          </Link>
          {member.role === 'ADMINISTRATOR' && (
            <Link className={path === '/access' ? 'active' : ''} href="/access">
              <KeyRound size={19} />
              Customer access
            </Link>
          )}
          {!isCustomer && (
            <>
              <Link className={path === '/team' ? 'active' : ''} href="/team">
                <Users size={19} /> Team
              </Link>
              <Link
                className={path === '/knowledge' ? 'active' : ''}
                href="/knowledge"
              >
                <BookOpen size={19} /> Knowledge base
              </Link>
              <Link
                className={path === '/reports' ? 'active' : ''}
                href="/reports"
              >
                <BarChart3 size={19} /> Reports
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <span className="online-dot" />
            Core support workspace
            <p>
              Private by design.
              <br />
              Human at the heart.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <span>{readable(member.role)}</span>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api('/auth/logout', {});
                  setUser(null);
                  router.push('/login');
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'Unable to sign out',
                  );
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {path === '/access' ? 'Customer access' : 'Support requests'}
            </strong>
          </div>
          <span className="privacy">
            <ShieldCheck size={14} /> Private workspace
          </span>
        </header>
        <main className="content">
          {error && <ErrorBox message={error} />}
          <TicketArea key={active} member={member} path={path} />
        </main>
        <footer className="app-footer">
          <span>Thoughtful support, one conversation at a time.</span>
          <span>SupportIQ · Customer support platform</span>
        </footer>
      </div>
    </div>
  );
}
function TicketArea({
  member,
  path,
}: {
  member: MembershipView;
  path: string;
}) {
  const router = useRouter();
  const base = `/organisations/${member.organisation.id}`;
  const customer = member.role === 'CUSTOMER';
  if (path === '/access')
    return member.role === 'ADMINISTRATOR' ? (
      <CustomerAccess base={base} />
    ) : (
      <ErrorBox message="Administrator access required." />
    );
  if (path === '/team')
    return customer ? (
      <ErrorBox message="Staff access required." />
    ) : (
      <TeamManagement base={base} member={member} />
    );
  if (path === '/knowledge')
    return customer ? (
      <ErrorBox message="Staff access required." />
    ) : (
      <KnowledgeBase base={base} member={member} />
    );
  if (path === '/reports')
    return customer ? (
      <ErrorBox message="Staff access required." />
    ) : (
      <Reports base={base} />
    );
  if (path === '/tickets/new')
    return customer ? (
      <>
        <Link className="back-link" href="/">
          <ArrowLeft size={15} /> All requests
        </Link>
        <div className="page-heading">
          <span className="small-label">LET’S WORK THROUGH IT</span>
          <h1>Create a support request</h1>
          <p>Give your support team the details they need to help.</p>
        </div>
        <section className="panel new-ticket">
          <NewTicketForm
            submit={async (data) => {
              const t = await api<TicketSummary>(base + '/tickets', data);
              router.push('/tickets/' + t.id);
              return t;
            }}
          />
        </section>
      </>
    ) : (
      <ErrorBox message="Ticket creation requires customer access." />
    );
  if (path.startsWith('/tickets/'))
    return (
      <TicketConversation
        key={path}
        base={base}
        id={path.split('/')[2]}
        member={member}
      />
    );
  if (!['/', '/login', '/register'].includes(path))
    return (
      <>
        <h1>Page not found</h1>
        <Link href="/">Return to requests</Link>
      </>
    );
  return (
    <TicketList
      base={base}
      customer={customer}
      name={member.organisation.name}
    />
  );
}
function TicketList({
  base,
  customer,
  name,
}: {
  base: string;
  customer: boolean;
  name: string;
}) {
  const [data, setData] = useState<TicketPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError('');
    api<TicketPage>(
      base +
        '/tickets?' +
        new URLSearchParams({
          page: String(page),
          search,
          sort,
          ...(status ? { status } : {}),
        }),
    )
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [base, page, search, status, sort, revision]);
  return (
    <>
      <div className="page-heading heading-row">
        <div>
          <span className="small-label">
            {customer ? 'YOUR SUPPORT, IN ONE PLACE' : name.toUpperCase()}
          </span>
          <h1>
            {customer ? 'My requests' : 'Ticket overview'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {customer
              ? 'A clear view of every conversation. We’re here to help.'
              : 'Your organisation’s customer requests, assignment and status history.'}
          </p>
        </div>
        {customer && (
          <Link className="primary" href="/tickets/new">
            <Plus size={18} /> New request
          </Link>
        )}
      </div>
      <section className="welcome-strip">
        <span className="welcome-icon">
          <LifeBuoy size={28} />
        </span>
        <div>
          <strong>A little context makes a big difference.</strong>
          <p>
            Share what happened and what you need. Keep the conversation
            together.
          </p>
        </div>
        <span className="strip-mark">
          HERE TO HELP <ArrowUpRight size={17} />
        </span>
      </section>
      <section className="panel inbox-panel">
        <div className="panel-heading">
          <div>
            <h2>
              {customer ? 'Your conversations' : 'Customer conversations'}
            </h2>
            <span className="count">{data && !busy ? data.total : '—'}</span>
          </div>
          <span className="subtle-label">
            {customer
              ? 'Only visible to you and your support team'
              : 'Organisation access verified'}
          </span>
        </div>
        <div className="filters">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(input);
            }}
          >
            <Search size={17} />
            <input
              aria-label="Search requests"
              placeholder="Search by subject…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={100}
            />
            <button className="search-button" type="submit">
              Search
            </button>
          </form>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              'OPEN',
              'IN_PROGRESS',
              'WAITING_ON_CUSTOMER',
              'RESOLVED',
              'CLOSED',
            ].map((s) => (
              <option key={s} value={s}>
                {readable(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort requests"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        {error ? (
          <div className="state">
            <ErrorBox message={error} />
            <button
              className="secondary"
              onClick={() => setRevision((v) => v + 1)}
            >
              Try again
            </button>
          </div>
        ) : busy ? (
          <div className="state" role="status">
            <LoaderCircle className="spin" size={22} /> Loading conversations…
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="ticket-table">
              <div className="table-head">
                <span>REQUEST</span>
                <span>STATUS</span>
                <span>PRIORITY</span>
                <span>CREATED</span>
                <span />
              </div>
              {data.items.map((t) => (
                <Link
                  className="ticket-row"
                  key={t.id}
                  href={'/tickets/' + t.id}
                >
                  <div className="request-cell">
                    <span className="ticket-icon">
                      <Ticket size={19} />
                    </span>
                    <div>
                      <strong>{t.subject}</strong>
                      <span>#{t.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <span className={'status status-' + t.status.toLowerCase()}>
                    <i />
                    {readable(t.status)}
                  </span>
                  <span
                    className={'priority priority-' + t.priority.toLowerCase()}
                  >
                    <span>▰</span>
                    {readable(t.priority)}
                  </span>
                  <time dateTime={t.createdAt}>{date(t.createdAt)}</time>
                  <ChevronRight size={17} />
                </Link>
              ))}
            </div>
            <div className="pagination">
              <span>
                {data.total} request{data.total !== 1 ? 's' : ''} · Page {page}{' '}
                of {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </span>
              <div>
                <button
                  className="secondary compact"
                  disabled={page === 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Previous
                </button>
                <button
                  className="secondary compact"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((v) => v + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="state empty">
            <span className="empty-icon">
              <Inbox size={28} />
            </span>
            <h3>
              {search || status
                ? 'No matching requests'
                : 'Every conversation starts somewhere'}
            </h3>
            <p>
              {search || status
                ? 'Try another subject or status.'
                : 'Your support requests will appear here, with all the details in one place.'}
            </p>
            {customer && !search && !status && (
              <Link className="primary" href="/tickets/new">
                <Plus size={17} /> Create your first request
              </Link>
            )}
          </div>
        )}
      </section>
      <div className="under-note">
        <ShieldCheck size={16} />
        <p>
          Your requests are private to your organisation. Please use synthetic
          data in this portfolio application.
        </p>
      </div>
    </>
  );
}
const nextStatuses: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED'],
  IN_PROGRESS: ['OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED'],
  WAITING_ON_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};
function TicketConversation({
  base,
  id,
  member,
}: {
  base: string;
  id: string;
  member: MembershipView;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [agents, setAgents] = useState<
    { id: string; user: { name: string } }[]
  >([]);
  const [agentError, setAgentError] = useState('');
  const [tagOptions, setTagOptions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [aiDrafts, setAiDrafts] = useState<
    {
      id: string;
      body: string;
      ticketVersion: number;
      edited: boolean;
      citations: { sourceId: string; title: string; excerpt: string }[];
      insufficientEvidence: boolean;
      status: string;
    }[]
  >([]);
  const [aiError, setAiError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const customer = member.role === 'CUSTOMER';
  useEffect(() => {
    let live = true;
    setError('');
    api<TicketDetail>(base + '/tickets/' + id)
      .then((t) => {
        if (live) setTicket(t);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    if (!customer)
      api<typeof agents>(base.replace('/tickets', '') + '/agents')
        .then((v) => {
          if (live) setAgents(v);
        })
        .catch((e) => {
          if (live) setAgentError(e.message);
        });
    if (!customer)
      api<typeof aiDrafts>(base + '/tickets/' + id + '/ai-drafts')
        .then((values) => {
          if (live) setAiDrafts(values);
        })
        .catch(() => undefined);
    if (!customer)
      api<typeof tagOptions>(base.replace('/tickets', '') + '/tags')
        .then((values) => {
          if (live) setTagOptions(values);
        })
        .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [base, id, retry, customer]);
  async function reply(data: {
    body: string;
    internal: boolean;
    requestId: string;
    expectedVersion: number;
    files: File[];
  }) {
    if (data.files.length) {
      const form = new FormData();
      form.set('body', data.body);
      form.set('internal', String(data.internal));
      form.set('requestId', data.requestId);
      form.set('expectedVersion', String(data.expectedVersion));
      data.files.forEach((file) => form.append('files', file));
      await apiMultipart(base + '/tickets/' + id + '/attachments', form);
      const latest = await api<TicketDetail>(base + '/tickets/' + id);
      setTicket(latest);
      return;
    }
    const messageData = {
      body: data.body,
      internal: data.internal,
      requestId: data.requestId,
      expectedVersion: data.expectedVersion,
    };
    const result = await api<{
      id: string;
      body: string;
      internal?: boolean;
      createdAt: string;
      author: { name: string };
      version: number;
    }>(base + '/tickets/' + id + '/messages', messageData);
    setTicket((old) =>
      old
        ? {
            ...old,
            version: result.version,
            status:
              old.status === 'WAITING_ON_CUSTOMER' && customer
                ? 'IN_PROGRESS'
                : old.status,
            updatedAt: result.createdAt,
            messages: [
              ...old.messages,
              {
                id: result.id,
                body: result.body,
                internal: result.internal,
                createdAt: result.createdAt,
                author: result.author,
                attachments: [],
              },
            ],
          }
        : old,
    );
  }
  async function createAiDraft() {
    if (!ticket) return;
    setAiBusy(true);
    setAiError('');
    try {
      const draft = await api<(typeof aiDrafts)[number]>(
        base + '/tickets/' + id + '/ai-drafts',
        {},
      );
      setAiDrafts((old) => [draft, ...old]);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Unable to create a draft');
    } finally {
      setAiBusy(false);
    }
  }
  async function reviewDraft(draftId: string, body: string) {
    try {
      await apiMethod<(typeof aiDrafts)[number]>(
        base + '/tickets/' + id + '/ai-drafts/' + draftId,
        'PATCH',
        { body },
      );
      const updated = await api<(typeof aiDrafts)[number]>(
        base + '/tickets/' + id + '/ai-drafts/' + draftId + '/approve',
        {},
      );
      setAiDrafts((old) =>
        old.map((draft) => (draft.id === draftId ? updated : draft)),
      );
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Unable to approve draft');
    }
  }
  async function sendDraft(draftId: string) {
    if (!ticket) return;
    try {
      await api(base + '/tickets/' + id + '/ai-drafts/' + draftId + '/send', {
        expectedVersion: ticket.version,
      });
      setTicket(await api<TicketDetail>(base + '/tickets/' + id));
      setAiDrafts((old) =>
        old.map((draft) =>
          draft.id === draftId ? { ...draft, status: 'SENT' } : draft,
        ),
      );
    } catch (e) {
      setAiError(
        e instanceof Error ? e.message : 'Unable to send approved reply',
      );
    }
  }
  async function change(fields: Record<string, unknown>) {
    if (!ticket) return;
    setError('');
    try {
      const updated = await apiMethod<TicketSummary>(
        base + '/tickets/' + id,
        'PATCH',
        {
          ...fields,
          expectedVersion: ticket.version,
        },
      );
      if (Object.hasOwn(fields, 'tagIds'))
        setTicket(await api<TicketDetail>(base + '/tickets/' + id));
      else setTicket((old) => (old ? { ...old, ...updated } : old));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update this ticket');
    }
  }
  return (
    <>
      <Link className="back-link" href="/">
        <ArrowLeft size={15} /> All requests
      </Link>
      {error && !ticket ? (
        <>
          <ErrorBox message={error} />
          <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </button>
        </>
      ) : !ticket ? (
        <div className="state" role="status">
          Loading conversation…
        </div>
      ) : (
        <>
          <div className="page-heading">
            <span className="small-label">
              REQUEST #{ticket.id.slice(0, 8)}
            </span>
            <h1>{ticket.subject}</h1>
            <p>
              Created {date(ticket.createdAt)} · Last updated{' '}
              {date(ticket.updatedAt)} · Version {ticket.version}
            </p>
          </div>
          {error && <ErrorBox message={error} />}
          <div className="conversation-grid">
            <div className="conversation-column">
              <section className="panel conversation">
                <div className="panel-heading">
                  <h2>Conversation</h2>
                  <span className="subtle-label">
                    {customer
                      ? 'Public messages'
                      : 'Public replies and private notes'}
                  </span>
                </div>
                {ticket.messages.map((m) => (
                  <article
                    className={
                      'message ' + (m.internal ? 'message-internal' : '')
                    }
                    key={m.id}
                  >
                    <div className="message-head">
                      <span className="avatar">
                        {m.author.name.slice(0, 1)}
                      </span>
                      <strong>{m.author.name}</strong>
                      {m.internal && (
                        <span className="internal-label">INTERNAL NOTE</span>
                      )}
                      <time dateTime={m.createdAt}>{date(m.createdAt)}</time>
                    </div>
                    <p>{m.body}</p>
                    {m.attachments.length > 0 && (
                      <ul
                        className="message-attachments"
                        aria-label="Attachments"
                      >
                        {m.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <a
                              href={`/api/organisations/${member.organisation.id}/tickets/attachments/${attachment.id}`}
                              download
                            >
                              {attachment.originalName}
                            </a>
                            <span>
                              {Math.max(
                                1,
                                Math.ceil(attachment.byteSize / 1024),
                              )}{' '}
                              KB
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
                <div className="conversation-note">
                  <Clock3 size={18} />
                  <p>
                    {ticket.status === 'CLOSED'
                      ? 'This request is closed. Staff can reopen it if more help is needed.'
                      : customer
                        ? 'Your reply will be shared with the support team.'
                        : 'Check the customer’s context before replying.'}
                  </p>
                </div>
              </section>
              {ticket.status !== 'CLOSED' && (
                <section className="panel reply-panel">
                  <div className="panel-heading">
                    <h2>
                      {customer ? 'Reply to the support team' : 'Add a message'}
                    </h2>
                    {!customer && (
                      <span className="subtle-label">
                        Internal notes stay private
                      </span>
                    )}
                  </div>
                  <ReplyForm
                    key={ticket.version}
                    customer={customer}
                    version={ticket.version}
                    submit={reply}
                  />
                </section>
              )}
              <section className="panel history-panel">
                <div className="panel-heading">
                  <h2>Ticket history</h2>
                  <span className="subtle-label">
                    {ticket.events.length} recorded changes
                  </span>
                </div>
                {ticket.events.length ? (
                  ticket.events.map((e) => (
                    <div className="history-event" key={e.id}>
                      <span
                        className={
                          'history-dot ' +
                          (e.kind === 'INTERNAL_NOTE' ? 'dot-private' : '')
                        }
                      />
                      <div>
                        <strong>{eventLabel(e.kind, e.detail)}</strong>
                        <p>
                          {e.actor.name} · {date(e.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="history-empty">No recorded changes yet.</div>
                )}
              </section>
              {!customer && (
                <section className="panel ai-panel">
                  <div className="panel-heading">
                    <h2>
                      <Sparkles size={17} /> AI reply drafting
                    </h2>
                    <span className="subtle-label">
                      Never sent automatically
                    </span>
                  </div>
                  <div className="ai-content">
                    <p>
                      Drafts use this organisation’s ready knowledge articles
                      and public conversation only.
                    </p>
                    {process.env.NEXT_PUBLIC_GEMINI_DEMO === 'true' && (
                      <p className="privacy-note">
                        Public demo notice: ticket text, selected source
                        excerpts, and generated drafts are sent to Google
                        Gemini’s free API. Google may use this content to
                        improve its products and human reviewers may process it.
                        Use synthetic information only; never enter real
                        customer or sensitive data.
                      </p>
                    )}
                    {aiError && <ErrorBox message={aiError} />}
                    <button
                      className="secondary"
                      disabled={aiBusy}
                      onClick={() => void createAiDraft()}
                    >
                      {aiBusy
                        ? 'Preparing a cited draft…'
                        : 'Draft a reply with AI'}
                    </button>
                    {aiDrafts.map((draft) => (
                      <article className="ai-draft" key={draft.id}>
                        <div className="ai-draft-head">
                          <strong>
                            Draft · {readable(draft.status)}
                            {draft.edited ? ' · edited' : ''}
                          </strong>
                          {draft.insufficientEvidence && (
                            <span className="status status-waiting_on_customer">
                              Insufficient sources
                            </span>
                          )}
                        </div>
                        {draft.status === 'DRAFT' ? (
                          <textarea
                            aria-label="Edit AI draft"
                            value={draft.body}
                            onChange={(event) =>
                              setAiDrafts((old) =>
                                old.map((value) =>
                                  value.id === draft.id
                                    ? { ...value, body: event.target.value }
                                    : value,
                                ),
                              )
                            }
                            rows={6}
                          />
                        ) : (
                          <p className="ai-draft-body">{draft.body}</p>
                        )}
                        {draft.citations.map((citation) => (
                          <details key={citation.sourceId}>
                            <summary>{citation.title} · cited source</summary>
                            <blockquote>{citation.excerpt}</blockquote>
                          </details>
                        ))}
                        {draft.status === 'DRAFT' && (
                          <button
                            className="primary"
                            onClick={() =>
                              void reviewDraft(draft.id, draft.body)
                            }
                          >
                            I reviewed this draft · approve
                          </button>
                        )}
                        {draft.status === 'APPROVED' && (
                          <button
                            className="primary"
                            onClick={() => void sendDraft(draft.id)}
                          >
                            Send approved reply
                          </button>
                        )}
                        {draft.status === 'SENT' && (
                          <span className="field-help">
                            Sent as a public reply.
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <aside className="panel detail-aside">
              <h2>Request details</h2>
              <dl>
                <dt>Status</dt>
                <dd>
                  <span
                    className={'status status-' + ticket.status.toLowerCase()}
                  >
                    <i />
                    {readable(ticket.status)}
                  </span>
                </dd>
                <dt>Priority</dt>
                <dd className="capitalize">{readable(ticket.priority)}</dd>
                {!customer && (
                  <>
                    <dt>Customer</dt>
                    <dd>{ticket.customer?.name || 'Customer'}</dd>
                    <dt>Assigned agent</dt>
                    <dd>{ticket.assignee?.user.name || 'Unassigned'}</dd>
                  </>
                )}
                <dt>Reference</dt>
                <dd>#{ticket.id.slice(0, 8)}</dd>
                <dt>Version</dt>
                <dd>{ticket.version}</dd>
              </dl>
              {!customer && (
                <div className="staff-controls">
                  <label htmlFor="ticket-status">Status</label>
                  <select
                    id="ticket-status"
                    aria-label="Ticket status"
                    value={ticket.status}
                    onChange={(e) => void change({ status: e.target.value })}
                  >
                    <option value={ticket.status}>
                      {readable(ticket.status)}
                    </option>
                    {(nextStatuses[ticket.status] || []).map((status) => (
                      <option value={status} key={status}>
                        {readable(status)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="ticket-priority">Priority</label>
                  <select
                    id="ticket-priority"
                    aria-label="Ticket priority"
                    value={ticket.priority}
                    onChange={(e) => void change({ priority: e.target.value })}
                  >
                    {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((v) => (
                      <option key={v} value={v}>
                        {readable(v)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="ticket-assignee">Assign to agent</label>
                  {agentError && <ErrorBox message={agentError} />}
                  <select
                    id="ticket-assignee"
                    aria-label="Assign to agent"
                    value={ticket.assignee?.id || ''}
                    onChange={(e) =>
                      void change({ assigneeId: e.target.value || null })
                    }
                  >
                    <option value="">Unassigned</option>
                    {agents.map((agent) => (
                      <option value={agent.id} key={agent.id}>
                        {agent.user.name}
                      </option>
                    ))}
                  </select>
                  <label>Tags</label>
                  <div className="tag-picker" aria-label="Ticket tags">
                    {tagOptions.map((tag) => (
                      <label key={tag.id}>
                        <input
                          type="checkbox"
                          checked={ticket.tags.some(
                            (value) => value.id === tag.id,
                          )}
                          onChange={(event) => {
                            const current = ticket.tags.map(
                              (value) => value.id,
                            );
                            void change({
                              tagIds: event.target.checked
                                ? [...current, tag.id]
                                : current.filter((value) => value !== tag.id),
                            });
                          }}
                        />
                        {tag.name}
                      </label>
                    ))}
                    {!tagOptions.length && (
                      <span className="field-help">
                        Ask an administrator to create tags in Team.
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="private-note">
                <ShieldCheck size={18} />
                <p>
                  {customer
                    ? 'Visible to you and your authorised support team.'
                    : 'Organisation members only. Internal messages are hidden from customers.'}
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
function eventLabel(kind: string, detail: unknown) {
  const value =
    detail && typeof detail === 'object'
      ? (detail as Record<string, unknown>)
      : {};
  if (kind === 'CREATED') return 'Ticket created';
  if (kind === 'PUBLIC_REPLY') return 'Public reply added';
  if (kind === 'INTERNAL_NOTE') return 'Internal note added';
  if (kind === 'STATUS_CHANGED')
    return `Status changed: ${readable(String(value.from || ''))} → ${readable(String(value.to || ''))}`;
  if (kind === 'PRIORITY_CHANGED')
    return `Priority changed: ${readable(String(value.from || ''))} → ${readable(String(value.to || ''))}`;
  if (kind === 'ASSIGNED') return 'Ticket assignment updated';
  return 'Ticket updated';
}
function CustomerAccess({ base }: { base: string }) {
  const [link, setLink] = useState('');
  const [expires, setExpires] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="page-heading">
        <span className="small-label">INVITE THE CONVERSATION</span>
        <h1>
          Customer access<span className="heading-dot">.</span>
        </h1>
        <p>
          A controlled way to welcome customers to your private support portal.
        </p>
      </div>
      <section className="panel access-panel">
        <span className="empty-icon">
          <KeyRound size={26} />
        </span>
        <h2>One link. One customer.</h2>
        <p>
          Create a private link, then share it directly with your customer. Each
          link works once and expires in 48 hours. It grants customer access
          only.
        </p>
        {error && <ErrorBox message={error} />}
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setCopied(false);
            try {
              const d = await api<{ url: string; expiresAt: string }>(
                base + '/customer-links',
                {},
              );
              setLink(d.url);
              setExpires(d.expiresAt);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Unable to create link',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={17} />
          {busy ? 'Creating…' : 'Create customer link'}
        </button>
        {link && (
          <div className="link-result" role="status">
            <label>
              Private join link
              <input value={link} readOnly onFocus={(e) => e.target.select()} />
            </label>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setError(
                    'Copy is unavailable. Select and copy the link manually.',
                  );
                }
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <p>
              Expires {new Date(expires).toLocaleString('en-AU')}. Store it
              safely; the full link is shown only now.
            </p>
          </div>
        )}
      </section>
      <div className="under-note">
        <ShieldCheck size={17} />
        <p>
          Existing users can join another organisation without changing roles
          they already hold.
        </p>
      </div>
    </>
  );
}

function RecoveryPage({ path }: { path: string }) {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(window.location.hash.slice(1)), []);
  const reset = path === '/reset';
  return (
    <main className="standalone-panel">
      <Link href="/login">
        <Brand />
      </Link>
      <section className="panel access-panel">
        <span className="small-label">ACCOUNT ACCESS</span>
        <h1>{reset ? 'Choose a new password' : 'Reset your password'}</h1>
        <p>
          {reset
            ? 'Reset links expire after one hour and work once.'
            : 'Enter your account email. If it matches an account, we’ll email a private reset link.'}
        </p>
        {!reset && process.env.NEXT_PUBLIC_GEMINI_DEMO === 'true' && (
          <p className="privacy-note">
            Email delivery is disabled in the public free demo, so password
            recovery links cannot be delivered.
          </p>
        )}
        {error && <ErrorBox message={error} />}
        {message && (
          <div className="success-note" role="status">
            {message}
          </div>
        )}
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            setMessage('');
            try {
              if (reset) {
                await api('/auth/password/reset', {
                  token,
                  password: String(data.get('password')),
                });
                setMessage(
                  'Your password was updated. Sign in with the new password.',
                );
              } else {
                await api('/auth/password/forgot', {
                  email: String(data.get('email')),
                });
                setMessage(
                  'If that email belongs to an account, a reset link has been sent.',
                );
              }
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : 'Unable to complete the request',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {reset ? (
            <>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </label>
              <button
                className="primary"
                disabled={busy || token.length !== 64}
              >
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </>
          ) : (
            <>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </>
          )}
        </form>
        {reset && !token && (
          <ErrorBox message="Open the private reset link from your email." />
        )}
        <Link className="back-link" href="/login">
          Return to sign in
        </Link>
      </section>
    </main>
  );
}

function InvitationPage({
  token,
  currentUser,
}: {
  token: string;
  currentUser?: CurrentUser;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="standalone-panel">
      <Link href="/login">
        <Brand />
      </Link>
      <section className="panel access-panel">
        <span className="small-label">TEAM INVITATION</span>
        <h1>Join the support team</h1>
        <p>
          {currentUser
            ? `Accept this invitation as ${currentUser.email}.`
            : 'Create an account to accept your private team invitation.'}
        </p>
        {error && <ErrorBox message={error} />}
        {token.length !== 64 ? (
          <ErrorBox message="A valid private invitation link is required." />
        ) : (
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setBusy(true);
              setError('');
              try {
                await api('/team/invitations/accept', {
                  token,
                  ...(!currentUser
                    ? {
                        name: String(data.get('name')),
                        password: String(data.get('password')),
                      }
                    : {}),
                });
                router.replace('/');
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Unable to accept invitation',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {!currentUser && (
              <>
                <label>
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>
              </>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Accepting…' : 'Accept agent invitation'}
            </button>
          </form>
        )}
        <Link className="back-link" href="/login">
          Return to sign in
        </Link>
      </section>
    </main>
  );
}

function TeamManagement({
  base,
  member,
}: {
  base: string;
  member: MembershipView;
}) {
  const [agents, setAgents] = useState<
    { id: string; active?: boolean; user: { name: string; email?: string } }[]
  >([]);
  const [invitations, setInvitations] = useState<
    {
      id: string;
      email: string;
      expiresAt: string;
      acceptedAt: string | null;
      revokedAt: string | null;
    }[]
  >([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<typeof agents>(
      base.replace('/tickets', '') +
        (member.role === 'ADMINISTRATOR' ? '/team/members' : '/agents'),
    )
      .then(setAgents)
      .catch((e) => setError(e.message));
    api<typeof tags>(base.replace('/tickets', '') + '/tags')
      .then(setTags)
      .catch(() => undefined);
    if (member.role === 'ADMINISTRATOR')
      api<typeof invitations>(
        base.replace('/tickets', '') + '/team/invitations',
      )
        .then(setInvitations)
        .catch(() => undefined);
  }, [base, member.role]);
  return (
    <>
      <div className="page-heading">
        <span className="small-label">PEOPLE BEHIND THE SUPPORT</span>
        <h1>
          Team<span className="heading-dot">.</span>
        </h1>
        <p>
          Manage agent membership and assign conversations to eligible
          colleagues.
        </p>
      </div>
      <section className="panel manage-panel">
        <div className="panel-heading">
          <h2>Active agents</h2>
          <span className="count">{agents.length}</span>
        </div>
        {error && <ErrorBox message={error} />}
        {agents.map((agent) => (
          <div className="team-row" key={agent.id}>
            <span className="avatar">{agent.user.name.slice(0, 1)}</span>
            <strong>{agent.user.name}</strong>
            <span className="role-tag">
              {agent.active === false ? 'Deactivated' : 'Agent'}
            </span>
            {agent.active !== false && member.role === 'ADMINISTRATOR' && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    const result = await apiMethod<{
                      unassignedTickets: number;
                    }>(
                      base.replace('/tickets', '') +
                        '/team/members/' +
                        agent.id,
                      'DELETE',
                    );
                    setAgents((old) =>
                      old.map((value) =>
                        value.id === agent.id
                          ? { ...value, active: false }
                          : value,
                      ),
                    );
                    setNotice(
                      `Agent removed. ${result.unassignedTickets} assigned ticket(s) returned to the queue.`,
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Unable to remove agent',
                    );
                  }
                }}
              >
                Remove agent
              </button>
            )}
          </div>
        ))}
      </section>
      {member.role === 'ADMINISTRATOR' && (
        <section className="panel manage-panel">
          <div className="panel-heading">
            <h2>Invite an agent</h2>
          </div>
          <p>
            We’ll send a private, single-use invitation that expires in seven
            days.
          </p>
          {process.env.NEXT_PUBLIC_GEMINI_DEMO === 'true' && (
            <p className="privacy-note">
              Invitation and password-reset email delivery is disabled in this
              free demo.
            </p>
          )}
          {notice && (
            <div className="success-note" role="status">
              {notice}
            </div>
          )}
          <form
            className="inline-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setNotice('');
              setError('');
              try {
                await api(base.replace('/tickets', '') + '/team/invitations', {
                  email: String(new FormData(event.currentTarget).get('email')),
                });
                setNotice(
                  'Invitation email sent through the configured SMTP service.',
                );
                event.currentTarget.reset();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Unable to send invitation',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Agent email address
              <input name="email" type="email" maxLength={254} required />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </form>
        </section>
      )}
      {member.role === 'ADMINISTRATOR' && (
        <section className="panel manage-panel">
          <div className="panel-heading">
            <h2>Pending team invitations</h2>
          </div>
          {invitations
            .filter((invite) => !invite.acceptedAt && !invite.revokedAt)
            .map((invite) => (
              <div className="team-row" key={invite.id}>
                <strong>{invite.email}</strong>
                <span>Expires {date(invite.expiresAt)}</span>
                <button
                  className="text-button"
                  onClick={async () => {
                    await api(
                      base.replace('/tickets', '') +
                        '/team/invitations/' +
                        invite.id +
                        '/revoke',
                      {},
                    );
                    setInvitations((old) =>
                      old.map((value) =>
                        value.id === invite.id
                          ? { ...value, revokedAt: new Date().toISOString() }
                          : value,
                      ),
                    );
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
        </section>
      )}
      {member.role === 'ADMINISTRATOR' && (
        <section className="panel manage-panel">
          <div className="panel-heading">
            <h2>Ticket tags</h2>
          </div>
          {tags.map((tag) => (
            <span className="tag-chip" key={tag.id}>
              {tag.name}
            </span>
          ))}
          <form
            className="inline-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const input = String(
                new FormData(event.currentTarget).get('name'),
              );
              try {
                const created = await api<{ id: string; name: string }>(
                  base.replace('/tickets', '') + '/tags',
                  { name: input },
                );
                setTags((old) =>
                  [...old, created].sort((a, b) =>
                    a.name.localeCompare(b.name),
                  ),
                );
                event.currentTarget.reset();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Unable to create tag',
                );
              }
            }}
          >
            <label>
              New tag
              <input name="name" minLength={2} maxLength={32} required />
            </label>
            <button className="secondary">Create tag</button>
          </form>
        </section>
      )}
    </>
  );
}

type KnowledgeItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  errorMessage: string | null;
  updatedAt: string;
};
function KnowledgeBase({
  base,
  member,
}: {
  base: string;
  member: MembershipView;
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { id: string; title: string; excerpt: string; similarity: number }[]
  >([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    body: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api<KnowledgeItem[]>(base.replace('/tickets', '') + '/knowledge')
        .then((v) => {
          if (live) setItems(v);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    void load();
    const timer = setInterval(() => {
      if (
        items.some((i) => i.status === 'PENDING' || i.status === 'PROCESSING')
      )
        void load();
    }, 2500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [base, revision, items]);
  const admin = member.role === 'ADMINISTRATOR';
  return (
    <>
      <div className="page-heading">
        <span className="small-label">SHARED, SEARCHABLE ANSWERS</span>
        <h1>
          Knowledge base<span className="heading-dot">.</span>
        </h1>
        <p>
          Articles and documents are private to this organisation and indexed as
          a durable background job.
        </p>
        {process.env.NEXT_PUBLIC_GEMINI_DEMO === 'true' && (
          <p className="privacy-note">
            Public demo content only: article and document text is sent to
            Google Gemini for indexing. Google&apos;s free-tier terms allow
            submitted content to be used to improve its products and reviewed by
            people. Do not upload personal, confidential, or real customer
            information.
          </p>
        )}
      </div>
      {error && <ErrorBox message={error} />}
      <section className="panel manage-panel">
        <div className="panel-heading">
          <h2>Knowledge documents</h2>
          <span className="count">{items.length}</span>
        </div>
        {items.map((item) => (
          <div className="knowledge-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.type.toLowerCase()} · updated {date(item.updatedAt)}
              </span>
              {item.errorMessage && <small>{item.errorMessage}</small>}
            </div>
            <span className={'status status-' + item.status.toLowerCase()}>
              {readable(item.status)}
            </span>
            {admin && item.type === 'ARTICLE' && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    const doc = await api<{
                      id: string;
                      title: string;
                      body: string;
                    }>(base.replace('/tickets', '') + '/knowledge/' + item.id);
                    setEditing({
                      id: doc.id,
                      title: doc.title,
                      body: doc.body,
                    });
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Unable to open article',
                    );
                  }
                }}
              >
                Edit
              </button>
            )}
            {admin && item.status === 'FAILED' && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api(
                      base.replace('/tickets', '') +
                        '/knowledge/' +
                        item.id +
                        '/retry',
                      {},
                    );
                    setRevision((v) => v + 1);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Unable to retry indexing',
                    );
                  }
                }}
              >
                Retry indexing
              </button>
            )}
            {admin && (
              <button
                className="text-button"
                aria-label={'Delete ' + item.title}
                onClick={async () => {
                  try {
                    await apiMethod(
                      base.replace('/tickets', '') + '/knowledge/' + item.id,
                      'DELETE',
                    );
                    setRevision((v) => v + 1);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Unable to remove document',
                    );
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {editing && (
          <form
            className="form-stack article-editor"
            onSubmit={async (event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              setBusy(true);
              try {
                await apiMethod(
                  base.replace('/tickets', '') + '/knowledge/' + editing.id,
                  'PATCH',
                  {
                    title: String(values.get('title')),
                    content: String(values.get('content')),
                  },
                );
                setEditing(null);
                setRevision((v) => v + 1);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Unable to update article',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Edit article</h3>
            <label>
              Title
              <input
                name="title"
                defaultValue={editing.title}
                minLength={3}
                maxLength={160}
                required
              />
            </label>
            <label>
              Content
              <textarea
                name="content"
                defaultValue={editing.body}
                minLength={40}
                maxLength={100000}
                rows={8}
                required
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Save and re-index
              </button>
            </div>
          </form>
        )}
      </section>
      {admin && (
        <section className="panel manage-panel">
          <div className="panel-heading">
            <h2>Write a knowledge article</h2>
          </div>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              try {
                const data = new FormData(event.currentTarget);
                await api(
                  base.replace('/tickets', '') + '/knowledge/articles',
                  {
                    title: String(data.get('title')),
                    content: String(data.get('content')),
                  },
                );
                event.currentTarget.reset();
                setRevision((v) => v + 1);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Unable to save article',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Article title
              <input name="title" minLength={3} maxLength={160} required />
            </label>
            <label>
              Article content
              <textarea
                name="content"
                rows={8}
                minLength={40}
                maxLength={100000}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save and index article'}
            </button>
          </form>
          <form
            className="inline-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              try {
                const form = new FormData();
                form.set('file', String(''));
                const input = event.currentTarget.elements.namedItem(
                  'file',
                ) as HTMLInputElement;
                if (input.files?.[0]) form.set('file', input.files[0]);
                const created = await apiMultipart<KnowledgeItem>(
                  base.replace('/tickets', '') + '/knowledge/uploads',
                  form,
                );
                setItems((current) => [
                  created,
                  ...current.filter((item) => item.id !== created.id),
                ]);
                event.currentTarget.reset();
                setRevision((v) => v + 1);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Unable to upload document',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Upload PDF, Markdown, or text
              <input
                name="file"
                type="file"
                accept=".pdf,.txt,.md,.markdown"
                required
              />
            </label>
            <button className="secondary" disabled={busy}>
              Upload document
            </button>
          </form>
        </section>
      )}
      <section className="panel manage-panel">
        <div className="panel-heading">
          <h2>Search knowledge</h2>
          <span className="subtle-label">Local semantic search</span>
        </div>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            try {
              setResults(
                await api(base.replace('/tickets', '') + '/knowledge/search', {
                  query,
                }),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Search unavailable');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Search terms
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              minLength={2}
              maxLength={500}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>
        {results.map((result) => (
          <article className="search-result" key={result.id}>
            <strong>{result.title}</strong>
            <span>{Math.round(result.similarity * 100)}% similarity</span>
            <p>{result.excerpt}</p>
          </article>
        ))}
      </section>
    </>
  );
}

type ReportData = {
  totalTickets: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  response: { averageHours: number | null; responded: number };
  resolution: { averageHours: number | null; resolved: number };
  backlogAge: { under24h: number; day1to3: number; over3d: number };
  workload: { id: string | null; name: string; openTickets: number }[];
  unassignedTickets: number;
  createdLast14Days: { day: string; count: number }[];
};
function Reports({ base }: { base: string }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<ReportData>(base.replace('/tickets', '') + '/reports/summary')
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [base]);
  const metric = (value: number | null) =>
    value === null
      ? '—'
      : value < 1
        ? `${Math.round(value * 60)} min`
        : `${value.toFixed(1)} hrs`;
  return (
    <>
      <div className="page-heading">
        <span className="small-label">REAL WORKFLOW MEASURES</span>
        <h1>
          Reports<span className="heading-dot">.</span>
        </h1>
        <p>
          Computed from this organisation’s ticket history. No synthetic
          estimates or external benchmarks.
        </p>
      </div>
      {error && <ErrorBox message={error} />}
      {!report ? (
        <div className="state" role="status">
          Loading reports…
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <article className="panel metric-card">
              <span>All tickets</span>
              <strong>{report.totalTickets}</strong>
            </article>
            <article className="panel metric-card">
              <span>Average first reply</span>
              <strong>{metric(report.response.averageHours)}</strong>
              <small>
                {report.response.responded} tickets with a staff reply
              </small>
            </article>
            <article className="panel metric-card">
              <span>Average resolution</span>
              <strong>{metric(report.resolution.averageHours)}</strong>
              <small>
                {report.resolution.resolved} tickets with a resolution event
              </small>
            </article>
          </div>
          <div className="report-grid">
            <section className="panel manage-panel">
              <h2>Ticket status</h2>
              {Object.entries(report.byStatus).map(([key, value]) => (
                <ReportBar
                  key={key}
                  label={readable(key)}
                  value={value}
                  max={report.totalTickets}
                />
              ))}
            </section>
            <section className="panel manage-panel">
              <h2>Tickets by priority</h2>
              {Object.entries(report.byPriority).map(([key, value]) => (
                <ReportBar
                  key={key}
                  label={readable(key)}
                  value={value}
                  max={report.totalTickets}
                />
              ))}
              <div className="report-emphasis">
                <span>Unassigned open tickets</span>
                <strong>{report.unassignedTickets}</strong>
              </div>
            </section>
            <section className="panel manage-panel">
              <h2>Backlog age</h2>
              <ReportBar
                label="Under 24 hours"
                value={report.backlogAge.under24h}
                max={report.totalTickets}
              />
              <ReportBar
                label="1–3 days"
                value={report.backlogAge.day1to3}
                max={report.totalTickets}
              />
              <ReportBar
                label="Over 3 days"
                value={report.backlogAge.over3d}
                max={report.totalTickets}
              />
            </section>
            <section className="panel manage-panel">
              <h2>Open workload</h2>
              {report.workload.map((row) => (
                <ReportBar
                  key={row.id || 'unassigned'}
                  label={row.name}
                  value={row.openTickets}
                  max={Math.max(
                    1,
                    ...report.workload.map((v) => v.openTickets),
                  )}
                />
              ))}
            </section>
            <section className="panel manage-panel">
              <h2>Ticket volume · 14 days</h2>
              {report.createdLast14Days.map((row) => (
                <ReportBar
                  key={row.day}
                  label={row.day}
                  value={row.count}
                  max={Math.max(
                    1,
                    ...report.createdLast14Days.map((v) => v.count),
                  )}
                />
              ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
function ReportBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div className="report-bar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="bar-track">
        <i
          style={{
            width: `${max ? Math.max(value ? 4 : 0, Math.min(100, (value / max) * 100)) : 0}%`,
          }}
        />
      </div>
    </div>
  );
}
