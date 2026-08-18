import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResourcesPage from './resources-page.jsx';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/api.js', () => ({ api }));
vi.mock('../context/auth-context.jsx', () => ({ useAuth: () => ({ user: { _id: 'admin-current', role: 'admin' } }) }));

const renderPage = () => render(<MemoryRouter><ResourcesPage /></MemoryRouter>);

const accounts = Array.from({ length: 7 }, (_, index) => ({
  _id: index === 0 ? 'user-driver-busy' : index === 1 ? 'user-driver-available' : `user-${index + 1}`,
  name: index === 0 ? 'Rohan Driver' : index === 1 ? 'Asha Driver' : index === 6 ? 'Maya Driver' : `Account ${index + 1}`,
  email: index === 6 ? 'maya@example.com' : `account-${index + 1}@example.com`,
  role: index <= 1 || index === 6 ? 'driver' : 'customer',
  isActive: index !== 4
}));

const drivers = [
  { _id: 'driver-available', user: { _id: 'user-driver-available', name: 'Asha Driver', role: 'driver', isActive: true }, licenseNumber: 'DL-101', licenseExpiresAt: '2028-12-31T00:00:00.000Z', status: 'available', currentDelivery: null, isActive: true },
  { _id: 'driver-busy', user: { _id: 'user-driver-busy', name: 'Rohan Driver', role: 'driver', isActive: true }, licenseNumber: 'DL-102', licenseExpiresAt: '2028-12-31T00:00:00.000Z', status: 'reserved', currentDelivery: { _id: 'delivery-1', trackingNumber: 'FF-1005', status: 'assigned' }, isActive: true },
  { _id: 'driver-offline', user: { _id: 'user-driver-offline', name: 'Neha Driver', role: 'driver', isActive: true }, licenseNumber: 'DL-103', licenseExpiresAt: '2028-12-31T00:00:00.000Z', status: 'offline', currentDelivery: null, isActive: true },
  { _id: 'driver-former', user: { _id: 'user-driver-former', name: 'Former Driver', role: 'customer', isActive: true }, licenseNumber: 'DL-104', licenseExpiresAt: '2028-12-31T00:00:00.000Z', status: 'offline', currentDelivery: null, isActive: false },
];

beforeEach(() => {
  api.get.mockReset().mockImplementation((path) => {
    if (path === '/drivers') return Promise.resolve({ data: { data: drivers } });
    if (path === '/vehicles') return Promise.resolve({ data: { data: [] } });
    if (path.startsWith('/users?')) {
      const query = new URLSearchParams(path.split('?')[1]);
      const page = Number(query.get('page'));
      const search = query.get('search')?.toLowerCase() ?? '';
      const role = query.get('role') ?? '';
      const status = query.get('status') ?? '';
      const filtered = accounts.filter((account) => {
        const matchesSearch = !search || account.name.toLowerCase().includes(search) || account.email.includes(search);
        const matchesRole = !role || account.role === role;
        const matchesStatus = !status || account.isActive === (status === 'active');
        return matchesSearch && matchesRole && matchesStatus;
      });
      const items = filtered.slice((page - 1) * 6, page * 6);
      return Promise.resolve({ data: { data: { items, pagination: { page, limit: 6, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / 6)) } } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});
afterEach(cleanup);

describe('resource account directory', () => {
  it('shows clear driver status labels without changing the stored values', async () => {
    renderPage();

    expect(await screen.findByRole('combobox', { name: 'Availability for Asha Driver' })).toHaveDisplayValue('Available');
    expect(screen.queryByRole('combobox', { name: 'Availability for Rohan Driver' })).not.toBeInTheDocument();
    expect(screen.getByText('Awaiting acceptance')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Availability for Neha Driver' })).toHaveDisplayValue('Unavailable');
    expect(screen.queryByRole('combobox', { name: 'Availability for Former Driver' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add staff account' }));
    expect(screen.getByRole('combobox', { name: 'Starting status' })).toHaveDisplayValue('Unavailable');
  });

  it('keeps the staff form out of the way until the admin opens it', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Account directory' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'View details' })[0]).toHaveAttribute('href', '/resources/users/user-driver-busy');
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add staff account' }));
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close form' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('locks role changes for a driver with an active delivery and explains how to recover', async () => {
    renderPage();

    const lockedRole = await screen.findByRole('combobox', { name: 'Role for Rohan Driver' });
    expect(lockedRole).toBeDisabled();
    expect(screen.getByText('Assignment lock')).toBeInTheDocument();
    expect(screen.getByText('Role and deactivation are locked while this driver has an active assignment.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Deactivate' })[0]).toBeDisabled();
    expect(screen.getByRole('link', { name: 'View FF-1005' })).toHaveAttribute('href', '/deliveries/delivery-1');
    expect(screen.getByRole('combobox', { name: 'Role for Asha Driver' })).toBeEnabled();
  });

  it('searches and filters accounts through the paginated API', async () => {
    renderPage();
    const search = await screen.findByRole('searchbox', { name: 'Search accounts' });

    await userEvent.type(search, 'Maya');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/users?page=1&limit=6&search=Maya'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'driver');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Access' }), 'active');

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/users?page=1&limit=6&search=Maya&role=driver&status=active'));
    expect(await screen.findByText('Maya Driver')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument();
  });

  it('shows only one short page of accounts and moves to the next page', async () => {
    renderPage();

    expect(await screen.findByText('Showing 1–6 of 7')).toBeInTheDocument();
    expect(screen.queryByText('Maya Driver')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Next/i }));

    expect(await screen.findByText('Maya Driver', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/users?page=2&limit=6');
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });
});
