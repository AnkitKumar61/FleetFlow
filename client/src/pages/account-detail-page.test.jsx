import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountDetailPage from './account-detail-page.jsx';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('../lib/api.js', () => ({ api }));
afterEach(cleanup);

function renderPage() {
  return render(<MemoryRouter initialEntries={['/resources/users/user-1']}><Routes><Route path="/resources/users/:id" element={<AccountDetailPage/>}/></Routes></MemoryRouter>);
}

describe('admin account details', () => {
  beforeEach(() => api.get.mockReset());

  it('shows safe customer contact details and delivery activity', async () => {
    api.get.mockResolvedValue({ data: { data: {
      account: { _id: 'user-1', name: 'Aman Customer', email: 'aman@example.com', phone: '+919876543280', phoneVerified: true, role: 'customer', isActive: true, createdAt: '2026-08-10T10:00:00.000Z' },
      driver: null,
      deliverySummary: { total: 4, active: 2 }
    } } });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Aman Customer' })).toBeInTheDocument();
    expect(screen.getByText('aman@example.com')).toBeInTheDocument();
    expect(screen.getByText('+919876543280')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delivery activity' })).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/users/user-1/details');
  });

  it('shows driver licence, availability and current delivery', async () => {
    api.get.mockResolvedValue({ data: { data: {
      account: { _id: 'user-1', name: 'Rohan Driver', email: 'rohan@example.com', phone: null, phoneVerified: false, role: 'driver', isActive: true, createdAt: '2026-08-10T10:00:00.000Z' },
      driver: { licenseNumber: 'DL-1001', licenseExpiresAt: '2028-12-31T00:00:00.000Z', status: 'busy', isActive: true, currentDelivery: { _id: 'delivery-1', trackingNumber: 'FF-1005', status: 'in_transit' } },
      deliverySummary: null
    } } });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Driver profile' })).toBeInTheDocument();
    expect(screen.getByText('DL-1001')).toBeInTheDocument();
    expect(screen.getByText('On delivery')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FF-1005' })).toHaveAttribute('href', '/deliveries/delivery-1');
    expect(screen.getByText('Not provided')).toBeInTheDocument();
  });
});
