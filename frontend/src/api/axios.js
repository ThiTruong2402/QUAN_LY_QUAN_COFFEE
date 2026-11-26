import axios from 'axios';

// Support multi-device access (LAN Wi-Fi, 4G/5G, Internet Tunnel, Cloud Production):
// Default production backend on Render if VITE_API_URL is not set on Vercel
const CLOUD_BACKEND_URL = 'https://my-coffee-house-api.onrender.com';
const envBackend = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const cleanBackendUrl = envBackend
  ? envBackend.replace(/\/api$/, '')
  : (import.meta.env.PROD ? CLOUD_BACKEND_URL : '');

export const API_BASE_URL = cleanBackendUrl ? `${cleanBackendUrl}/api` : '/api';
export const BACKEND_URL = cleanBackendUrl || 'http://localhost:5000';

/**
 * Chuẩn hóa URL ảnh món ăn (tự động gắn host Render cho ảnh upload khi chạy bản Vercel production).
 */
export const resolveProductImage = (imageUrl, fallbackUrl = '') => {
  if (!imageUrl) return fallbackUrl;
  const trimmed = String(imageUrl).trim();
  if (!trimmed) return fallbackUrl;
  if (trimmed.startsWith('/api/') && import.meta.env.PROD && cleanBackendUrl) {
    return `${cleanBackendUrl}${trimmed}`;
  }
  return trimmed;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Auto attach token (sessionStorage để mỗi lần mở link/tab mới luôn yêu cầu đăng nhập)
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/register') || original?.url?.includes('/auth/refresh');
    if (err.response?.status === 401 && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        const refreshToken = sessionStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('Missing refreshToken');
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        sessionStorage.setItem('accessToken', data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        sessionStorage.clear();
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
