import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/auth-context.jsx';
import { PhoneVerificationFields } from '../components/phone-verification-fields.jsx';

function AuthLayout({ mode }) {
  const { user, login, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: mode === 'login' ? 'admin@fleetflow.demo' : '', phone: '', phoneVerificationToken: '', password: mode === 'login' ? 'Demo1234' : '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await (mode === 'login' ? login({ email: form.email, password: form.password }) : register(form)); } catch (err) { setError(err.response?.data?.error?.message ?? 'Could not complete sign in. Check the API connection.'); } finally { setBusy(false); } };
  return <main className="auth-page">
    <section className="auth-story"><div className="brand brand--light"><span className="brand-mark">FF</span><strong>FleetFlow</strong></div><div className="route-graphic" aria-hidden="true"><span>BLR</span><i/><b>04</b><i/><span>DEL</span></div><div><h1>Every handoff.<br/>One operating truth.</h1><p>Plan, dispatch and verify deliveries without losing the thread between teams.</p><ul><li><CheckCircle2/> Server-enforced delivery lifecycle</li><li><CheckCircle2/> Transaction-safe resource assignment</li><li><CheckCircle2/> Role-specific operational views</li></ul></div><small>Synthetic demo environment · No production claims</small></section>
    <section className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><div><h2>{mode === 'login' ? 'Sign in to FleetFlow' : 'Create a customer account'}</h2><p>{mode === 'login' ? 'Admins, drivers and customers sign in here.' : 'Customers can create their own account here.'}</p></div>
      {mode === 'register' && <><label>Full name<input required minLength="2" value={form.name} onChange={(e) => setForm({...form,name:e.target.value})} autoComplete="name" /></label><PhoneVerificationFields phone={form.phone} onPhoneChange={(phone) => setForm((current) => ({ ...current, phone }))} onVerified={(phoneVerificationToken) => setForm((current) => ({ ...current, phoneVerificationToken }))}/></>}
      <label>Email address<input required type="email" value={form.email} onChange={(e) => setForm({...form,email:e.target.value})} autoComplete="email" /></label>
      <label>Password<input required type="password" minLength="8" value={form.password} onChange={(e) => setForm({...form,password:e.target.value})} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" disabled={busy || (mode === 'register' && !form.phoneVerificationToken)}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create customer account'} <ArrowRight /></button>
      <p className="auth-switch">{mode === 'login' ? <>New customer? <Link to="/register">Create an account</Link></> : <>Already registered? <Link to="/login">Sign in</Link></>}</p>
    </form></section>
  </main>;
}
export const LoginPage = () => <AuthLayout mode="login" />;
export const RegisterPage = () => <AuthLayout mode="register" />;
export default function AuthPages({ mode }) { return <AuthLayout mode={mode}/>; }
