import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import socket from '../api/socket';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
 
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
 
const getElapsedMinutes = (openedAt) => {
  if (!openedAt) return 0;
  const diff = Date.now() - new Date(openedAt).getTime();
  return Math.max(1, Math.floor(diff / 60000));
};
 
const Icon = {
  Plus: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Refresh: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
    </svg>
  ),
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Users: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Clock: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Swap: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};
 
const shortAreaName = (name = "") => name.split(" - ")[0].trim();

export default function Tables() {
  const { user } = useAuth();
  const canOperateTable = ['admin', 'manager', 'cashier', 'waiter'].includes(user?.role);
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [areas, setAreas] = useState([]);
  const [onlineOrdersCount, setOnlineOrdersCount] = useState(0);
  const [storeIsOpen, setStoreIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
 
  const [selectedArea, setSelectedArea] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
 
  const [reserveModal, setReserveModal] = useState({
    open: false, tableId: '', reservation_name: '', reservation_phone: '',
    reservation_time: '19:30', customer_count: 2, reservation_note: '',
  });
  const [transferModal, setTransferModal] = useState({ open: false, fromTable: null, toTableId: '' });
 
  const fetchData = async () => {
    try {
      const [tblRes, ordRes, storeRes] = await Promise.all([
        api.get('/tables'),
        api.get('/orders/all?limit=50').catch(() => ({ data: { data: [] } })),
        api.get('/settings/store-hours').catch(() => ({ data: { data: { isOpen: true } } })),
      ]);
 
      if (tblRes.data?.success) {
        setTables(tblRes.data.data.tables || []);
        setAreas(tblRes.data.data.areas || []);
      }
 
      const allOrds = Array.isArray(ordRes.data?.data) ? ordRes.data.data : [];
      const activeOnline = allOrds.filter(
        (o) => o.order_type === 'takeaway' && ['awaiting_payment', 'pending', 'preparing', 'done'].includes(o.status)
      );
      setOnlineOrdersCount(activeOnline.length);
 
      if (storeRes.data?.data) setStoreIsOpen(Boolean(storeRes.data.data.isOpen));
      setLastUpdated(new Date());
    } catch {
      toast.error('Không thể tải sơ đồ bàn');
    } finally {
      setLoading(false);
    }
  };
 
  useEffect(() => {
    fetchData();
    const syncHandler = () => fetchData();
    socket.on('table:status_updated', syncHandler);
    socket.on('order:created', syncHandler);
    socket.on('order:status_updated', syncHandler);
    socket.on('order:cancelled', syncHandler);
 
    const timer = setInterval(() => setLastUpdated(new Date()), 30000);
    return () => {
      clearInterval(timer);
      socket.off('table:status_updated', syncHandler);
      socket.off('order:created', syncHandler);
      socket.off('order:status_updated', syncHandler);
      socket.off('order:cancelled', syncHandler);
    };
  }, []);
 
  const stats = useMemo(() => {
    const total = tables.length;
    const empty = tables.filter((t) => t.status === 'empty').length;
    const occupied = tables.filter((t) => t.status === 'occupied').length;
    const reserved = tables.filter((t) => t.status === 'reserved').length;
    const emptyPct = total > 0 ? Math.round((empty / total) * 100) : 0;
    const occPct = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const nextReserved = tables.find((t) => t.status === 'reserved' && t.reservation_time);
    return { total, empty, occupied, reserved, emptyPct, occPct, nextReservedTime: nextReserved?.reservation_time };
  }, [tables]);
 
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchArea = selectedArea === 'all' || String(t.area_id) === String(selectedArea);
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        (t.code || '').toLowerCase().includes(q) ||
        (t.area_name || '').toLowerCase().includes(q) ||
        (t.reservation_name || '').toLowerCase().includes(q) ||
        (t.reservation_phone || '').toLowerCase().includes(q);
      return matchArea && matchStatus && matchSearch;
    });
  }, [tables, selectedArea, statusFilter, searchQuery]);
 
  const groupedAreas = useMemo(() => {
    return areas
      .filter((a) => selectedArea === 'all' || String(a.id) === String(selectedArea))
      .map((area) => {
        const areaTables = filteredTables.filter((t) => String(t.area_id) === String(area.id));
        const allAreaTables = tables.filter((t) => String(t.area_id) === String(area.id));
        return {
          ...area,
          tables: areaTables,
          emptyCount: allAreaTables.filter((t) => t.status === 'empty').length,
          occupiedCount: allAreaTables.filter((t) => t.status === 'occupied').length,
          reservedCount: allAreaTables.filter((t) => t.status === 'reserved').length,
        };
      })
      .filter((g) => g.tables.length > 0);
  }, [areas, filteredTables, tables, selectedArea]);
 
  const handleOpenTablePos = (table) => {
    if (!canOperateTable) return;
    const params = new URLSearchParams({ table_id: String(table.id), table_code: table.code });
    if (table.reservation_name) params.set('customer_name', table.reservation_name);
    if (table.reservation_phone) params.set('customer_phone', table.reservation_phone);
    navigate(`/pos?${params.toString()}`);
  };
 
  const handleReleaseTable = async (e, table) => {
    e.stopPropagation();
    if (!window.confirm(`Xác nhận khách đã rời ${table.code} và chuyển bàn sang Trống?`)) return;
    try {
      await api.put(`/tables/${table.id}/status`, { status: 'empty' });
      toast.success(`Đã dọn ${table.code} về trạng thái trống`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật trạng thái bàn');
    }
  };
 
  const handleCancelReservation = async (e, table) => {
    e.stopPropagation();
    if (!window.confirm(`Hủy lịch đặt trước tại ${table.code} của khách ${table.reservation_name}?`)) return;
    try {
      await api.post(`/tables/${table.id}/cancel-reservation`);
      toast.success(`Đã hủy đặt trước ${table.code}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi hủy đặt bàn');
    }
  };
 
  const handleOpenReserveModal = (tableId = '') => {
    const firstEmpty = tables.find((t) => t.status === 'empty');
    setReserveModal({
      open: true,
      tableId: tableId || (firstEmpty ? String(firstEmpty.id) : ''),
      reservation_name: '', reservation_phone: '',
      reservation_time: '19:30', customer_count: 2, reservation_note: '',
    });
  };
 
  const handleSubmitReserve = async (e) => {
    e.preventDefault();
    if (!reserveModal.tableId) return toast.error('Vui lòng chọn bàn trống');
    if (!reserveModal.reservation_name.trim() || !reserveModal.reservation_phone.trim()) {
      return toast.error('Vui lòng nhập tên và số điện thoại khách');
    }
    try {
      await api.post(`/tables/${reserveModal.tableId}/reserve`, {
        reservation_name: reserveModal.reservation_name.trim(),
        reservation_phone: reserveModal.reservation_phone.trim(),
        reservation_time: reserveModal.reservation_time,
        customer_count: Number(reserveModal.customer_count) || 2,
        reservation_note: reserveModal.reservation_note.trim(),
      });
      toast.success('Đặt bàn trước thành công');
      setReserveModal((prev) => ({ ...prev, open: false }));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể đặt bàn');
    }
  };
 
  const handleOpenTransferModal = (e, table) => {
    e.stopPropagation();
    const firstEmpty = tables.find((t) => t.status === 'empty' && t.id !== table.id);
    setTransferModal({ open: true, fromTable: table, toTableId: firstEmpty ? String(firstEmpty.id) : '' });
  };
 
  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    if (!transferModal.fromTable || !transferModal.toTableId) return;
    try {
      await api.post(`/tables/${transferModal.fromTable.id}/transfer`, { to_table_id: Number(transferModal.toTableId) });
      toast.success(`Đã chuyển đơn từ ${transferModal.fromTable.code} sang bàn mới`);
      setTransferModal({ open: false, fromTable: null, toTableId: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi chuyển bàn');
    }
  };
 
  return (
    <div className="pos-floor-page">
      <style>{`
        .pos-floor-page {
          color: #F4F1EC;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .fp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
        }
        .fp-title {
          margin: 0;
          font-size: 1.45rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #F4F1EC;
        }
        .fp-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .fp-kpi-card {
          background: #18181B;
          border: 1px solid #2A2A30;
          border-radius: 14px;
          padding: 14px 16px;
          cursor: pointer;
          transition: all 0.16s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: left;
        }
        .fp-kpi-card:hover {
          border-color: #3B3B44;
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
        }
        .fp-kpi-card.active {
          border-color: #D97706;
          box-shadow: 0 0 0 1.5px #D97706;
        }
        .fp-toolbar {
          background: #18181B;
          border: 1px solid #2A2A30;
          border-radius: 14px;
          padding: 10px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .fp-area-pill {
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          border: 1px solid transparent;
          background: transparent;
          color: #A1A1AA;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .fp-area-pill:hover { background: #202024; color: #F4F1EC; }
        .fp-area-pill.active { background: #D97706; color: #FFFFFF; }
        .fp-search-input {
          background: #121214;
          border: 1px solid #2E2E35;
          border-radius: 999px;
          padding: 7px 14px 7px 34px;
          color: #F4F1EC;
          font-size: 0.82rem;
          width: 240px;
          outline: none;
        }
        .fp-search-input:focus { background: #18181B; border-color: #D97706; }
        .fp-table-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 12px;
        }
        .fp-table-card {
          border-radius: 14px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 138px;
          cursor: pointer;
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }
        .fp-table-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
        }
        .fp-table-card.empty { background: #18181B; border: 1px solid #2A2A30; border-top: 3px solid #10B981; }
        .fp-table-card.empty:hover { border-color: #10B981; }
        .fp-table-card.occupied { background: #202024; border: 1px solid rgba(217, 119, 6, 0.45); border-top: 3px solid #D97706; }
        .fp-table-card.reserved { background: #1D1A26; border: 1px solid rgba(168, 85, 247, 0.45); border-top: 3px solid #A855F7; }
        .fp-action-btn {
          border: none;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 0.76rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: opacity 0.15s ease;
        }
        .fp-action-btn:hover { opacity: 0.88; }
        .fp-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          z-index: 9999;
        }
        .fp-modal-box {
          background: #18181B;
          border: 1px solid #2A2A30;
          border-radius: 16px;
          width: 100%;
          max-width: 440px;
          padding: 22px;
          color: #F4F1EC;
          box-shadow: 0 24px 56px rgba(0, 0, 0, 0.65);
        }
        .fp-field-input {
          width: 100%;
          background: #121214;
          border: 1px solid #2E2E35;
          border-radius: 9px;
          padding: 9px 12px;
          color: #F4F1EC;
          color-scheme: dark;
          font-size: 0.85rem;
          outline: none;
        }
        .fp-field-input:focus { background: #18181B; border-color: #D97706; }
      `}</style>
 
      {/* 1. HEADER */}
      <div className="fp-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '0.76rem', fontWeight: 700, padding: '5px 12px', borderRadius: '999px',
            background: storeIsOpen ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
            color: storeIsOpen ? '#34D399' : '#F87171',
            border: `1px solid ${storeIsOpen ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: storeIsOpen ? '#10B981' : '#EF4444' }} />
            {storeIsOpen ? 'Cổng Online: Đang mở' : 'Cổng Online: Ngoài giờ'}
          </span>
        </div>
 
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canOperateTable && (
            <button
              type="button"
              onClick={() => handleOpenReserveModal()}
              style={{
                background: '#D97706', color: '#FFFFFF', border: 'none',
                padding: '9px 16px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
              }}
            >
              <Icon.Plus /> <span>Đặt bàn trước</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { fetchData(); toast.success('Đã làm mới sơ đồ bàn'); }}
            style={{
              background: '#202024', color: '#F4F1EC', border: '1px solid #32323A',
              width: '36px', height: '36px', borderRadius: '10px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}
            title="Làm mới dữ liệu"
          >
            <Icon.Refresh />
          </button>
        </div>
      </div>
 
      {/* 2. KPI KIÊM BỘ LỌC TRẠNG THÁI */}
      <div className="fp-kpi-grid">
        <button type="button" className={`fp-kpi-card ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase' }}>Tất cả bàn</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#F4F1EC' }}>{stats.total}</span>
            <span style={{ fontSize: '0.76rem', color: '#A1A1AA' }}>{areas.length} khu vực</span>
          </div>
        </button>
 
        <button type="button" className={`fp-kpi-card ${statusFilter === 'empty' ? 'active' : ''}`} onClick={() => setStatusFilter(statusFilter === 'empty' ? 'all' : 'empty')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 700, color: '#34D399', textTransform: 'uppercase' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981' }} />
            <span>Bàn trống</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#34D399' }}>{stats.empty}</span>
            <span style={{ fontSize: '0.76rem', color: '#A1A1AA' }}>{stats.emptyPct}% sẵn sàng</span>
          </div>
        </button>
 
        <button type="button" className={`fp-kpi-card ${statusFilter === 'occupied' ? 'active' : ''}`} onClick={() => setStatusFilter(statusFilter === 'occupied' ? 'all' : 'occupied')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#D97706' }} />
            <span>Đang có khách</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#F59E0B' }}>{stats.occupied}</span>
            <span style={{ fontSize: '0.76rem', color: '#A1A1AA' }}>{stats.occPct}% công suất</span>
          </div>
        </button>
 
        <button type="button" className={`fp-kpi-card ${statusFilter === 'reserved' ? 'active' : ''}`} onClick={() => setStatusFilter(statusFilter === 'reserved' ? 'all' : 'reserved')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 700, color: '#C084FC', textTransform: 'uppercase' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#A855F7' }} />
            <span>Đã đặt trước</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#C084FC' }}>{stats.reserved}</span>
            <span style={{ fontSize: '0.76rem', color: '#A1A1AA' }}>{stats.nextReservedTime ? `Hẹn ${stats.nextReservedTime}` : 'Không có lịch'}</span>
          </div>
        </button>
 
        <button type="button" className="fp-kpi-card" onClick={() => navigate('/orders')}>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase' }}>Đơn Online / Mang về</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#38BDF8' }}>{onlineOrdersCount}</span>
            <span style={{ fontSize: '0.76rem', color: '#38BDF8', fontWeight: 600 }}>Xem danh sách →</span>
          </div>
        </button>
      </div>
 
      {/* 3. THANH LỌC KHU VỰC & TÌM KIẾM */}
      <div className="fp-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          <button type="button" className={`fp-area-pill ${selectedArea === 'all' ? 'active' : ''}`} onClick={() => setSelectedArea('all')}>
            Tất cả ({tables.length})
          </button>
          {areas.map((a) => {
            const count = tables.filter((t) => String(t.area_id) === String(a.id)).length;
            return (
              <button key={a.id} type="button" className={`fp-area-pill ${String(selectedArea) === String(a.id) ? 'active' : ''}`} onClick={() => setSelectedArea(String(a.id))}>
                {shortAreaName(a.name)} ({count})
              </button>
            );
          })}
        </div>
 
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', display: 'flex' }}>
            <Icon.Search />
          </span>
          <input
            type="text"
            className="fp-search-input"
            style={{ width: '240px' }}
            placeholder="Tìm số bàn, tên khách đặt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
 
      {/* 4. LƯỚI SƠ ĐỒ BÀN THEO KHU VỰC */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#A1A1AA' }}>Đang tải dữ liệu sơ đồ bàn...</div>
      ) : groupedAreas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#18181B', borderRadius: '14px', border: '1px solid #2A2A30', color: '#A1A1AA' }}>
          Không tìm thấy bàn nào phù hợp với bộ lọc hiện tại.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {groupedAreas.map((group) => (
            <section key={group.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #2A2A30' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#F4F1EC' }}>{group.name}</h2>
                  <span style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>({group.tables.length} bàn)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.76rem', fontWeight: 600 }}>
                  <span style={{ color: '#34D399' }}>● {group.emptyCount} trống</span>
                  {group.occupiedCount > 0 && <span style={{ color: '#F59E0B' }}>● {group.occupiedCount} có khách</span>}
                  {group.reservedCount > 0 && <span style={{ color: '#C084FC' }}>● {group.reservedCount} đặt trước</span>}
                </div>
              </div>
 
              <div className="fp-table-grid">
                {group.tables.map((t) => {
                  const isEmpty = t.status === 'empty';
                  const isOccupied = t.status === 'occupied';
                  const isReserved = t.status === 'reserved';
                  const mins = isOccupied ? getElapsedMinutes(t.current_order_time) : 0;
 
                  return (
                    <div key={t.id} className={`fp-table-card ${t.status}`} onClick={() => handleOpenTablePos(t)}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#F4F1EC' }}>{t.code}</span>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                            background: isEmpty ? 'rgba(16,185,129,0.14)' : isOccupied ? 'rgba(245,158,11,0.14)' : 'rgba(168,85,247,0.14)',
                            color: isEmpty ? '#34D399' : isOccupied ? '#FBBF24' : '#C084FC'
                          }}>
                            {isEmpty ? 'Trống' : isOccupied ? 'Đang phục vụ' : 'Đặt trước'}
                          </span>
                        </div>
 
                        {isEmpty && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#A1A1AA' }}>
                            <Icon.Users /><span>{t.seats} ghế tiêu chuẩn</span>
                          </div>
                        )}
 
                        {isOccupied && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#F59E0B' }}>
                              {Number(t.current_order_total || 0) > 0 ? fmt(t.current_order_total) : 'Đang chọn món'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.74rem', color: '#A1A1AA' }}>
                              <span>{t.current_item_count || 0} món</span>
                              {mins > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Icon.Clock /> {mins}p</span>}
                            </div>
                          </div>
                        )}
 
                        {isReserved && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#E9D5FF' }}>
                              {t.reservation_name} • {t.reservation_time}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#C084FC' }}>
                              {t.customer_count || t.seats} khách {t.reservation_phone ? `• ${t.reservation_phone}` : ''}
                            </div>
                          </div>
                        )}
                      </div>
 
                      {canOperateTable && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                          {isEmpty && (
                            <>
                              <button type="button" className="fp-action-btn"
                                style={{ flex: 1, background: 'rgba(16,185,129,0.14)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}
                                onClick={(e) => { e.stopPropagation(); handleOpenTablePos(t); }}
                              >
                                <span>Mở bàn</span> <Icon.ArrowRight />
                              </button>
                              <button type="button" className="fp-action-btn"
                                style={{ background: '#202024', color: '#D4D4D8', border: '1px solid #32323A' }}
                                onClick={(e) => { e.stopPropagation(); handleOpenReserveModal(String(t.id)); }}
                                title="Đặt trước bàn này"
                              >
                                <Icon.Calendar />
                              </button>
                            </>
                          )}
 
                          {isOccupied && (
                            <>
                              <button type="button" className="fp-action-btn"
                                style={{ flex: 1, background: '#D97706', color: '#FFFFFF' }}
                                onClick={(e) => { e.stopPropagation(); handleOpenTablePos(t); }}
                              >
                                Gọi thêm
                              </button>
                              <button type="button" className="fp-action-btn"
                                style={{ background: '#18181B', color: '#D4D4D8', border: '1px solid #32323A' }}
                                onClick={(e) => handleOpenTransferModal(e, t)} title="Chuyển bàn"
                              >
                                <Icon.Swap />
                              </button>
                              <button type="button" className="fp-action-btn"
                                style={{ background: 'rgba(16,185,129,0.14)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}
                                onClick={(e) => handleReleaseTable(e, t)} title="Khách về / Dọn bàn trống"
                              >
                                <Icon.Check />
                              </button>
                            </>
                          )}
 
                          {isReserved && (
                            <>
                              <button type="button" className="fp-action-btn"
                                style={{ flex: 1, background: '#9333EA', color: '#FFFFFF' }}
                                onClick={(e) => { e.stopPropagation(); handleOpenTablePos(t); }}
                              >
                                Nhận bàn
                              </button>
                              <button type="button" className="fp-action-btn"
                                style={{ background: 'rgba(239,68,68,0.14)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }}
                                onClick={(e) => handleCancelReservation(e, t)}
                              >
                                Hủy
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
 
      {/* 5. MODAL ĐẶT BÀN TRƯỚC */}
      {reserveModal.open && (
        <div className="fp-modal-backdrop" onClick={() => setReserveModal((p) => ({ ...p, open: false }))}>
          <form className="fp-modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmitReserve}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.12rem', fontWeight: 700, color: '#F4F1EC' }}>Đặt bàn trước</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#A1A1AA', display: 'block', marginBottom: '4px' }}>Chọn bàn trống</label>
                <select className="fp-field-input" value={reserveModal.tableId} onChange={(e) => setReserveModal((p) => ({ ...p, tableId: e.target.value }))}>
                  <option value="">-- Chọn bàn --</option>
                  {tables.filter((t) => t.status === 'empty').map((t) => (
                    <option key={t.id} value={t.id}>{t.code} ({t.area_name} • {t.seats} ghế)</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#A1A1AA', display: 'block', marginBottom: '4px' }}>Tên khách *</label>
                  <input type="text" className="fp-field-input" placeholder="Anh Hoàng..." value={reserveModal.reservation_name} onChange={(e) => setReserveModal((p) => ({ ...p, reservation_name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#A1A1AA', display: 'block', marginBottom: '4px' }}>Số điện thoại *</label>
                  <input type="tel" className="fp-field-input" placeholder="0901234567" value={reserveModal.reservation_phone} onChange={(e) => setReserveModal((p) => ({ ...p, reservation_phone: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#A1A1AA', display: 'block', marginBottom: '4px' }}>Giờ đến</label>
                  <input type="time" className="fp-field-input" value={reserveModal.reservation_time} onChange={(e) => setReserveModal((p) => ({ ...p, reservation_time: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#A1A1AA', display: 'block', marginBottom: '4px' }}>Số lượng khách</label>
                  <input type="number" min="1" max="20" className="fp-field-input" value={reserveModal.customer_count} onChange={(e) => setReserveModal((p) => ({ ...p, customer_count: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#A1A1AA', display: 'block', marginBottom: '4px' }}>Ghi chú</label>
                <input type="text" className="fp-field-input" placeholder="Bàn gần cửa sổ, ghế trẻ em..." value={reserveModal.reservation_note} onChange={(e) => setReserveModal((p) => ({ ...p, reservation_note: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button type="button" onClick={() => setReserveModal((p) => ({ ...p, open: false }))} style={{ background: '#202024', border: '1px solid #32323A', color: '#F4F1EC', padding: '8px 14px', borderRadius: '9px', cursor: 'pointer' }}>Đóng</button>
              <button type="submit" style={{ background: '#D97706', border: 'none', color: '#FFFFFF', fontWeight: 700, padding: '8px 18px', borderRadius: '9px', cursor: 'pointer' }}>Xác nhận đặt bàn</button>
            </div>
          </form>
        </div>
      )}
 
      {/* 6. MODAL CHUYỂN BÀN */}
      {transferModal.open && transferModal.fromTable && (
        <div className="fp-modal-backdrop" onClick={() => setTransferModal({ open: false, fromTable: null, toTableId: '' })}>
          <form className="fp-modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmitTransfer}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.12rem', fontWeight: 700, color: '#F4F1EC' }}>Chuyển từ {transferModal.fromTable.code}</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#A1A1AA' }}>
              Toàn bộ đơn hàng đang phục vụ tại {transferModal.fromTable.code} sẽ được chuyển sang bàn trống mới.
            </p>
            <select className="fp-field-input" value={transferModal.toTableId} onChange={(e) => setTransferModal((p) => ({ ...p, toTableId: e.target.value }))}>
              <option value="">-- Chọn bàn đích còn trống --</option>
              {tables.filter((t) => t.status === 'empty' && t.id !== transferModal.fromTable.id).map((t) => (
                <option key={t.id} value={t.id}>{t.code} ({t.area_name} • {t.seats} ghế)</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button type="button" onClick={() => setTransferModal({ open: false, fromTable: null, toTableId: '' })} style={{ background: '#202024', border: '1px solid #32323A', color: '#F4F1EC', padding: '8px 14px', borderRadius: '9px', cursor: 'pointer' }}>Hủy</button>
              <button type="submit" style={{ background: '#D97706', border: 'none', color: '#FFFFFF', fontWeight: 700, padding: '8px 18px', borderRadius: '9px', cursor: 'pointer' }}>Chuyển bàn ngay</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
