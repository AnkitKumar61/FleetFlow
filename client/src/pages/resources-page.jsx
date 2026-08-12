import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';

export default function ResourcesPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [drivers, setDrivers] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [vehicleForm, setVehicleForm] = useState({ registrationNumber: '', type: 'van', capacityKg: '' });

  const load = async () => {
    setError('');
    try {
      const requests = [api.get('/drivers'), api.get('/vehicles')];
      if (isAdmin) requests.push(api.get('/users'));
      const [driverData, vehicleData, userData] = await Promise.all(requests);
      setDrivers(driverData.data.data);
      setVehicles(vehicleData.data.data);
      setUsers(userData?.data.data ?? []);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Could not load resources.');
    }
  };

  useEffect(() => { load(); }, []);

  const update = async (path, body, confirmation) => {
    if (confirmation && !confirm(confirmation)) return;
    try { await api.patch(path, body); await load(); }
    catch (requestError) { setError(requestError.response?.data?.error?.message ?? 'The resource could not be updated.'); }
  };

  const createVehicle = async (event) => {
    event.preventDefault();
    try {
      await api.post('/vehicles', vehicleForm);
      setVehicleForm({ registrationNumber: '', type: 'van', capacityKg: '' });
      await load();
    } catch (requestError) { setError(requestError.response?.data?.error?.message ?? 'The vehicle could not be added.'); }
  };

  if (error) return <ErrorState message={error} retry={load}/>;
  if (!drivers) return <Loading/>;

  return <>
    <PageHeader title="Resource board" description="Availability, allocation and account authority in one operating view."/>
    <div className="resources-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Drivers</h2><p>{drivers.filter((driver) => driver.status === 'available').length} available now</p></div></div>
        <div className="resource-list">{drivers.length ? drivers.map((driver) => <div className="resource-row" key={driver._id}>
          <span className="avatar">{driver.user.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
          <div><strong>{driver.user.name}</strong><small>{driver.licenseNumber} · expires {new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(driver.licenseExpiresAt))}</small></div>
          <select aria-label={`Availability for ${driver.user.name}`} value={driver.status} onChange={(event) => update(`/drivers/${driver._id}`, { status: event.target.value })}><option>available</option><option>busy</option><option>offline</option></select>
          {isAdmin && <button className="text-button danger" onClick={() => update(`/drivers/${driver._id}`, { isActive: !driver.isActive }, `${driver.isActive ? 'Deactivate' : 'Activate'} ${driver.user.name}?`)}>{driver.isActive ? 'Deactivate' : 'Activate'}</button>}
        </div>) : <p className="resource-empty">No driver profiles yet.</p>}</div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Vehicles</h2><p>{vehicles.filter((vehicle) => vehicle.status === 'available').length} ready to assign</p></div></div>
        <div className="resource-list">{vehicles.length ? vehicles.map((vehicle) => <div className="resource-row" key={vehicle._id}>
          <span className="vehicle-type">{vehicle.type.slice(0, 2).toUpperCase()}</span>
          <div><strong>{vehicle.registrationNumber}</strong><small>{vehicle.type} · {vehicle.capacityKg} kg capacity</small></div>
          <StatusBadge status={vehicle.status}/>
          {isAdmin && <button className="text-button danger" onClick={() => update(`/vehicles/${vehicle._id}`, { isActive: !vehicle.isActive }, `${vehicle.isActive ? 'Deactivate' : 'Activate'} ${vehicle.registrationNumber}?`)}>{vehicle.isActive ? 'Deactivate' : 'Activate'}</button>}
        </div>) : <p className="resource-empty">No vehicles have been added.</p>}</div>
        {isAdmin && <form className="inline-resource-form" onSubmit={createVehicle}><h3>Add vehicle</h3><label>Registration<input required value={vehicleForm.registrationNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, registrationNumber: event.target.value })}/></label><label>Type<select value={vehicleForm.type} onChange={(event) => setVehicleForm({ ...vehicleForm, type: event.target.value })}><option>bike</option><option>van</option><option>truck</option></select></label><label>Capacity (kg)<input required type="number" min="0.1" step="0.1" value={vehicleForm.capacityKg} onChange={(event) => setVehicleForm({ ...vehicleForm, capacityKg: event.target.value })}/></label><button className="button">Add vehicle</button></form>}
      </section>
    </div>

    {isAdmin && <section className="panel user-admin"><div className="panel-heading"><div><h2>Accounts & roles</h2><p>Role and activation changes are written to the audit log</p></div></div><div className="resource-list">{users.map((account) => <div className="resource-row user-row" key={account._id}><span className="avatar">{account.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><div><strong>{account.name}</strong><small>{account.email}</small></div><select aria-label={`Role for ${account.name}`} value={account.role} onChange={(event) => update(`/users/${account._id}`, { role: event.target.value }, `Change ${account.name}'s role?`)}><option>admin</option><option>manager</option><option>driver</option><option>customer</option></select><button className="button button--secondary" disabled={account._id === user._id} onClick={() => update(`/users/${account._id}`, { isActive: !account.isActive }, `${account.isActive ? 'Deactivate' : 'Activate'} ${account.name}?`)}>{account.isActive ? 'Deactivate' : 'Activate'}</button></div>)}</div></section>}
  </>;
}
