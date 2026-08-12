import axios from 'axios';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1', withCredentials: true });
let accessToken = null;
let onRefreshFailure = () => {};
export const setAccessToken = (token) => { accessToken = token; };
export const setRefreshFailureHandler = (handler) => { onRefreshFailure = handler; };
api.interceptors.request.use((config) => { if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`; return config; });
api.interceptors.response.use((response) => response, async (error) => {
  const original = error.config;
  if (error.response?.status === 401 && !original?._retried && !original?.url?.includes('/auth/refresh')) {
    original._retried = true;
    try {
      const response = await api.post('/auth/refresh');
      setAccessToken(response.data.data.accessToken);
      original.headers.Authorization = `Bearer ${response.data.data.accessToken}`;
      return api(original);
    } catch (refreshError) { onRefreshFailure(); return Promise.reject(refreshError); }
  }
  return Promise.reject(error);
});

