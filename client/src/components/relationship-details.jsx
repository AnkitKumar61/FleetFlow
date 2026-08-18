import { ContactRound, Truck, UserRound } from 'lucide-react';

function DetailList({ children }) {
  return <dl className="relationship-list">{children}</dl>;
}

function Detail({ label, value, hint }) {
  return <div><dt>{label}</dt><dd>{value || 'Not provided'}{hint && <small>{hint}</small>}</dd></div>;
}

export function RelationshipDetails({ delivery, role }) {
  const details = delivery.relationshipDetails;

  if (!details) {
    if (role === 'customer') return <section className="relationship-panel relationship-panel--empty"><div className="relationship-heading"><ContactRound /><div><h2>Delivery contacts</h2><p>Driver and vehicle details will appear here after an active assignment.</p></div></div></section>;
    if (role === 'driver') return <section className="relationship-panel relationship-panel--empty"><div className="relationship-heading"><ContactRound /><div><h2>Delivery contacts</h2><p>Contact details are available only while this delivery is assigned and active.</p></div></div></section>;
    return null;
  }

  return <section className="relationship-panel">
    <div className="relationship-heading"><ContactRound /><div><h2>People and resources</h2><p>Only the operational details allowed for your role are shown.</p></div></div>
    <div className="relationship-groups">
      {details.customer && <article><header><UserRound /><h3>Customer</h3></header><DetailList>
        <Detail label="Name" value={details.customer.name}/>
        <Detail label="Email" value={details.customer.email}/>
        <Detail label="Phone" value={details.customer.phone} hint={details.customer.phone && !details.customer.phoneVerified ? 'Not verified' : undefined}/>
      </DetailList></article>}
      {details.recipient && <article><header><UserRound /><h3>Recipient</h3></header><DetailList>
        <Detail label="Name" value={details.recipient.name}/>
        <Detail label="Phone" value={details.recipient.phone}/>
      </DetailList></article>}
      {details.driver && <article><header><UserRound /><h3>Assigned driver</h3></header><DetailList>
        <Detail label="Name" value={details.driver.name}/>
        {details.driver.email !== undefined && <Detail label="Email" value={details.driver.email}/>}
        <Detail label="Phone" value={details.driver.phone} hint={details.driver.phone && !details.driver.phoneVerified ? 'Not verified' : undefined}/>
      </DetailList></article>}
      {details.vehicle && <article><header><Truck /><h3>Assigned vehicle</h3></header><DetailList>
        <Detail label="Registration" value={details.vehicle.registrationNumber}/>
        <Detail label="Type" value={details.vehicle.type}/>
        {details.vehicle.capacityKg !== undefined && <Detail label="Capacity" value={`${details.vehicle.capacityKg} kg`}/>}
      </DetailList></article>}
    </div>
  </section>;
}
