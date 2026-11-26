import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
 
const ACTION_BADGES = {
  LOGIN:               { label: 'Đăng nhập',       cls: 'ui-badge-blue' },
  CREATE_ORDER:        { label: 'Tạo đơn',         cls: 'ui-badge-green' },
  UPDATE_ORDER_STATUS: { label: 'Cập nhật đơn',    cls: 'ui-badge-amber' },
  CANCEL_ORDER:        { label: 'Hủy đơn',         cls: 'ui-badge-red' },
  UPDATE_PRODUCT:      { label: 'Cập nhật món',    cls: 'ui-badge-amber' },
  CREATE_STAFF:        { label: 'Tạo tài khoản',   cls: 'ui-badge-purple' },
  UPDATE_STAFF:        { label: 'Sửa phân quyền',  cls: 'ui-badge-purple' },
  DELETE_STAFF:        { label: 'Xóa tài khoản',   cls: 'ui-badge-red' },
};
 
export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ total_all: 0, today_count: 0, order_actions: 0, staff_actions: 0, login_actions: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
 
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
 
  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search.trim()) params.set('search', search.trim());
      if (action) params.set('action', action);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
 
      const res = await api.get(`/audit-logs?${params.toString()}`);
      if (res.data?.success && res.data.data) {
        setLogs(res.data.data.logs || []);
        setStats(res.data.data.stats || {});
        setPagination(res.data.data.pagination || { page: 1, totalPages: 1, total: 0 });
      }
    } catch {
      toast.error('Không thể tải nhật ký hoạt động');
    } finally {
      setLoading(false);
    }
  };
 
  useEffect(() => { fetchLogs(1); }, []);
 
  const handleReset = () => {
    setSearch('');
    setAction('');
    setFromDate('');
    setToDate('');
    setTimeout(() => fetchLogs(1), 0);
  };
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', minWidth: 0 }}>
      {/* HEADER GỌN GÀNG KHÔNG IN HOA SERIF, KHÔNG TRÀN MÉP PHẢI */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '8px' }}>
        <button type="button" className="ui-btn ui-btn-outline" onClick={() => fetchLogs(pagination.page)}>
          Làm mới dữ liệu
        </button>
      </div>
 
      {/* 5 THẺ KPI ĐỒNG NHẤT TRẮNG SẠCH (BỎ 5 VIỀN NEON PHÁT SÁNG) */}
      <div className="ui-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))' }}>
        <div className="ui-kpi-card">
          <span className="ui-kpi-label">Tổng lượt ghi nhận</span>
          <span className="ui-kpi-value">{stats.total_all || 0}</span>
        </div>
        <div className="ui-kpi-card">
          <span className="ui-kpi-label">Phát sinh hôm nay</span>
          <span className="ui-kpi-value" style={{ color: '#34D399' }}>{stats.today_count || 0}</span>
        </div>
        <div className="ui-kpi-card">
          <span className="ui-kpi-label">Thao tác đơn hàng</span>
          <span className="ui-kpi-value" style={{ color: '#38BDF8' }}>{stats.order_actions || 0}</span>
        </div>
        <div className="ui-kpi-card">
          <span className="ui-kpi-label">Phân quyền &amp; Nhân sự</span>
          <span className="ui-kpi-value" style={{ color: '#C084FC' }}>{stats.staff_actions || 0}</span>
        </div>
        <div className="ui-kpi-card">
          <span className="ui-kpi-label">Lượt đăng nhập</span>
          <span className="ui-kpi-value" style={{ color: '#F59E0B' }}>{stats.login_actions || 0}</span>
        </div>
      </div>
 
      {/* THANH BỘ LỌC TỰ CO GIÃN (FLEX-WRAP) KHÔNG BỊ CẮT NÚT BÊN PHẢI */}
      <div className="ui-card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            className="ui-input"
            style={{ flex: '1 1 220px', minWidth: '180px' }}
            placeholder="Tìm theo nội dung, tên nhân viên, tài khoản..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLogs(1)}
          />
          <select className="ui-select" style={{ width: '175px' }} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tất cả hành động</option>
            <option value="LOGIN">Đăng nhập</option>
            <option value="ORDER">Nhóm đơn hàng</option>
            <option value="STAFF">Nhóm nhân sự</option>
            <option value="MENU">Nhóm thực đơn</option>
            <option value="INVENTORY">Nhóm kho</option>
          </select>
          <input type="date" className="ui-input" style={{ width: '142px' }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="ui-input" style={{ width: '142px' }} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <button type="button" className="ui-btn ui-btn-brand" onClick={() => fetchLogs(1)}>Lọc</button>
          <button type="button" className="ui-btn ui-btn-outline" onClick={handleReset}>Đặt lại</button>
        </div>
      </div>
 
      {/* BẢNG NHẬT KÝ RÕ RÀNG, ĐỦ CỘT ĐỊA CHỈ IP KHÔNG BỊ CẮT */}
      <div className="ui-card">
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Hành động</th>
                <th>Nội dung chi tiết</th>
                <th style={{ textAlign: 'right' }}>Địa chỉ IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#A1A1AA' }}>Đang tải nhật ký...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#A1A1AA' }}>Không tìm thấy bản ghi nhật ký phù hợp.</td></tr>
              ) : logs.map((row) => {
                const badge = ACTION_BADGES[row.action] || { label: row.action, cls: 'ui-badge-gray' };
                return (
                  <tr key={row.id}>
                    <td className="ui-nowrap" style={{ fontSize: '0.8rem', color: '#A1A1AA' }}>
                      {new Date(row.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="ui-nowrap">
                      <div style={{ fontWeight: 700, color: '#F4F1EC' }}>{row.full_name || row.username || 'Hệ thống'}</div>
                      <div style={{ fontSize: '0.73rem', color: '#A1A1AA' }}>
                        @{row.username || 'system'} • {row.role_label || row.role_name || '—'}
                      </div>
                    </td>
                    <td className="ui-nowrap">
                      <span className={`ui-badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: '#F4F1EC' }}>{row.reason || '—'}</div>
                      {row.entity_type && (
                        <div style={{ fontSize: '0.73rem', color: '#A1A1AA', marginTop: '2px' }}>
                          Đối tượng: {row.entity_type} #{row.entity_id}
                        </div>
                      )}
                    </td>
                    <td className="ui-nowrap" style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8rem', color: '#A1A1AA' }}>
                      {(row.ip_address || '—').replace('::ffff:', '')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
 
        {/* Phân trang */}
        {pagination.totalPages > 1 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #2A2A30', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#A1A1AA' }}>
            <span>Trang {pagination.page} / {pagination.totalPages} ({pagination.total} bản ghi)</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" className="ui-btn ui-btn-outline" style={{ height: '32px' }} disabled={pagination.page <= 1} onClick={() => fetchLogs(pagination.page - 1)}>Trước</button>
              <button type="button" className="ui-btn ui-btn-outline" style={{ height: '32px' }} disabled={pagination.page >= pagination.totalPages} onClick={() => fetchLogs(pagination.page + 1)}>Sau</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
