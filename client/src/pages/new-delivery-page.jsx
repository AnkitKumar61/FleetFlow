import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { PageHeader } from '../components/ui.jsx';

const emptyAddress = { line1: '', city: '', state: '', postalCode: '' };
const addressFields = [['line1', 'Street address'], ['city', 'City'], ['state', 'State'], ['postalCode', 'Postal code']];
const localMinimum = () => {
  const date = new Date(Date.now() + 60000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

function AddressFields({ section, value, onChange }) {
  return addressFields.map(([field, label]) => <label key={field}>{label}<input
    required
    autoComplete={`section-${section} ${field === 'postalCode' ? 'postal-code' : field === 'line1' ? 'street-address' : `address-level${field === 'city' ? '2' : '1'}`}`}
    inputMode={field === 'postalCode' ? 'numeric' : undefined}
    value={value[field]}
    onChange={(event) => onChange(field, event.target.value)}
  /></label>);
}

export default function NewDeliveryPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    pickupAddress: { ...emptyAddress }, deliveryAddress: { ...emptyAddress }, packageDescription: '',
    packageWeightKg: '', priority: 'standard', expectedDeliveryAt: '', deliveryOtp: ''
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const updateAddress = (key, field, value) => setForm((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/deliveries', form);
      navigate(`/deliveries/${data.data._id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Could not create delivery.');
    } finally { setBusy(false); }
  };

  return <>
    <PageHeader title="Request a delivery" description="Provide the route, package and expected delivery window."/>
    <form className="delivery-form" onSubmit={submit}>
      <fieldset><legend>Pickup</legend><AddressFields section="pickup" value={form.pickupAddress} onChange={(field, value) => updateAddress('pickupAddress', field, value)}/></fieldset>
      <fieldset><legend>Destination</legend><AddressFields section="destination" value={form.deliveryAddress} onChange={(field, value) => updateAddress('deliveryAddress', field, value)}/></fieldset>
      <fieldset className="package-fields"><legend>Package</legend>
        <label>Description<textarea required minLength="3" value={form.packageDescription} onChange={(event) => setForm({ ...form, packageDescription: event.target.value })}/></label>
        <label>Weight (kg)<input required min="0.1" step="0.1" type="number" value={form.packageWeightKg} onChange={(event) => setForm({ ...form, packageWeightKg: event.target.value })}/></label>
        <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>standard</option><option>express</option><option>urgent</option></select></label>
        <label>Expected by<input required type="datetime-local" min={localMinimum()} value={form.expectedDeliveryAt} onChange={(event) => setForm({ ...form, expectedDeliveryAt: event.target.value })}/></label>
        <label>Recipient OTP <span>4 to 8 digits</span><input required inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" value={form.deliveryOtp} onChange={(event) => setForm({ ...form, deliveryOtp: event.target.value })}/></label>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button--secondary" onClick={() => navigate(-1)}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Creating…' : 'Create request'} <ArrowRight/></button></div>
    </form>
  </>;
}
