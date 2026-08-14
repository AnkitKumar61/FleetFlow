import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell.jsx';

const { api, socketHandlers } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn() },
  socketHandlers: {}
}));

vi.mock('../lib/api.js', () => ({ api }));
vi.mock('../context/auth-context.jsx', () => ({ useAuth: () => ({ user: { name: 'Admin User', role: 'admin' }, token: 'token', logout: vi.fn() }) }));
vi.mock('socket.io-client', () => ({ io: () => ({ on: (event, handler) => { socketHandlers[event] = handler; }, close: vi.fn() }) }));

function renderShell() {
  return render(<MemoryRouter initialEntries={['/']}><Routes><Route element={<AppShell />}><Route index element={<p>Overview page</p>} /><Route path="deliveries/:id" element={<p>Delivery detail route</p>} /></Route></Routes></MemoryRouter>);
}

const notifications = [
  { _id: 'notice-1', type: 'delivery_reassigned', message: 'FF-1005 has been assigned to you', delivery: { _id: 'delivery-1', trackingNumber: 'FF-1005' }, createdAt: '2026-08-15T10:00:00.000Z' },
  { _id: 'notice-2', type: 'delivery_delayed', message: 'FF-1006 may be delayed', delivery: { _id: 'delivery-2', trackingNumber: 'FF-1006' }, createdAt: '2026-08-15T09:00:00.000Z' }
];

beforeEach(() => {
  for (const key of Object.keys(socketHandlers)) delete socketHandlers[key];
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  api.get.mockReset().mockResolvedValue({ data: { data: { items: notifications, unreadCount: 2 } } });
  api.patch.mockReset().mockResolvedValue({ data: { data: {} } });
});

afterEach(cleanup);

describe('notification drawer', () => {
  it('shows the unread count and opens the affected delivery after marking the notification read', async () => {
    renderShell();
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    await userEvent.click(bell);
    await userEvent.click(screen.getByRole('button', { name: /Assignment changed.*FF-1005 has been assigned to you/i }));

    expect(await screen.findByText('Delivery detail route')).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith('/notifications/notice-1/read');
  });

  it('marks all visible notifications as read', async () => {
    renderShell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/notifications/read-all'));
    expect(screen.getByText('0 unread')).toBeInTheDocument();
  });

  it('adds realtime delay and assignment messages to the drawer', async () => {
    api.get.mockResolvedValue({ data: { data: { items: [], unreadCount: 0 } } });
    renderShell();
    await waitFor(() => expect(socketHandlers['notification:created']).toBeTypeOf('function'));
    socketHandlers['notification:created']({ _id: 'live-notice', type: 'delivery_delayed', message: 'FF-2001 may be delayed', delivery: 'delivery-live' });

    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    expect(screen.getByRole('button', { name: /Delay warning.*FF-2001 may be delayed/i })).toBeInTheDocument();
  });
});
