import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, CheckCheck, LogOut, Menu, Package, Truck, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/auth-context.jsx';
import { api } from '../lib/api.js';

const noticeTypeLabels = {
  delivery_delayed: 'Delay warning',
  delivery_rejected: 'Assignment rejected',
  delivery_reassigned: 'Assignment changed'
};

function noticeDeliveryId(notification) {
  return notification.delivery?._id ?? notification.delivery;
}

function noticeTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function AppShell() {
  const { user, token, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationError, setNotificationError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [liveMessage, setLiveMessage] = useState('');
  const menuButton = useRef(null);
  const notificationButton = useRef(null);
  const notificationDrawer = useRef(null);
  const notificationIds = useRef(new Set());
  const sidebar = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const closeNavigation = () => { setOpen(false); menuButton.current?.focus(); };
  const closeNotifications = () => { setNotificationOpen(false); notificationButton.current?.focus(); };

  const loadNotifications = async () => {
    setNotificationLoading(true);
    setNotificationError('');
    try {
      const response = await api.get('/notifications');
      notificationIds.current = new Set(response.data.data.items.map((item) => item._id));
      setNotifications(response.data.data.items);
      setUnreadCount(response.data.data.unreadCount);
    } catch {
      setNotificationError('Notifications could not be loaded.');
    } finally {
      setNotificationLoading(false);
    }
  };

  useEffect(() => { setOpen(false); setNotificationOpen(false); }, [location]);
  useEffect(() => { const media=window.matchMedia('(max-width: 760px)');const update=()=>setMobile(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update); }, []);
  useEffect(() => { if (!open) return undefined; const focusable=[...sidebar.current.querySelectorAll('a,button:not([disabled])')];focusable[0]?.focus();const handleKey=(event)=>{if(event.key==='Escape')closeNavigation();if(event.key==='Tab'&&focusable.length){const first=focusable[0];const last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};document.addEventListener('keydown',handleKey);return()=>document.removeEventListener('keydown',handleKey); }, [open]);
  useEffect(() => {
    if (!notificationOpen) return undefined;
    notificationDrawer.current?.querySelector('button')?.focus();
    const handleKey = (event) => { if (event.key === 'Escape') closeNotifications(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [notificationOpen]);
  useEffect(() => { if (token) loadNotifications(); }, [token]);
  useEffect(() => {
    if (!token) return undefined;
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000', { auth: { token } });
    socket.on('delivery:updated', () => { window.dispatchEvent(new Event('fleetflow:data-changed')); setLiveMessage('Delivery changed. The current view has been refreshed.'); });
    socket.on('delivery:location', (payload) => window.dispatchEvent(new CustomEvent('fleetflow:location-changed', { detail: payload })));
    socket.on('notification:created', (notice) => {
      const incoming = { ...notice, createdAt: notice.createdAt ?? new Date().toISOString() };
      if (!notificationIds.current.has(incoming._id)) {
        notificationIds.current.add(incoming._id);
        setNotifications((current) => [incoming, ...current].slice(0, 50));
        if (!incoming.readAt) setUnreadCount((current) => current + 1);
      }
      setLiveMessage(incoming.message);
    });
    return () => socket.close();
  }, [token]);
  useEffect(() => {
    if (!liveMessage) return undefined;
    const timer = window.setTimeout(() => setLiveMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [liveMessage]);

  const openNotification = (notification) => {
    const deliveryId = noticeDeliveryId(notification);
    setNotificationOpen(false);
    if (!notification.readAt) {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item._id === notification._id ? { ...item, readAt } : item));
      setUnreadCount((current) => Math.max(0, current - 1));
      api.patch(`/notifications/${notification._id}/read`).catch(() => loadNotifications());
    }
    if (deliveryId) navigate(`/deliveries/${deliveryId}`);
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    setNotificationError('');
    try {
      await api.patch('/notifications/read-all');
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
      setUnreadCount(0);
    } catch {
      setNotificationError('Notifications could not be updated.');
    } finally {
      setMarkingAll(false);
    }
  };

  const canManage = user.role === 'admin';
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
      <div className="topbar"><button ref={menuButton} className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} aria-controls="primary-navigation"><Menu /></button><div className="network"><span /> Live operating view</div><button ref={notificationButton} className="icon-button notification-trigger" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationOpen} aria-controls="notification-drawer" onClick={() => { setOpen(false); setNotificationOpen(true); }}><Bell />{unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button></div>
      {liveMessage && <div className="toast" role="status"><span>{liveMessage}</span><button onClick={() => setLiveMessage('')}>Dismiss</button></div>}
      <main id="main"><Outlet /></main>
    </section>
    {notificationOpen && <><button className="notification-scrim" onClick={closeNotifications} aria-label="Close notifications" /><aside id="notification-drawer" ref={notificationDrawer} className="notification-drawer" aria-label="Notifications">
      <header><div><p>Updates</p><h2>Notifications</h2></div><button className="icon-button" onClick={closeNotifications} aria-label="Close notifications"><X /></button></header>
      <div className="notification-tools"><span aria-live="polite">{unreadCount} unread</span><button className="text-button" disabled={markingAll || unreadCount === 0} onClick={markAllRead}><CheckCheck />{markingAll ? 'Updating…' : 'Mark all as read'}</button></div>
      {notificationError && <p className="notification-error" role="alert">{notificationError}</p>}
      {notificationLoading ? <p className="notification-empty">Loading notifications…</p> : notifications.length === 0 ? <div className="notification-empty"><Bell /><strong>You are all caught up</strong><span>New delivery updates will appear here.</span></div> : <div className="notification-list">{notifications.map((notification) => <button key={notification._id} className={`notification-item ${notification.readAt ? '' : 'notification-item--unread'}`} onClick={() => openNotification(notification)}>
        <span className="notification-dot" aria-hidden="true" /><span><strong>{noticeTypeLabels[notification.type] ?? 'Delivery update'}</strong><span>{notification.message}</span>{notification.createdAt && <time dateTime={notification.createdAt}>{noticeTime(notification.createdAt)}</time>}</span>
      </button>)}</div>}
    </aside></>}
  </div>;
}
