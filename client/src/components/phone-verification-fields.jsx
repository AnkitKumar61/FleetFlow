import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';

export function PhoneVerificationFields({ phone, onPhoneChange, onVerified, scope = 'customer', disabled = false }) {
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [testCode, setTestCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [verified, setVerified] = useState(false);
  const [resendWait, setResendWait] = useState(0);
  const basePath = scope === 'customer' ? '/auth/phone-verifications' : '/phone-verifications';

  useEffect(() => {
    if (!resendWait) return undefined;
    const timer = setInterval(() => setResendWait((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendWait]);

  const changePhone = (value) => {
    onPhoneChange(value);
    onVerified('');
    setVerificationId('');
    setCode('');
    setTestCode('');
    setMessage('');
    setError('');
    setVerified(false);
    setResendWait(0);
  };

  const sendCode = async () => {
    setBusy('send');
    setError('');
    setMessage('');
    try {
      const response = await api.post(basePath, { phone });
      setVerificationId(response.data.data.verificationId);
      setTestCode(response.data.data.testCode ?? '');
      setCode('');
      setVerified(false);
      onVerified('');
      setResendWait(30);
      setMessage('The test code is valid for 5 minutes.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Could not create a verification code.');
    } finally {
      setBusy('');
    }
  };

  const verifyCode = async () => {
    setBusy('verify');
    setError('');
    try {
      const response = await api.post(`${basePath}/verify`, { verificationId, phone, code });
      onVerified(response.data.data.verificationToken);
      setVerified(true);
      setMessage('Phone number verified.');
      setTestCode('');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Could not verify the phone number.');
    } finally {
      setBusy('');
    }
  };

  return <div className="phone-verification">
    <div className="phone-verification-heading"><ShieldCheck/><div><strong>Test phone verification</strong><small>No SMS is sent in this demonstration.</small></div>{verified && <button type="button" className="text-button" onClick={() => changePhone('')}>Change number</button>}</div>
    <div className="phone-verification-entry">
      <label>Phone number<input required type="tel" value={phone} onChange={(event) => changePhone(event.target.value)} placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" title="Use the international format, for example +919876543210" autoComplete="tel" disabled={disabled || verified}/></label>
      <button type="button" className="button button--secondary" onClick={sendCode} disabled={disabled || verified || busy || resendWait > 0 || !phone}>{busy === 'send' ? 'Creating code…' : resendWait ? `Resend in ${resendWait}s` : verificationId ? 'Resend code' : 'Send test code'}</button>
    </div>
    {verificationId && !verified && <div className="phone-code-entry">
      <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} pattern="[0-9]{6}" maxLength="6"/></label>
      <button type="button" className="button" onClick={verifyCode} disabled={disabled || busy || code.length !== 6}>{busy === 'verify' ? 'Checking…' : 'Verify phone'}</button>
    </div>}
    {testCode && <p className="phone-test-code" role="status">Test code: <code>{testCode}</code></p>}
    {message && <p className={verified ? 'phone-verification-success' : 'phone-verification-note'} role="status">{verified && <CheckCircle2/>}{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
