import { useEffect, useState } from 'react';
import { Outlet, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, ROLE_DEFINITIONS } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('vi-VN'));
      setDateStr(now.toLocaleDateString('vi-VN'));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cuộn trang mượt mà lên đầu khi đổi tab/trang, tránh cảm giác khựng/giật
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fcf9f4' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>☕</div>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    logout();
    toast.success('Đã đăng xuất');
    navigate('/login');
  };

  const currentRole = user?.role || 'guest';

  // Điều hướng tự động về trang làm việc chính theo vai trò nếu truy cập vào trang chủ mà không có quyền
  const roleDefaultPath = {
    admin: '/',
    cashier: '/',
    waiter: '/',
    barista: '/barista',
    warehouse: '/inventory',
    customer: '/customer',
  }[currentRole] || '/customer';

  // Khách hàng tuyệt đối không vào AppLayout nội bộ quán -> Chuyển ngay sang cổng khách hàng
  if (currentRole === 'customer') {
    return <Navigate to="/customer" replace />;
  }

  if (location.pathname === '/' && !['admin', 'cashier', 'waiter', 'barista'].includes(currentRole)) {
    return <Navigate to={roleDefaultPath} replace />;
  }

  const getCurrentShift = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) {
      return { icon: '☀️', name: 'Ca Sáng', time: '06:30 - 14:30' };
    } else if (hour >= 14 && hour < 22) {
      return { icon: '🌙', name: 'Ca Chiều / Tối', time: '14:30 - 22:30' };
    } else {
      return { icon: '🌙', name: 'Ca Đêm', time: '22:30 - 06:30' };
    }
  };
  const currentShift = getCurrentShift();

  // 1. ROLE-BASED ACCESS CONTROL (RBAC) TABS DEFINITION (Gộp các tính năng theo yêu cầu)
  const ALL_TABS = [
    { to: '/', label: 'TRANG CHỦ (BÀN)', icon: '🪑', roles: ['admin', 'cashier', 'waiter', 'barista'] },
    { to: '/pos', label: 'ĐƠN HÀNG (POS)', icon: '🛒', roles: ['admin', 'cashier', 'waiter'] },
    { to: '/orders', label: 'LIST ĐƠN HÀNG', icon: '📋', roles: ['admin', 'cashier', 'barista', 'waiter'] },
    { to: '/barista', label: 'PHA CHẾ (KDS)', icon: '🍹', roles: ['admin', 'barista'] },
    { to: '/menu', label: 'MENU & CÔNG THỨC', icon: '☕', roles: ['admin', 'cashier', 'barista', 'waiter', 'warehouse'] },
    { to: '/accounts', label: 'QUẢN LÝ TÀI KHOẢN', icon: '👥', roles: ['admin', 'cashier'] },
    { to: '/shifts', label: 'CA TRỰC', icon: '📅', roles: ['admin', 'cashier', 'barista', 'waiter', 'warehouse'] },
    { to: '/inventory', label: 'KHO', icon: '📦', roles: ['admin', 'warehouse'] },
    { to: '/reports', label: 'THỐNG KÊ', icon: '📈', roles: ['admin', 'warehouse', 'cashier'] },
    { to: '/customer', label: 'CỔNG KHÁCH', icon: '🌟', roles: ['admin'] },
  ];

  // Filter tabs allowed for current user role
  const visibleTabs = ALL_TABS.filter((tab) => tab.roles.includes(currentRole));

  const currentRoleObj = (ROLE_DEFINITIONS || []).find((r) => r.role === currentRole) || {
    label: currentRole === 'admin' ? 'Quản Lý Quán' : (currentRole === 'guest' ? 'Khách / Chưa có quyền' : currentRole),
    color: '#64748b',
    bg: '#f1f5f9',
    icon: '👤',
  };

  return (
    <div className="app-container">
      {/* 1. TOP BANNER */}
      <header className="mockup-top-banner">
        <div className="banner-brand notranslate" translate="no">
          <div className="banner-logo-icon">☕</div>
          <div>
            <div className="banner-brand-title notranslate" translate="no">MY COFFEE HOUSE</div>
            <div className="banner-brand-sub">PREMIUM COFFEE &amp; MANAGEMENT SYSTEM</div>
          </div>
        </div>

        {/* RIGHT WIDGETS */}
        <div className="banner-right-widgets">
          <div className="shift-widget">
            <span style={{ fontSize: '1.4rem' }}>{currentShift.icon}</span>
            <div>
              <div className="shift-widget-title">CA LÀM VIỆC</div>
              <div className="shift-widget-value">{currentShift.name}</div>
              <div className="shift-widget-time">{currentShift.time}</div>
            </div>
          </div>

          <div className="user-widget">
            <div className="user-widget-avatar" style={{ background: currentRoleObj.color || '#b45309' }}>
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="shift-widget-title">NHÂN VIÊN</div>
              <div className="user-widget-name">{user?.full_name}</div>
              <div
                style={{
                  display: 'inline-block',
                  background: currentRoleObj.bg || '#fef3c7',
                  color: currentRoleObj.color || '#92400e',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  padding: '1px 8px',
                  borderRadius: '10px',
                  marginTop: '2px',
                }}
              >
                {currentRoleObj.icon} {currentRoleObj.label}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. HORIZONTAL NAVIGATION TABS (Filtered based on Role Permissions) */}
      <nav className="mockup-nav-bar">
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) => `mockup-nav-tab ${isActive ? 'active' : ''}`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}

        <button className="mockup-nav-tab mockup-nav-tab-logout" onClick={handleLogout} title="Đăng xuất khỏi hệ thống">
          <span>🚪</span>
          <span>ĐĂNG XUẤT</span>
        </button>
      </nav>

      {/* 3. MAIN CONTENT BODY WITH SMOOTH UNROLL TRANSITION */}
      <main className="mockup-page-body">
        <div key={location.pathname} className="page-unfold-transition">
          <Outlet />
        </div>
      </main>

      {/* 4. BOTTOM STATUS FOOTER */}
      <footer className="mockup-status-footer notranslate" translate="no">
        <div className="status-footer-left">
          <span>📅 Ngày: <strong>{dateStr}</strong></span>
          <span>⏰ Giờ: <strong>{timeStr}</strong></span>
          <span style={{ marginLeft: '12px' }}>
            Vai trò hiện tại: <strong style={{ color: currentRoleObj.color }}>{currentRoleObj.label}</strong>
          </span>
        </div>

        <div className="status-footer-center notranslate" translate="no">
          🤎 MY COFFEE HOUSE • Thank you see you again! 🤎
        </div>

        <div className="status-footer-right">
          <span className="status-dot-online" />
          <span style={{ color: '#059669' }}>Kết nối: Trực tiếp tại quầy</span>
        </div>
      </footer>
    </div>
  );
}
