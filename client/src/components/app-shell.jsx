import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, LogOut, Menu, Package, Truck, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/auth-context.jsx';

export function AppShell() {
  const { user, token, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [liveMessage, setLiveMessage] = useState('');
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  const location = useLocation();
  const closeNavigation = () => { setOpen(false); menuButton.current?.focus(); };
  useEffect(() => setOpen(false), [location]);
  useEffect(() => { const media=window.matchMedia('(max-width: 760px)');const update=()=>setMobile(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update); }, []);
  useEffect(() => { if (!open) return undefined; const focusable=[...sidebar.current.querySelectorAll('a,button:not([disabled])')];focusable[0]?.focus();const handleKey=(event)=>{if(event.key==='Escape')closeNavigation();if(event.key==='Tab'&&focusable.length){const first=focusable[0];const last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};document.addEventListener('keydown',handleKey);return()=>document.removeEventListener('keydown',handleKey); }, [open]);
  useEffect(() => {
    if (!token) return undefined;
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000', { auth: { token } });
    socket.on('delivery:updated', () => { window.dispatchEvent(new Event('fleetflow:data-changed')); setLiveMessage('Delivery changed. The current view has been refreshed.'); });
    socket.on('notification:created', (notice) => setLiveMessage(notice.message));
    return () => socket.close();
  }, [token]);
  const canManage = ['admin', 'manager'].includes(user.role);
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <aside id="primary-navigation" ref={sidebar} className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-hidden={mobile && !open} inert={mobile && !open ? '' : undefined}>
      <div className="brand"><span className="brand-mark">FF</span><div><strong>FleetFlow</strong><small>OPERATIONS</small></div><button className="icon-button mobile-only" onClick={closeNavigation} aria-label="Close navigation"><X /></button></div>
      <nav aria-label="Primary navigation">
        <NavLink to="/" end><BarChart3 /> Overview</NavLink>
        <NavLink to="/deliveries"><Package /> Deliveries</NavLink>
        {canManage && <NavLink to="/resources"><Truck /> Resources</NavLink>}
      </nav>
      <div className="operator"><span className="avatar">{user.name.split(' ').map((word) => word[0]).slice(0,2).join('')}</span><div><strong>{user.name}</strong><small>{user.role}</small></div><button className="icon-button" onClick={logout} aria-label="Sign out"><LogOut /></button></div>
    </aside>
    {open && <button className="scrim" onClick={closeNavigation} aria-label="Close navigation" />}
    <section className="workspace">
      <div className="topbar"><button ref={menuButton} className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} aria-controls="primary-navigation"><Menu /></button><div className="network"><span /> Live operating view</div><button className="icon-button" aria-label="Notifications" onClick={() => setLiveMessage('No unread notifications')}><Bell /></button></div>
      {liveMessage && <div className="toast" role="status">{liveMessage}<button onClick={() => setLiveMessage('')}>Dismiss</button></div>}
      <main id="main"><Outlet /></main>
    </section>
  </div>;
}
