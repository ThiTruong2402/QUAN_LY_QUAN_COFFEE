import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    total_all: 0,
    today_count: 0,
    order_actions: 0,
    staff_actions: 0,
    login_actions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 25,
      };
      if (search.trim()) params.search = search.trim();
      if (actionFilter) params.action = actionFilter;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;

      const res = await api.get('/audit-logs', { params });
      if (res.data?.success) {
        setLogs(res.data.data.logs || []);
        setStats(res.data.data.stats || {});
        setTotalPages(res.data.data.pagination.totalPages || 1);
        setTotalCount(res.data.data.pagination.total || 0);
      }
    } catch (err) {
      toast.error('Lỗi tải nhật ký kiểm toán: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleResetFilter = () => {
    setSearch('');
    setActionFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'LOGIN':
        return { label: '🔑 ĐĂNG NHẬP', bg: '#0284c7', color: '#e0f2fe' };
      case 'LOGOUT':
        return { label: '🚪 ĐĂNG XUẤT', bg: '#64748b', color: '#f1f5f9' };
      case 'CREATE_ORDER':
        return { label: '🛒 TẠO ĐƠN HÀNG', bg: '#16a34a', color: '#dcfce7' };
      case 'UPDATE_ORDER_STATUS':
        return { label: '🔄 ĐỔI TIẾN ĐỘ ĐƠN', bg: '#d97706', color: '#fef3c7' };
      case 'CANCEL_ORDER':
        return { label: '❌ HỦY ĐƠN HÀNG', bg: '#dc2626', color: '#fee2e2' };
      case 'PAY_ORDER':
        return { label: '💵 THANH TOÁN', bg: '#059669', color: '#d1fae5' };
      case 'CREATE_STAFF':
        return { label: '👥 TẠO NHÂN SỰ', bg: '#9333ea', color: '#f3e8ff' };
      case 'UPDATE_STAFF':
        return { label: '⚙️ PHÂN QUYỀN / SỬA', bg: '#7c3aed', color: '#ede9fe' };
      case 'DELETE_STAFF':
        return { label: '🔒 KHÓA TÀI KHOẢN', bg: '#b91c1c', color: '#fecaca' };
      case 'ADJUST_STOCK':
        return { label: '📦 ĐIỀU CHỈNH KHO', bg: '#ea580c', color: '#ffedd5' };
      case 'CRUD_PRODUCT':
      case 'ADD_PRODUCT':
      case 'UPDATE_PRODUCT':
      case 'DELETE_PRODUCT':
        return { label: '☕ THỰC ĐƠN / GIÁ', bg: '#ca8a04', color: '#fef9c3' };
      default:
        return { label: action, bg: '#475569', color: '#f8fafc' };
    }
  };

  const getRoleBadge = (roleName) => {
    switch (roleName) {
      case 'admin':
        return { label: 'Admin', color: '#ef4444', bg: '#450a0a' };
      case 'manager':
        return { label: 'Quản Lý', color: '#f59e0b', bg: '#451a03' };
      case 'cashier':
        return { label: 'Thu Ngân', color: '#22c55e', bg: '#052e16' };
      case 'barista':
        return { label: 'Pha Chế', color: '#38bdf8', bg: '#082f49' };
      case 'waiter':
        return { label: 'Phục Vụ', color: '#c084fc', bg: '#3b0764' };
      case 'warehouse':
        return { label: 'Thủ Kho', color: '#fb923c', bg: '#431407' };
      case 'customer':
        return { label: 'Khách Hàng', color: '#2dd4bf', bg: '#042f2e' };
      default:
        return { label: roleName || 'Khách', color: '#94a3b8', bg: '#1e293b' };
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto', color: '#fef3c7' }}>
      {/* 1. HEADER */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid #3d2314'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.8rem' }}>🛡️</span>
            <h1 style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#f59e0b',
              letterSpacing: '0.5px'
            }}>
              THEO DÕI HOẠT ĐỘNG HỆ THỐNG (AUDIT LOGS)
            </h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: '#d4b094' }}>
            Nhật ký kiểm toán bảo mật: Ghi nhận mọi thao tác phân quyền, đăng nhập, tạo đơn và cập nhật dữ liệu của toàn bộ nhân viên.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          style={{
            background: '#24140b',
            border: '1px solid #78350f',
            color: '#fbbf24',
            padding: '9px 18px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {loading ? '⏳ Đang tải...' : '🔄 Làm mới dữ liệu'}
        </button>
      </div>

      {/* 2. STATS CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{ background: '#1c1008', border: '1px solid #451a03', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.76rem', color: '#a88265', fontWeight: 700 }}>TỔNG HOẠT ĐỘNG ĐÃ GHI</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fde68a', marginTop: '4px' }}>
            {Number(stats.total_all || 0).toLocaleString('vi-VN')}
          </div>
        </div>

        <div style={{ background: '#1c1008', border: '1px solid #166534', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.76rem', color: '#86efac', fontWeight: 700 }}>HÔM NAY</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#4ade80', marginTop: '4px' }}>
            {Number(stats.today_count || 0).toLocaleString('vi-VN')}
          </div>
        </div>

        <div style={{ background: '#1c1008', border: '1px solid #0369a1', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.76rem', color: '#7dd3fc', fontWeight: 700 }}>THAO TÁC ĐƠN HÀNG & POS</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>
            {Number(stats.order_actions || 0).toLocaleString('vi-VN')}
          </div>
        </div>

        <div style={{ background: '#1c1008', border: '1px solid #6b21a8', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.76rem', color: '#d8b4fe', fontWeight: 700 }}>PHÂN QUYỀN & NHÂN SỰ</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#c084fc', marginTop: '4px' }}>
            {Number(stats.staff_actions || 0).toLocaleString('vi-VN')}
          </div>
        </div>

        <div style={{ background: '#1c1008', border: '1px solid #78350f', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.76rem', color: '#fde68a', fontWeight: 700 }}>LƯỢT ĐĂNG NHẬP</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24', marginTop: '4px' }}>
            {Number(stats.login_actions || 0).toLocaleString('vi-VN')}
          </div>
        </div>
      </div>

      {/* 3. FILTER BAR */}
      <form onSubmit={handleSearchSubmit} style={{
        background: '#1c1008',
        border: '1px solid #3d2314',
        borderRadius: '12px',
        padding: '14px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'center'
      }}>
        <div style={{ flex: '1 1 240px' }}>
          <input
            type="text"
            placeholder="🔍 Tìm kiếm theo nội dung, tên nhân viên, username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#24140b',
              border: '1px solid #5a341e',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          />
        </div>

        <div style={{ flex: '0 1 180px' }}>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#24140b',
              border: '1px solid #5a341e',
              borderRadius: '6px',
              color: '#fef3c7',
              fontSize: '0.85rem'
            }}
          >
            <option value="">-- Tất cả hành động --</option>
            <option value="LOGIN">🔑 Đăng nhập hệ thống</option>
            <option value="ORDER">🛒 Thao tác đơn hàng</option>
            <option value="STAFF">👥 Phân quyền & Nhân sự</option>
            <option value="INVENTORY">📦 Kho nguyên liệu</option>
            <option value="MENU">☕ Thực đơn & Giá</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', color: '#d4b094' }}>Từ:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '7px 10px',
              background: '#24140b',
              border: '1px solid #5a341e',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.82rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', color: '#d4b094' }}>Đến:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '7px 10px',
              background: '#24140b',
              border: '1px solid #5a341e',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.82rem'
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            background: '#d97706',
            border: 'none',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          Lọc
        </button>

        <button
          type="button"
          onClick={handleResetFilter}
          style={{
            background: 'transparent',
            border: '1px solid #5a341e',
            color: '#d4b094',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          Đặt lại
        </button>
      </form>

      {/* 4. LOGS TABLE */}
      <div style={{
        background: '#1c1008',
        border: '1px solid #3d2314',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#24140b', borderBottom: '1px solid #3d2314', color: '#fbbf24', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '12px 14px' }}>Thời gian</th>
                <th style={{ padding: '12px 14px' }}>Người thực hiện</th>
                <th style={{ padding: '12px 14px' }}>Hành động</th>
                <th style={{ padding: '12px 14px' }}>Nội dung chi tiết</th>
                <th style={{ padding: '12px 14px' }}>Địa chỉ IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#a88265' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />
                    Đang tải nhật ký kiểm toán...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#a88265' }}>
                    📭 Không có dữ liệu hoạt động nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const roleB = getRoleBadge(log.role_name);
                  const timeFormatted = new Date(log.created_at).toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  });

                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: '1px solid #2d180d',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#28160c'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#d4b094', fontSize: '0.82rem' }}>
                        {timeFormatted}
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {log.user_id ? (
                          <div>
                            <div style={{ fontWeight: 700, color: '#fef3c7' }}>
                              {log.full_name || log.username}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <span style={{ fontSize: '0.72rem', color: '#a88265' }}>
                                @{log.username}
                              </span>
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                color: roleB.color,
                                background: roleB.bg,
                                border: `1px solid ${roleB.color}40`
                              }}>
                                {roleB.label}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Khách / Hệ thống</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: badge.bg,
                          color: badge.color
                        }}>
                          {badge.label}
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px', color: '#fef3c7', lineHeight: 1.4 }}>
                        <div>{log.reason || '—'}</div>
                        {log.entity_type && (
                          <div style={{ fontSize: '0.72rem', color: '#a88265', marginTop: '2px' }}>
                            Thực thể: <span style={{ color: '#fbbf24' }}>{log.entity_type}</span> {log.entity_id ? `(#${log.entity_id})` : ''}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#a88265', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        {log.ip_address || '127.0.0.1'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. PAGINATION */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#24140b',
          borderTop: '1px solid #3d2314',
          fontSize: '0.85rem'
        }}>
          <span style={{ color: '#d4b094' }}>
            Hiển thị <strong>{logs.length}</strong> / <strong>{totalCount}</strong> hoạt động (Trang {page}/{totalPages})
          </span>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={{
                background: '#1c1008',
                border: '1px solid #5a341e',
                color: page <= 1 ? '#5a341e' : '#fbbf24',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              ← Trang trước
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              style={{
                background: '#1c1008',
                border: '1px solid #5a341e',
                color: page >= totalPages ? '#5a341e' : '#fbbf24',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Trang sau →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
