import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from './context/auth-context.jsx';
import { AppShell } from './components/app-shell.jsx';

const AuthPages = lazy(() => import('./pages/auth-pages.jsx'));
const DashboardPage = lazy(() => import('./pages/dashboard-page.jsx'));
const DeliveriesPage = lazy(() => import('./pages/deliveries-page.jsx'));
const DeliveryDetailPage = lazy(() => import('./pages/delivery-detail-page.jsx'));
const NewDeliveryPage = lazy(() => import('./pages/new-delivery-page.jsx'));
const ResourcesPage = lazy(() => import('./pages/resources-page.jsx'));

function Protected() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="boot"><span className="brand-mark">FF</span><p>Loading operating data…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function RequireRoles({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

export function App() {
  return <Suspense fallback={<div className="boot"><span className="brand-mark">FF</span><p>Loading workspace…</p></div>}><Routes>
    <Route path="/login" element={<AuthPages mode="login" />} />
    <Route path="/register" element={<AuthPages mode="register" />} />
    <Route element={<Protected />}>
      <Route index element={<DashboardPage />} />
      <Route path="deliveries" element={<DeliveriesPage />} />
      <Route path="deliveries/new" element={<RequireRoles roles={['customer']}><NewDeliveryPage /></RequireRoles>} />
      <Route path="deliveries/:id" element={<DeliveryDetailPage />} />
      <Route path="resources" element={<RequireRoles roles={['admin']}><ResourcesPage /></RequireRoles>} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;
}
