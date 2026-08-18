import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Image as ImageIcon, MapPin, PackageCheck, UserRound, Weight } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/auth-context.jsx';
import { ErrorState, Loading, PageHeader, StatusBadge, labelStatus } from '../components/ui.jsx';
import { LiveTrackingPanel } from '../components/live-tracking-panel.jsx';
import { RelationshipDetails } from '../components/relationship-details.jsx';

const nextDriverStatus = { assigned: 'accepted', accepted: 'picked_up', picked_up: 'in_transit' };
const operationalTransitions = {
  customer: { pending: ['cancelled'] },
  admin: {
    pending: ['cancelled'], assigned: ['rescheduled', 'cancelled'], accepted: ['rescheduled', 'cancelled'],
    picked_up: ['failed'], in_transit: ['failed'], failed: ['rescheduled'], rescheduled: ['cancelled']
  }
};

export default function DeliveryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [delivery, setDelivery] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [assignment, setAssignment] = useState({ driverId: '', vehicleId: '' });
  const [showRejection, setShowRejection] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReassignment, setShowReassignment] = useState(false);
  const [reassignment, setReassignment] = useState({ driverId: '', vehicleId: '', reason: '' });
  const [proof, setProof] = useState({ recipientName: '', otp: '', driverNotes: '' });
  const [proofImage, setProofImage] = useState(null);
  const [proofImageUrl, setProofImageUrl] = useState('');

  const load = () => {
    setLoadError('');
    return api.get(`/deliveries/${id}`).then((response) => setDelivery(response.data.data)).catch((error) => {
      setLoadError(error.response?.data?.error?.message ?? 'Could not load delivery.');
    });
  };

  const loadResources = () => Promise.all([api.get('/drivers'), api.get('/vehicles')]).then(([driverData, vehicleData]) => {
    setDrivers(driverData.data.data.filter((item) => item.isActive && item.status === 'available'));
    setVehicles(vehicleData.data.data.filter((item) => item.isActive && item.status === 'available'));
  });

  useEffect(() => {
    load();
    window.addEventListener('fleetflow:data-changed', load);
    const updateLocation = (event) => {
      if (event.detail?.deliveryId !== id) return;
      setDelivery((current) => current ? { ...current, liveLocation: event.detail.location } : current);
    };
    window.addEventListener('fleetflow:location-changed', updateLocation);
    if (user.role === 'admin') loadResources().catch(() => {});
    return () => {
      window.removeEventListener('fleetflow:data-changed', load);
      window.removeEventListener('fleetflow:location-changed', updateLocation);
    };
  }, [id, user.role]);

  const transition = async (status) => {
    if (!confirm(`Move this delivery to ${labelStatus(status)}?`)) return;
    setBusyAction(status);
    setActionError('');
    try {
      const { data } = await api.patch(`/deliveries/${id}/status`, { status });
      setDelivery(data.data);
    } catch (error) {
      setActionError(error.response?.data?.error?.message ?? 'Status change failed.');
    } finally {
      setBusyAction('');
    }
  };

  const assign = async (event) => {
    event.preventDefault();
    setBusyAction('assign');
    setActionError('');
    try {
      await api.post(`/deliveries/${id}/assign`, assignment);
      await load();
    } catch (error) {
      setActionError(error.response?.data?.error?.message ?? 'Assignment failed. Refresh availability and try again.');
    } finally {
      setBusyAction('');
    }
  };

  const rejectAssignment = async (event) => {
    event.preventDefault();
    setBusyAction('reject');
    setActionError('');
    try {
      await api.post(`/deliveries/${id}/reject`, { reason: rejectionReason.trim() });
      navigate('/deliveries');
    } catch (error) {
      setActionError(error.response?.data?.error?.message ?? 'Assignment could not be rejected. Refresh and try again.');
    } finally {
      setBusyAction('');
    }
  };

  const reassign = async (event) => {
    event.preventDefault();
    setBusyAction('reassign');
    setActionError('');
    try {
      await api.post(`/deliveries/${id}/reassign`, {
        ...reassignment,
        reason: reassignment.reason.trim(),
        expectedDriverId: delivery.assignedDriver._id,
        expectedVehicleId: delivery.assignedVehicle._id
      });
      setShowReassignment(false);
      setReassignment({ driverId: '', vehicleId: '', reason: '' });
      await Promise.all([load(), loadResources()]);
    } catch (error) {
      setActionError(error.response?.data?.error?.message ?? 'Reassignment failed. Refresh availability and try again.');
    } finally {
      setBusyAction('');
    }
  };

  const submitProof = async (event) => {
    event.preventDefault();
    setBusyAction('proof');
    setActionError('');
    try {
      const body = new FormData();
      Object.entries(proof).forEach(([key, value]) => body.append(key, value));
      if (proofImage) body.append('image', proofImage);
      await api.post(`/deliveries/${id}/proof`, body);
      setProofImage(null);
      await load();
    } catch (error) {
      setActionError(error.response?.data?.error?.message ?? 'Proof could not be submitted.');
    } finally {
      setBusyAction('');
    }
  };

  const toggleProofImage = async () => {
    if (proofImageUrl) { setProofImageUrl(''); return; }
    setBusyAction('proof-image');
    setActionError('');
    try {
      const response = await api.get(`/deliveries/${id}/proof-image`);
      setProofImageUrl(response.data.data.url);
    } catch (error) {
      setActionError(error.response?.data?.error?.message ?? 'Proof image could not be opened.');
    } finally {
      setBusyAction('');
    }
  };

  if (loadError) return <ErrorState message={loadError} retry={load} />;
  if (!delivery) return <Loading />;

  const next = user.role === 'driver' ? nextDriverStatus[delivery.status] : null;
  const transitionOptions = operationalTransitions[user.role]?.[delivery.status] ?? [];
  const actions = (next || transitionOptions.length) ? <div className="header-actions">
    <StatusBadge status={delivery.status} />
    {next && <button disabled={Boolean(busyAction)} className="button" onClick={() => transition(next)}>{busyAction === next ? 'Updating…' : next === 'accepted' ? 'Accept delivery' : `Mark ${labelStatus(next)}`} <ArrowRight /></button>}
    {user.role === 'driver' && delivery.status === 'assigned' && <button disabled={Boolean(busyAction)} className="button button--secondary" onClick={() => setShowRejection((current) => !current)} aria-expanded={showRejection} aria-controls="assignment-rejection">
      Reject delivery
    </button>}
    {user.role === 'admin' && ['assigned', 'accepted'].includes(delivery.status) && <button disabled={Boolean(busyAction)} className="button button--secondary" onClick={() => setShowReassignment((current) => !current)} aria-expanded={showReassignment} aria-controls="delivery-reassignment">
      Reassign resources
    </button>}
    {transitionOptions.map((status) => <button key={status} disabled={Boolean(busyAction)} className="button button--secondary" onClick={() => transition(status)}>
      {busyAction === status ? 'Updating…' : status === 'cancelled' ? 'Cancel delivery' : `Mark ${labelStatus(status)}`}
    </button>)}
  </div> : <StatusBadge status={delivery.status} />;

  return <>
    <PageHeader title={delivery.trackingNumber} description={`${delivery.priority} priority · Created ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(delivery.createdAt))}`} action={actions} />
    {actionError && <p className="form-error action-error" role="alert">{actionError}</p>}
    <section className="detail-grid">
      <div className="route-board">
        <div><MapPin /><span>Pickup</span><strong>{delivery.pickupAddress.line1}</strong><small>{delivery.pickupAddress.city}, {delivery.pickupAddress.state} {delivery.pickupAddress.postalCode}</small></div>
        <div className="route-line"><i /><b>{labelStatus(delivery.status)}</b><i /></div>
        <div><MapPin /><span>Destination</span><strong>{delivery.deliveryAddress.line1}</strong><small>{delivery.deliveryAddress.city}, {delivery.deliveryAddress.state} {delivery.deliveryAddress.postalCode}</small></div>
      </div>
      <aside className="detail-facts"><h2>Shipment facts</h2><dl>
        <div><dt><Weight />Weight</dt><dd>{delivery.packageWeightKg} kg</dd></div>
        <div><dt><PackageCheck />Contents</dt><dd>{delivery.packageDescription}</dd></div>
        <div><dt><UserRound />Customer</dt><dd>{delivery.customer.name}</dd></div>
        <div><dt>Expected</dt><dd>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(delivery.expectedDeliveryAt))}</dd></div>
      </dl></aside>
    </section>
    <RelationshipDetails delivery={delivery} role={user.role}/>
    {delivery.assignedDriver && (['assigned', 'accepted', 'picked_up', 'in_transit'].includes(delivery.status) || delivery.liveLocation) && <LiveTrackingPanel
      delivery={delivery}
      user={user}
      onLocation={(liveLocation) => setDelivery((current) => ({ ...current, liveLocation }))}
    />}
    {user.role === 'admin' && ['pending', 'rescheduled'].includes(delivery.status) && <form className="action-panel" onSubmit={assign}>
      <div><h2>Assign resources</h2><p>{drivers.length ? 'Only currently available and capable resources can be reserved.' : 'No drivers are currently available. Release or activate a driver before assigning.'}</p></div>
      <label>Driver<select required value={assignment.driverId} onChange={(event) => setAssignment({ ...assignment, driverId: event.target.value })}><option value="">Select available driver</option>{drivers.map((driver) => <option key={driver._id} value={driver._id}>{driver.user.name}</option>)}</select></label>
      <label>Vehicle<select required value={assignment.vehicleId} onChange={(event) => setAssignment({ ...assignment, vehicleId: event.target.value })}><option value="">Select available vehicle</option>{vehicles.filter((vehicle) => vehicle.capacityKg >= delivery.packageWeightKg).map((vehicle) => <option key={vehicle._id} value={vehicle._id}>{vehicle.registrationNumber} · {vehicle.capacityKg} kg</option>)}</select></label>
      <button className="button" disabled={Boolean(busyAction) || !assignment.driverId || !assignment.vehicleId}>{busyAction === 'assign' ? 'Assigning…' : 'Confirm assignment'}</button>
    </form>}
    {user.role === 'driver' && delivery.status === 'assigned' && showRejection && <form id="assignment-rejection" className="action-panel rejection-panel" onSubmit={rejectAssignment}>
      <div><h2>Reject assignment</h2><p>Tell the dispatcher why you cannot take this delivery. The driver and vehicle will be released for another assignment.</p></div>
      <label>Rejection reason<textarea required minLength="5" maxLength="300" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="For example: vehicle issue or medical emergency" /></label>
      <div className="rejection-actions">
        <button type="button" className="button button--secondary" disabled={Boolean(busyAction)} onClick={() => { setShowRejection(false); setRejectionReason(''); }}>Keep assignment</button>
        <button className="button button--danger" disabled={Boolean(busyAction) || rejectionReason.trim().length < 5}>{busyAction === 'reject' ? 'Rejecting…' : 'Confirm rejection'}</button>
      </div>
    </form>}
    {user.role === 'admin' && ['assigned', 'accepted'].includes(delivery.status) && showReassignment && <form id="delivery-reassignment" className="action-panel reassignment-panel" onSubmit={reassign}>
      <div className="previous-assignment"><h2>Reassign resources</h2><p>The replacement driver must accept this delivery before work continues.</p><dl>
        <div><dt>Current driver</dt><dd>{delivery.assignedDriver.user.name}</dd></div>
        <div><dt>Current vehicle</dt><dd>{delivery.assignedVehicle.registrationNumber}</dd></div>
      </dl></div>
      <label>Replacement driver<select required value={reassignment.driverId} onChange={(event) => setReassignment({ ...reassignment, driverId: event.target.value })}><option value="">Select available driver</option>{drivers.map((driver) => <option key={driver._id} value={driver._id}>{driver.user.name}</option>)}</select></label>
      <label>Replacement vehicle<select required value={reassignment.vehicleId} onChange={(event) => setReassignment({ ...reassignment, vehicleId: event.target.value })}><option value="">Select available vehicle</option>{vehicles.filter((vehicle) => vehicle.capacityKg >= delivery.packageWeightKg).map((vehicle) => <option key={vehicle._id} value={vehicle._id}>{vehicle.registrationNumber} · {vehicle.capacityKg} kg</option>)}</select></label>
      <label>Reassignment reason<textarea required minLength="5" maxLength="300" value={reassignment.reason} onChange={(event) => setReassignment({ ...reassignment, reason: event.target.value })} placeholder="Explain why this assignment must change" /></label>
      <div className="reassignment-actions"><button type="button" className="button button--secondary" disabled={Boolean(busyAction)} onClick={() => setShowReassignment(false)}>Keep current assignment</button><button className="button" disabled={Boolean(busyAction) || !reassignment.driverId || !reassignment.vehicleId || reassignment.reason.trim().length < 5}>{busyAction === 'reassign' ? 'Reassigning…' : 'Confirm reassignment'}</button></div>
    </form>}
    {user.role === 'driver' && delivery.status === 'in_transit' && <form className="action-panel proof-panel" onSubmit={submitProof}>
      <div><h2>Complete delivery</h2><p>Verify the recipient before releasing the assigned resources.</p></div>
      <label>Recipient name<input required minLength="2" value={proof.recipientName} onChange={(event) => setProof({ ...proof, recipientName: event.target.value })} /></label>
      <label>Delivery OTP<input required inputMode="numeric" pattern="[0-9]{4,8}" value={proof.otp} onChange={(event) => setProof({ ...proof, otp: event.target.value })} /></label>
      <label>Driver notes<textarea maxLength="500" value={proof.driverNotes} onChange={(event) => setProof({ ...proof, driverNotes: event.target.value })} /></label>
      <label>Proof image <span>Optional · JPEG, PNG, or WebP · 5 MB max</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProofImage(event.target.files[0] ?? null)} /></label>
      <button className="button" disabled={Boolean(busyAction)}>{busyAction === 'proof' ? 'Submitting proof…' : 'Submit proof & deliver'}</button>
    </form>}
    {delivery.proof?.image?.filePath && <section className="proof-evidence"><div><ImageIcon /><div><h2>Delivery evidence</h2><p>Stored privately in ImageKit. Access links expire after five minutes.</p></div></div><button className="button button--secondary" disabled={Boolean(busyAction)} onClick={toggleProofImage}>{busyAction === 'proof-image' ? 'Opening…' : proofImageUrl ? 'Hide proof image' : 'View proof image'}</button>{proofImageUrl && <img src={proofImageUrl} alt={`Delivery proof for ${delivery.trackingNumber}`} />}</section>}
    <section className="timeline"><h2>Delivery timeline</h2>{[...delivery.history].reverse().map((history, index) => <div className="timeline-event" key={`${history.at}-${index}`}><i /><div><strong>{labelStatus(history.status)}</strong><p>{history.note || 'Status updated'}</p><time>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(history.at))}</time></div></div>)}</section>
    <button className="text-button" onClick={() => navigate('/deliveries')}>← Back to manifest</button>
  </>;
}
