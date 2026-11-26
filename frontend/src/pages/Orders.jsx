import { useEffect, useState, useMemo } from 'react';
import api from '../api/axios';
import socket from '../api/socket';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
 
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
 
const STATUS_META = {
  awaiting_payment: { label: 'Chờ xác nhận CK', bg: 'rgba(245,158,11,0.14)', color: '#FBBF24', dot: '#F59E0B', step: 0 },
  scheduled:        { label: 'Hẹn giờ nhận',     bg: 'rgba(168,85,247,0.14)', color: '#C084FC', dot: '#A855F7', step: 1 },
  pending:          { label: 'Chờ pha chế',      bg: 'rgba(245,158,11,0.14)', color: '#FBBF24', dot: '#D97706', step: 1 },
  preparing:        { label: 'Đang pha chế',     bg: 'rgba(56,189,248,0.14)', color: '#38BDF8', dot: '#38BDF8', step: 2 },
  done:             { label: 'Đã pha xong',      bg: 'rgba(16,185,129,0.14)', color: '#34D399', dot: '#10B981', step: 3 },
  served:           { label: 'Hoàn tất',         bg: 'rgba(16,185,129,0.14)', color: '#34D399', dot: '#10B981', step: 3 },
  paid:             { label: 'Hoàn tất',         bg: 'rgba(16,185,129,0.14)', color: '#34D399', dot: '#10B981', step: 3 },
  cancelled:        { label: 'Đã hủy',           bg: 'rgba(239,68,68,0.14)',  color: '#F87171', dot: '#EF4444', step: -1 },
};
 
const FILTER_TABS = [
  { id: 'all',       label: 'Tất cả' },
  { id: 'scheduled', label: 'Hẹn giờ' },
  { id: 'pending',   label: 'Chờ pha chế' },
  { id: 'preparing', label: 'Đang pha chế' },
  { id: 'completed', label: 'Hoàn tất' },
  { id: 'cancelled', label: 'Đã hủy' },
];
 
export default function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
 
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
 
  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await api.get(`/orders/all?${params.toString()}`);
      setOrders(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      toast.error('Không thể tải danh sách đơn hàng');
    } finally {
      setLoading(false);
    }
  };
 
  const openOrderDrawer = async (order) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    try {
      const res = await api.get(`/orders/${order.id}`);
      if (res.data?.success) setOrderDetail(res.data.data);
    } catch {
      setOrderDetail(order);
    } finally {
      setLoadingDetail(false);
    }
  };
 
  useEffect(() => {
    fetchOrders();
    const onSync = () => fetchOrders();
    socket.on('order:created', onSync);
    socket.on('order:status_updated', onSync);
    socket.on('barista:item_updated', onSync);
    socket.on('order:cancelled', onSync);
    return () => {
      socket.off('order:created', onSync);
      socket.off('order:status_updated', onSync);
      socket.off('barista:item_updated', onSync);
      socket.off('order:cancelled', onSync);
    };
  }, [fromDate, toDate]);
 
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedOrder(null);
      }
    };
    if (selectedOrder) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [selectedOrder]);

  const counts = useMemo(() => ({
    all: orders.length,
    scheduled: orders.filter((o) => o.status === 'scheduled').length,
    pending: orders.filter((o) => ['pending', 'awaiting_payment'].includes(o.status)).length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    completed: orders.filter((o) => ['done', 'served', 'paid'].includes(o.status)).length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
  }), [orders]);
 
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (activeTab === 'scheduled' && o.status !== 'scheduled') return false;
      if (activeTab === 'pending' && !['pending', 'awaiting_payment'].includes(o.status)) return false;
      if (activeTab === 'preparing' && o.status !== 'preparing') return false;
      if (activeTab === 'completed' && !['done', 'served', 'paid'].includes(o.status)) return false;
      if (activeTab === 'cancelled' && o.status !== 'cancelled') return false;
 
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (o.code || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.customer_phone || '').toLowerCase().includes(q) ||
        (o.items_summary || '').toLowerCase().includes(q)
      );
    });
  }, [orders, activeTab, search]);
 
  const handleUpdateStatus = async (orderId, nextStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: nextStatus });
      toast.success('Đã cập nhật trạng thái đơn hàng');
      await fetchOrders();
      if (selectedOrder?.id === orderId) openOrderDrawer({ ...selectedOrder, status: nextStatus });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể chuyển trạng thái');
    }
  };
 
  const handleConfirmPayment = async (orderId) => {
    try {
      await api.post(`/orders/${orderId}/confirm-payment`);
      toast.success('Đã xác nhận nhận tiền chuyển khoản');
      await fetchOrders();
      if (selectedOrder?.id === orderId) openOrderDrawer(selectedOrder);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xác nhận thanh toán');
    }
  };
 
  const handleCancelOrder = async (orderId) => {
    const reason = window.prompt('Nhập lý do hủy đơn hàng:', 'Khách yêu cầu hủy');
    if (reason === null) return;
    try {
      await api.put(`/orders/${orderId}/cancel`, { cancel_reason: reason || 'Hủy đơn' });
      toast.success('Đã hủy đơn và hoàn kho thành công');
      setSelectedOrder(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không có quyền hoặc không thể hủy đơn này');
    }
  };
 
  const detail = orderDetail || selectedOrder;
  const detailMeta = detail ? (STATUS_META[detail.status] || STATUS_META.pending) : null;
 
  return (
    <div className="ord-page">
      <style>{`
        .ord-page { display: flex; flex-direction: column; gap: 16px; color: #F4F1EC; }
        .ord-card {
          background: #18181B; border: 1px solid #2A2A30; border-radius: 16px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.32); overflow: hidden;
        }
        .ord-toolbar {
          padding: 14px 18px; border-bottom: 1px solid #2A2A30;
          display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
        }
        .ord-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .ord-tab {
          padding: 6px 13px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
          border: 1px solid #2A2A30; background: #202024; color: #A1A1AA; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: all 0.15s ease;
        }
        .ord-tab:hover { background: #2A2A32; color: #F4F1EC; }
        .ord-tab.active { background: #D97706; border-color: #D97706; color: #FFFFFF; }
        .ord-input {
          background: #121214; border: 1px solid #2E2E35; border-radius: 9px;
          padding: 7px 12px; font-size: 0.82rem; color: #F4F1EC; color-scheme: dark; outline: none;
        }
        .ord-input:focus { background: #18181B; border-color: #D97706; }
        .ord-table-wrap { width: 100%; overflow-x: auto; }
        .ord-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
        .ord-table th {
          text-align: left; padding: 11px 14px; font-size: 0.72rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em; color: #A1A1AA;
          background: #141417; border-bottom: 1px solid #2A2A30; white-space: nowrap;
        }
        .ord-table td {
          padding: 12px 14px; border-bottom: 1px solid #242429; vertical-align: middle; color: #F4F1EC;
        }
        .ord-table tbody tr { cursor: pointer; transition: background 0.12s ease; }
        .ord-table tbody tr:hover { background: #202024; }
        .ord-drawer-backdrop {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px); z-index: 999; display: flex; justify-content: flex-end;
        }
        .ord-drawer {
          width: 100%; max-width: 480px; height: 100vh; background: #18181B; color: #F4F1EC;
          border-left: 1px solid #2A2A30; box-shadow: -12px 0 36px rgba(0, 0, 0, 0.55); display: flex; flex-direction: column;
        }
      `}</style>
 
      <div className="ord-card">
        <div className="ord-toolbar">
          <div className="ord-tabs">
            {FILTER_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ord-tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                <span>{t.label}</span>
                <span style={{
                  fontSize: '0.72rem', padding: '1px 6px', borderRadius: '999px',
                  background: activeTab === t.id ? 'rgba(255,255,255,0.2)' : '#141417',
                  color: activeTab === t.id ? '#FFFFFF' : '#A1A1AA'
                }}>
                  {counts[t.id]}
                </span>
              </button>
            ))}
          </div>
 
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="ord-input"
              placeholder="Tìm mã đơn, khách, tên món..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '210px' }}
            />
            <input type="date" className="ord-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input type="date" className="ord-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
 
        <div className="ord-table-wrap">
          <table className="ord-table">
            <thead>
              <tr>
                <th style={{ width: '48px' }}>#</th>
                <th>Mã đơn & Vị trí</th>
                <th>Khách hàng</th>
                <th>Món đã gọi</th>
                <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#A1A1AA' }}>Đang tải danh sách đơn hàng...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#A1A1AA' }}>Không có đơn hàng nào trong mục này.</td></tr>
              ) : (
                filteredOrders.map((o, idx) => {
                  const st = STATUS_META[o.status] || STATUS_META.pending;
                  return (
                    <tr key={o.id} onClick={() => openOrderDrawer(o)}>
                      <td style={{ color: '#A1A1AA', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#F4F1EC' }}>{o.code}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '6px',
                            background: o.table_code ? 'rgba(56,189,248,0.14)' : '#26262B',
                            color: o.table_code ? '#38BDF8' : '#A1A1AA'
                          }}>
                            {o.table_code || 'Mang về'}
                          </span>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '6px',
                            background: o.payment_status === 'paid' ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
                            color: o.payment_status === 'paid' ? '#34D399' : '#FBBF24'
                          }}>
                            {o.payment_status === 'paid' ? 'Đã TT' : 'Chưa TT'}
                          </span>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#F4F1EC' }}>{o.customer_name || 'Khách lẻ'}</div>
                        <div style={{ fontSize: '0.74rem', color: '#A1A1AA' }}>{o.customer_phone || '—'}</div>
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        <div style={{ fontWeight: 500, color: '#F4F1EC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.items_summary}>
                          {o.items_summary || 'Không có chi tiết món'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#A1A1AA', marginTop: '2px' }}>
                          {new Date(o.opened_at).toLocaleString('vi-VN')}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: '#F59E0B', fontSize: '0.92rem' }}>
                        {fmt(o.total)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: st.bg, color: st.color, padding: '4px 10px',
                          borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot }} />
                          {st.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openOrderDrawer(o)}
                          style={{
                            background: '#202024', border: '1px solid #32323A', color: '#F4F1EC',
                            padding: '5px 11px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          Chi tiết →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
 
      {/* SLIDE-OVER DRAWER CHI TIẾT & TIẾN ĐỘ NGANG 3 BƯỚC */}
      {selectedOrder && detail && (
        <div className="ord-drawer-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="ord-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #2A2A30',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F4F1EC' }}>{detail.code}</span>
                  <span style={{
                    background: detailMeta.bg, color: detailMeta.color,
                    padding: '2px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700
                  }}>
                    {detailMeta.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>
                  Tạo lúc {new Date(detail.opened_at).toLocaleString('vi-VN')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #32323A',
                  background: '#202024', color: '#F4F1EC', fontWeight: 700, cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
 
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {detail.status !== 'cancelled' && (
                <div style={{
                  background: '#141417', border: '1px solid #2A2A30', borderRadius: '12px',
                  padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px'
                }}>
                  {[
                    { step: 1, title: '1. Thanh toán', sub: detail.payment_status === 'paid' ? 'Đã thu tiền' : 'Chờ xác nhận' },
                    { step: 2, title: '2. Pha chế', sub: detailMeta.step >= 2 ? 'Barista đã nhận' : 'Đang chờ quầy' },
                    { step: 3, title: '3. Trả món', sub: detailMeta.step >= 3 ? 'Đã hoàn tất' : 'Chưa trả món' },
                  ].map((s) => {
                    const done = detailMeta.step >= s.step && (s.step !== 1 || detail.payment_status === 'paid');
                    return (
                      <div key={s.step} style={{
                        padding: '8px', borderRadius: '8px',
                        background: done ? 'rgba(16,185,129,0.14)' : '#202024',
                        border: `1px solid ${done ? 'rgba(52,211,153,0.3)' : '#2A2A30'}`
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: done ? '#34D399' : '#D4D4D8' }}>{s.title}</div>
                        <div style={{ fontSize: '0.68rem', color: done ? '#34D399' : '#A1A1AA', marginTop: '2px' }}>{s.sub}</div>
                      </div>
                    );
                  })}
                </div>
              )}
 
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px',
                background: '#141417', border: '1px solid #2A2A30', padding: '12px 14px', borderRadius: '12px', fontSize: '0.8rem'
              }}>
                <div><span style={{ color: '#A1A1AA' }}>Vị trí:</span> <strong>{detail.table_code || 'Mang về'}</strong></div>
                <div><span style={{ color: '#A1A1AA' }}>Thanh toán:</span> <strong>{detail.payment_method || 'Tiền mặt'}</strong></div>
                <div><span style={{ color: '#A1A1AA' }}>Khách hàng:</span> <strong>{detail.customer_name || 'Khách lẻ'}</strong></div>
                <div><span style={{ color: '#A1A1AA' }}>SĐT:</span> <strong>{detail.customer_phone || '—'}</strong></div>
                {detail.coupon_code && (
                  <div style={{ gridColumn: '1 / -1', color: '#34D399' }}>
                    Mã ưu đãi: <strong>{detail.coupon_code}</strong> (-{fmt(detail.discount_total)})
                  </div>
                )}
              </div>
 
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F4F1EC', marginBottom: '8px' }}>
                  Danh sách đồ uống ({detail.items?.length || 0} dòng)
                </div>
                {loadingDetail ? (
                  <div style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>Đang tải chi tiết món...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(detail.items || []).map((it) => (
                      <div key={it.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: '10px', border: '1px solid #2A2A30', background: '#202024'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#F4F1EC' }}>
                            {it.product_name} {it.size_name && it.size_name !== 'Tiêu chuẩn' ? `(${it.size_name})` : ''} × {it.quantity}
                          </div>
                          {it.toppings_summary && <div style={{ fontSize: '0.74rem', color: '#F59E0B' }}>+ {it.toppings_summary}</div>}
                          {it.note && <div style={{ fontSize: '0.74rem', color: '#A1A1AA' }}>Ghi chú: {it.note}</div>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#F59E0B', whiteSpace: 'nowrap' }}>
                          {fmt(it.line_total)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
 
              <div style={{ borderTop: '1px dashed #2A2A30', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.84rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA' }}>
                  <span>Tạm tính</span><span>{fmt(detail.subtotal)}</span>
                </div>
                {Number(detail.discount_total) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34D399' }}>
                    <span>Giảm giá</span><span>-{fmt(detail.discount_total)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.08rem', fontWeight: 700, color: '#F59E0B', marginTop: '4px' }}>
                  <span>Tổng cộng</span><span>{fmt(detail.total)}</span>
                </div>
              </div>
            </div>
 
            <div style={{
              padding: '14px 20px', borderTop: '1px solid #2A2A30', background: '#141417',
              display: 'flex', gap: '8px', flexWrap: 'wrap'
            }}>
              {detail.payment_status !== 'paid' && detail.status !== 'cancelled' && ['admin', 'manager', 'cashier'].includes(user?.role) && (
                <button type="button" onClick={() => handleConfirmPayment(detail.id)}
                  style={{ flex: 1, background: '#D97706', color: '#FFFFFF', border: 'none', padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
                  Xác nhận đã nhận tiền
                </button>
              )}
              {detail.status === 'pending' && detail.payment_status === 'paid' && ['admin', 'manager', 'barista'].includes(user?.role) && (
                <button type="button" onClick={() => handleUpdateStatus(detail.id, 'preparing')}
                  style={{ flex: 1, background: '#0284C7', color: '#FFFFFF', border: 'none', padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
                  Chuyển sang Pha chế
                </button>
              )}
              {detail.status === 'preparing' && ['admin', 'manager', 'barista'].includes(user?.role) && (
                <button type="button" onClick={() => handleUpdateStatus(detail.id, 'done')}
                  style={{ flex: 1, background: '#D97706', color: '#FFFFFF', border: 'none', padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
                  Báo đã pha xong
                </button>
              )}
              {detail.status === 'done' && ['admin', 'manager', 'cashier', 'barista', 'waiter'].includes(user?.role) && (
                <button type="button" onClick={() => handleUpdateStatus(detail.id, 'served')}
                  style={{ flex: 1, background: '#10B981', color: '#FFFFFF', border: 'none', padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
                  Xác nhận đã trả món
                </button>
              )}
              {detail.status !== 'cancelled' && ['admin', 'manager', 'cashier'].includes(user?.role) && (
                <button type="button" onClick={() => handleCancelOrder(detail.id)}
                  style={{ background: 'rgba(239,68,68,0.14)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)', padding: '10px 14px', borderRadius: '10px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                  Hủy đơn
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
