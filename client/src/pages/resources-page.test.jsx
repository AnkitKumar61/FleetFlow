import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResourcesPage from './resources-page.jsx';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/api.js', () => ({ api }));
vi.mock('../context/auth-context.jsx', () => ({ useAuth: () => ({ user: { _id: 'admin-current', role: 'admin' } }) }));

const accounts = Array.from({ length: 7 }, (_, index) => ({
  _id: `user-${index + 1}`,
  name: index === 6 ? 'Maya Driver' : `Account ${index + 1}`,
  email: index === 6 ? 'maya@example.com' : `account-${index + 1}@example.com`,
  role: index === 6 ? 'driver' : 'customer',
  isActive: index !== 4
}));

beforeEach(() => {
  api.get.mockReset().mockImplementation((path) => {
    if (path === '/drivers') return Promise.resolve({ data: { data: [] } });
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
  it('keeps the staff form out of the way until the admin opens it', async () => {
    render(<ResourcesPage />);

    expect(await screen.findByRole('heading', { name: 'Account directory' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add staff account' }));
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close form' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('searches and filters accounts through the paginated API', async () => {
    render(<ResourcesPage />);
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
    render(<ResourcesPage />);

    expect(await screen.findByText('Showing 1–6 of 7')).toBeInTheDocument();
    expect(screen.queryByText('Maya Driver')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Next/i }));

    expect(await screen.findByText('Maya Driver')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/users?page=2&limit=6');
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });
});
