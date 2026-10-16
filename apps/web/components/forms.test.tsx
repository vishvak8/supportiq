import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm, NewTicketForm } from './forms';
describe('connected form interactions', () => {
  it('submits login credentials and disables while pending', async () => {
    const user = userEvent.setup();
    let done!: () => void;
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
    );
    render(<AuthForm mode="login" submit={submit} />);
    await user.type(
      screen.getByLabelText('Email address'),
      'customer@example.com',
    );
    await user.type(screen.getByLabelText('Password'), 'long-test-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(submit).toHaveBeenCalledWith({
      email: 'customer@example.com',
      password: 'long-test-password',
    });
    expect(screen.getByRole('button', { name: /Please wait/ })).toBeDisabled();
    done();
  });
  it('shows API failure and preserves ticket fields and retry ID', async () => {
    const user = userEvent.setup();
    const submit = vi
      .fn()
      .mockRejectedValue(new Error('Unable to connect to support'));
    render(<NewTicketForm submit={submit} />);
    await user.type(screen.getByLabelText('Subject'), 'Address update');
    await user.type(
      screen.getByLabelText('How can we help?'),
      'Please help update my address.',
    );
    await user.click(screen.getByRole('button', { name: /Submit request/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to connect to support',
    );
    expect(screen.getByLabelText('Subject')).toHaveValue('Address update');
    await user.click(screen.getByRole('button', { name: /Submit request/ }));
    expect(submit.mock.calls[0][0].requestId).toBe(
      submit.mock.calls[1][0].requestId,
    );
    expect(submit.mock.calls[0][0].priority).toBe('MEDIUM');
  });
  it('customer onboarding form never exposes a role selector', () => {
    render(<AuthForm mode="join" submit={async () => {}} />);
    expect(screen.getByLabelText('Full name')).toBeRequired();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Join support portal/ }),
    ).toBeEnabled();
  });
});
