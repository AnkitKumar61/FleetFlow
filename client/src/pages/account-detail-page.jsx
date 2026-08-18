import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CircleUserRound, Truck } from 'lucide-react';
import { api } from '../lib/api.js';
import { ErrorState, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';

const driverStatusLabel = { available: 'Available', busy: 'On delivery', offline: 'Unavailable' };

function Field({ label, value, note }) {
  return <div><dt>{label}</dt><dd>{value || 'Not provided'}{note && <small>{note}</small>}</dd></div>;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : 'Not provided';
}

export default function AccountDetailPage() {
  const { id } = useParams();
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    return api.get(`/users/${id}/details`)
      .then((response) => setDetails(response.data.data))
      .catch((requestError) => setError(requestError.response?.data?.error?.message ?? 'Could not load account details.'));
  };

  useEffect(() => { load(); }, [id]);
  if (error) return <ErrorState message={error} retry={load}/>;
  if (!details) return <Loading/>;

  const { account, driver, deliverySummary } = details;
  return <>
    <PageHeader title={account.name} description={`${account.role} account · Added ${formatDate(account.createdAt)}`} action={<span className={`account-state account-state--${account.isActive ? 'active' : 'inactive'}`}>{account.isActive ? 'Active' : 'Inactive'}</span>}/>
    <Link className="account-detail-back" to="/resources"><ArrowLeft/> Back to resource board</Link>
    <div className="account-detail-grid">
      <section className="account-detail-card">
        <header><CircleUserRound/><div><h2>Account information</h2><p>Contact and access details required for operations.</p></div></header>
        <dl className="account-detail-list">
          <Field label="Full name" value={account.name}/>
          <Field label="Email address" value={account.email}/>
          <Field label="Phone number" value={account.phone} note={account.phone ? account.phoneVerified ? 'Verified' : 'Not verified' : undefined}/>
          <Field label="Role" value={account.role}/>
          <Field label="Account status" value={account.isActive ? 'Active' : 'Inactive'}/>
          <Field label="Created" value={formatDate(account.createdAt)}/>
        </dl>
      </section>

      {account.role === 'driver' && <section className="account-detail-card">
        <header><BadgeCheck/><div><h2>Driver profile</h2><p>Licence, availability and current assignment.</p></div></header>
        {driver ? <dl className="account-detail-list">
          <Field label="Licence number" value={driver.licenseNumber}/>
          <Field label="Licence expiry" value={formatDate(driver.licenseExpiresAt)}/>
          <div><dt>Availability</dt><dd><StatusBadge status={driver.status}/><small>{driverStatusLabel[driver.status] ?? driver.status}</small></dd></div>
          <Field label="Driver profile" value={driver.isActive ? 'Active' : 'Inactive'}/>
          <div><dt>Current delivery</dt><dd>{driver.currentDelivery ? <Link to={`/deliveries/${driver.currentDelivery._id}`}>{driver.currentDelivery.trackingNumber}</Link> : 'No active delivery'}</dd></div>
        </dl> : <p className="account-detail-empty">This account does not have a driver profile.</p>}
      </section>}

      {account.role === 'customer' && <section className="account-detail-card">
        <header><Truck/><div><h2>Delivery activity</h2><p>A short operational summary. Delivery details remain in the manifest.</p></div></header>
        <dl className="account-detail-list">
          <Field label="Total requests" value={String(deliverySummary?.total ?? 0)}/>
          <Field label="Active requests" value={String(deliverySummary?.active ?? 0)}/>
        </dl>
        <Link className="button button--secondary account-detail-action" to="/deliveries">Open delivery manifest</Link>
      </section>}
    </div>
  </>;
}
