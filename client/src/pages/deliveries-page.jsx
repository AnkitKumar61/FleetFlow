import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Filter, Plus, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { Empty, ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';

export default function DeliveriesPage() {
  const { user } = useAuth(); const [items,setItems]=useState(null); const [meta,setMeta]=useState({}); const [filters,setFilters]=useState({search:'',status:'',priority:''}); const [error,setError]=useState('');
  const load = async (cursor) => { try { setError(''); const params = new URLSearchParams(Object.entries({...filters,cursor}).filter(([,v])=>v)); const {data}=await api.get(`/deliveries?${params}`); setItems((old)=>cursor?[...(old??[]),...data.data]:data.data); setMeta(data.meta); } catch(err){setError(err.response?.data?.error?.message??'Could not load deliveries.');} };
  useEffect(()=>{const timer=setTimeout(()=>load(),250);const refresh=()=>load();window.addEventListener('fleetflow:data-changed',refresh);return()=>{clearTimeout(timer);window.removeEventListener('fleetflow:data-changed',refresh);};},[filters]);
  return <><PageHeader title="Delivery manifest" description="Search, filter and inspect the authoritative delivery record." action={['customer','admin','manager'].includes(user.role)&&<Link className="button" to="/deliveries/new"><Plus/> New request</Link>}/>
    <section className="filters"><label><Search/><span className="sr-only">Search deliveries</span><input placeholder="Tracking number or package" value={filters.search} onChange={(e)=>setFilters({...filters,search:e.target.value})}/></label><label><Filter/><span className="sr-only">Filter by status</span><select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All statuses</option>{['pending','assigned','accepted','picked_up','in_transit','delivered','cancelled','failed','rescheduled'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label><label><span className="sr-only">Filter by priority</span><select value={filters.priority} onChange={(e)=>setFilters({...filters,priority:e.target.value})}><option value="">All priorities</option><option>standard</option><option>express</option><option>urgent</option></select></label></section>
    {error?<ErrorState message={error} retry={()=>load()}/>:items===null?<Loading/>:items.length===0?<Empty/>:<section className="delivery-list">{items.map((d)=><Link className="delivery-row" to={`/deliveries/${d._id}`} key={d._id}><div><strong>{d.trackingNumber}</strong><small>{d.packageDescription}</small></div><div className="route"><span>{d.pickupAddress.city}</span><ArrowRight/><span>{d.deliveryAddress.city}</span></div><span className={`priority priority--${d.priority}`}>{d.priority}</span><time>{new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short'}).format(new Date(d.expectedDeliveryAt))}</time><StatusBadge status={d.status}/><ArrowRight className="row-arrow"/></Link>)}</section>}
    {meta.nextCursor&&<button className="button button--secondary load-more" onClick={()=>load(meta.nextCursor)}>Load more</button>}
  </>;
}
