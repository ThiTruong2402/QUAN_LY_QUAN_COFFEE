import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const ROLE_DEFINITIONS = [
  { role: 'admin', label: 'Quản Lý Quán', icon: '👑', color: '#b45309', bg: '#fef3c7' },
  { role: 'cashier', label: 'Thu Ngân', icon: '💵', color: '#15803d', bg: '#dcfce7' },
  { role: 'barista', label: 'Pha Chế (Barista)', icon: '☕', color: '#0284c7', bg: '#e0f2fe' },
  { role: 'waiter', label: 'Phục Vụ Bàn', icon: '🛵', color: '#7c3aed', bg: '#f3e8ff' },
  { role: 'warehouse', label: 'Thủ Kho Tiếp Liệu', icon: '📦', color: '#ea580c', bg: '#ffedd5' },
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/auth/me')
        .then((res) => setUser(res.data.data))
        .catch(() => localStorage.clear())
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

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const hasRole = (...roles) => {
    if (!user || !user.role) return false;
    if (user.role === 'admin') return true; // Admin có toàn quyền
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
