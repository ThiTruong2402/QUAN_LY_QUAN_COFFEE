import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import socket from '../api/socket';
import { playNotificationSound } from '../utils/sound';
import toast from 'react-hot-toast';

const SvgIcon = ({ d, size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
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

const ROUTE_TITLES = {
  '/': 'Sơ đồ bàn phục vụ',
  '/pos': 'Bán hàng tại quầy (POS)',
  '/orders': 'Quản lý đơn hàng',
  '/barista': 'Màn hình pha chế (KDS)',
  '/menu': 'Thực đơn & Định lượng công thức',
  '/inventory': 'Quản lý kho nguyên liệu',
  '/shifts': 'Lịch phân ca nhân sự',
  '/reports': 'Báo cáo & Thống kê doanh thu',
  '/accounts': 'Tài khoản & Phân quyền',
  '/audit-logs': 'Nhật ký hoạt động hệ thống',
  '/settings': 'Cấu hình cửa hàng',
};

const getCurrentShiftInfo = () => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const totalM = h * 60 + m;
  if (totalM >= 6 * 60 + 30 && totalM < 14 * 60 + 30) {
    return { name: 'Ca Sáng', icon: '☀️', time: '06:30 - 14:30' };
  } else if (totalM >= 14 * 60 + 30 && totalM < 22 * 60 + 30) {
    return { name: 'Ca Chiều', icon: '🌤️', time: '14:30 - 22:30' };
  } else {
    return { name: 'Ca Đêm', icon: '🌙', time: '22:30 - 06:30' };
  }
};

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [shiftInfo, setShiftInfo] = useState(getCurrentShiftInfo());

  const userRole = user?.role || 'admin';
  const currentTitle = ROUTE_TITLES[location.pathname] || 'My Coffee House';

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
    const interval = setInterval(() => {
      setShiftInfo(getCurrentShiftInfo());
    }, 60000);

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
      clearInterval(interval);
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
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background: #F6F3EE !important;
          color: #1F1611 !important;
          font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .mch-sidebar {
          width: ${collapsed ? '68px' : '236px'};
          flex-shrink: 0;
          background: linear-gradient(180deg, #24160F 0%, #170E09 100%);
          border-right: 1px solid #352116;
          display: flex;
          flex-direction: column;
          transition: width 0.2s ease;
          height: 100vh;
          overflow: hidden;
          z-index: 40;
          color: #EFE6DC;
        }
        .mch-brand {
          height: 56px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }
        .mch-nav-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 10px 8px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .mch-nav-scroll::-webkit-scrollbar { width: 4px; }
        .mch-nav-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 4px; }
        .mch-group-label {
          font-size: 0.66rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: #9C8370;
          padding: 0 10px 4px;
          display: ${collapsed ? 'none' : 'block'};
        }
        .mch-nav-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 9px;
          color: #D6C7B8;
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 500;
          transition: all 0.15s ease;
          justify-content: ${collapsed ? 'center' : 'flex-start'};
          position: relative;
        }
        .mch-nav-link:hover {
          background: rgba(255, 255, 255, 0.07);
          color: #FFFFFF;
        }
        .mch-nav-link.active {
          background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
          color: #FFFFFF;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35);
        }
        .mch-shell {
          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background: #F7F5F0;
        }
        .mch-main {
          flex: 1;
          min-width: 0 !important;
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .mch-topbar {
          height: 58px;
          flex-shrink: 0;
          background: #18181B;
          border-bottom: 1px solid #27272B;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 30;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
        }
        .mch-content {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px 24px;
          scroll-behavior: smooth;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
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
              width: '32px', height: '32px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #F59E0B, #B45309)', color: '#FFFFFF',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.85rem'
            }}>
              ☕
            </div>
            {!collapsed && (
              <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF', lineHeight: 1.15 }}>My Coffee House</div>
                <div style={{ fontSize: '0.67rem', color: '#B09884' }}>Hệ thống quản lý POS</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            style={{ background: 'transparent', border: 'none', color: '#B09884', cursor: 'pointer', padding: '4px', display: 'flex' }}
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            <SvgIcon size={16} d={collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />} />
          </button>
        </div>

        <nav className="mch-nav-scroll">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title}>
                <div className="mch-group-label">{group.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
        </nav>
      </aside>

      <div className="mch-main">
        <header className="mch-topbar">
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#F4F1EC', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{currentTitle}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Widget Ca trực hiện tại */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#202024', border: '1px solid #2E2E35',
              padding: '5px 10px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 600, color: '#D4D4D8'
            }} title={`Ca trực: ${shiftInfo.time}`}>
              <span>{shiftInfo.icon}</span>
              <span>{shiftInfo.name}</span>
              <span style={{ color: '#52525B' }}>•</span>
              <span style={{ color: '#A1A1AA' }}>{shiftInfo.time}</span>
            </div>

            {/* Quick button Cổng khách hàng */}
            <button
              type="button"
              onClick={() => window.open('/customer', '_blank')}
              style={{
                background: 'rgba(217, 119, 6, 0.15)', border: '1px solid rgba(217, 119, 6, 0.35)', color: '#FBBF24',
                padding: '6px 13px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.15s ease'
              }}
              title="Mở cổng khách đặt món trực tuyến trong tab mới"
            >
              <span>Cổng khách hàng</span>
              <SvgIcon size={13} d={<><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>} />
            </button>

            <div style={{ width: '1px', height: '22px', background: '#2E2E35' }} />

            {/* User Profile & Logout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%',
                background: '#27272B', border: '1px solid #3F3F46', color: '#F59E0B', fontSize: '0.78rem', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {(user?.full_name || user?.name || user?.username || 'A').charAt(0).toUpperCase()}
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC' }}>
                  {user?.full_name || user?.name || user?.username || 'Quản trị viên'}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#A1A1AA', textTransform: 'capitalize' }}>
                  {userRole}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { logout(); navigate('/login'); }}
                title="Đăng xuất"
                style={{
                  marginLeft: '4px', background: 'rgba(220, 38, 38, 0.15)', border: '1px solid rgba(220, 38, 38, 0.3)', color: '#F87171',
                  width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s ease'
                }}
              >
                <SvgIcon size={14} d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>} />
              </button>
            </div>
          </div>
        </header>

        <main className="mch-content">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
