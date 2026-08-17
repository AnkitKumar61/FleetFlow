import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Filter, SearchX } from 'lucide-react';
import { api } from '../lib/api.js';
import { ErrorState, Loading, PageHeader } from '../components/ui.jsx';

function label(value) {
  return value.replaceAll('.', ' · ').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Values({ title, values, tone }) {
  if (values === undefined) return null;
  return <section className={`audit-values audit-values--${tone}`}><h3>{title}</h3>{values === null ? <p>None</p> : <dl>{Object.entries(values).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{displayValue(value)}</dd></div>)}</dl>}</section>;
}

export default function AuditLogPage() {
  const [items, setItems] = useState(null);
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ actor: '', action: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAudits = async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const response = await api.get(`/audit-logs${query.size ? `?${query}` : ''}`);
      setItems(response.data.data.items);
      setActions(response.data.data.actions);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Could not load the audit history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { api.get('/users?page=1&limit=100').then((response) => setUsers(response.data.data.items)).catch(() => {}); }, []);
  useEffect(() => { loadAudits(); }, [filters]);

  return <>
    <PageHeader title="Audit history" description="A traceable record of important delivery, user and resource decisions." />
    <section className="audit-filters" aria-busy={loading}>
      <label><Filter /><span>Performed by</span><select value={filters.actor} onChange={(event) => setFilters({ ...filters, actor: event.target.value })}><option value="">All users</option>{users.map((user) => <option key={user._id} value={user._id}>{user.name} · {user.role}</option>)}</select></label>
      <label><span>Action</span><select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}><option value="">All actions</option>{actions.map((action) => <option key={action} value={action}>{label(action)}</option>)}</select></label>
    </section>
    {loading && items !== null && <p className="filter-status" role="status">Updating audit history…</p>}
    {error ? <ErrorState message={error} retry={loadAudits} /> : items === null ? <Loading label="Loading audit history…" /> : items.length === 0 ? <div className="audit-empty"><SearchX /><h2>No matching actions</h2><p>Change the filters to see more audit records.</p></div> : <section className="audit-list" aria-busy={loading}>{items.map((item) => {
      const details = Object.entries(item.metadata ?? {}).filter(([key]) => !['oldValues', 'newValues'].includes(key));
      return <article className="audit-entry" key={item._id}>
        <header><div><span className="audit-action">{label(item.action)}</span><h2>{item.actor?.name ?? 'Unknown user'} <small>{item.actor?.role ?? 'unknown role'}</small></h2></div><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></header>
        <div className="audit-target"><span>Affected record</span>{item.entityType === 'Delivery' ? <Link to={`/deliveries/${item.entityId}`}>{item.entityType} · {item.entityId}<ArrowRight /></Link> : <strong>{item.entityType} · {item.entityId}</strong>}</div>
        <div className="audit-change"><Values title="Previous values" values={item.metadata?.oldValues} tone="old" /><Values title="New values" values={item.metadata?.newValues} tone="new" /></div>
        {details.length > 0 && <dl className="audit-details">{details.map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{displayValue(value)}</dd></div>)}</dl>}
        <footer><span>Request ID</span><code>{item.requestId || 'Not recorded'}</code></footer>
      </article>;
    })}</section>}
  </>;
}
