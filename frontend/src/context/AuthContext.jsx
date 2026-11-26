import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import socket, { reconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export const ROLE_DEFINITIONS = [
  { role: 'admin', label: 'Quản Trị Hệ Thống', icon: '🛡️', color: '#dc2626', bg: '#fee2e2' },
  { role: 'manager', label: 'Quản Lý Quán', icon: '👔', color: '#b45309', bg: '#fef3c7' },
  { role: 'cashier', label: 'Thu Ngân', icon: '💵', color: '#15803d', bg: '#dcfce7' },
  { role: 'barista', label: 'Pha Chế (Barista)', icon: '☕', color: '#0284c7', bg: '#e0f2fe' },
  { role: 'waiter', label: 'Phục Vụ Bàn', icon: '🛵', color: '#7c3aed', bg: '#f3e8ff' },
  { role: 'warehouse', label: 'Thủ Kho Tiếp Liệu', icon: '📦', color: '#ea580c', bg: '#ffedd5' },
  { role: 'customer', label: 'Khách Hàng', icon: '🌟', color: '#0d9488', bg: '#ccfbf1' },
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.data) {
        setUser(res.data.data);
        sessionStorage.setItem('user', JSON.stringify(res.data.data));
        return res.data.data;
      }
      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    // Dọn token tồn đọng trong localStorage (nếu có) để mọi phiên mở link mới luôn qua Đăng nhập
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    const token = sessionStorage.getItem('accessToken');
    if (token) {
      api.get('/auth/me')
        .then((res) => {
          if (res.data?.success && res.data?.data) {
            setUser(res.data.data);
          } else {
            sessionStorage.clear();
            setUser(null);
          }
        })
        .catch(() => {
          sessionStorage.clear();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { accessToken, refreshToken, user: u } = res.data.data;
    sessionStorage.setItem('accessToken', accessToken);
    if (refreshToken) sessionStorage.setItem('refreshToken', refreshToken);
    sessionStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    reconnectSocket();
    return u;
  };

  const register = async (registerData) => {
    const res = await api.post('/auth/register', registerData);
    const { accessToken, refreshToken, user: u } = res.data.data;
    sessionStorage.setItem('accessToken', accessToken);
    if (refreshToken) sessionStorage.setItem('refreshToken', refreshToken);
    sessionStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    reconnectSocket();
    return u;
  };

  const logout = () => {
    socket.disconnect();
    sessionStorage.clear();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  const hasRole = (...roles) => {
    if (!user || !user.role) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, hasRole, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
