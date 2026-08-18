import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeliveryDetailPage from './delivery-detail-page.jsx';

const { api, user } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  user: { _id: 'customer-id', name: 'Customer', role: 'customer' }
}));

vi.mock('../lib/api.js', () => ({ api }));
vi.mock('../context/auth-context.jsx', () => ({ useAuth: () => ({ user }) }));

afterEach(cleanup);

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
    user.role = 'customer';
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

  it('shows the saved live location to the customer on an active delivery', async () => {
    api.get.mockResolvedValue({ data: { data: {
      ...delivery,
      status: 'in_transit',
      assignedDriver: { user: { name: 'Rohan Driver' } },
      liveLocation: { latitude: 18.5204, longitude: 73.8567, accuracyMeters: 14, speedKph: 31, sharing: true, updatedAt: new Date().toISOString() }
    } } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Live driver tracking' })).toBeInTheDocument();
    expect(screen.getByText('Live location')).toBeInTheDocument();
    expect(screen.getByText('Rohan Driver')).toBeInTheDocument();
    expect(screen.getByText('31 km/h')).toBeInTheDocument();
  });

  it('shows assigned driver and vehicle details to the customer', async () => {
    api.get.mockResolvedValue({ data: { data: {
      ...delivery,
      status: 'assigned',
      assignedDriver: { user: { name: 'Rohan Driver' } },
      assignedVehicle: { registrationNumber: 'MH-12-TEST' },
      relationshipDetails: {
        driver: { name: 'Rohan Driver', phone: '+919876543281', phoneVerified: true },
        vehicle: { registrationNumber: 'MH-12-TEST', type: 'van' }
      }
    } } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'People and resources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assigned driver' })).toBeInTheDocument();
    expect(screen.getByText('+919876543281')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assigned vehicle' })).toBeInTheDocument();
    expect(screen.getAllByText('MH-12-TEST').length).toBeGreaterThan(0);
  });

  it('shows customer and recipient details to the assigned driver', async () => {
    user.role = 'driver';
    api.get.mockResolvedValue({ data: { data: {
      ...delivery,
      status: 'assigned',
      assignedDriver: { user: { name: 'Rohan Driver' } },
      assignedVehicle: { registrationNumber: 'MH-12-TEST' },
      relationshipDetails: {
        customer: { name: 'Customer', email: 'customer@example.com', phone: '+919876543282', phoneVerified: true },
        recipient: { name: 'Priya Recipient', phone: '+919876543283' }
      }
    } } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.getByText('customer@example.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recipient' })).toBeInTheDocument();
    expect(screen.getByText('Priya Recipient')).toBeInTheDocument();
    expect(screen.getByText('+919876543283')).toBeInTheDocument();
  });

  it('keeps the last driver position visible after tracking ends', async () => {
    api.get.mockResolvedValue({ data: { data: {
      ...delivery,
      status: 'delivered',
      assignedDriver: { user: { name: 'Rohan Driver' } },
      liveLocation: { latitude: 18.5204, longitude: 73.8567, sharing: false, updatedAt: new Date().toISOString() }
    } } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Live driver tracking' })).toBeInTheDocument();
    expect(screen.getByText('Tracking ended')).toBeInTheDocument();
    expect(screen.getByText('Rohan Driver')).toBeInTheDocument();
  });

  it('requires a reason before the driver can reject an assignment', async () => {
    user.role = 'driver';
    api.get.mockResolvedValue({ data: { data: {
      ...delivery,
      status: 'assigned',
      assignedDriver: { user: { name: 'Rohan Driver' } },
      assignedVehicle: { registrationNumber: 'MH-12-TEST' }
    } } });
    api.post.mockResolvedValue({ data: { data: { ...delivery, status: 'pending' } } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /><Route path="/deliveries" element={<p>Delivery manifest</p>} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('button', { name: 'Accept delivery' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reject delivery' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirm rejection' });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox', { name: 'Rejection reason' }), 'Vehicle has a brake warning');
    await userEvent.click(confirmButton);

    expect(api.post).toHaveBeenCalledWith('/deliveries/delivery-id/reject', { reason: 'Vehicle has a brake warning' });
    expect(await screen.findByText('Delivery manifest')).toBeInTheDocument();
  });

  it('shows the previous assignment and sends concurrency-safe reassignment details', async () => {
    user.role = 'admin';
    const assignedDelivery = {
      ...delivery,
      status: 'accepted',
      assignedDriver: { _id: 'old-driver', user: { name: 'Current Driver' } },
      assignedVehicle: { _id: 'old-vehicle', registrationNumber: 'MH-12-OLD' }
    };
    api.get.mockImplementation((url) => {
      if (url === '/drivers') return Promise.resolve({ data: { data: [{ _id: 'new-driver', isActive: true, status: 'available', currentDelivery: null, user: { name: 'Replacement Driver', isActive: true } }] } });
      if (url === '/vehicles') return Promise.resolve({ data: { data: [{ _id: 'new-vehicle', isActive: true, status: 'available', registrationNumber: 'MH-12-NEW', capacityKg: 50 }] } });
      return Promise.resolve({ data: { data: assignedDelivery } });
    });
    api.post.mockResolvedValue({ data: { data: assignedDelivery } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: 'Reassign resources' }));
    expect(screen.getAllByText('Current Driver')).toHaveLength(2);
    expect(screen.getByText('MH-12-OLD')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Replacement driver' }), 'new-driver');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Replacement vehicle' }), 'new-vehicle');
    await userEvent.type(screen.getByRole('textbox', { name: 'Reassignment reason' }), 'Current driver reported a family emergency');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reassignment' }));

    expect(api.post).toHaveBeenCalledWith('/deliveries/delivery-id/reassign', {
      driverId: 'new-driver',
      vehicleId: 'new-vehicle',
      expectedDriverId: 'old-driver',
      expectedVehicleId: 'old-vehicle',
      reason: 'Current driver reported a family emergency'
    });
  });

  it('includes an optional proof image in the delivery completion form', async () => {
    user.role = 'driver';
    api.get.mockResolvedValue({ data: { data: { ...delivery, status: 'in_transit', assignedDriver: { user: { name: 'Rohan Driver' } } } } });
    api.post.mockResolvedValue({ data: { data: { ...delivery, status: 'delivered' } } });
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    await userEvent.type(await screen.findByRole('textbox', { name: 'Recipient name' }), 'Test Recipient');
    await userEvent.type(screen.getByRole('textbox', { name: 'Delivery OTP' }), '2468');
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'proof.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/Proof image/i), image);
    await userEvent.click(screen.getByRole('button', { name: 'Submit proof & deliver' }));

    const form = api.post.mock.calls[0][1];
    expect(api.post.mock.calls[0][0]).toBe('/deliveries/delivery-id/proof');
    expect(form.get('image')).toBe(image);
    expect(form.get('recipientName')).toBe('Test Recipient');
  });

  it('loads a short-lived proof image link for an authorized viewer', async () => {
    api.get.mockImplementation((path) => path.endsWith('/proof-image')
      ? Promise.resolve({ data: { data: { url: 'https://signed.example/proof.png', expiresIn: 300 } } })
      : Promise.resolve({ data: { data: { ...delivery, status: 'delivered', proof: { image: { provider: 'imagekit', filePath: '/fleetflow/proofs/proof.png' } } } } }));
    render(<MemoryRouter initialEntries={['/deliveries/delivery-id']}><Routes><Route path="/deliveries/:id" element={<DeliveryDetailPage />} /></Routes></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: 'View proof image' }));
    expect(await screen.findByRole('img', { name: 'Delivery proof for FF-UI-1001' })).toHaveAttribute('src', 'https://signed.example/proof.png');
    expect(api.get).toHaveBeenCalledWith('/deliveries/delivery-id/proof-image');
  });
});
