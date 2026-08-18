import { describe, expect, it } from 'vitest';
import { shouldAttemptSessionRefresh } from './api.js';

const unauthorized = (config) => ({ response: { status: 401 }, config });

describe('session refresh interceptor', () => {
  it('keeps the original login error when credentials are rejected', () => {
    expect(shouldAttemptSessionRefresh(unauthorized({ url: '/auth/login', headers: {} }))).toBe(false);
  });

  it('refreshes an expired authenticated API request', () => {
    expect(shouldAttemptSessionRefresh(unauthorized({
      url: '/deliveries',
      headers: { Authorization: 'Bearer expired-access-token' }
    }))).toBe(true);
  });

  it('does not retry refresh requests or an already retried request', () => {
    const headers = { Authorization: 'Bearer expired-access-token' };
    expect(shouldAttemptSessionRefresh(unauthorized({ url: '/auth/refresh', headers }))).toBe(false);
    expect(shouldAttemptSessionRefresh(unauthorized({ url: '/deliveries', headers, _retried: true }))).toBe(false);
  });
});
