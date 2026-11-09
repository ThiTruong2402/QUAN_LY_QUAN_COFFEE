import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import socket from '../api/socket';
import { playNotificationSound } from '../utils/sound';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  empty: { label: 'Trống', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', icon: '🟢' },
  occupied: { label: 'Đang phục vụ', color: '#f87171', bg: 'rgba(239, 68, 68, 0.18)', border: 'rgba(239, 68, 68, 0.45)', icon: '🔴' },
  reserved: { label: 'Đã đặt trước', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)', icon: '🟡' },
  disabled: { label: 'Tạm khóa', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)', icon: '⚪' },
};

export default function Tables() {
  const navigate = useNavigate();
  const [data, setData] = useState({ tables: [], areas: [] });
  const [selectedArea, setSelectedArea] = useState('all');
  const [loading, setLoading] = useState(true);

  // Danh sách đơn hàng đặt online / mang về đang chờ xử lý
  const [onlineOrders, setOnlineOrders] = useState([]);

  // Modals state
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveTableTarget, setReserveTableTarget] = useState(null);
  const [reserveForm, setReserveForm] = useState({
    name: '',
    phone: '',
    time: '19:30',
    guests: 4,
    note: '',
  });

  const [activeTable, setActiveTable] = useState(null); // Clicked occupied table details
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [targetTransferTableId, setTargetTransferTableId] = useState('');

  const loadTables = async () => {
    try {
      const res = await api.get('/tables');
      if (res.data?.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách bàn:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOnlineOrders = async () => {
    try {
      const res = await api.get('/orders/all');
      const list = res.data?.data || [];
      const active = list.filter((o) =>
        ['takeaway', 'dine_in'].includes(o.order_type) && ['scheduled', 'pending', 'preparing', 'open'].includes(o.status)
      );
      setOnlineOrders(active);
    } catch (err) {
      console.warn('Could not load online orders:', err);
    }
  };

  const handleUpdateOnlineStatus = async (orderId, targetStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: targetStatus });
      toast.success(targetStatus === 'preparing' ? '☕ Đã chuyển sang: Đang pha chế' : '🔔 Đã chuyển sang: Pha xong & Trả món');
      loadOnlineOrders();
      loadTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi cập nhật trạng thái đơn');
    }
  };

  useEffect(() => {
    loadTables();
    loadOnlineOrders();

    const handleNewOrder = (payload) => {
      playNotificationSound();
      toast.success(`🔔 CÓ ĐƠN HÀNG ONLINE MỚI: #${payload?.orderCode || ''}!`, { duration: 6000 });
      loadTables();
      loadOnlineOrders();
    };

    const handleSync = () => {
      loadTables();
      loadOnlineOrders();
    };

    socket.on('order:created', handleNewOrder);
    socket.on('barista:new_order', handleSync);
    socket.on('order:status_updated', handleSync);
    socket.on('barista:item_updated', handleSync);
    socket.on('order:cancelled', handleSync);

    const interval = setInterval(() => {
      loadTables();
      loadOnlineOrders();
    }, 10000);

    return () => {
      clearInterval(interval);
      socket.off('order:created', handleNewOrder);
      socket.off('barista:new_order', handleSync);
      socket.off('order:status_updated', handleSync);
      socket.off('barista:item_updated', handleSync);
      socket.off('order:cancelled', handleSync);
    };
  }, []);

  const tables = data.tables.filter((t) => selectedArea === 'all' || String(t.area_id) === String(selectedArea));

  const counts = {
    total: data.tables.length,
    empty: data.tables.filter((t) => t.status === 'empty').length,
    occupied: data.tables.filter((t) => t.status === 'occupied').length,
    reserved: data.tables.filter((t) => t.status === 'reserved').length,
  };

  // Quick Open Table & Go to POS
  const handleOpenTableToPos = (table) => {
    let url = `/pos?table_id=${table.id}&table_code=${encodeURIComponent(table.code)}`;
    if (table.reservation_name) {
      url += `&customer_name=${encodeURIComponent(table.reservation_name)}`;
    }
    if (table.reservation_phone) {
      url += `&customer_phone=${encodeURIComponent(table.reservation_phone)}`;
    }
    navigate(url);
  };

  // Open Reserve Modal for a specific table
  const handleOpenReserve = (table = null) => {
    setReserveTableTarget(table);
    setReserveForm({
      name: '',
      phone: '',
      time: '19:30',
      guests: table ? table.seats : 4,
      note: '',
    });
    setShowReserveModal(true);
  };

  // Submit Reservation
  const handleSaveReservation = async (e) => {
    e.preventDefault();
    if (!reserveTableTarget) {
      toast.error('Vui lòng chọn bàn để đặt');
      return;
    }
    try {
      await api.post(`/tables/${reserveTableTarget.id}/reserve`, {
        reservation_name: reserveForm.name,
        reservation_phone: reserveForm.phone,
        reservation_time: reserveForm.time,
        reservation_note: reserveForm.note,
        customer_count: reserveForm.guests,
      });
      toast.success(`🎉 Đã đặt trước ${reserveTableTarget.code} cho khách ${reserveForm.name}!`);
      setShowReserveModal(false);
      loadTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi đặt bàn');
    }
  };

  // Cancel Reservation
  const handleCancelReservation = async (tableId, tableCode) => {
    if (!window.confirm(`Xác nhận hủy đặt bàn ${tableCode}?`)) return;
    try {
      await api.post(`/tables/${tableId}/cancel-reservation`);
      toast.success(`Đã hủy đặt bàn ${tableCode}`);
      loadTables();
    } catch (err) {
      toast.error('Lỗi khi hủy đặt bàn');
    }
  };

  // Check-in (Khách đặt bàn đã tới -> Chuyển thành occupied và mở POS)
  const handleCheckInReservedTable = async (table) => {
    try {
      await api.put(`/tables/${table.id}/status`, { status: 'occupied' });
      toast.success(`✅ Khách ${table.reservation_name || ''} đã nhận bàn ${table.code}!`);
      handleOpenTableToPos(table);
    } catch (err) {
      toast.error('Lỗi nhận bàn');
    }
  };

  // Free table (Trả bàn về trống)
  const handleFreeTable = async (tableId, tableCode) => {
    if (!window.confirm(`Xác nhận dọn bàn và trả ${tableCode} về trạng thái TRỐNG?`)) return;
    try {
      await api.put(`/tables/${tableId}/status`, { status: 'empty' });
      toast.success(`Đã giải phóng ${tableCode} thành bàn Trống!`);
      setActiveTable(null);
      loadTables();
    } catch (err) {
      toast.error('Lỗi khi đổi trạng thái bàn');
    }
  };

  // Transfer Table
  const handleExecuteTransfer = async () => {
    if (!targetTransferTableId) {
      toast.error('Vui lòng chọn bàn đích để chuyển');
      return;
    }
    try {
      await api.post(`/tables/${activeTable.id}/transfer`, { to_table_id: targetTransferTableId });
      toast.success(`Đã chuyển khách từ ${activeTable.code} sang bàn mới thành công!`);
      setShowTransferModal(false);
      setActiveTable(null);
      loadTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi chuyển bàn');
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TOP HEADER & 5 LIVE KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="mockup-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2.2rem' }}>🪑</span>
          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase' }}>
              TỔNG SỐ BÀN
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fef3c7' }}>
              {counts.total} <span style={{ fontSize: '0.85rem', color: '#c4a482', fontWeight: 500 }}>Bàn</span>
            </div>
          </div>
        </div>

        <div className="mockup-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '2.2rem' }}>🟢</span>
          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase' }}>
              BÀN TRỐNG (SẴN SÀNG)
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#34d399' }}>
              {counts.empty} <span style={{ fontSize: '0.85rem', color: '#c4a482', fontWeight: 500 }}>Bàn</span>
            </div>
          </div>
        </div>

        <div className="mockup-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #ef4444' }}>
          <span style={{ fontSize: '2.2rem' }}>🔴</span>
          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase' }}>
              ĐANG CÓ KHÁCH
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f87171' }}>
              {counts.occupied} <span style={{ fontSize: '0.85rem', color: '#c4a482', fontWeight: 500 }}>Bàn</span>
            </div>
          </div>
        </div>

        <div className="mockup-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '2.2rem' }}>🟡</span>
          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase' }}>
              KHÁCH ĐẶT TRƯỚC
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24' }}>
              {counts.reserved} <span style={{ fontSize: '0.85rem', color: '#c4a482', fontWeight: 500 }}>Bàn</span>
            </div>
          </div>
        </div>

        <div
          className="mockup-panel"
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderLeft: onlineOrders.length > 0 ? '4px solid #f59e0b' : '4px solid #10b981',
            background: onlineOrders.length > 0 ? 'rgba(245, 158, 11, 0.12)' : undefined,
            cursor: 'pointer'
          }}
          onClick={() => {
            if (onlineOrders.length > 0) {
              const el = document.getElementById('online-orders-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }
          }}
        >
          <span style={{ fontSize: '2.2rem' }}>🛍️</span>
          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: onlineOrders.length > 0 ? '#fbbf24' : '#c4a482', textTransform: 'uppercase' }}>
              ĐƠN ONLINE / MANG VỀ
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: onlineOrders.length > 0 ? '#f59e0b' : '#34d399' }}>
              {onlineOrders.length} <span style={{ fontSize: '0.85rem', color: '#c4a482', fontWeight: 500 }}>Đơn chờ</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1.5. ĐƠN ĐẶT ONLINE & MANG VỀ (TỰ ĐỘNG ĐẨY ĐƠN TỪ KHÁCH HÀNG) */}
      {onlineOrders.length > 0 ? (
        <div
          id="online-orders-section"
          className="mockup-panel"
          style={{
            padding: '16px 20px',
            border: '2px solid #d97706',
            background: 'linear-gradient(135deg, rgba(42, 22, 11, 0.95), rgba(24, 13, 6, 0.95))',
            borderRadius: '14px',
            boxShadow: '0 8px 24px rgba(217, 119, 6, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.6rem' }}>🔔</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fbbf24', fontWeight: 800 }}>
                  ĐƠN ĐẶT ONLINE & MANG VỀ ĐANG CHỜ XỬ LÝ ({onlineOrders.length} ĐƠN)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#d4b094' }}>
                  Khách hàng vừa đặt trực tuyến qua website. Đơn tự động đồng bộ sang quầy pha chế & thu ngân.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => navigate('/orders')}
              style={{ background: '#d97706', color: '#fff', fontWeight: 800, padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
            >
              📋 Quản Lý Chi Tiết Tại List Đơn Hàng →
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
            {onlineOrders.map((o) => {
              const isScheduled = o.status === 'scheduled';
              const isPending = o.status === 'pending' || o.status === 'open';
              return (
                <div
                  key={o.id}
                  style={{
                    background: '#1c1008',
                    border: isScheduled ? '1.5px solid #a855f7' : (isPending ? '1.5px solid #f59e0b' : '1.5px solid #38bdf8'),
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.92rem' }}>
                        #{o.code || o.invoice_no}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: isScheduled ? 'rgba(168, 85, 247, 0.2)' : (isPending ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)'),
                          color: isScheduled ? '#c084fc' : (isPending ? '#fbbf24' : '#38bdf8'),
                          border: isScheduled ? '1px solid #a855f7' : (isPending ? '1px solid #f59e0b' : '1px solid #38bdf8'),
                        }}
                      >
                        {isScheduled
                          ? `🗓️ Hẹn: ${o.pickup_time ? String(o.pickup_time).replace('T', ' ').slice(11, 16) : 'Hẹn trước'}`
                          : (isPending ? '⏳ Chờ pha chế' : '☕ Đang pha chế')}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: '#fef3c7', fontWeight: 700, marginBottom: '2px' }}>
                      👤 {o.customer_name || 'Khách đặt online'} {o.customer_phone ? `(${o.customer_phone})` : ''}
                    </div>

                    {isScheduled && o.pickup_time && (
                      <div style={{ fontSize: '0.74rem', color: '#e9d5ff', background: 'rgba(168, 85, 247, 0.15)', padding: '4px 8px', borderRadius: '6px', margin: '4px 0', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                        ⏰ Giờ hẹn nhận: <strong>{String(o.pickup_time).replace('T', ' ').slice(0, 16)}</strong>
                      </div>
                    )}

                    <div style={{ fontSize: '0.78rem', color: '#e5d5c5', margin: '6px 0', lineHeight: 1.35, maxHeight: '48px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ☕ {o.items_summary || 'Món đang tải...'}
                    </div>

                    {o.note && (
                      <div style={{ fontSize: '0.73rem', color: '#f87171', fontStyle: 'italic', marginBottom: '6px' }}>
                        📝 Ghi chú: {o.note}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #382012', paddingTop: '6px', fontSize: '0.82rem' }}>
                      <span style={{ color: '#a88265', fontWeight: 600 }}>Tổng tiền:</span>
                      <span style={{ fontWeight: 900, color: '#fbbf24', fontSize: '0.98rem' }}>
                        {fmt(o.total)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    {isScheduled ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleUpdateOnlineStatus(o.id, 'preparing')}
                        title="Khách đến sớm - Bắt đầu pha chế ngay"
                        style={{ flex: 1, background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '0.78rem', padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        ☕ Pha chế sớm
                      </button>
                    ) : isPending ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleUpdateOnlineStatus(o.id, 'preparing')}
                        style={{ flex: 1, background: '#d97706', color: '#fff', fontWeight: 700, fontSize: '0.78rem', padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        ☕ Bắt đầu pha chế
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleUpdateOnlineStatus(o.id, 'done')}
                        style={{ flex: 1, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: '0.78rem', padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        🔔 Pha xong & Trả món
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => navigate('/orders')}
                      style={{ borderColor: '#5a341e', color: '#d4b094', fontWeight: 600, fontSize: '0.75rem', padding: '6px 10px', cursor: 'pointer' }}
                    >
                      Chi tiết
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="mockup-panel"
          style={{
            padding: '10px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.82rem',
            color: '#c4a482',
            borderLeft: '4px solid #10b981',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#10b981', fontSize: '1rem' }}>●</span>
            <span><strong>Cổng Đặt Món Online:</strong> Trực tuyến sẵn sàng. Đơn hàng từ khách sẽ tự động đồng bộ ngay lập tức.</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={loadOnlineOrders}
            style={{ borderColor: '#4a2c18', color: '#d4b094', fontSize: '0.76rem', padding: '3px 10px' }}
          >
            ↻ Làm mới
          </button>
        </div>
      )}

      {/* 2. AREA FILTER & ACTION BAR */}
      <div
        className="mockup-panel"
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fbbf24', marginRight: '4px' }}>
            📍 KHU VỰC:
          </span>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: selectedArea === 'all' ? 'linear-gradient(135deg, #d97706, #b45309)' : '#24160e',
              color: selectedArea === 'all' ? '#ffffff' : '#d5bba2',
              border: selectedArea === 'all' ? '1.5px solid #fbbf24' : '1px solid #4a2c18',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onClick={() => setSelectedArea('all')}
          >
            Tất cả ({data.tables.length})
          </button>

          {data.areas.map((a) => {
            const areaTables = data.tables.filter((t) => String(t.area_id) === String(a.id));
            const active = selectedArea === String(a.id);
            return (
              <button
                key={a.id}
                type="button"
                className="btn btn-sm"
                style={{
                  background: active ? 'linear-gradient(135deg, #d97706, #b45309)' : '#24160e',
                  color: active ? '#ffffff' : '#d5bba2',
                  border: active ? '1.5px solid #fbbf24' : '1px solid #4a2c18',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
                onClick={() => setSelectedArea(String(a.id))}
              >
                {a.name} ({areaTables.length})
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24', fontWeight: 700 }}
            onClick={() => handleOpenReserve(null)}
          >
            ➕ ĐẶT BÀN TRƯỚC
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ borderColor: '#4a2c18', color: '#d5bba2' }}
            onClick={loadTables}
          >
            🔄 Làm mới
          </button>
        </div>
      </div>

      {/* 3. 20 TABLE CARDS GRID (SƠ ĐỒ 20 BÀN TRỰC QUAN) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '16px',
        }}
      >
        {tables.map((table) => {
          const cfg = STATUS_CONFIG[table.status] || STATUS_CONFIG.empty;
          const isOccupied = table.status === 'occupied';
          const isReserved = table.status === 'reserved';
          const isEmpty = table.status === 'empty';

          return (
            <div
              key={table.id}
              className="mockup-panel"
              style={{
                padding: '16px',
                borderRadius: '14px',
                border: `2px solid ${cfg.border}`,
                background: cfg.bg,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                transition: 'all 0.2s ease',
                position: 'relative',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
              }}
            >
              {/* Header: Table Code & Seats */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.4rem' }}>{cfg.icon}</span>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
                      {table.code}
                    </h3>
                  </div>

                  <span
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      color: cfg.color,
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      border: `1px solid ${cfg.border}`,
                    }}
                  >
                    {cfg.label}
                  </span>
                </div>

                <div style={{ fontSize: '0.78rem', color: '#c4a482', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📍 {table.area_name}</span>
                  <span>👤 {table.seats} ghế</span>
                </div>
              </div>

              {/* Body: Live Status Details */}
              <div style={{ background: 'rgba(20, 12, 7, 0.65)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(245, 158, 11, 0.15)', minHeight: '75px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {isEmpty && (
                  <div style={{ textAlign: 'center', color: '#34d399', fontSize: '0.82rem', fontWeight: 700 }}>
                    ✨ Bàn đang trống • Sẵn sàng đón khách
                  </div>
                )}

                {isOccupied && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#c4a482' }}>Số món đang dùng:</span>
                      <strong style={{ color: '#fef3c7' }}>{table.current_item_count || 1} món</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#c4a482' }}>Tạm tính:</span>
                      <strong style={{ color: '#fbbf24', fontSize: '0.92rem' }}>
                        {table.current_order_total ? fmt(table.current_order_total) : '55.000 đ'}
                      </strong>
                    </div>
                    {table.customer_count > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#d5bba2' }}>
                        👥 Số khách ngồi: {table.customer_count} người
                      </div>
                    )}
                  </div>
                )}

                {isReserved && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.78rem' }}>
                    <div style={{ color: '#fbbf24', fontWeight: 700 }}>
                      👤 {table.reservation_name || 'Khách đặt bàn'} ({table.reservation_phone || ''})
                    </div>
                    <div style={{ color: '#fef3c7' }}>
                      ⏰ Giờ hẹn: <strong>{table.reservation_time || '19:30'}</strong> • {table.customer_count || 2} khách
                    </div>
                    {table.reservation_note && (
                      <div style={{ color: '#d5bba2', fontStyle: 'italic', fontSize: '0.72rem' }}>
                        📝 &ldquo;{table.reservation_note}&rdquo;
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {isEmpty && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                      background: 'linear-gradient(135deg, #15803d, #166534)',
                      borderColor: '#15803d',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      padding: '8px',
                    }}
                    onClick={() => handleOpenTableToPos(table)}
                  >
                    🛒 MỞ BÀN / GỌI MÓN
                  </button>
                )}

                {isOccupied && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #d97706, #b45309)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        padding: '8px',
                      }}
                      onClick={() => handleOpenTableToPos(table)}
                      title="Gọi thêm món hoặc thanh toán tại quầy"
                    >
                      ➕ THÊM MÓN
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ borderColor: '#ef4444', color: '#f87171', fontWeight: 700, fontSize: '0.78rem', padding: '8px 10px' }}
                      onClick={() => handleFreeTable(table.id, table.code)}
                      title="Khách về, dọn bàn và trả về trạng thái trống"
                    >
                      🧹 TRẢ BÀN
                    </button>
                  </>
                )}

                {isReserved && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #15803d, #166534)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        padding: '8px',
                      }}
                      onClick={() => handleCheckInReservedTable(table)}
                    >
                      ✅ KHÁCH ĐÃ ĐẾN
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ borderColor: '#ef4444', color: '#f87171', fontWeight: 700, fontSize: '0.78rem', padding: '8px' }}
                      onClick={() => handleCancelReservation(table.id, table.code)}
                    >
                      ✕ HỦY
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: ĐẶT BÀN TRƯỚC */}
      {showReserveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
          }}
          onClick={() => setShowReserveModal(false)}
        >
          <div
            className="animate-fade-in"
            style={{
              background: '#1c120b',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              border: '2px solid rgba(245, 158, 11, 0.4)',
              boxShadow: '0 25px 50px rgba(0,0,0,0.85)',
              overflow: 'hidden',
              color: '#fdf8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: 'linear-gradient(135deg, #2a180e, #1c1008)', padding: '16px 20px', borderBottom: '1px solid rgba(245, 158, 11, 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🟡</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fef3c7' }}>
                  ĐẶT BÀN TRƯỚC CHO KHÁCH
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReserveModal(false)}
                style={{ background: 'none', border: 'none', color: '#c4a482', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveReservation} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24', display: 'block', marginBottom: '4px' }}>
                  CHỌN BÀN:
                </label>
                <select
                  className="form-select"
                  value={reserveTableTarget ? reserveTableTarget.id : ''}
                  onChange={(e) => {
                    const t = data.tables.find((tbl) => String(tbl.id) === e.target.value);
                    setReserveTableTarget(t || null);
                  }}
                  style={{ width: '100%', padding: '8px 12px' }}
                  required
                >
                  <option value="">-- Chọn bàn muốn đặt --</option>
                  {data.tables.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.status === 'occupied'}>
                      {t.code} ({t.area_name} - {t.seats} ghế) {t.status === 'occupied' ? ' [Đang có khách]' : t.status === 'reserved' ? ' [Đã có người đặt]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                  TÊN KHÁCH HÀNG:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Anh Hoàng"
                  value={reserveForm.name}
                  onChange={(e) => setReserveForm({ ...reserveForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                  SỐ ĐIỆN THOẠI:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0988 123 456"
                  value={reserveForm.phone}
                  onChange={(e) => setReserveForm({ ...reserveForm, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                    GIỜ HẸN ĐẾN:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="19:30"
                    value={reserveForm.time}
                    onChange={(e) => setReserveForm({ ...reserveForm, time: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                    SỐ LƯỢNG KHÁCH:
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    max="20"
                    value={reserveForm.guests}
                    onChange={(e) => setReserveForm({ ...reserveForm, guests: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                  GHI CHÚ / YÊU CẦU ĐẶC BIỆT:
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Ví dụ: Sinh nhật, cần chuẩn bị hoa, bàn view đẹp..."
                  value={reserveForm.note}
                  onChange={(e) => setReserveForm({ ...reserveForm, note: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: '#4a2c18', color: '#d5bba2' }}
                  onClick={() => setShowReserveModal(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', borderColor: '#d97706', fontWeight: 800, padding: '8px 20px' }}
                >
                  LƯU ĐẶT BÀN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
