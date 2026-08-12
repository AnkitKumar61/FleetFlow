import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Filter, Plus, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { Empty, ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';

export default function DeliveriesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({});
  const [filters, setFilters] = useState({ search: '', status: '', priority: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestSequence = useRef(0);

  const load = async (cursor, sequence = ++requestSequence.current) => {
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      setError('');
      const params = new URLSearchParams(Object.entries({ ...filters, cursor }).filter(([, value]) => value));
      const { data } = await api.get(`/deliveries?${params}`);
      if (sequence !== requestSequence.current) return;
      setItems((current) => cursor ? [...(current ?? []), ...data.data] : data.data);
      setMeta(data.meta);
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.response?.data?.error?.message ?? 'Could not load deliveries.');
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const timer = setTimeout(() => load(undefined, sequence), 250);
    const refresh = () => load();
    window.addEventListener('fleetflow:data-changed', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('fleetflow:data-changed', refresh);
    };
  }, [filters]);

  return <>
    <PageHeader title="Delivery manifest" description="Search, filter and inspect the authoritative delivery record." action={user.role === 'customer' && <Link className="button" to="/deliveries/new"><Plus /> New request</Link>} />
    <section className="filters" aria-busy={loading}>
      <label><Search /><span className="sr-only">Search deliveries</span><input placeholder="Tracking number or package" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
      <label><Filter /><span className="sr-only">Filter by status</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{['pending', 'assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed', 'rescheduled'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label><span className="sr-only">Filter by priority</span><select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">All priorities</option><option>standard</option><option>express</option><option>urgent</option></select></label>
    </section>
    {loading && items !== null && <p className="filter-status" role="status">Updating results…</p>}
    {error ? <ErrorState message={error} retry={() => load()} /> : items === null ? <Loading label="Loading delivery manifest…" /> : items.length === 0 ? <Empty /> : <section className="delivery-list" aria-busy={loading}>{items.map((delivery) => <Link className="delivery-row" to={`/deliveries/${delivery._id}`} key={delivery._id}>
      <div><strong>{delivery.trackingNumber}</strong><small>{delivery.packageDescription}</small></div>
      <div className="route"><span>{delivery.pickupAddress.city}</span><ArrowRight /><span>{delivery.deliveryAddress.city}</span></div>
      <span className={`priority priority--${delivery.priority}`}>{delivery.priority}</span>
      <time>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(delivery.expectedDeliveryAt))}</time>
      <StatusBadge status={delivery.status} /><ArrowRight className="row-arrow" />
    </Link>)}</section>}
    {meta.nextCursor && <button className="button button--secondary load-more" disabled={loadingMore} onClick={() => load(meta.nextCursor)}>{loadingMore ? 'Loading more…' : 'Load more'}</button>}
  </>;
}
