import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, Search, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';
import { PhoneVerificationFields } from '../components/phone-verification-fields.jsx';

const USER_PAGE_SIZE = 6;
const DRIVER_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'On delivery' },
  { value: 'offline', label: 'Unavailable' },
];

const emptyAccountForm = {
  name: '',
  email: '',
  phone: '',
  phoneVerificationToken: '',
  password: '',
  role: 'driver',
  licenseNumber: '',
  licenseExpiresAt: '',
  driverStatus: 'offline',
};

export default function ResourcesPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [drivers, setDrivers] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [directory, setDirectory] = useState({ items: [], pagination: { page: 1, limit: USER_PAGE_SIZE, total: 0, totalPages: 1 } });
  const [directoryFilters, setDirectoryFilters] = useState({ search: '', role: '', status: '' });
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [vehicleForm, setVehicleForm] = useState({ registrationNumber: '', type: 'van', capacityKg: '' });
  const [accountForm, setAccountForm] = useState(emptyAccountForm);

  const loadResources = async () => {
    setLoadError('');
    try {
      const [driverData, vehicleData] = await Promise.all([api.get('/drivers'), api.get('/vehicles')]);
      setDrivers(driverData.data.data);
      setVehicles(vehicleData.data.data);
    } catch (requestError) {
      setLoadError(requestError.response?.data?.error?.message ?? 'Could not load resources.');
    }
  };

  const loadUsers = async (overrides = {}) => {
    if (!isAdmin) return;
    const queryState = { ...directoryFilters, page: directoryPage, ...overrides };
    const query = new URLSearchParams({ page: String(queryState.page), limit: String(USER_PAGE_SIZE) });
    if (queryState.search) query.set('search', queryState.search);
    if (queryState.role) query.set('role', queryState.role);
    if (queryState.status) query.set('status', queryState.status);
    setDirectoryLoading(true);
    setDirectoryError('');
    try {
      const response = await api.get(`/users?${query}`);
      setDirectory(response.data.data);
      if (queryState.page > response.data.data.pagination.totalPages) {
        setDirectoryPage(response.data.data.pagination.totalPages);
      }
    } catch (requestError) {
      setDirectoryError(requestError.response?.data?.error?.message ?? 'Could not load the account directory.');
    } finally {
      setDirectoryLoading(false);
    }
  };

  useEffect(() => { loadResources(); }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      const search = directorySearch.trim();
      setDirectoryFilters((current) => current.search === search ? current : { ...current, search });
      setDirectoryPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [directorySearch]);
  useEffect(() => { loadUsers(); }, [directoryFilters, directoryPage]);

  const update = async (path, body, confirmation) => {
    if (confirmation && !confirm(confirmation)) return;
    setBusyAction(path);
    setActionError('');
    setActionSuccess('');
    try {
      await api.patch(path, body);
      if (path.startsWith('/users/')) await Promise.all([loadUsers(), loadResources()]);
      else await loadResources();
    }
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
      await loadResources();
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
      delete payload.phoneVerificationToken;
    }
    try {
      await api.post('/users', payload);
      setAccountForm(emptyAccountForm);
      setActionSuccess(`${payload.role[0].toUpperCase()}${payload.role.slice(1)} account created. The user can now sign in.`);
      setShowAccountForm(false);
      setDirectoryPage(1);
      await Promise.all([loadResources(), loadUsers({ page: 1 })]);
    } catch (requestError) {
      setActionError(requestError.response?.data?.error?.message ?? 'The account could not be created.');
    } finally {
      setBusyAction('');
    }
  };

  const clearDirectoryFilters = () => {
    setDirectorySearch('');
    setDirectoryFilters({ search: '', role: '', status: '' });
    setDirectoryPage(1);
  };
  const changeAccountRole = (account, nextRole) => {
    const warning = account.role === 'driver' && nextRole !== 'driver'
      ? `Change ${account.name} to ${nextRole}? Their driver profile will become unavailable.`
      : nextRole === 'driver'
        ? `Change ${account.name} to Driver? Their valid driver profile will restart as Unavailable.`
        : `Change ${account.name}'s role to ${nextRole}?`;
    update(`/users/${account._id}`, { role: nextRole }, warning);
  };
  const filtersActive = Boolean(directorySearch || directoryFilters.role || directoryFilters.status);
  const { items: users, pagination } = directory;
  const firstVisibleUser = pagination.total ? ((pagination.page - 1) * pagination.limit) + 1 : 0;
  const lastVisibleUser = Math.min(pagination.page * pagination.limit, pagination.total);

  if (loadError) return <ErrorState message={loadError} retry={loadResources}/>;
  if (!drivers || !vehicles) return <Loading/>;
  const visibleDrivers = drivers.filter((driver) => driver.user?.role === 'driver');

  return <>
    <PageHeader title="Resource board" description="Availability, allocation and account authority in one operating view."/>
    {actionError && <p className="form-error action-error" role="alert">{actionError}</p>}
    {actionSuccess && <p className="form-success action-error" role="status">{actionSuccess}</p>}
    <div className="resources-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Drivers</h2><p>{visibleDrivers.filter((driver) => driver.isActive && driver.status === 'available').length} available now</p></div></div>
        <div className="resource-list">{visibleDrivers.length ? visibleDrivers.map((driver) => <div className="resource-row" key={driver._id}>
          <span className="avatar">{driver.user.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
          <div><strong>{driver.user.name}</strong><small>{driver.licenseNumber} · expires {new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(driver.licenseExpiresAt))}</small></div>
          <select disabled={Boolean(busyAction) || Boolean(driver.currentDelivery)} aria-label={`Availability for ${driver.user.name}`} value={driver.status} onChange={(event) => update(`/drivers/${driver._id}`, { status: event.target.value })}>{DRIVER_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
          {isAdmin && <button disabled={Boolean(busyAction) || Boolean(driver.currentDelivery)} className="text-button danger" onClick={() => update(`/drivers/${driver._id}`, { isActive: !driver.isActive }, `${driver.isActive ? 'Deactivate' : 'Activate'} ${driver.user.name}?`)}>{driver.isActive ? 'Deactivate' : 'Activate'}</button>}
        </div>) : <p className="resource-empty">No active driver accounts yet.</p>}</div>
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
      <div className="panel-heading account-directory-heading"><div><h2>Account directory</h2><p>{pagination.total} {pagination.total === 1 ? 'account' : 'accounts'} · Search, filter and manage access</p></div><button type="button" className={showAccountForm ? 'button button--secondary' : 'button'} onClick={() => setShowAccountForm((current) => !current)} aria-expanded={showAccountForm} aria-controls="staff-account-form">{showAccountForm ? <><X /> Close form</> : <><UserPlus /> Add staff account</>}</button></div>
      {showAccountForm && <form id="staff-account-form" className="account-create-form" onSubmit={createAccount}>
        <div className="account-form-heading"><div><h3>Create staff account</h3><p>Add a driver or administrator. Customers continue to use the Sign Up page.</p></div><span>Admin only</span></div>
        <label>Full name<input required minLength="2" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} autoComplete="off"/></label>
        <label>Email address<input required type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} autoComplete="off"/></label>
        {accountForm.role === 'admin' && <label>Phone <span>optional</span><input type="tel" value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })} autoComplete="tel"/></label>}
        <label>Role<select value={accountForm.role} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value, phoneVerificationToken: '' })}><option value="driver">Driver</option><option value="admin">Admin</option></select></label>
        <label className="account-password">Temporary password<input required type="password" minLength="8" pattern="(?=.*[A-Z])(?=.*\d).{8,}" title="Use at least 8 characters, one capital letter and one number." value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} autoComplete="new-password"/><small>8+ characters, one capital letter and one number.</small></label>
        {accountForm.role === 'driver' && <>
          <PhoneVerificationFields scope="staff" phone={accountForm.phone} onPhoneChange={(phone) => setAccountForm((current) => ({ ...current, phone }))} onVerified={(phoneVerificationToken) => setAccountForm((current) => ({ ...current, phoneVerificationToken }))}/>
          <label>Licence number<input required value={accountForm.licenseNumber} onChange={(event) => setAccountForm({ ...accountForm, licenseNumber: event.target.value })}/></label>
          <label>Licence expiry<input required type="date" min={new Date().toISOString().slice(0, 10)} value={accountForm.licenseExpiresAt} onChange={(event) => setAccountForm({ ...accountForm, licenseExpiresAt: event.target.value })}/></label>
          <label>Starting status<select value={accountForm.driverStatus} onChange={(event) => setAccountForm({ ...accountForm, driverStatus: event.target.value })}>{DRIVER_STATUS_OPTIONS.filter((status) => status.value !== 'busy').map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        </>}
        <button className="button account-create-button" disabled={Boolean(busyAction) || (accountForm.role === 'driver' && !accountForm.phoneVerificationToken)}>{busyAction === 'create-account' ? 'Creating account…' : 'Create staff account'}</button>
      </form>}
      <div className="account-directory-tools">
        <label className="account-search"><span>Search accounts</span><span><Search /><input type="search" value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Name or email"/></span></label>
        <label><span>Role</span><select value={directoryFilters.role} onChange={(event) => { setDirectoryFilters({ ...directoryFilters, role: event.target.value }); setDirectoryPage(1); }}><option value="">All roles</option><option value="admin">Admin</option><option value="driver">Driver</option><option value="customer">Customer</option></select></label>
        <label><span>Access</span><select value={directoryFilters.status} onChange={(event) => { setDirectoryFilters({ ...directoryFilters, status: event.target.value }); setDirectoryPage(1); }}><option value="">Active and inactive</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select></label>
        <button type="button" className="text-button directory-reset" onClick={clearDirectoryFilters} disabled={!filtersActive}><RotateCcw /> Clear filters</button>
      </div>
      <div className="account-directory-summary" role="status"><span>{directoryLoading ? 'Updating accounts…' : pagination.total ? `Showing ${firstVisibleUser}–${lastVisibleUser} of ${pagination.total}` : 'No accounts match these filters'}</span><span>Page {pagination.page} of {pagination.totalPages}</span></div>
      {directoryError ? <div className="directory-error"><p>{directoryError}</p><button type="button" className="text-button" onClick={() => loadUsers()}>Try again</button></div> : users.length ? <div className="resource-list" aria-busy={directoryLoading}>{users.map((account) => <div className="resource-row user-row" key={account._id}><span className="avatar">{account.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><div className="account-identity"><strong>{account.name}</strong><small>{account.email}</small></div><span className={`account-state account-state--${account.isActive ? 'active' : 'inactive'}`}>{account.isActive ? 'Active' : 'Inactive'}</span><select disabled={Boolean(busyAction) || account._id === user._id} aria-label={`Role for ${account.name}`} value={account.role} onChange={(event) => changeAccountRole(account, event.target.value)}><option value="admin">Admin</option><option value="driver" disabled={!drivers.some((driver) => driver.user._id === account._id)}>Driver</option><option value="customer">Customer</option></select><button className="button button--secondary" disabled={Boolean(busyAction) || account._id === user._id} onClick={() => update(`/users/${account._id}`, { isActive: !account.isActive }, `${account.isActive ? 'Deactivate' : 'Activate'} ${account.name}?`)}>{account.isActive ? 'Deactivate' : 'Activate'}</button></div>)}</div> : !directoryLoading && <div className="account-directory-empty"><Search /><h3>No matching accounts</h3><p>Change or clear the filters to see more people.</p></div>}
      <div className="directory-pagination"><span>{pagination.total} total {pagination.total === 1 ? 'account' : 'accounts'}</span><div><button type="button" className="button button--secondary" disabled={directoryLoading || pagination.page <= 1} onClick={() => setDirectoryPage((current) => current - 1)}><ArrowLeft /> Previous</button><button type="button" className="button button--secondary" disabled={directoryLoading || pagination.page >= pagination.totalPages} onClick={() => setDirectoryPage((current) => current + 1)}>Next <ArrowRight /></button></div></div>
    </section>}
  </>;
}
