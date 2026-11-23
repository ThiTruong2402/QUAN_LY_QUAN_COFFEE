import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import socket from '../api/socket';
import { playNotificationSound } from '../utils/sound';
import toast from 'react-hot-toast';

const SvgIcon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const NAV_GROUPS = [
  {
    title: 'Vận hành tại quầy',
    items: [
      { to: '/', label: 'Sơ đồ bàn', roles: ['admin', 'manager', 'cashier', 'waiter', 'barista'], end: true, icon: <SvgIcon d={<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>} /> },
      { to: '/pos', label: 'Bán hàng (POS)', roles: ['admin', 'manager', 'cashier', 'waiter'], icon: <SvgIcon d={<><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>} /> },
      { to: '/orders', label: 'Đơn hàng', roles: ['admin', 'manager', 'cashier', 'waiter', 'barista'], hasBadge: true, icon: <SvgIcon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>} /> },
      { to: '/barista', label: 'Pha chế (KDS)', roles: ['admin', 'manager', 'barista'], icon: <SvgIcon d={<><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/></>} /> },
    ],
  },
  {
    title: 'Quản lý cửa hàng',
    items: [
      { to: '/menu', label: 'Thực đơn & Công thức', roles: ['admin', 'manager', 'cashier', 'barista', 'waiter', 'warehouse'], icon: <SvgIcon d={<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>} /> },
      { to: '/inventory', label: 'Kho nguyên liệu', roles: ['admin', 'manager', 'warehouse', 'barista', 'cashier'], icon: <SvgIcon d={<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>} /> },
      { to: '/shifts', label: 'Lịch phân ca', roles: ['admin', 'manager', 'cashier', 'barista', 'waiter', 'warehouse'], icon: <SvgIcon d={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} /> },
      { to: '/reports', label: 'Thống kê & Doanh thu', roles: ['admin', 'manager'], icon: <SvgIcon d={<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>} /> },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { to: '/accounts', label: 'Tài khoản & Phân quyền', roles: ['admin', 'manager'], icon: <SvgIcon d={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>} /> },
      { to: '/audit-logs', label: 'Nhật ký hoạt động', roles: ['admin'], icon: <SvgIcon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>} /> },
      { to: '/settings', label: 'Cấu hình quán', roles: ['admin'], icon: <SvgIcon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>} /> },
    ],
  },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  const userRole = user?.role || 'admin';

  const fetchPendingCount = async () => {
    try {
      const res = await api.get('/orders/all');
      const list = res.data?.data || [];
      const pending = list.filter((o) => ['pending', 'preparing', 'open'].includes(o.status));
      setPendingOrdersCount(pending.length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPendingCount();

    const handleNewOrder = (payload) => {
      playNotificationSound();
      toast.success(`🔔 CÓ ĐƠN HÀNG MỚI: #${payload?.orderCode || ''}!`, { duration: 6000 });
      fetchPendingCount();
    };

    const handleUpdate = () => {
      fetchPendingCount();
    };

    socket.on('newOrder', handleNewOrder);
    socket.on('order:created', handleNewOrder);
    socket.on('order:status-changed', handleUpdate);
    socket.on('table:status-changed', handleUpdate);

    return () => {
      socket.off('newOrder', handleNewOrder);
      socket.off('order:created', handleNewOrder);
      socket.off('order:status-changed', handleUpdate);
      socket.off('table:status-changed', handleUpdate);
    };
  }, []);

  return (
    <div className="mch-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');

        .mch-shell {
          display: flex;
          min-height: 100vh;
          background: #F6F4F0;
          color: #1C1917;
          font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .mch-sidebar {
          width: ${collapsed ? '74px' : '246px'};
          flex-shrink: 0;
          background: #FFFFFF;
          border-right: 1px solid #E7E2DA;
          display: flex;
          flex-direction: column;
          transition: width 0.2s ease;
          position: sticky;
          top: 0;
          height: 100vh;
          z-index: 30;
        }
        .mch-brand {
          height: 62px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #F0ECE5;
        }
        .mch-nav-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 14px 10px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .mch-group-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #A8A29E;
          padding: 0 10px 6px;
          display: ${collapsed ? 'none' : 'block'};
        }
        .mch-nav-link {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 9px 11px;
          border-radius: 10px;
          color: #57534E;
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 500;
          transition: background 0.15s ease, color 0.15s ease;
          justify-content: ${collapsed ? 'center' : 'flex-start'};
          position: relative;
        }
        .mch-nav-link:hover {
          background: #F5F2EC;
          color: #1C1917;
        }
        .mch-nav-link.active {
          background: #2C1A12;
          color: #FFFFFF;
          font-weight: 600;
        }
        .mch-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: #F6F4F0;
        }
        .mch-content {
          flex: 1;
          padding: 22px 28px;
          max-width: 1560px;
          width: 100%;
          margin: 0 auto;
        }
        .mch-badge {
          background: #DC2626;
          color: #FFFFFF;
          font-size: 0.68rem;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 10px;
          margin-left: auto;
        }
      `}</style>

      <aside className="mch-sidebar">
        <div className="mch-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px',
              background: '#2C1A12', color: '#FAF6F0', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem'
            }}>
              ☕
            </div>
            {!collapsed && (
              <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1C1917', lineHeight: 1.2 }}>My Coffee House</div>
                <div style={{ fontSize: '0.7rem', color: '#78716C' }}>Hệ thống quản lý POS</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            style={{ background: 'transparent', border: 'none', color: '#78716C', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <SvgIcon size={17} d={collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />} />
          </button>
        </div>

        <nav className="mch-nav-scroll">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title}>
                <div className="mch-group-label">{group.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) => `mch-nav-link ${isActive ? 'active' : ''}`}
                    >
                      <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                      {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                      {!collapsed && item.hasBadge && pendingOrdersCount > 0 && (
                        <span className="mch-badge">{pendingOrdersCount}</span>
                      )}
                      {collapsed && item.hasBadge && pendingOrdersCount > 0 && (
                        <span style={{
                          position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px',
                          borderRadius: '50%', background: '#DC2626'
                        }} />
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Quick link to Customer Portal */}
          <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
            <button
              type="button"
              onClick={() => window.open('/customer', '_blank')}
              title="Mở cổng khách đặt món trực tuyến"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                background: '#FDF8F3',
                border: '1px solid #F2DEC8',
                borderRadius: '8px',
                color: '#C86A28',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                justifyContent: collapsed ? 'center' : 'flex-start'
              }}
            >
              <SvgIcon size={16} d={<><circle cx="12" cy="12" r="10"/><polygon points="12 8 8 12 12 16 12 8"/></>} />
              {!collapsed && <span>CỔNG KHÁCH HÀNG ↗</span>}
            </button>
          </div>
        </nav>

        <div style={{ padding: '12px', borderTop: '1px solid #F0ECE5' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
            gap: '8px', background: '#FAF8F5', padding: '8px 10px', borderRadius: '10px', border: '1px solid #EFEAE1'
          }}>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1C1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.full_name || user?.name || 'Quản trị viên'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#78716C', textTransform: 'capitalize' }}>
                  {userRole}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => { logout(); navigate('/login'); }}
              title="Đăng xuất"
              style={{
                background: '#FFFFFF', border: '1px solid #E7E2DA', color: '#DC2626',
                width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}
            >
              <SvgIcon size={15} d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>} />
            </button>
          </div>
        </div>
      </aside>

      <div className="mch-main">
        <main className="mch-content">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
