import { useEffect, useState } from 'react';
import api from '../api/axios';
import socket from '../api/socket';
import { playNotificationSound } from '../utils/sound';

export default function Barista() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/barista/queue')
      .then((r) => setItems(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();

    const handleNewOrder = () => {
      playNotificationSound();
      load();
    };

    // Lắng nghe Socket.IO tức thì
    socket.on('order:created', handleNewOrder);
    socket.on('barista:new_order', load);
    socket.on('barista:item_updated', load);
    socket.on('order:status_updated', load);
    socket.on('order:cancelled', load);

    // Fallback định kỳ 15s phòng rớt mạng
    const t = setInterval(load, 15000);
    return () => {
      clearInterval(t);
      socket.off('order:created', handleNewOrder);
      socket.off('barista:new_order', load);
      socket.off('barista:item_updated', load);
      socket.off('order:status_updated', load);
      socket.off('order:cancelled', load);
    };
  }, []);

  const updateStatus = async (id, status) => {
    await api.put(`/barista/items/${id}/status`, { status });
    load();
  };

  const pending   = items.filter((i) => i.status === 'pending');
  const preparing = items.filter((i) => i.status === 'preparing');
  const done      = items.filter((i) => i.status === 'done');

  const renderItem = (item, actions) => (
    <div key={item.id} className="barista-item-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div
          className="barista-item-table"
          style={!item.table_code ? { background: 'rgba(217, 119, 6, 0.25)', border: '1px solid #d97706', color: '#fbbf24', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 } : {}}
        >
          {item.table_code ? `🪑 ${item.table_code}` : '🛍️ ĐƠN ONLINE (MANG VỀ)'}
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
          #{item.order_code}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <div className="barista-item-name">
          {item.product_name}{' '}
          {item.size_name && ['S', 'M', 'L', 'XL'].includes(String(item.size_name).trim().toUpperCase()) && (
            <span style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: 700 }}>
              (Size {item.size_name})
            </span>
          )}
        </div>
        <span
          style={{
            background: 'linear-gradient(135deg, #d97706, #b45309)',
            color: '#ffffff',
            fontWeight: 900,
            fontSize: '0.85rem',
            padding: '2px 10px',
            borderRadius: '12px',
            flexShrink: 0,
          }}
        >
          ×{item.quantity}
        </span>
      </div>

      {item.toppings && (
        <div className="barista-item-toppings" style={{ color: '#fbbf24' }}>
          🧋 Topping: {item.toppings}
        </div>
      )}

      {item.note && (
        <div
          style={{
            fontSize: '0.78rem',
            color: '#f87171',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px dashed rgba(239, 68, 68, 0.35)',
            padding: '5px 8px',
            borderRadius: '6px',
            marginTop: '6px',
            fontStyle: 'italic',
          }}
        >
          📝 Ghi chú: {item.note}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              background: a.bg,
              color: '#ffffff',
              fontWeight: 800,
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              fontSize: '0.82rem',
            }}
            onClick={() => updateStatus(item.id, a.status)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.8rem' }}>🍹</span>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
            MÀN HÌNH PHA CHẾ (KDS)
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(32, 20, 13, 0.8)', padding: '6px 14px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#34d399' }}>Trực tuyến</span>
        </div>
      </div>

      {/* 2. 3 KANBAN COLUMNS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px', minHeight: 'calc(100vh - 230px)' }}>
        {/* Column 1: Pending */}
        <div className="barista-col" style={{ borderTop: '3px solid #f59e0b' }}>
          <div className="barista-col-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24' }}>
              <span>⏳</span>
              <span>1. CHỜ PHA CHẾ</span>
            </div>
            <span
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '20px',
                padding: '2px 10px',
                fontSize: '0.82rem',
                fontWeight: 800,
              }}
            >
              {pending.length} món
            </span>
          </div>
          <div className="barista-items">
            {pending.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px' }}>
                <div className="empty-state-icon">☕</div>
                <div className="empty-state-text" style={{ color: '#c4a482' }}>Không có món nào đang chờ</div>
              </div>
            ) : (
              pending.map((i) =>
                renderItem(i, [
                  { label: '▶️ Bắt đầu pha chế', status: 'preparing', bg: 'linear-gradient(135deg, #d97706, #b45309)' },
                ])
              )
            )}
          </div>
        </div>

        {/* Column 2: Preparing */}
        <div className="barista-col" style={{ borderTop: '3px solid #38bdf8' }}>
          <div className="barista-col-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
              <span>🔄</span>
              <span>2. ĐANG PHA CHẾ</span>
            </div>
            <span
              style={{
                background: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '20px',
                padding: '2px 10px',
                fontSize: '0.82rem',
                fontWeight: 800,
              }}
            >
              {preparing.length} món
            </span>
          </div>
          <div className="barista-items">
            {preparing.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px' }}>
                <div className="empty-state-icon">🍹</div>
                <div className="empty-state-text" style={{ color: '#c4a482' }}>Không có món đang pha</div>
              </div>
            ) : (
              preparing.map((i) =>
                renderItem(i, [
                  { label: '🔔 Pha xong & Trả món', status: 'done', bg: 'linear-gradient(135deg, #10b981, #059669)' },
                ])
              )
            )}
          </div>
        </div>

        {/* Column 3: Done */}
        <div className="barista-col" style={{ borderTop: '3px solid #10b981' }}>
          <div className="barista-col-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399' }}>
              <span>✅</span>
              <span>3. PHA XONG &amp; TRẢ MÓN</span>
            </div>
            <span
              style={{
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '20px',
                padding: '2px 10px',
                fontSize: '0.82rem',
                fontWeight: 800,
              }}
            >
              {done.length} món
            </span>
          </div>
          <div className="barista-items">
            {done.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px' }}>
                <div className="empty-state-icon">🎉</div>
                <div className="empty-state-text" style={{ color: '#c4a482' }}>Chưa có món hoàn thành</div>
              </div>
            ) : (
              done.map((i) =>
                renderItem(i, [
                  { label: '🛎️ Đã trả món (Hoàn tất)', status: 'served', bg: 'linear-gradient(135deg, #7c3aed, #6d28d9)' },
                ])
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
