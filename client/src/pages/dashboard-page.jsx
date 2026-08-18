import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowRight, CircleAlert, PackageCheck, Route, Truck, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { Empty, ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';

const Metric = ({ label, value, note, icon: Icon, tone }) => <div className={`metric metric--${tone ?? 'default'}`}><div><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong><small>{note}</small></div><Icon aria-hidden="true"/></div>;

export default function DashboardPage() {
  const { user } = useAuth(); const [data, setData] = useState(null); const [deliveries, setDeliveries] = useState([]); const [driverProfile, setDriverProfile] = useState(null); const [error, setError] = useState(''); const [availabilityError, setAvailabilityError] = useState(''); const [availabilityBusy, setAvailabilityBusy] = useState(false); const [loading,setLoading]=useState(true);
  const load = async () => { setError('');try { const [list, analytics, profile] = await Promise.all([api.get('/deliveries?limit=6'), user.role === 'admin' ? api.get('/analytics/overview') : Promise.resolve(null), user.role === 'driver' ? api.get('/drivers/me') : Promise.resolve(null)]); setDeliveries(list.data.data); setData(analytics?.data.data ?? null); setDriverProfile(profile?.data.data ?? null); } catch (err) { setError(err.response?.data?.error?.message ?? 'Could not load current operations.'); } finally { setLoading(false); } };
  useEffect(() => { load();window.addEventListener('fleetflow:data-changed',load);return()=>window.removeEventListener('fleetflow:data-changed',load); }, []);
  const changeAvailability = async (status) => {
    setAvailabilityBusy(true); setAvailabilityError('');
    try {
      const response = await api.patch('/drivers/me/availability', { status });
      setDriverProfile(response.data.data);
    } catch (requestError) {
      setAvailabilityError(requestError.response?.data?.error?.message ?? 'Could not change your availability. Try again.');
    } finally { setAvailabilityBusy(false); }
  };
  const heading = user.role === 'driver' ? 'Your delivery run' : user.role === 'customer' ? 'Your deliveries' : 'Today’s operating picture';
  if (error) return <ErrorState message={error} retry={load}/>;
  if (loading) return <Loading/>;
  const driverDeliveryStatus = typeof driverProfile?.currentDelivery === 'object' ? driverProfile.currentDelivery?.status : null;
  const driverAvailabilityLocked = Boolean(driverProfile?.currentDelivery) || ['reserved', 'busy'].includes(driverProfile?.status);
  const driverState = !driverProfile?.isActive
    ? { value: 'inactive', label: 'Inactive', message: 'Your driver profile is inactive. Ask an admin to enable assignments.' }
    : driverDeliveryStatus === 'assigned' || driverProfile?.status === 'reserved'
      ? { value: 'reserved', label: 'Awaiting acceptance', message: 'This delivery is reserved for you. Accept or reject it before changing availability.' }
      : driverAvailabilityLocked
        ? { value: 'busy', label: 'On delivery', message: 'You are on delivery. Availability unlocks after the delivery is completed or reassigned.' }
        : driverProfile?.status === 'available'
          ? { value: 'available', label: 'Available', message: 'You can receive a new delivery assignment.' }
          : { value: 'offline', label: 'Unavailable', message: 'You will not appear in the admin’s available-driver list.' };
  return <>
    <PageHeader title={heading} description={`${new Intl.DateTimeFormat('en-IN', { weekday:'long', day:'numeric', month:'long' }).format(new Date())} · Authoritative data from FleetFlow`} action={(user.role === 'customer') && <Link className="button" to="/deliveries/new">Request delivery <ArrowRight/></Link>} />
    {user.role === 'driver' && driverProfile && <section className="driver-availability" aria-labelledby="driver-availability-title">
      <div className="driver-availability-copy">
        <div><h2 id="driver-availability-title">Your availability</h2><span className={`status status--${driverState.value}`}>{driverState.label}</span></div>
        <p>{driverState.message}</p>
        {availabilityError && <p className="driver-availability-error" role="alert">{availabilityError}</p>}
      </div>
      <div className="driver-availability-actions" role="group" aria-label="Set your availability">
        <button type="button" className={`button ${driverProfile.status === 'available' ? '' : 'button--secondary'}`} aria-pressed={driverProfile.status === 'available'} disabled={availabilityBusy || driverAvailabilityLocked || !driverProfile.isActive || driverProfile.status === 'available'} onClick={() => changeAvailability('available')}>{availabilityBusy ? 'Updating…' : 'Available'}</button>
        <button type="button" className="button button--secondary" aria-pressed={driverProfile.status === 'offline'} disabled={availabilityBusy || driverAvailabilityLocked || !driverProfile.isActive || driverProfile.status === 'offline'} onClick={() => changeAvailability('offline')}>{availabilityBusy ? 'Updating…' : 'Unavailable'}</button>
      </div>
    </section>}
    {data && <section className="metric-strip" aria-label="Operational metrics"><Metric label="Total deliveries" value={data.total} note="all records" icon={Route}/><Metric label="Moving now" value={data.inTransit} note="picked up + transit" icon={Truck}/><Metric label="Delivered" value={data.delivered} note="completed" icon={PackageCheck} tone="success"/><Metric label="Delayed" value={data.delayed} note="needs review" icon={CircleAlert} tone={data.delayed ? 'warning' : 'default'}/></section>}
    <div className="dashboard-grid">
      <section className="panel manifest"><div className="panel-heading"><div><h2>Active manifest</h2><p>Newest work across the operating queue</p></div><Link to="/deliveries">Open all <ArrowRight/></Link></div>
        {deliveries.length ? <div className="table-wrap"><table><thead><tr><th>Tracking</th><th>Route</th><th>Priority</th><th>Expected</th><th>Status</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery._id}><td><Link to={`/deliveries/${delivery._id}`}><strong>{delivery.trackingNumber}</strong></Link><small>{delivery.packageDescription}</small></td><td>{delivery.pickupAddress.city} <ArrowRight/> {delivery.deliveryAddress.city}</td><td>{delivery.priority}</td><td>{new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(delivery.expectedDeliveryAt))}</td><td><StatusBadge status={delivery.status}/></td></tr>)}</tbody></table></div> : <Empty title="The manifest is clear" message="New delivery requests will appear here."/>}
      </section>
      {data && <aside className="panel pulse"><div className="panel-heading"><div><h2>14-day completion pulse</h2><p>Delivered records by day</p></div></div><div className="chart" aria-label="Deliveries completed by day"><p className="sr-only">{data.completedByDay.length?data.completedByDay.map(item=>`${item.date}: ${item.count}`).join('; '):'No completed deliveries in this period.'}</p><ResponsiveContainer width="100%" height={210}><AreaChart data={data.completedByDay}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1c64f2" stopOpacity={0.28}/><stop offset="100%" stopColor="#1c64f2" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="count" stroke="#1c64f2" strokeWidth={3} fill="url(#area)"/></AreaChart></ResponsiveContainer></div><div className="capacity-row"><span><Users/> Available drivers <strong>{data.availableDrivers}</strong></span><span><Truck/> Vehicles in use <strong>{data.vehiclesInUse}</strong></span></div></aside>}
    </div>
  </>;
}
