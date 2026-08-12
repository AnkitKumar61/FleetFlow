import { LoaderCircle, PackageOpen } from 'lucide-react';

export const labelStatus = (status = '') => status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
export function StatusBadge({ status }) { return <span className={`status status--${status}`}>{labelStatus(status)}</span>; }
export function PageHeader({ title, description, action }) { return <header className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
export function Loading({ label = 'Loading current data…' }) { return <div className="state" role="status" aria-live="polite"><LoaderCircle className="spin" aria-hidden="true"/><p>{label}</p></div>; }
export function Empty({ title = 'No records found', message = 'Try changing your filters or add the first record.' }) { return <div className="state"><PackageOpen aria-hidden="true"/><h2>{title}</h2><p>{message}</p></div>; }
export function ErrorState({ message, retry }) { return <div className="state state--error" role="alert"><h2>Something needs attention</h2><p>{message}</p>{retry && <button className="button button--secondary" onClick={retry}>Try again</button>}</div>; }
