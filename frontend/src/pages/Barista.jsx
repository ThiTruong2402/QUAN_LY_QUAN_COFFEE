import { useEffect, useState, useMemo } from 'react';
import api from '../api/axios';
import socket from '../api/socket';
import toast from 'react-hot-toast';
import { playNotificationSound } from '../utils/sound';

const getWaitMins = (ts) => (ts ? Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 60000)) : 0);

export default function Barista() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [selectedRecipeItem, setSelectedRecipeItem] = useState(null);

  const fetchQueue = async () => {
    try {
      const res = await api.get('/barista/queue');
      setItems(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      toast.error('Lỗi tải hàng đợi pha chế');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const onNewOrder = () => {
      if (soundOn) {
        try { playNotificationSound(); } catch {}
      }
      toast('🔔 Có đơn đồ uống mới!', { duration: 4000 });
      fetchQueue();
    };
    const onSync = () => fetchQueue();

    socket.emit('join_barista');
    // FE-05: Chỉ lắng nghe barista:new_order để chống chuông báo và thông báo bị nhân đôi
    socket.on('barista:new_order', onNewOrder);
    socket.on('barista:item_updated', onSync);
    socket.on('order:status_updated', onSync);
    socket.on('order:cancelled', onSync);
    const interval = setInterval(fetchQueue, 20000);

    return () => {
      clearInterval(interval);
      socket.off('barista:new_order', onNewOrder);
      socket.off('barista:item_updated', onSync);
      socket.off('order:status_updated', onSync);
      socket.off('order:cancelled', onSync);
    };
  }, [soundOn]);

  // Gom nhóm các món theo từng đơn hàng (Ticket)
  const groupedOrders = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!map.has(it.order_id)) {
        map.set(it.order_id, {
          order_id: it.order_id,
          order_code: it.order_code,
          table_code: it.table_code,
          order_type: it.order_type,
          customer_name: it.customer_name,
          sent_at: it.sent_at || it.opened_at,
          items: [],
        });
      }
      map.get(it.order_id).items.push(it);
    }
    return Array.from(map.values()).map((ord) => {
      const allDone = ord.items.every((i) => i.status === 'done');
      const anyPrep = ord.items.some((i) => i.status === 'preparing' || i.status === 'done');
      const col = allDone ? 'done' : anyPrep ? 'preparing' : 'pending';
      return { ...ord, col };
    });
  }, [items]);

  const handleOrderStep = async (orderId, status) => {
    try {
      await api.put(`/barista/orders/${orderId}/status`, { status });
      toast.success(status === 'preparing' ? 'Bắt đầu pha chế' : status === 'done' ? 'Đã pha xong, chờ trả món' : 'Đã trả món thành công');
      fetchQueue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật trạng thái');
    }
  };

  const columns = [
    { id: 'pending',   title: 'Chờ pha chế',       accent: '#D97706', bg: '#FFFBEB', btnLabel: 'Nhận pha ngay',   nextStatus: 'preparing', btnBg: '#D97706' },
    { id: 'preparing', title: 'Đang pha chế',      accent: '#0284C7', bg: '#F0F9FF', btnLabel: 'Báo pha xong',    nextStatus: 'done',      btnBg: '#0284C7' },
    { id: 'done',      title: 'Sẵn sàng trả món',  accent: '#10B981', bg: '#ECFDF5', btnLabel: 'Xác nhận trả món', nextStatus: 'served',    btnBg: '#10B981' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Thanh điều khiển KDS */}
      <div className="mch-card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#2C1A12' }}>Hàng đợi pha chế trực tuyến</span>
          <span className="mch-badge mch-badge-amber">{groupedOrders.filter((o) => o.col === 'pending').length} chờ pha</span>
          <span className="mch-badge mch-badge-blue">{groupedOrders.filter((o) => o.col === 'preparing').length} đang làm</span>
          <span className="mch-badge mch-badge-green">{groupedOrders.filter((o) => o.col === 'done').length} chờ trả</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="mch-btn mch-btn-outline" onClick={() => setSoundOn((s) => !s)}>
            {soundOn ? '🔔 Âm báo: Bật' : '🔕 Âm báo: Tắt'}
          </button>
          <button type="button" className="mch-btn mch-btn-primary" onClick={fetchQueue}>🔄 Làm mới</button>
        </div>
      </div>

      {/* 3 Cột Kanban KDS */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#78716C' }}>Đang tải hàng đợi pha chế...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', alignItems: 'start' }}>
          {columns.map((col) => {
            const list = groupedOrders.filter((o) => o.col === col.id);
            return (
              <div key={col.id} style={{ background: '#FFFFFF', border: '1px solid #E7DFD5', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(44, 26, 18, 0.04)' }}>
                <div style={{ padding: '12px 16px', background: col.bg, borderBottom: `2px solid ${col.accent}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1F1611' }}>{col.title}</span>
                  <span style={{ background: col.accent, color: '#FFFFFF', fontSize: '0.74rem', fontWeight: 800, padding: '2px 9px', borderRadius: '999px' }}>{list.length}</span>
                </div>

                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                  {list.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 10px', fontSize: '0.82rem', color: '#A8A29E' }}>Không có đơn trong cột này</div>
                  ) : list.map((ord) => {
                    const mins = getWaitMins(ord.sent_at);
                    const isLate = mins >= 12 && col.id !== 'done';
                    return (
                      <div key={ord.order_id} style={{
                        border: isLate ? '1.5px solid #DC2626' : '1px solid #E7DFD5',
                        borderRadius: '12px', padding: '12px', background: '#FAF7F2'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontWeight: 800, color: '#2C1A12', fontSize: '0.9rem' }}>#{ord.order_code}</span>
                            <span style={{ marginLeft: '6px', fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: '#FFFFFF', border: '1px solid #E7DFD5', color: '#2C1A12' }}>
                              {ord.table_code || 'Mang về'}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isLate ? '#DC2626' : '#78716C' }}>
                            ⏱️ {mins} phút
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                          {ord.items.map((it) => (
                            <div key={it.id} style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #F0EAE1' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1F1611' }}>
                                  {it.product_name} {it.size_name && it.size_name !== 'Tiêu chuẩn' ? `(${it.size_name})` : ''} × {it.quantity}
                                </span>
                                {it.recipe?.length > 0 && (
                                  <button type="button" onClick={() => setSelectedRecipeItem(it)}
                                    style={{ background: '#FFF7ED', border: '1px solid #FDBA74', color: '#C2410C', fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', cursor: 'pointer' }}>
                                    Công thức
                                  </button>
                                )}
                              </div>
                              {it.toppings && <div style={{ fontSize: '0.73rem', color: '#C86A28', marginTop: '2px' }}>+ {it.toppings}</div>}
                              {it.note && <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>Lưu ý: {it.note}</div>}
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOrderStep(ord.order_id, col.nextStatus)}
                          style={{
                            width: '100%', background: col.btnBg, color: '#FFFFFF', border: 'none',
                            padding: '8px', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                            transition: 'opacity 0.15s ease'
                          }}
                        >
                          {col.btnLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal xem nhanh công thức định lượng chuẩn (g / ml) */}
      {selectedRecipeItem && (
        <div onClick={() => setSelectedRecipeItem(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '22px', width: '100%', maxWidth: '420px', border: '1px solid #E7DFD5', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px', color: '#2C1A12', fontSize: '1.08rem', fontWeight: 800 }}>
              Định lượng: {selectedRecipeItem.product_name} ({selectedRecipeItem.size_name || 'Tiêu chuẩn'})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              {(selectedRecipeItem.recipe || []).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#FAF7F2', borderRadius: '8px', fontSize: '0.84rem' }}>
                  <span>{r.ingredient}</span>
                  <strong style={{ color: '#C86A28' }}>{r.display}</strong>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2C1A12', marginBottom: '6px' }}>Quy trình thực hiện:</div>
            <ol style={{ margin: '0 0 16px', paddingLeft: '18px', fontSize: '0.8rem', color: '#57534E', lineHeight: 1.5 }}>
              {(selectedRecipeItem.workflow_steps || []).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <button type="button" className="mch-btn mch-btn-primary" style={{ width: '100%' }} onClick={() => setSelectedRecipeItem(null)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
