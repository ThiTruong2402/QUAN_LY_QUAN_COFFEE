import axios from 'axios';

// Support multi-device access (LAN Wi-Fi, 4G/5G, Internet Tunnel, Cloud Production):
// When deployed on Vercel, set VITE_API_URL=https://your-backend.onrender.com
const envBackend = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const API_BASE_URL = envBackend
  ? (envBackend.endsWith('/api') ? envBackend : `${envBackend}/api`)
  : '/api';
export const BACKEND_URL = envBackend || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Auto attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
