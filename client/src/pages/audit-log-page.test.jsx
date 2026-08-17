import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLogPage from './audit-log-page.jsx';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('../lib/api.js', () => ({ api }));

const audit = {
  _id: 'audit-1', actor: { _id: 'user-1', name: 'Operations Admin', role: 'admin' },
  action: 'delivery.reassigned', entityType: 'Delivery', entityId: 'delivery-1', requestId: 'request-123',
  createdAt: '2026-08-15T10:00:00.000Z',
  metadata: { reason: 'Driver emergency', oldValues: { status: 'accepted', driverId: 'driver-old' }, newValues: { status: 'assigned', driverId: 'driver-new' } }
};

beforeEach(() => {
  api.get.mockReset().mockImplementation((path) => {
    if (path === '/users?page=1&limit=100') return Promise.resolve({ data: { data: { items: [{ _id: 'user-1', name: 'Operations Admin', role: 'admin' }] } } });
    const query = new URLSearchParams(path.split('?')[1]);
    const page = Number(query.get('page'));
    const limit = Number(query.get('limit'));
    return Promise.resolve({ data: { data: { items: [audit], actions: ['delivery.reassigned'], pagination: { page, limit, total: 25, totalPages: Math.ceil(25 / limit) } } } });
  });
});
afterEach(cleanup);

describe('audit history page', () => {
  it('shows who changed what, old and new values, time, and request ID', async () => {
    render(<MemoryRouter><AuditLogPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Audit history' })).toBeInTheDocument();
    expect(screen.getByText('Operations Admin')).toBeInTheDocument();
    expect(screen.getByText('Delivery · delivery-1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Previous values' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New values' })).toBeInTheDocument();
    expect(screen.getByText('Driver emergency')).toBeInTheDocument();
    expect(screen.getByText('request-123')).toBeInTheDocument();
  });

  it('requests audit records for the selected user and action', async () => {
    render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
    await screen.findByText('Operations Admin');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Performed by' }), 'user-1');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'delivery.reassigned');

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit-logs?page=1&limit=10&actor=user-1&action=delivery.reassigned'));
  });

  it('changes page size, navigates pages, and sends inclusive date boundaries', async () => {
    render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
    await screen.findByText('Showing 1–10 of 25 records');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Records per page' }), '20');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit-logs?page=1&limit=20'));
    await userEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit-logs?page=2&limit=20'));

    await userEvent.type(screen.getByLabelText('From date'), '2026-08-01');
    await userEvent.type(screen.getByLabelText('To date'), '2026-08-17');
    await waitFor(() => {
      const requestPath = api.get.mock.calls.map(([path]) => path).find((path) => path.includes('&from=') && path.includes('&to='));
      const query = new URL(requestPath, 'https://fleetflow.test').searchParams;
      expect(query.get('page')).toBe('1');
      expect(query.get('limit')).toBe('20');
      expect(query.get('from')).toBe(new Date('2026-08-01T00:00:00.000').toISOString());
      expect(query.get('to')).toBe(new Date('2026-08-17T23:59:59.999').toISOString());
    });
  });
});
