import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowRight, CircleAlert, PackageCheck, Route, Truck, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { Empty, ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';

const Metric = ({ label, value, note, icon: Icon, tone }) => <div className={`metric metric--${tone ?? 'default'}`}><div><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong><small>{note}</small></div><Icon aria-hidden="true"/></div>;

export default function DashboardPage() {
  const { user } = useAuth(); const [data, setData] = useState(null); const [deliveries, setDeliveries] = useState([]); const [error, setError] = useState(''); const [loading,setLoading]=useState(true);
  const load = async () => { setError('');try { const requests = [api.get('/deliveries?limit=6')]; if (user.role === 'admin') requests.push(api.get('/analytics/overview')); const [list, analytics] = await Promise.all(requests); setDeliveries(list.data.data); setData(analytics?.data.data ?? null); } catch (err) { setError(err.response?.data?.error?.message ?? 'Could not load current operations.'); } finally { setLoading(false); } };
  useEffect(() => { load();window.addEventListener('fleetflow:data-changed',load);return()=>window.removeEventListener('fleetflow:data-changed',load); }, []);
  const heading = user.role === 'driver' ? 'Your delivery run' : user.role === 'customer' ? 'Your deliveries' : 'Today’s operating picture';
  if (error) return <ErrorState message={error} retry={load}/>;
  if (loading) return <Loading/>;
  return <>
    <PageHeader title={heading} description={`${new Intl.DateTimeFormat('en-IN', { weekday:'long', day:'numeric', month:'long' }).format(new Date())} · Authoritative data from FleetFlow`} action={(user.role === 'customer') && <Link className="button" to="/deliveries/new">Request delivery <ArrowRight/></Link>} />
    {data && <section className="metric-strip" aria-label="Operational metrics"><Metric label="Total deliveries" value={data.total} note="all records" icon={Route}/><Metric label="Moving now" value={data.inTransit} note="picked up + transit" icon={Truck}/><Metric label="Delivered" value={data.delivered} note="completed" icon={PackageCheck} tone="success"/><Metric label="Delayed" value={data.delayed} note="needs review" icon={CircleAlert} tone={data.delayed ? 'warning' : 'default'}/></section>}
    <div className="dashboard-grid">
      <section className="panel manifest"><div className="panel-heading"><div><h2>Active manifest</h2><p>Newest work across the operating queue</p></div><Link to="/deliveries">Open all <ArrowRight/></Link></div>
        {deliveries.length ? <div className="table-wrap"><table><thead><tr><th>Tracking</th><th>Route</th><th>Priority</th><th>Expected</th><th>Status</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery._id}><td><Link to={`/deliveries/${delivery._id}`}><strong>{delivery.trackingNumber}</strong></Link><small>{delivery.packageDescription}</small></td><td>{delivery.pickupAddress.city} <ArrowRight/> {delivery.deliveryAddress.city}</td><td>{delivery.priority}</td><td>{new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(delivery.expectedDeliveryAt))}</td><td><StatusBadge status={delivery.status}/></td></tr>)}</tbody></table></div> : <Empty title="The manifest is clear" message="New delivery requests will appear here."/>}
      </section>
      {data && <aside className="panel pulse"><div className="panel-heading"><div><h2>14-day completion pulse</h2><p>Delivered records by day</p></div></div><div className="chart" aria-label="Deliveries completed by day"><p className="sr-only">{data.completedByDay.length?data.completedByDay.map(item=>`${item.date}: ${item.count}`).join('; '):'No completed deliveries in this period.'}</p><ResponsiveContainer width="100%" height={210}><AreaChart data={data.completedByDay}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1c64f2" stopOpacity={0.28}/><stop offset="100%" stopColor="#1c64f2" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="count" stroke="#1c64f2" strokeWidth={3} fill="url(#area)"/></AreaChart></ResponsiveContainer></div><div className="capacity-row"><span><Users/> Available drivers <strong>{data.availableDrivers}</strong></span><span><Truck/> Vehicles in use <strong>{data.vehiclesInUse}</strong></span></div></aside>}
    </div>
  </>;
}
