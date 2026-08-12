import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken, setRefreshFailureHandler } from '../lib/api.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setRefreshFailureHandler(() => { setAccessToken(null); setUser(null); });
    api.post('/auth/refresh').then(({ data }) => { setAccessToken(data.data.accessToken); setToken(data.data.accessToken); setUser(data.data.user); }).catch(() => {}).finally(() => setReady(true));
  }, []);
  const value = useMemo(() => ({
    user, token, ready,
    async login(credentials) { const { data } = await api.post('/auth/login', credentials); setAccessToken(data.data.accessToken); setToken(data.data.accessToken); setUser(data.data.user); },
    async register(details) { const { data } = await api.post('/auth/register', details); setAccessToken(data.data.accessToken); setToken(data.data.accessToken); setUser(data.data.user); },
    async logout() { await api.post('/auth/logout').catch(() => {}); setAccessToken(null); setToken(null); setUser(null); }
  }), [user, token, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
