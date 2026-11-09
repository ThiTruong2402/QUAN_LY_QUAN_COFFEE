import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

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
      setUser(res.data.data);
      return res.data.data;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/auth/me')
        .then((res) => {
          if (res.data?.success && res.data?.data) {
            setUser(res.data.data);
          } else {
            localStorage.clear();
            setUser(null);
          }
        })
        .catch(() => {
          localStorage.clear();
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
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setUser(u);
    return u;
  };

  const register = async (registerData) => {
    const res = await api.post('/auth/register', registerData);
    const { accessToken, refreshToken, user: u } = res.data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const hasRole = (...roles) => {
    if (!user || !user.role) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, hasRole, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
