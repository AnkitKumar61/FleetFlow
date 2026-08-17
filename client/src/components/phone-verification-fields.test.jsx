import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PhoneVerificationFields } from './phone-verification-fields.jsx';

const { api } = vi.hoisted(() => ({ api: { post: vi.fn() } }));
vi.mock('../lib/api.js', () => ({ api }));

afterEach(() => {
  cleanup();
  api.post.mockReset();
});

it('shows the generated test code and returns a token after verification', async () => {
  api.post
    .mockResolvedValueOnce({ data: { data: { verificationId: 'verification-1', testCode: '483921' } } })
    .mockResolvedValueOnce({ data: { data: { verificationToken: 'verified-token' } } });
  const onVerified = vi.fn();

  render(<PhoneVerificationFields phone="+919876543210" onPhoneChange={vi.fn()} onVerified={onVerified}/>);
  await userEvent.click(screen.getByRole('button', { name: 'Send test code' }));
  expect(api.post).toHaveBeenCalledWith('/auth/phone-verifications', { phone: '+919876543210' });
  expect(await screen.findByText('483921')).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText('Verification code'), '483921');
  await userEvent.click(screen.getByRole('button', { name: 'Verify phone' }));
  expect(api.post).toHaveBeenLastCalledWith('/auth/phone-verifications/verify', {
    verificationId: 'verification-1', phone: '+919876543210', code: '483921'
  });
  expect(onVerified).toHaveBeenLastCalledWith('verified-token');
  expect(screen.getByText('Phone number verified.')).toBeInTheDocument();
});
