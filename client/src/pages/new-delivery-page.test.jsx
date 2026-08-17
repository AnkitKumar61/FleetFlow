import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NewDeliveryPage, { localDateTimeToIso } from './new-delivery-page.jsx';

const { navigate, post } = vi.hoisted(() => ({
  navigate: vi.fn(),
  post: vi.fn()
}));

vi.mock('../lib/api.js', () => ({ api: { post } }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate
}));

const formatLocalDateTime = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

describe('new delivery expected time', () => {
  it('converts the selected local time to an unambiguous ISO timestamp without changing the local time', () => {
    const selectedLocalTime = '2030-08-17T14:15';
    const timestamp = localDateTimeToIso(selectedLocalTime);

    expect(timestamp).toMatch(/Z$/);
    expect(formatLocalDateTime(new Date(timestamp))).toBe(selectedLocalTime);
  });

  it('sends the converted expected time when creating a delivery', async () => {
    post.mockResolvedValueOnce({ data: { data: { _id: 'delivery-1' } } });
    render(<MemoryRouter><NewDeliveryPage /></MemoryRouter>);

    const fillBoth = (label, values) => screen.getAllByLabelText(label).forEach((input, index) => {
      fireEvent.change(input, { target: { value: values[index] } });
    });
    fillBoth('Street address', ['1 Pickup Road', '2 Delivery Road']);
    fillBoth('City', ['Pune', 'Mumbai']);
    fillBoth('State', ['Maharashtra', 'Maharashtra']);
    fillBoth('Postal code', ['411001', '400001']);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Two boxes of books' } });
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Expected by'), { target: { value: '2030-08-17T14:15' } });
    fireEvent.change(screen.getByLabelText(/Recipient OTP/), { target: { value: '2468' } });
    fireEvent.click(screen.getByRole('button', { name: /Create request/i }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries', expect.objectContaining({
      expectedDeliveryAt: localDateTimeToIso('2030-08-17T14:15')
    })));
    expect(navigate).toHaveBeenCalledWith('/deliveries/delivery-1');
  });
});
