import { useEffect, useState } from 'react';
import api from '../api/axios';
import socket from '../api/socket';
import { playNotificationSound } from '../utils/sound';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

// Bank Config matching Techcombank Account
const BANK_CONFIG = {
  bankName: 'Techcombank',
  bankFullName: 'Ngân hàng TMCP Kỹ Thương Việt Nam',
  accountNumber: '2402 2005 6666',
  accountNumberRaw: '240220056666',
  accountHolder: 'BUI VAN TRUONG',
  bin: '970407',
};

// 3-step Coffee Shop Direct Sales Workflow Metadata
// Khách thanh toán 100% tại quầy trước khi làm món -> Pha xong & Trả món là hoàn tất (Không cần thanh toán nữa)
const STATUS_META = {
  scheduled: {
    key: 'scheduled',
    label: '🗓️ Đã hẹn giờ',
    short: 'Hẹn giờ',
    badgeBg: 'rgba(168, 85, 247, 0.2)',
    badgeColor: '#c084fc',
    badgeBorder: 'rgba(168, 85, 247, 0.4)',
    stepIndex: 0,
    nextAction: {
      label: '☕ Pha chế sớm',
      status: 'preparing',
      desc: 'Khách đến sớm - Bắt đầu pha chế đồ uống ngay',
      bg: '#7c3aed',
    },
  },
  pending: {
    key: 'pending',
    label: '⏳ Đã TT • Chờ pha chế',
    short: 'Chờ pha',
    badgeBg: 'rgba(245, 158, 11, 0.2)',
    badgeColor: '#fbbf24',
    badgeBorder: 'rgba(245, 158, 11, 0.4)',
    stepIndex: 1,
    nextAction: {
      label: '☕ Bắt đầu pha chế',
      status: 'preparing',
      desc: 'Barista bắt đầu pha chế đồ uống theo định lượng',
      bg: '#d97706',
    },
  },
  open: {
    key: 'open',
    label: '⏳ Đã TT • Chờ pha chế',
    short: 'Chờ pha',
    badgeBg: 'rgba(245, 158, 11, 0.2)',
    badgeColor: '#fbbf24',
    badgeBorder: 'rgba(245, 158, 11, 0.4)',
    stepIndex: 1,
    nextAction: {
      label: '☕ Bắt đầu pha chế',
      status: 'preparing',
      desc: 'Barista bắt đầu pha chế đồ uống theo định lượng',
      bg: '#d97706',
    },
  },
  preparing: {
    key: 'preparing',
    label: '☕ Đang pha chế',
    short: 'Đang pha',
    badgeBg: 'rgba(56, 189, 248, 0.2)',
    badgeColor: '#38bdf8',
    badgeBorder: 'rgba(56, 189, 248, 0.4)',
    stepIndex: 2,
    nextAction: {
      label: '🔔 Pha xong (Chờ trả)',
      status: 'done',
      desc: 'Pha chế xong, báo chuông và sẵn sàng trả món cho khách',
      bg: '#10b981',
    },
  },
  done: {
    key: 'done',
    label: '🔔 Đã pha xong - Chờ trả món',
    short: 'Chờ trả',
    badgeBg: 'rgba(16, 185, 129, 0.2)',
    badgeColor: '#34d399',
    badgeBorder: 'rgba(16, 185, 129, 0.4)',
    stepIndex: 3,
    nextAction: {
      label: '🛎️ Xác nhận đã trả món',
      status: 'served',
      desc: 'Bàn giao đồ uống cho khách và hoàn tất đơn hàng',
      bg: '#7c3aed',
    },
  },
  served: {
    key: 'served',
    label: '✅ Đã trả món (Hoàn tất)',
    short: 'Hoàn tất',
    badgeBg: 'rgba(16, 185, 129, 0.2)',
    badgeColor: '#34d399',
    badgeBorder: 'rgba(16, 185, 129, 0.4)',
    stepIndex: 4,
    nextAction: null,
  },
  paid: {
    key: 'paid',
    label: '✅ Hoàn tất đơn hàng',
    short: 'Hoàn tất',
    badgeBg: 'rgba(16, 185, 129, 0.2)',
    badgeColor: '#34d399',
    badgeBorder: 'rgba(16, 185, 129, 0.4)',
    stepIndex: 4,
    nextAction: null,
  },
  cancelled: {
    key: 'cancelled',
    label: '❌ Đã hủy',
    short: 'Đã hủy',
    badgeBg: 'rgba(239, 68, 68, 0.2)',
    badgeColor: '#f87171',
    badgeBorder: 'rgba(239, 68, 68, 0.4)',
    stepIndex: -1,
    nextAction: null,
  },
};

export default function Orders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role || '';

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // VietQR Modal state
  const [showQrModal, setShowQrModal] = useState(null);

  // Form (matching image11.png right panel)
  const [form, setForm] = useState({
    code: '',
    customer_name: '',
    customer_phone: '',
    opened_at: '',
    total: 0,
    status: 'pending',
    payment_method: 'Tiền mặt',
    note: '',
  });

  // PHÂN QUYỀN RBAC THEO MÔ HÌNH BÁN TRỰC TIẾP TẠI QUẦY (3 BƯỚC):
  // - Thu ngân: Tạo đơn POS (100% upfront), theo dõi tiến độ, hủy đơn nếu khách yêu cầu
  // - Pha chế (Barista): Bước 2 (Đang pha chế) và Bước 3 (Pha xong & Trả món - Hoàn tất)
  // - Quản lý: Toàn quyền kiểm soát và điều phối ở cả 3 bước
  const canUpdateStatus = (targetStatus) => {
    if (userRole === 'admin' || userRole === 'manager') return true;
    if (userRole === 'cashier') {
      return ['scheduled', 'preparing', 'pending', 'open', 'done', 'served', 'paid', 'cancelled'].includes(targetStatus);
    }
    if (userRole === 'barista') {
      return ['preparing', 'done', 'served'].includes(targetStatus);
    }
    return true;
  };

  const loadData = async (keepSelection = true) => {
    try {
      const res = await api.get('/orders/all');
      const list = res.data.data || [];
      setOrders(list);

      if (list.length > 0) {
        if (!keepSelection || !selectedOrder) {
          selectRow(list[0]);
        } else {
          const updated = list.find((o) => o.id === selectedOrder.id);
          if (updated) selectRow(updated);
          else selectRow(list[0]);
        }
      }
    } catch {
      toast.error('Lỗi tải danh sách đơn hàng');
    }
  };

  useEffect(() => {
    loadData(false);

    // Lắng nghe sự kiện thời gian thực từ Socket.IO đồng bộ 100% với Barista KDS
    const handleNewOrder = (data) => {
      playNotificationSound();
      toast.success(`🔔 Có đơn hàng mới: #${data?.orderCode || ''}!`, { duration: 5000 });
      loadData(true);
    };

    const handleSync = () => {
      loadData(true);
    };

    socket.on('order:created', handleNewOrder);
    socket.on('barista:new_order', handleNewOrder);
    socket.on('order:status_updated', handleSync);
    socket.on('barista:item_updated', handleSync);
    socket.on('order:cancelled', handleSync);

    return () => {
      socket.off('order:created', handleNewOrder);
      socket.off('barista:new_order', handleNewOrder);
      socket.off('order:status_updated', handleSync);
      socket.off('barista:item_updated', handleSync);
      socket.off('order:cancelled', handleSync);
    };
  }, []);

  const selectRow = async (o) => {
    setSelectedOrder(o);
    setForm({
      code: o.code || o.invoice_no,
      customer_name: o.customer_name || 'Khách vãng lai',
      customer_phone: o.customer_phone || '',
      opened_at: o.opened_at ? o.opened_at.replace('T', ' ').slice(0, 16) : '',
      total: o.total,
      status: o.status || 'pending',
      payment_method: o.payment_method || 'Tiền mặt',
      note: o.note || '',
    });

    // Fetch order items details
    try {
      const res = await api.get(`/orders/${o.id}`);
      setOrderDetails(res.data.data || null);
    } catch {
      setOrderDetails(null);
    }
  };

  // Step-by-step business status progression with Role Check
  const handleUpdateStatus = async (orderId, newStatus) => {
    if (!canUpdateStatus(newStatus)) {
      if (userRole === 'cashier') {
        toast.error('⚠️ Quyền hạn: Bước Đang pha chế do quầy Barista thực hiện!');
      } else if (userRole === 'barista') {
        toast.error('⚠️ Quyền hạn: Barista chỉ thao tác bước Đang pha chế và Pha xong & Trả món!');
      } else {
        toast.error('Bạn không có quyền chuyển trạng thái này!');
      }
      return;
    }

    try {
      await api.put(`/orders/${orderId}/status`, {
        status: newStatus,
        payment_method: form.payment_method || selectedOrder?.payment_method || 'Tiền mặt',
      });

      const label = STATUS_META[newStatus]?.label || newStatus;
      toast.success(`🎉 Đã chuyển đơn hàng sang: ${label}!`);
      await loadData(true);
      if (showQrModal) setShowQrModal(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi cập nhật trạng thái');
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (userRole === 'barista') {
      toast.error('⚠️ Quyền hạn: Pha chế không có quyền hủy đơn! Chỉ Thu Ngân hoặc Quản Lý mới có quyền hủy đơn.');
      return;
    }
    if (!window.confirm('Bạn có chắc muốn hủy đơn hàng này không?')) return;
    try {
      await api.put(`/orders/${orderId}/cancel`, { cancel_reason: 'Khách yêu cầu hủy tại quầy' });
      toast.success('Đã hủy đơn hàng, hoàn trả kho và cập nhật doanh thu thành công!');
      await loadData(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi hủy đơn');
    }
  };

  const handleConfirmPayment = async (orderId) => {
    try {
      const res = await api.post(`/orders/${orderId}/confirm-payment`);
      toast.success(res.data?.message || 'Xác nhận thanh toán thành công! 💵');
      await loadData(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xác nhận thanh toán');
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'scheduled') {
        if (o.status !== 'scheduled') return false;
      } else if (statusFilter === 'pending') {
        if (!['pending', 'open'].includes(o.status)) return false;
      } else if (statusFilter === 'preparing') {
        if (o.status !== 'preparing') return false;
      } else if (statusFilter === 'completed') {
        if (!['done', 'served', 'paid'].includes(o.status)) return false;
      } else if (statusFilter === 'cancelled') {
        if (o.status !== 'cancelled') return false;
      }
    }
    if (fromDate && o.opened_at && o.opened_at.slice(0, 10) < fromDate) return false;
    if (toDate && o.opened_at && o.opened_at.slice(0, 10) > toDate) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.code || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.customer_phone || '').toLowerCase().includes(q) ||
      (o.items_summary || '').toLowerCase().includes(q)
    );
  });

  // Calculate status counts (Mô hình bán trực tiếp 3 bước)
  const countAll = orders.length;
  const countScheduled = orders.filter((o) => o.status === 'scheduled').length;
  const countPending = orders.filter((o) => o.status === 'pending' || o.status === 'open').length;
  const countPreparing = orders.filter((o) => o.status === 'preparing').length;
  const countCompleted = orders.filter((o) => ['done', 'served', 'paid'].includes(o.status)).length;
  const countCancelled = orders.filter((o) => o.status === 'cancelled').length;

  const currentMeta = STATUS_META[selectedOrder?.status] || STATUS_META.pending;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="mockup-split-grid">
      {/* LEFT: DANH SÁCH ĐƠN HÀNG (matching image11.png + Full Workflow Steps) */}
      <div className="mockup-panel">
        <div className="mockup-panel-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div className="mockup-panel-title">
            <span>📋</span>
            <span>DANH SÁCH ĐƠN HÀNG &amp; TIẾN TRÌNH PHA CHẾ</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Tìm mã đơn, tên, món..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '180px', padding: '6px 8px', fontSize: '0.82rem' }}
            />
            <input
              type="date"
              className="form-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ width: '120px', padding: '6px 6px', fontSize: '0.82rem' }}
              title="Từ ngày"
            />
            <input
              type="date"
              className="form-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ width: '120px', padding: '6px 6px', fontSize: '0.82rem' }}
              title="Đến ngày"
            />
          </div>
        </div>

        {/* Workflow Status Filter Tabs (3 Bước chuyên nghiệp) */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '10px 14px',
            background: 'rgba(32, 20, 13, 0.75)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.18)',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'all', label: 'Tất cả', count: countAll, icon: '📋' },
            { id: 'scheduled', label: '🗓️ Hẹn giờ', count: countScheduled, icon: '🗓️', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.2)' },
            { id: 'pending', label: '1. Chờ pha chế', count: countPending, icon: '⏳', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.2)' },
            { id: 'preparing', label: '2. Đang pha chế', count: countPreparing, icon: '☕', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' },
            { id: 'completed', label: '3. Hoàn tất / Đã trả món', count: countCompleted, icon: '✅', color: '#34d399', bg: 'rgba(16, 185, 129, 0.2)' },
            { id: 'cancelled', label: 'Đã hủy', count: countCancelled, icon: '❌', color: '#f87171', bg: 'rgba(248, 113, 113, 0.2)' },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: isActive ? '1.5px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.2)',
                  background: isActive ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(255, 255, 255, 0.04)',
                  color: isActive ? '#ffffff' : '#d5bba2',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 2px 8px rgba(217, 119, 6, 0.35)' : 'none',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.25)' : tab.bg || 'rgba(255,255,255,0.08)',
                    color: isActive ? '#ffffff' : tab.color || '#fef3c7',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
          <table className="mockup-table">
            <thead>
              <tr>
                <th style={{ width: '35px' }}>STT</th>
                <th style={{ width: '105px' }}>Mã đơn</th>
                <th style={{ width: '120px' }}>Khách hàng</th>
                <th>Món gọi (Chi tiết đồ uống)</th>
                <th style={{ width: '95px', textAlign: 'right' }}>Tổng tiền</th>
                <th style={{ width: '125px' }}>Trạng thái</th>
                <th style={{ width: '150px', textAlign: 'center' }}>Quy trình xử lý</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '35px', color: '#c4a482' }}>
                    Không có đơn hàng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredOrders.slice((page - 1) * pageSize, page * pageSize).map((o, idx) => {
                  const isSelected = selectedOrder?.id === o.id;
                  const st = o.status === 'open' ? 'pending' : o.status || 'pending';
                  const meta = STATUS_META[st] || STATUS_META.pending;
                  const realIdx = (page - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={o.id}
                      onClick={() => selectRow(o)}
                      className={isSelected ? 'selected' : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ color: '#c4a482' }}>{realIdx}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#fef3c7' }}>{o.code || o.invoice_no}</div>
                        <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: o.table_code ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: o.table_code ? '#38bdf8' : '#fbbf24',
                            border: o.table_code ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(245, 158, 11, 0.3)',
                          }}>
                            {o.table_code ? `🪑 ${o.table_code}` : '🛍️ ĐƠN ONLINE (MANG VỀ)'}
                          </span>
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            💵 Đã TT 100%
                          </span>
                          {o.pickup_time && (
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(168, 85, 247, 0.25)',
                              color: '#c084fc',
                              border: '1px solid rgba(168, 85, 247, 0.4)',
                            }}>
                              ⏰ Hẹn: {String(o.pickup_time).replace('T', ' ').slice(11, 16)} ({String(o.pickup_time).slice(8, 10)}/{String(o.pickup_time).slice(5, 7)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fef3c7' }}>{o.customer_name || 'Khách vãng lai'}</div>
                        <div style={{ fontSize: '0.73rem', color: '#c4a482' }}>{o.customer_phone || ''}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#e5d5c5', maxWidth: '220px' }}>
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: 600,
                          }}
                          title={o.items_summary || 'Đang cập nhật'}
                        >
                          {o.items_summary || '—'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#a89078' }}>
                          {o.opened_at ? o.opened_at.replace('T', ' ').slice(0, 16) : ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#fbbf24' }}>
                        {fmt(o.total)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              background: meta.badgeBg,
                              color: meta.badgeColor,
                              border: `1px solid ${meta.badgeBorder}`,
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {o.payment_status === 'unpaid' && o.status === 'pending' ? '⏳ Chờ TT • Chờ pha chế' : meta.label}
                          </span>
                          {o.payment_status === 'unpaid' && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f87171', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '1px 6px', borderRadius: '4px' }}>
                              ⚠️ Chưa nhận tiền QR
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {meta.nextAction ? (
                          canUpdateStatus(meta.nextAction.status) ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{
                                background: meta.nextAction.bg,
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                                whiteSpace: 'nowrap',
                              }}
                              title={meta.nextAction.desc}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(o.id, meta.nextAction.status);
                              }}
                            >
                              {meta.nextAction.label}
                            </button>
                          ) : (
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: '0.72rem',
                                background: '#f1f5f9',
                                color: '#64748b',
                                border: '1px solid #cbd5e1',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                cursor: 'not-allowed',
                              }}
                              title={
                                ['preparing', 'done'].includes(meta.nextAction.status)
                                  ? 'Bước 3 & 4: Nghiệp vụ của quầy Pha Chế (Barista)'
                                  : 'Bước 1, 2, 5: Nghiệp vụ của quầy Thu Ngân'
                              }
                            >
                              🔒 {['preparing', 'done'].includes(meta.nextAction.status) ? 'Chờ Barista' : 'Chờ Thu Ngân'}
                            </span>
                          )
                        ) : st === 'paid' ? (
                          <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                            ✅ Hoàn tất
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>
                            Đã hủy
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            className="btn btn-sm"
                            style={{ padding: '3px 6px', background: '#dcfce7', color: '#15803d' }}
                            title="Xem chi tiết"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectRow(o);
                            }}
                          >
                            👁️
                          </button>
                          {st !== 'paid' && st !== 'cancelled' && userRole !== 'barista' && (
                            <button
                              className="btn btn-sm"
                              style={{ padding: '3px 6px', background: '#fee2e2', color: '#dc2626' }}
                              title="Hủy đơn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelOrder(o.id);
                              }}
                            >
                              ❌
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Working Pagination */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            background: 'rgba(32, 20, 13, 0.75)',
            borderTop: '1px solid rgba(245, 158, 11, 0.18)',
            fontSize: '0.82rem',
            color: '#c4a482',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          <span>
            Hiển thị {filteredOrders.length === 0 ? 0 : (page - 1) * pageSize + 1} -{' '}
            {Math.min(page * pageSize, filteredOrders.length)} trong {filteredOrders.length} đơn hàng
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="btn btn-sm btn-outline"
              style={{ padding: '2px 8px', borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fef3c7', background: 'transparent' }}
              onClick={() => setPage(1)}
              disabled={page === 1}
              title="Trang đầu"
            >
              &lt;&lt;
            </button>
            <button
              className="btn btn-sm btn-outline"
              style={{ padding: '2px 8px', borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fef3c7', background: 'transparent' }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              title="Trang trước"
            >
              &lt;
            </button>

            {Array.from({ length: Math.ceil(filteredOrders.length / pageSize) || 1 }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                type="button"
                className="btn btn-sm"
                style={{
                  padding: '2px 8px',
                  background: page === num ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(255, 255, 255, 0.05)',
                  color: page === num ? '#ffffff' : '#fef3c7',
                  border: page === num ? '1px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.2)',
                  fontWeight: 700,
                }}
                onClick={() => setPage(num)}
              >
                {num}
              </button>
            ))}

            <button
              className="btn btn-sm btn-outline"
              style={{ padding: '2px 8px', borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fef3c7', background: 'transparent' }}
              onClick={() => setPage((p) => Math.min(Math.ceil(filteredOrders.length / pageSize) || 1, p + 1))}
              disabled={page === (Math.ceil(filteredOrders.length / pageSize) || 1)}
              title="Trang sau"
            >
              &gt;
            </button>
            <button
              className="btn btn-sm btn-outline"
              style={{ padding: '2px 8px', borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fef3c7', background: 'transparent' }}
              onClick={() => setPage(Math.ceil(filteredOrders.length / pageSize) || 1)}
              disabled={page === (Math.ceil(filteredOrders.length / pageSize) || 1)}
              title="Trang cuối"
            >
              &gt;&gt;
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: THÔNG TIN ĐƠN HÀNG & QUY TRÌNH TIẾN ĐỘ (matching image11.png) */}
      <div className="mockup-panel">
        <div className="mockup-panel-header">
          <div className="mockup-panel-title">
            <span>📝</span>
            <span>TIẾN ĐỘ &amp; CHI TIẾT ĐƠN HÀNG</span>
          </div>
        </div>

        <div className="mockup-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Thông tin Hẹn giờ nhận hàng nếu có */}
          {selectedOrder?.pickup_time && (
            <div style={{
              background: 'rgba(168, 85, 247, 0.15)',
              border: '1.5px solid #a855f7',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#e9d5ff', fontWeight: 700 }}>🗓️ ĐƠN ĐẶT TRƯỚC HẸN GIỜ:</span>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#f5d0fe', marginTop: '2px' }}>
                  ⏰ Giờ nhận hàng: {String(selectedOrder.pickup_time).replace('T', ' ').slice(0, 16)}
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', background: '#7c3aed', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                {selectedOrder.status === 'scheduled' ? 'Tự chuyển trước 15p' : 'Đã chuyển pha chế'}
              </span>
            </div>
          )}

          {/* 3 Steps Coffee Shop Business Logic Stepper (Mô hình trả tiền trước mới làm món) */}
          <div style={{ background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tiến Trình Pha Chế &amp; Phục Vụ
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center', fontSize: '0.72rem' }}>
              {/* Bước 1: Đã thanh toán */}
              <div style={{
                background: currentMeta.stepIndex >= 1 ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: currentMeta.stepIndex >= 1 ? '#34d399' : '#785338',
                padding: '8px 4px',
                borderRadius: '6px',
                fontWeight: 700,
                border: currentMeta.stepIndex >= 1 ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{ fontWeight: 800 }}>1. Đã thanh toán</div>
                <div style={{ fontSize: '0.62rem', opacity: 0.85, margin: '2px 0' }}>Thu ngân POS</div>
                <div>✅ Đã thu tiền (100%)</div>
              </div>

              {/* Bước 2: Đang pha chế */}
              <div
                style={{
                  background: currentMeta.stepIndex >= 2 ? (currentMeta.stepIndex === 2 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(16, 185, 129, 0.18)') : 'rgba(255, 255, 255, 0.04)',
                  color: currentMeta.stepIndex >= 2 ? (currentMeta.stepIndex === 2 ? '#38bdf8' : '#34d399') : '#785338',
                  padding: '8px 4px',
                  borderRadius: '6px',
                  fontWeight: currentMeta.stepIndex === 2 ? 800 : 600,
                  border: currentMeta.stepIndex === 2 ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ fontWeight: 800 }}>2. Đang pha chế</div>
                <div style={{ fontSize: '0.62rem', opacity: 0.85, margin: '2px 0' }}>Quầy Barista</div>
                <div>{currentMeta.stepIndex === 2 ? '☕ Đang pha...' : currentMeta.stepIndex > 2 ? '✅ Đã pha xong' : '⏳ Chờ đến lượt'}</div>
              </div>

              {/* Bước 3: Pha xong & Trả món */}
              <div
                style={{
                  background: currentMeta.stepIndex >= 3 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                  color: currentMeta.stepIndex >= 3 ? '#34d399' : '#785338',
                  padding: '8px 4px',
                  borderRadius: '6px',
                  fontWeight: currentMeta.stepIndex >= 3 ? 800 : 600,
                  border: currentMeta.stepIndex >= 3 ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ fontWeight: 800 }}>3. Hoàn tất &amp; Trả món</div>
                <div style={{ fontSize: '0.62rem', opacity: 0.85, margin: '2px 0' }}>Barista / Phục vụ</div>
                <div>{currentMeta.stepIndex >= 3 ? '🎉 Đã trả món' : '—'}</div>
              </div>
            </div>
          </div>

          {/* Quick Advancement Action Banner with RBAC check */}
          {selectedOrder && currentMeta.nextAction && (
            <div
              style={{
                background: 'rgba(32, 20, 13, 0.85)',
                border: `1.5px solid ${canUpdateStatus(currentMeta.nextAction.status) ? currentMeta.nextAction.bg : 'rgba(255, 255, 255, 0.15)'}`,
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TIẾP THEO:</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fef3c7', marginTop: '2px' }}>
                  {currentMeta.nextAction.desc}
                </div>
                {!canUpdateStatus(currentMeta.nextAction.status) && (
                  <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 700, marginTop: '2px' }}>
                    {['preparing', 'done', 'served'].includes(currentMeta.nextAction.status)
                      ? '⚠️ Bước này do quầy Pha Chế (Barista) thực hiện'
                      : '⚠️ Bước này do quầy Thu Ngân thực hiện'}
                  </div>
                )}
              </div>
              {canUpdateStatus(currentMeta.nextAction.status) ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: currentMeta.nextAction.bg,
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                  }}
                  onClick={() => handleUpdateStatus(selectedOrder.id, currentMeta.nextAction.status)}
                >
                  {currentMeta.nextAction.label} →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#8c7662',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'not-allowed',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                  title="Chờ Barista thao tác"
                >
                  🔒 Chờ Barista
                </button>
              )}
            </div>
          )}

          {/* Banner thông báo khi đơn đã hoàn tất */}
          {selectedOrder && !currentMeta.nextAction && selectedOrder.status !== 'cancelled' && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1.5px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '10px',
                padding: '12px 16px',
                textAlign: 'center',
                color: '#34d399',
                fontWeight: 800,
                fontSize: '0.88rem',
              }}
            >
              🎉 Đơn hàng đã hoàn tất 100%! Đã thanh toán upfront &amp; đã trả món cho khách.
            </div>
          )}

          {/* Channel Badge & Payment Status Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(32, 20, 13, 0.75)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
            <span style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '6px',
              background: selectedOrder?.table_code ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: selectedOrder?.table_code ? '#38bdf8' : '#fbbf24',
              border: selectedOrder?.table_code ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(245, 158, 11, 0.3)',
            }}>
              {selectedOrder?.table_code ? `🪑 Bán tại bàn (${selectedOrder.table_code})` : '🛍️ Đơn mang về (Online / POS)'}
            </span>

            {selectedOrder?.payment_status === 'unpaid' ? (
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.35)',
              }}>
                ⚠️ CHƯA NHẬN ĐƯỢC TIỀN
              </span>
            ) : (
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.35)',
              }}>
                💵 ĐÃ THANH TOÁN 100%
              </span>
            )}
          </div>

          {/* Banner & Nút xác nhận chuyển khoản cho khách online (Lỗi 5) */}
          {selectedOrder?.payment_status === 'unpaid' && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1.5px dashed #ef4444',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ fontSize: '0.8rem', color: '#fca5a5', lineHeight: 1.4 }}>
                ⚠️ Khách đặt online chọn chuyển khoản qua <strong>QR Banking</strong> nhưng quán chưa nhận được tiền hoặc chưa đối soát sao kê.
              </div>
              {['admin', 'manager', 'cashier'].includes(userRole) && (
                <button
                  type="button"
                  onClick={() => handleConfirmPayment(selectedOrder.id)}
                  style={{
                    background: 'linear-gradient(135deg, #15803d, #166534)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(21, 128, 61, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>💵</span>
                  <span>Xác Nhận Đã Nhận Tiền Chuyển Khoản</span>
                </button>
              )}
            </div>
          )}

          {/* Service Channel Badge */}
          <div style={{ background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#fef3c7' }}>Vị trí phục vụ:</span>
            <span style={{
              fontWeight: 800,
              fontSize: '0.78rem',
              padding: '2px 8px',
              borderRadius: '6px',
              background: selectedOrder?.table_code ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: selectedOrder?.table_code ? '#38bdf8' : '#fbbf24',
              border: selectedOrder?.table_code ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(245, 158, 11, 0.3)',
            }}>
              {selectedOrder?.table_code ? `🪑 ${selectedOrder.table_code} (${selectedOrder.area_name || 'Tại quán'})` : '🛍️ Mang về'}
            </span>
          </div>

          {/* Voucher Info */}
          {selectedOrder?.coupon_code && (
            <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px dashed rgba(245, 158, 11, 0.35)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', color: '#fbbf24', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🏷️ <strong>Mã giảm giá áp dụng:</strong></span>
              <strong style={{ color: '#fbbf24' }}>{selectedOrder.coupon_code} (-{fmt(selectedOrder.discount)})</strong>
            </div>
          )}

          <div>
            <label className="form-label" style={{ fontSize: '0.82rem' }}>🏷️ Mã đơn :</label>
            <input
              className="form-input"
              value={form.code}
              readOnly
              style={{ fontWeight: 700 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>👤 Khách hàng :</label>
              <input
                className="form-input"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>📞 SĐT :</label>
              <input
                className="form-input"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
              />
            </div>
          </div>

          {/* Detailed Items in Selected Order - Đồng bộ tiến độ Barista theo từng món */}
          {orderDetails?.items && orderDetails.items.length > 0 && (
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>☕ Danh sách món &amp; Tiến trình Barista ({orderDetails.items.length}):</label>
              <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid rgba(245, 158, 11, 0.18)', borderRadius: '6px' }}>
                <table className="mockup-table">
                  <thead>
                    <tr>
                      <th>Tên món</th>
                      <th style={{ width: '45px', textAlign: 'center' }}>Size</th>
                      <th style={{ width: '30px', textAlign: 'center' }}>SL</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Tiến độ KDS</th>
                      <th style={{ width: '75px', textAlign: 'right' }}>T.Tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderDetails.items.map((it, idx) => {
                      const itemStatusMap = {
                        pending:   { label: '⏳ Chờ pha', bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '#f59e0b' },
                        preparing: { label: '☕ Đang pha', bg: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '#38bdf8' },
                        done:      { label: '🔔 Pha xong', bg: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '#10b981' },
                        served:    { label: '✅ Đã trả',   bg: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '#a855f7' },
                        cancelled: { label: '❌ Đã hủy',   bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '#ef4444' },
                      };
                      const stMeta = itemStatusMap[it.status] || { label: it.status || 'Chờ pha', bg: '#334155', color: '#94a3b8', border: '#475569' };
                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, color: '#fef3c7', fontSize: '0.78rem' }}>
                            <div>{it.product_name}</div>
                            {it.toppings_summary && (
                              <div style={{ fontSize: '0.68rem', color: '#fbbf24', opacity: 0.85 }}>+ {it.toppings_summary}</div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                            {it.size_name && it.size_name !== 'Tiêu chuẩn' ? it.size_name : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#fef3c7' }}>{it.quantity}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: stMeta.bg,
                              color: stMeta.color,
                              border: `1px solid ${stMeta.border}`,
                              whiteSpace: 'nowrap'
                            }}>
                              {stMeta.label}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24', fontSize: '0.76rem' }}>{fmt(it.line_total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>💰 Tổng tiền :</label>
              <input
                className="form-input"
                value={fmt(form.total)}
                readOnly
                style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399', background: 'rgba(32, 20, 13, 0.85)', border: '1px solid rgba(245, 158, 11, 0.25)' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>🏷️ Trạng thái :</label>
              <select
                className="form-select"
                value={form.status}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'cancelled') {
                    if (selectedOrder) handleCancelOrder(selectedOrder.id);
                    return;
                  }
                  setForm({ ...form, status: val });
                  if (selectedOrder) handleUpdateStatus(selectedOrder.id, val);
                }}
                style={{ fontWeight: 700 }}
              >
                {/* 3 Bước chuẩn quầy cà phê */}
                {(['admin', 'manager', 'cashier'].includes(userRole)) && (
                  <option value="pending">1. ⏳ Đã thanh toán • Chờ làm</option>
                )}
                {(['admin', 'manager', 'barista'].includes(userRole)) && (
                  <option value="preparing">2. ☕ Đang pha chế (Barista)</option>
                )}
                {(['admin', 'manager', 'barista', 'waiter', 'cashier'].includes(userRole)) && (
                  <option value="done">3. ✅ Đã pha xong &amp; Trả món (Hoàn tất)</option>
                )}
                {(['admin', 'manager', 'cashier'].includes(userRole)) && (
                  <option value="cancelled">❌ Đã hủy đơn</option>
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>💳 Phương thức :</label>
              <select
                className="form-select"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              >
                <option value="Tiền mặt">💵 Tiền mặt (Cash)</option>
                <option value="QR Banking">💠 Quét mã QR (VietQR)</option>
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>📅 Ngày đặt :</label>
              <input
                className="form-input"
                value={form.opened_at}
                onChange={(e) => setForm({ ...form, opened_at: e.target.value })}
                style={{ fontSize: '0.78rem' }}
              />
            </div>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.82rem' }}>📝 Ghi chú :</label>
            <textarea
              className="form-input"
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          {/* Quick VietQR View Modal Button */}
          {selectedOrder && selectedOrder.status !== 'cancelled' && (
            <button
              type="button"
              className="btn btn-sm"
              style={{
                background: 'linear-gradient(135deg, #d97706, #b45309)',
                color: '#ffffff',
                fontWeight: 800,
                padding: '10px 14px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.85rem',
                boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
              }}
              onClick={() => setShowQrModal(selectedOrder)}
            >
              <span>💠</span>
              <span>XEM MÃ QR TECHCOMBANK ĐƠN NÀY</span>
            </button>
          )}

          {/* 3 Circular Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '6px' }}>
            {userRole !== 'barista' && (
              <button
                type="button"
                className="circle-btn circle-btn-green"
                title="Tạo đơn hàng mới (POS) - Thu ngân"
                onClick={() => navigate('/pos')}
              >
                +
              </button>
            )}
            <button
              type="button"
              className="circle-btn circle-btn-blue"
              title="In hóa đơn"
              onClick={() => window.print()}
            >
              🖨️
            </button>
            {userRole !== 'barista' && (
              <button
                type="button"
                className="circle-btn circle-btn-red"
                title="Hủy đơn - Thu ngân / Quản lý"
                onClick={() => selectedOrder && handleCancelOrder(selectedOrder.id)}
              >
                🗑️
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* TECHCOMBANK VIETQR MODAL */}
      {showQrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              background: '#1c120b',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fef3c7',
            }}
          >
            <div style={{ background: 'linear-gradient(135deg, #b45309, #78350f)', color: '#fef3c7', padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.5px' }}>💠 TECHCOMBANK VIETQR NAPAS247</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.9, marginTop: '2px' }}>Mã đơn: {showQrModal.code || showQrModal.invoice_no}</div>
            </div>

            <div style={{ padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <img
                src={`https://img.vietqr.io/image/${BANK_CONFIG.bin}-${BANK_CONFIG.accountNumberRaw}-compact2.png?amount=${showQrModal.total}&addInfo=${encodeURIComponent(showQrModal.code || showQrModal.invoice_no)}&accountName=${encodeURIComponent(BANK_CONFIG.accountHolder)}`}
                alt="VietQR Techcombank"
                style={{ width: '220px', height: '220px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.35)', background: '#ffffff', padding: '4px' }}
              />

              <div style={{ fontSize: '0.88rem', color: '#fef3c7', lineHeight: '1.6' }}>
                <div>Chủ tài khoản: <strong>{BANK_CONFIG.accountHolder}</strong></div>
                <div>Số tài khoản: <strong style={{ color: '#fbbf24', fontSize: '1.05rem' }}>{BANK_CONFIG.accountNumber}</strong></div>
                <div>Ngân hàng: <strong>{BANK_CONFIG.bankFullName}</strong></div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>
                  Số tiền: {fmt(showQrModal.total)}
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(28, 18, 11, 0.95)', padding: '14px 20px', borderTop: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ borderColor: 'rgba(245, 158, 11, 0.35)', color: '#fef3c7', background: 'transparent' }}
                onClick={() => setShowQrModal(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', fontWeight: 800, color: '#ffffff' }}
                onClick={() => setShowQrModal(null)}
              >
                ✅ ĐÃ XÁC NHẬN / ĐÓNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE THERMAL RECEIPT FOR WINDOW.PRINT() */}
      <div className="pos-thermal-receipt">
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 'bold' }}>MY COFFEE HOUSE</h2>
          <div style={{ fontSize: '11px', color: '#333' }}>Đ/c: 123 Nguyễn Văn Cừ, Quận 5, TP.HCM</div>
          <div style={{ fontSize: '11px', color: '#333' }}>Hotline: 1900 6868 - Wifi: MyCoffee_Free</div>
          <div style={{ margin: '6px 0', borderBottom: '1px dashed #000' }}></div>
          <h3 style={{ margin: '4px 0', fontSize: '14px', fontWeight: 'bold' }}>HÓA ĐƠN ĐƠN HÀNG</h3>
          <div style={{ fontSize: '11px' }}>Mã đơn: {form.code}</div>
          <div style={{ fontSize: '11px' }}>Khách hàng: {form.customer_name} ({form.customer_phone || '—'})</div>
          <div style={{ fontSize: '11px' }}>Thời gian: {form.opened_at || new Date().toLocaleString('vi-VN')}</div>
          <div style={{ fontSize: '11px' }}>Trạng thái: {form.status}</div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

        {orderDetails?.items && (
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ padding: '3px 0' }}>Tên món (Size)</th>
                <th style={{ textAlign: 'center', width: '25px' }}>SL</th>
                <th style={{ textAlign: 'right', width: '60px' }}>Đ.Giá</th>
                <th style={{ textAlign: 'right', width: '65px' }}>T.Tiền</th>
              </tr>
            </thead>
            <tbody>
              {orderDetails.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 0' }}>{item.product_name} ({item.size_name})</td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

        <div style={{ fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
          <span>THÀNH TIỀN:</span>
          <span>{fmt(form.total)}</span>
        </div>
        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
          <span>Phương thức:</span>
          <span>{form.payment_method}</span>
        </div>
        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
          <span>TK Techcombank:</span>
          <span>2402 2005 6666 (BUI VAN TRUONG)</span>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
        <div style={{ textAlign: 'center', fontSize: '11px' }}>
          <div>❤️ MY COFFEE HOUSE ❤️</div>
          <div>Cảm ơn Quý Khách! Hẹn gặp lại!</div>
        </div>
      </div>
    </div>
  );
}
