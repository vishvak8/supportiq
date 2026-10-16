'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import type { TicketSummary } from '@supportiq/contracts';
export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}
export function AuthForm({
  mode,
  submit,
}: {
  mode: 'login' | 'register' | 'join';
  submit: (data: Record<string, string>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await submit(
        Object.fromEntries(new FormData(e.currentTarget)) as Record<
          string,
          string
        >,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={handle} className="form-stack">
      {error && <ErrorBox message={error} />}
      {mode !== 'login' && (
        <label>
          Full name
          <input
            name="name"
            autoComplete="name"
            maxLength={100}
            required
            placeholder="Jamie Chen"
          />
        </label>
      )}
      {mode === 'register' && (
        <label>
          Organisation name
          <input
            name="organisation"
            autoComplete="organization"
            minLength={2}
            maxLength={100}
            required
            placeholder="Acme Studio"
          />
        </label>
      )}
      <label>
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          placeholder="you@example.com"
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={12}
          maxLength={128}
          required
          placeholder="At least 12 characters"
        />
      </label>
      {mode !== 'login' && (
        <p className="field-help">
          Use at least 12 characters. A long, unique passphrase works well.
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? (
          <>
            <LoaderCircle className="spin" size={17} /> Please wait…
          </>
        ) : (
          <>
            {mode === 'login'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create your workspace'
                : 'Join support portal'}
            <ArrowRight size={17} />
          </>
        )}
      </button>
      <p className="form-foot">
        {mode === 'login' ? (
          <>
            Starting a support team?{' '}
            <Link href="/register">Create a workspace</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
export function NewTicketForm({
  submit,
}: {
  submit: (data: {
    subject: string;
    description: string;
    priority: string;
    requestId: string;
  }) => Promise<TicketSummary>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await submit({
        subject: String(data.get('subject')),
        description: String(data.get('description')),
        priority: String(data.get('priority')),
        requestId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create ticket');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack ticket-form" onSubmit={handle}>
      {error && <ErrorBox message={error} />}
      <label>
        Subject
        <input
          name="subject"
          minLength={3}
          maxLength={160}
          required
          placeholder="A short summary of what you need"
        />
      </label>
      <label>
        How can we help?
        <textarea
          name="description"
          minLength={10}
          maxLength={10000}
          required
          rows={8}
          placeholder="Tell us what happened, what you expected, and any details that might help."
        />
      </label>
      <label>
        Priority
        <select aria-label="Priority" name="priority" defaultValue="MEDIUM">
          <option value="LOW">Low — general question</option>
          <option value="MEDIUM">Medium — I need some help</option>
          <option value="HIGH">High — my work is affected</option>
          <option value="URGENT">Urgent — I’m blocked</option>
        </select>
      </label>
      <p className="field-help">
        Please keep passwords, payment details, and other sensitive information
        out of your request.
      </p>
      <div className="form-actions">
        <Link className="secondary" href="/">
          Cancel
        </Link>
        <button className="primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit request'}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}
