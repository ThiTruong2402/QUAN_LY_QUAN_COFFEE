import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const NAV = [
  { section: 'Bán hàng', items: [
    { to: '/', icon: '📊', label: 'Dashboard' },
    { to: '/tables', icon: '🪑', label: 'Sơ đồ bàn' },
    { to: '/orders', icon: '📋', label: 'Đơn hàng' },
    { to: '/barista', icon: '☕', label: 'Màn hình pha chế' },
  ]},
  { section: 'Danh mục', items: [
    { to: '/products', icon: '🍵', label: 'Thực đơn' },
    { to: '/categories', icon: '📂', label: 'Nhóm món' },
  ]},
  { section: 'Kho & Tài chính', items: [
    { to: '/inventory', icon: '📦', label: 'Kho nguyên liệu' },
    { to: '/suppliers', icon: '🚚', label: 'Nhà cung cấp' },
    { to: '/shifts', icon: '🕐', label: 'Quản lý ca' },
  ]},
  { section: 'Khách hàng', items: [
    { to: '/customers', icon: '👥', label: 'Khách hàng' },
    { to: '/promotions', icon: '🎁', label: 'Khuyến mãi' },
  ]},
  { section: 'Quản lý', items: [
    { to: '/staff', icon: '👤', label: 'Nhân viên' },
    { to: '/reports', icon: '📈', label: 'Báo cáo' },
  ]},
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Đã đăng xuất');
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo notranslate" translate="no">
        <div className="sidebar-logo-icon">☕</div>
        <div className="sidebar-logo-name notranslate" translate="no">MY COFFEE HOUSE</div>
        <div className="sidebar-logo-sub">Quản lý quán</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(section => (
          <div key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sidebar-muted)', marginBottom: '2px' }}>Đang đăng nhập</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-sidebar)' }}>{user?.full_name}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--coffee-400)' }}>{user?.role}</div>
        </div>
        <button className="nav-item" style={{ width: '100%' }} onClick={handleLogout}>
          <span className="nav-icon">🚪</span>
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
