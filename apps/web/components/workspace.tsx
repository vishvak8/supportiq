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
} from 'lucide-react';
import type {
  CurrentUser,
  MembershipView,
  TicketPage,
  TicketDetail,
  TicketSummary,
} from '@supportiq/contracts';
import { api, ApiError } from '../lib/api';
import { AuthForm, NewTicketForm, ErrorBox } from './forms';
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
    if (path === '/join') {
      setJoinToken(window.location.hash.slice(1));
    }
  }, [path]);
  useEffect(() => {
    if (
      !loading &&
      !error &&
      !user &&
      !['/login', '/register', '/join'].includes(path)
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
      </main>
    );
  if (!user) {
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
          <span>SupportIQ · Foundation release</span>
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
      <TicketConversation key={path} base={base} id={path.split('/')[2]} />
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
              : 'Your organisation’s customer requests. Agent actions arrive in Stage 2.'}
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
function TicketConversation({ base, id }: { base: string; id: string }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
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
    return () => {
      live = false;
    };
  }, [base, id, retry]);
  return (
    <>
      <Link className="back-link" href="/">
        <ArrowLeft size={15} /> All requests
      </Link>
      {error ? (
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
              {date(ticket.updatedAt)}
            </p>
          </div>
          <div className="conversation-grid">
            <section className="panel conversation">
              <div className="panel-heading">
                <h2>Conversation</h2>
                <span className="subtle-label">Public messages</span>
              </div>
              {ticket.messages.map((m) => (
                <article className="message" key={m.id}>
                  <div className="message-head">
                    <span className="avatar">{m.author.name.slice(0, 1)}</span>
                    <strong>{m.author.name}</strong>
                    <time dateTime={m.createdAt}>{date(m.createdAt)}</time>
                  </div>
                  <p>{m.body}</p>
                </article>
              ))}
              <div className="conversation-note">
                <Clock3 size={18} />
                <p>
                  Your request is saved. Public replies and agent actions will
                  be added in Stage 2.
                </p>
              </div>
            </section>
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
                <dt>Reference</dt>
                <dd>#{ticket.id.slice(0, 8)}</dd>
              </dl>
              <div className="private-note">
                <ShieldCheck size={18} />
                <p>Visible to the customer and authorised support team.</p>
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  );
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
