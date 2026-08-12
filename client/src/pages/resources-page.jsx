import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';

const emptyAccountForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'customer',
  licenseNumber: '',
  licenseExpiresAt: '',
  driverStatus: 'offline',
};

export default function ResourcesPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [drivers, setDrivers] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [vehicleForm, setVehicleForm] = useState({ registrationNumber: '', type: 'van', capacityKg: '' });
  const [accountForm, setAccountForm] = useState(emptyAccountForm);

  const load = async () => {
    setLoadError('');
    try {
      const requests = [api.get('/drivers'), api.get('/vehicles')];
      if (isAdmin) requests.push(api.get('/users'));
      const [driverData, vehicleData, userData] = await Promise.all(requests);
      setDrivers(driverData.data.data);
      setVehicles(vehicleData.data.data);
      setUsers(userData?.data.data ?? []);
    } catch (requestError) {
      setLoadError(requestError.response?.data?.error?.message ?? 'Could not load resources.');
    }
  };

  useEffect(() => { load(); }, []);

  const update = async (path, body, confirmation) => {
    if (confirmation && !confirm(confirmation)) return;
    setBusyAction(path);
    setActionError('');
    setActionSuccess('');
    try { await api.patch(path, body); await load(); }
    catch (requestError) { setActionError(requestError.response?.data?.error?.message ?? 'The resource could not be updated.'); }
    finally { setBusyAction(''); }
  };

  const createVehicle = async (event) => {
    event.preventDefault();
    setBusyAction('create-vehicle');
    setActionError('');
    setActionSuccess('');
    try {
      await api.post('/vehicles', vehicleForm);
      setVehicleForm({ registrationNumber: '', type: 'van', capacityKg: '' });
      await load();
    } catch (requestError) { setActionError(requestError.response?.data?.error?.message ?? 'The vehicle could not be added.'); }
    finally { setBusyAction(''); }
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setBusyAction('create-account');
    setActionError('');
    setActionSuccess('');
    const payload = { ...accountForm };
    if (payload.role !== 'driver') {
      delete payload.licenseNumber;
      delete payload.licenseExpiresAt;
      delete payload.driverStatus;
    }
    try {
      await api.post('/users', payload);
      setAccountForm(emptyAccountForm);
      setActionSuccess(`${payload.role[0].toUpperCase()}${payload.role.slice(1)} account created. The user can now sign in.`);
      await load();
    } catch (requestError) {
      setActionError(requestError.response?.data?.error?.message ?? 'The account could not be created.');
    } finally {
      setBusyAction('');
    }
  };

  if (loadError) return <ErrorState message={loadError} retry={load}/>;
  if (!drivers) return <Loading/>;

  return <>
    <PageHeader title="Resource board" description="Availability, allocation and account authority in one operating view."/>
    {actionError && <p className="form-error action-error" role="alert">{actionError}</p>}
    {actionSuccess && <p className="form-success action-error" role="status">{actionSuccess}</p>}
    <div className="resources-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Drivers</h2><p>{drivers.filter((driver) => driver.status === 'available').length} available now</p></div></div>
        <div className="resource-list">{drivers.length ? drivers.map((driver) => <div className="resource-row" key={driver._id}>
          <span className="avatar">{driver.user.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
          <div><strong>{driver.user.name}</strong><small>{driver.licenseNumber} · expires {new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(driver.licenseExpiresAt))}</small></div>
          <select disabled={Boolean(busyAction) || Boolean(driver.currentDelivery)} aria-label={`Availability for ${driver.user.name}`} value={driver.status} onChange={(event) => update(`/drivers/${driver._id}`, { status: event.target.value })}><option>available</option><option>busy</option><option>offline</option></select>
          {isAdmin && <button disabled={Boolean(busyAction) || Boolean(driver.currentDelivery)} className="text-button danger" onClick={() => update(`/drivers/${driver._id}`, { isActive: !driver.isActive }, `${driver.isActive ? 'Deactivate' : 'Activate'} ${driver.user.name}?`)}>{driver.isActive ? 'Deactivate' : 'Activate'}</button>}
        </div>) : <p className="resource-empty">No driver profiles yet.</p>}</div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Vehicles</h2><p>{vehicles.filter((vehicle) => vehicle.status === 'available').length} ready to assign</p></div></div>
        <div className="resource-list">{vehicles.length ? vehicles.map((vehicle) => <div className="resource-row" key={vehicle._id}>
          <span className="vehicle-type">{vehicle.type.slice(0, 2).toUpperCase()}</span>
          <div><strong>{vehicle.registrationNumber}</strong><small>{vehicle.type} · {vehicle.capacityKg} kg capacity</small></div>
          <StatusBadge status={vehicle.status}/>
          {isAdmin && <button disabled={Boolean(busyAction) || Boolean(vehicle.currentDelivery)} className="text-button danger" onClick={() => update(`/vehicles/${vehicle._id}`, { isActive: !vehicle.isActive }, `${vehicle.isActive ? 'Deactivate' : 'Activate'} ${vehicle.registrationNumber}?`)}>{vehicle.isActive ? 'Deactivate' : 'Activate'}</button>}
        </div>) : <p className="resource-empty">No vehicles have been added.</p>}</div>
        {isAdmin && <form className="inline-resource-form" onSubmit={createVehicle}><h3>Add vehicle</h3><label>Registration<input required value={vehicleForm.registrationNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, registrationNumber: event.target.value })}/></label><label>Type<select value={vehicleForm.type} onChange={(event) => setVehicleForm({ ...vehicleForm, type: event.target.value })}><option>bike</option><option>van</option><option>truck</option></select></label><label>Capacity (kg)<input required type="number" min="0.1" step="0.1" value={vehicleForm.capacityKg} onChange={(event) => setVehicleForm({ ...vehicleForm, capacityKg: event.target.value })}/></label><button className="button" disabled={Boolean(busyAction)}>{busyAction === 'create-vehicle' ? 'Adding vehicle…' : 'Add vehicle'}</button></form>}
      </section>
    </div>

    {isAdmin && <section className="panel user-admin">
      <div className="panel-heading"><div><h2>Accounts & roles</h2><p>Create users and control who can access FleetFlow</p></div></div>
      <form className="account-create-form" onSubmit={createAccount}>
        <div className="account-form-heading"><div><h3>Create account</h3><p>All users use the same sign-in page.</p></div><span>Admin only</span></div>
        <label>Full name<input required minLength="2" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} autoComplete="off"/></label>
        <label>Email address<input required type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} autoComplete="off"/></label>
        <label>Phone <span>optional</span><input value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })} autoComplete="off"/></label>
        <label>Role<select value={accountForm.role} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value })}><option value="customer">Customer</option><option value="driver">Driver</option><option value="admin">Admin</option></select></label>
        <label className="account-password">Temporary password<input required type="password" minLength="8" pattern="(?=.*[A-Z])(?=.*\d).{8,}" title="Use at least 8 characters, one capital letter and one number." value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} autoComplete="new-password"/><small>8+ characters, one capital letter and one number.</small></label>
        {accountForm.role === 'driver' && <>
          <label>Licence number<input required value={accountForm.licenseNumber} onChange={(event) => setAccountForm({ ...accountForm, licenseNumber: event.target.value })}/></label>
          <label>Licence expiry<input required type="date" min={new Date().toISOString().slice(0, 10)} value={accountForm.licenseExpiresAt} onChange={(event) => setAccountForm({ ...accountForm, licenseExpiresAt: event.target.value })}/></label>
          <label>Starting status<select value={accountForm.driverStatus} onChange={(event) => setAccountForm({ ...accountForm, driverStatus: event.target.value })}><option value="offline">Offline</option><option value="available">Available</option></select></label>
        </>}
        <button className="button account-create-button" disabled={Boolean(busyAction)}>{busyAction === 'create-account' ? 'Creating account…' : 'Create account'}</button>
      </form>
      <div className="resource-list">{users.map((account) => <div className="resource-row user-row" key={account._id}><span className="avatar">{account.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><div><strong>{account.name}</strong><small>{account.email}</small></div><select disabled={Boolean(busyAction) || account._id === user._id} aria-label={`Role for ${account.name}`} value={account.role} onChange={(event) => update(`/users/${account._id}`, { role: event.target.value }, `Change ${account.name}'s role?`)}><option value="admin">Admin</option><option value="driver" disabled={!drivers.some((driver) => driver.user._id === account._id)}>Driver</option><option value="customer">Customer</option></select><button className="button button--secondary" disabled={Boolean(busyAction) || account._id === user._id} onClick={() => update(`/users/${account._id}`, { isActive: !account.isActive }, `${account.isActive ? 'Deactivate' : 'Activate'} ${account.name}?`)}>{account.isActive ? 'Deactivate' : 'Activate'}</button></div>)}</div>
    </section>}
  </>;
}
