import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Filter, RotateCcw, SearchX } from 'lucide-react';
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

const emptyFilters = { actor: '', action: '', fromDate: '', toDate: '' };

function dateBoundary(value, endOfDay = false) {
  if (!value) return '';
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString();
}

export default function AuditLogPage() {
  const [items, setItems] = useState(null);
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAudits = async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filters.actor) query.set('actor', filters.actor);
      if (filters.action) query.set('action', filters.action);
      if (filters.fromDate) query.set('from', dateBoundary(filters.fromDate));
      if (filters.toDate) query.set('to', dateBoundary(filters.toDate, true));
      const response = await api.get(`/audit-logs?${query}`);
      setItems(response.data.data.items);
      setActions(response.data.data.actions);
      setPagination(response.data.data.pagination);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Could not load the audit history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { api.get('/users?page=1&limit=100').then((response) => setUsers(response.data.data.items)).catch(() => {}); }, []);
  useEffect(() => {
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      setFilterError('To date must be on or after From date.');
      setLoading(false);
      return;
    }
    setFilterError('');
    loadAudits();
  }, [filters, page, limit]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const clearFilters = () => {
    setFilters(emptyFilters);
    setPage(1);
  };
  const filtersActive = Object.values(filters).some(Boolean);
  const firstVisible = pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const lastVisible = Math.min(pagination.page * pagination.limit, pagination.total);

  return <>
    <PageHeader title="Audit history" description="A traceable record of important delivery, user and resource decisions." />
    <section className="audit-filters" aria-busy={loading}>
      <label><Filter /><span>Performed by</span><select value={filters.actor} onChange={(event) => updateFilter('actor', event.target.value)}><option value="">All users</option>{users.map((user) => <option key={user._id} value={user._id}>{user.name} · {user.role}</option>)}</select></label>
      <label><span>Action</span><select value={filters.action} onChange={(event) => updateFilter('action', event.target.value)}><option value="">All actions</option>{actions.map((action) => <option key={action} value={action}>{label(action)}</option>)}</select></label>
      <label><span>From date</span><input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={(event) => updateFilter('fromDate', event.target.value)}/></label>
      <label><span>To date</span><input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={(event) => updateFilter('toDate', event.target.value)}/></label>
    </section>
    {filterError && <p className="form-error audit-filter-error" role="alert">{filterError}</p>}
    <div className="audit-results-bar">
      <span>{loading && items !== null ? 'Updating records…' : pagination.total ? `Showing ${firstVisible}–${lastVisible} of ${pagination.total} records` : 'No records match these filters'}</span>
      <div>
        <label>Records per page<select aria-label="Records per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}><option value="10">10</option><option value="20">20</option></select></label>
        <button type="button" className="text-button" onClick={clearFilters} disabled={!filtersActive}><RotateCcw /> Clear filters</button>
      </div>
    </div>
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
    {items !== null && !error && <div className="audit-pagination"><span>Page {pagination.page} of {pagination.totalPages}</span><div><button type="button" className="button button--secondary" disabled={loading || pagination.page <= 1} onClick={() => setPage((current) => current - 1)}><ArrowLeft /> Previous</button><button type="button" className="button button--secondary" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next <ArrowRight /></button></div></div>}
  </>;
}
