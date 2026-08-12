import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeliveryDetailPage from './delivery-detail-page.jsx';

const { api, user } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  user: { _id: 'customer-id', name: 'Customer', role: 'customer' }
}));

vi.mock('../lib/api.js', () => ({ api }));
vi.mock('../context/auth-context.jsx', () => ({ useAuth: () => ({ user }) }));

const delivery = {
  _id: 'delivery-id', trackingNumber: 'FF-UI-1001', priority: 'standard', status: 'pending',
  createdAt: '2026-08-12T10:00:00.000Z', expectedDeliveryAt: '2026-08-14T10:00:00.000Z',
  pickupAddress: { line1: '1 Pickup Road', city: 'Pune', state: 'MH', postalCode: '411001' },
  deliveryAddress: { line1: '2 Delivery Road', city: 'Mumbai', state: 'MH', postalCode: '400001' },
  packageWeightKg: 5, packageDescription: 'Acceptance parcel', customer: { name: 'Customer' },
  history: [{ status: 'pending', note: 'Created', at: '2026-08-12T10:00:00.000Z' }]
};

describe('delivery detail actions', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
    api.post.mockReset();
    api.get.mockResolvedValue({ data: { data: delivery } });
    window.confirm = vi.fn(() => true);
  });

  it('keeps the delivery visible and announces an action error', async () => {
    api.patch.mockRejectedValue({ response: { data: { error: { message: 'Cancellation is temporarily unavailable' } } } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'FF-UI-1001' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel delivery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cancellation is temporarily unavailable');
    expect(screen.getByRole('heading', { name: 'FF-UI-1001' })).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith('/deliveries/delivery-id/status', { status: 'cancelled' });
  });
});
