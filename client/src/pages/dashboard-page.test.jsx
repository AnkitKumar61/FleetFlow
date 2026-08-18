import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './dashboard-page.jsx';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('../lib/api.js', () => ({ api }));
vi.mock('../context/auth-context.jsx', () => ({ useAuth: () => ({ user: { _id: 'driver-user', role: 'driver' } }) }));

const renderPage = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>);
const profile = { _id: 'driver-profile', status: 'available', currentDelivery: null, isActive: true };

beforeEach(() => {
  api.get.mockReset().mockImplementation((path) => {
    if (path === '/deliveries?limit=6') return Promise.resolve({ data: { data: [] } });
    if (path === '/drivers/me') return Promise.resolve({ data: { data: profile } });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  api.patch.mockReset();
});
afterEach(cleanup);

describe('driver availability control', () => {
  it('lets an unassigned driver become unavailable', async () => {
    api.patch.mockResolvedValue({ data: { data: { ...profile, status: 'offline' } } });
    renderPage();

    expect(await screen.findByText('You can receive a new delivery assignment.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Available' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Unavailable' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/drivers/me/availability', { status: 'offline' }));
    expect(screen.getByText('You will not appear in the admin’s available-driver list.')).toBeInTheDocument();
  });

  it('locks both choices while the driver is on delivery', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/deliveries?limit=6') return Promise.resolve({ data: { data: [] } });
      if (path === '/drivers/me') return Promise.resolve({ data: { data: { ...profile, status: 'busy', currentDelivery: { _id: 'delivery-1', trackingNumber: 'FF-1005' } } } });
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    renderPage();

    expect(await screen.findByText(/Availability unlocks after the delivery is completed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Available' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});
