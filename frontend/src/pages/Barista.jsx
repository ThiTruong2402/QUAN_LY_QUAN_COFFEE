import { useEffect, useState } from 'react';
import api from '../api/axios';
import socket from '../api/socket';
import { playNotificationSound } from '../utils/sound';
import toast from 'react-hot-toast';

export default function Barista() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'drinks' | 'packaged' | 'takeaway' | 'dine_in'
  const [expandedRecipes, setExpandedRecipes] = useState({}); // { [itemId]: boolean }
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('vi-VN'));

  const load = () => {
    api.get('/barista/queue')
      .then((r) => {
        setItems(r.data.data || []);
      })
      .catch((err) => {
        console.warn('Lỗi tải hàng đợi pha chế:', err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();

    const handleNewOrder = (data) => {
      playNotificationSound();
      toast.success(`🍹 Có món mới cần pha chế: #${data?.orderCode || ''}!`, { duration: 4000 });
      load();
    };

    // Lắng nghe Socket.IO tức thì
    socket.on('order:created', handleNewOrder);
    socket.on('barista:new_order', handleNewOrder);
    socket.on('barista:item_updated', load);
    socket.on('order:status_updated', load);
    socket.on('order:cancelled', load);

    // Đồng hồ thời gian thực và tự refresh 15s
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('vi-VN'));
    }, 1000);

    const refreshTimer = setInterval(load, 15000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(refreshTimer);
      socket.off('order:created', handleNewOrder);
      socket.off('barista:new_order', handleNewOrder);
      socket.off('barista:item_updated', load);
      socket.off('order:status_updated', load);
      socket.off('order:cancelled', load);
    };
  }, []);

  // Cập nhật trạng thái từng món
  const updateStatus = async (id, status) => {
    try {
      await api.put(`/barista/items/${id}/status`, { status });
      const statusLabel = status === 'preparing' ? 'Đang pha chế' : (status === 'done' ? 'Pha xong & Chờ trả' : 'Đã trả món');
      toast.success(`✅ Đã chuyển món sang: ${statusLabel}!`);
      load();
    } catch (err) {
      toast.error('Lỗi cập nhật: ' + (err.response?.data?.message || err.message));
    }
  };

  // Cập nhật hàng loạt tất cả món của đơn hàng
  const updateOrderAllItems = async (orderId, orderCode, status) => {
    try {
      await api.put(`/barista/orders/${orderId}/status`, { status });
      const statusLabel = status === 'preparing' ? 'Đang pha chế' : (status === 'done' ? 'Pha xong cả đơn' : 'Đã trả món');
      toast.success(`🎉 Đơn #${orderCode}: ${statusLabel}!`);
      load();
    } catch (err) {
      toast.error('Lỗi cập nhật đơn: ' + (err.response?.data?.message || err.message));
    }
  };

  const toggleRecipe = (id) => {
    setExpandedRecipes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Tính số phút đã trôi qua
  const getElapsedMinutes = (timestamp) => {
    if (!timestamp) return 0;
    const diff = Date.now() - new Date(timestamp).getTime();
    return Math.max(0, Math.floor(diff / 60000));
  };

  // Lọc danh sách món
  const filteredItems = items.filter((i) => {
    // Lọc theo kênh phục vụ hoặc chủng loại món
    if (channelFilter === 'takeaway') {
      if (i.table_code) return false;
    } else if (channelFilter === 'dine_in') {
      if (!i.table_code) return false;
    } else if (channelFilter === 'drinks') {
      if (i.is_packaged) return false;
    } else if (channelFilter === 'packaged') {
      if (!i.is_packaged) return false;
    }

    // Lọc theo từ khóa tìm kiếm
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (i.order_code || '').toLowerCase().includes(q) ||
      (i.product_name || '').toLowerCase().includes(q) ||
      (i.customer_name || '').toLowerCase().includes(q) ||
      (i.customer_phone || '').toLowerCase().includes(q) ||
      (i.table_code || '').toLowerCase().includes(q) ||
      (i.note || '').toLowerCase().includes(q)
    );
  });

  const pending = filteredItems.filter((i) => i.status === 'pending');
  const preparing = filteredItems.filter((i) => i.status === 'preparing');
  const done = filteredItems.filter((i) => i.status === 'done');

  // Thống kê nhanh
  const takeawayCount = items.filter(i => !i.table_code).length;
  const dineInCount = items.filter(i => !!i.table_code).length;
  const drinksCount = items.filter(i => !i.is_packaged).length;
  const packagedCount = items.filter(i => !!i.is_packaged).length;

  // Render thẻ món Barista với đầy đủ quy trình và định lượng
  const renderItem = (item, actions) => {
    const isExpanded = expandedRecipes[item.id] !== undefined ? expandedRecipes[item.id] : false;
    const isTakeaway = !item.table_code;
    const elapsedWait = getElapsedMinutes(item.sent_at);
    const elapsedPrep = getElapsedMinutes(item.started_at);
    const hasRecipe = item.recipe && item.recipe.length > 0;

    // Chuẩn hóa hiển thị Size: Đồ uống ghi rõ Size, đồ ăn vặt / bánh bỏ chữ size
    const rawSize = String(item.size_name || '').trim();
    const isLetterSize = ['S', 'M', 'L', 'XL'].includes(rawSize.toUpperCase());
    const isStandardSize = ['TIÊU CHUẨN', 'PHẦN', 'MẶC ĐỊNH', 'SIZE', ''].includes(rawSize.toUpperCase());

    let sizeDisplay = null;
    if (isLetterSize || rawSize.toUpperCase().startsWith('SIZE ')) {
      sizeDisplay = <span style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 800 }}>({rawSize.toUpperCase().startsWith('SIZE ') ? rawSize : `Size ${rawSize}`})</span>;
    } else if (!isStandardSize && rawSize) {
      sizeDisplay = <span style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 800 }}>({rawSize})</span>;
    }

    return (
      <div
        key={item.id}
        className="barista-item-card"
        style={{
          background: 'rgba(38, 22, 14, 0.95)',
          border: item.status === 'preparing'
            ? '1.5px solid #38bdf8'
            : item.status === 'done'
              ? '1.5px solid #10b981'
              : (elapsedWait >= 10 ? '1.5px solid #ef4444' : '1px solid rgba(245, 158, 11, 0.25)'),
          boxShadow: item.status === 'preparing'
            ? '0 4px 20px rgba(56, 189, 248, 0.25)'
            : '0 4px 16px rgba(0, 0, 0, 0.4)',
          position: 'relative',
        }}
      >
        {/* 1. TOP HEADER: KÊNH PHỤC VỤ & MÃ ĐƠN & GIỜ ĐẶT */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                background: isTakeaway ? 'rgba(217, 119, 6, 0.25)' : 'rgba(56, 189, 248, 0.25)',
                border: isTakeaway ? '1px solid #d97706' : '1px solid #0284c7',
                color: isTakeaway ? '#fbbf24' : '#38bdf8',
                letterSpacing: '0.5px'
              }}
            >
              {isTakeaway ? '🛍️ MANG VỀ (CỐC ĐÓNG SẴN)' : `🪑 BÀN ${item.table_code} (${item.area_name || 'Tại quán'})`}
            </span>

            <span style={{ fontSize: '0.72rem', color: '#c4a482', fontWeight: 600 }}>
              🕒 {item.opened_at ? item.opened_at.replace('T', ' ').slice(11, 16) : ''}
            </span>
          </div>

          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              color: '#fbbf24',
              background: 'rgba(245, 158, 11, 0.15)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            #{item.order_code}
          </span>
        </div>

        {/* 2. CẢNH BÁO ĐƠN HẸN GIỜ (NẾU CÓ) */}
        {item.pickup_time && (
          <div
            style={{
              background: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid #a855f7',
              borderRadius: '6px',
              padding: '4px 8px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.74rem'
            }}
          >
            <span style={{ color: '#e9d5ff', fontWeight: 700 }}>
              ⏰ HẸN NHẬN HÀNG:
            </span>
            <strong style={{ color: '#f5d0fe', fontSize: '0.85rem' }}>
              {item.pickup_time.replace('T', ' ').slice(11, 16)} ({item.pickup_time.slice(8, 10)}/{item.pickup_time.slice(5, 7)})
            </strong>
          </div>
        )}

        {/* 3. THÔNG TIN KHÁCH HÀNG */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', color: '#d4b094', marginBottom: '8px', borderBottom: '1px dashed rgba(245, 158, 11, 0.15)', paddingBottom: '6px' }}>
          <div>
            👤 <strong>{item.customer_name || 'Khách vãng lai'}</strong>
          </div>
          {item.customer_phone && (
            <div style={{ color: '#fef3c7' }}>
              📞 {item.customer_phone}
            </div>
          )}
        </div>

        {/* 4. TÊN MÓN, SIZE & SỐ LƯỢNG */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', margin: '4px 0 8px' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fef3c7', lineHeight: 1.3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span>{item.product_name}</span>
              {sizeDisplay}
              {item.is_packaged && (
                <span style={{ fontSize: '0.68rem', background: 'rgba(234, 179, 8, 0.2)', color: '#fde047', border: '1px solid #eab308', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                  📦 Đóng gói lấy liền
                </span>
              )}
            </div>
          </div>
          <span
            style={{
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: '0.95rem',
              padding: '2px 10px',
              borderRadius: '12px',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
            }}
          >
            ×{item.quantity}
          </span>
        </div>

        {/* 5. TOPPING NẾU CÓ */}
        {item.toppings && (
          <div style={{ fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)', padding: '3px 8px', borderRadius: '4px', marginBottom: '6px' }}>
            🧋 <strong>Topping:</strong> {item.toppings}
          </div>
        )}

        {/* 6. GHI CHÚ PHA CHẾ ĐẶC BIỆT */}
        {item.note && (
          <div
            style={{
              fontSize: '0.8rem',
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px dashed rgba(239, 68, 68, 0.4)',
              padding: '6px 10px',
              borderRadius: '6px',
              marginBottom: '8px',
              fontWeight: 600,
            }}
          >
            📝 <strong>Ghi chú:</strong> {item.note}
          </div>
        )}

        {/* 7. QUY TRÌNH TIẾN TRÌNH PHA CHẾ (WORKFLOW STEPPER) */}
        <div style={{ background: 'rgba(20, 10, 5, 0.65)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '8px', padding: '8px 10px', margin: '8px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.7rem', color: '#c4a482', fontWeight: 700, textTransform: 'uppercase' }}>
            <span>Quy Trình Xử Lý</span>
            {item.status === 'pending' && (
              <span style={{ color: elapsedWait >= 10 ? '#ef4444' : '#fbbf24', fontWeight: 800 }}>
                ⏳ Đã chờ: {elapsedWait} phút {elapsedWait >= 10 && '⚠️ (Ưu tiên)'}
              </span>
            )}
            {item.status === 'preparing' && (
              <span style={{ color: '#38bdf8', fontWeight: 800 }}>
                ☕ Đang pha: {elapsedPrep} phút
              </span>
            )}
            {item.status === 'done' && (
              <span style={{ color: '#34d399', fontWeight: 800 }}>
                ✅ Đã pha xong - Chờ trả món
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', textAlign: 'center', fontSize: '0.68rem' }}>
            <div
              style={{
                background: item.status === 'pending' ? 'rgba(245, 158, 11, 0.35)' : (['preparing', 'done', 'served'].includes(item.status) ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.05)'),
                color: item.status === 'pending' ? '#fbbf24' : (['preparing', 'done', 'served'].includes(item.status) ? '#34d399' : '#8c7662'),
                border: item.status === 'pending' ? '1px solid #f59e0b' : (['preparing', 'done', 'served'].includes(item.status) ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent'),
                padding: '4px 2px',
                borderRadius: '4px',
                fontWeight: 700
              }}
            >
              1. Chờ pha
            </div>
            <div
              style={{
                background: item.status === 'preparing' ? 'rgba(56, 189, 248, 0.35)' : (['done', 'served'].includes(item.status) ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.05)'),
                color: item.status === 'preparing' ? '#38bdf8' : (['done', 'served'].includes(item.status) ? '#34d399' : '#8c7662'),
                border: item.status === 'preparing' ? '1px solid #38bdf8' : (['done', 'served'].includes(item.status) ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent'),
                padding: '4px 2px',
                borderRadius: '4px',
                fontWeight: 700
              }}
            >
              2. Đang pha
            </div>
            <div
              style={{
                background: ['done', 'served'].includes(item.status) ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255,255,255,0.05)',
                color: ['done', 'served'].includes(item.status) ? '#34d399' : '#8c7662',
                border: ['done', 'served'].includes(item.status) ? '1px solid #10b981' : '1px solid transparent',
                padding: '4px 2px',
                borderRadius: '4px',
                fontWeight: 700
              }}
            >
              3. Trả món
            </div>
          </div>

          {/* Các bước thao tác chuẩn hóa (Workflow steps) */}
          {Array.isArray(item.workflow_steps) && item.workflow_steps.length > 0 && (
            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(245, 158, 11, 0.15)', fontSize: '0.72rem', color: '#e5d5c5' }}>
              <div style={{ fontWeight: 800, color: '#fbbf24', marginBottom: '3px' }}>📋 Thao tác chuẩn:</div>
              {item.workflow_steps.map((st, sIdx) => (
                <div key={sIdx} style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '2px' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: '0.68rem' }}>{sIdx + 1}.</span>
                  <span style={{ color: '#d4b094' }}>{st}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 8. CÔNG THỨC & ĐỊNH LƯỢNG PHA CHẾ CHUẨN BARISTA */}
        <div style={{ marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => toggleRecipe(item.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: isExpanded ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px dashed rgba(245, 158, 11, 0.3)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '0.76rem',
              color: '#fde68a',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            <span>📖 Công thức &amp; Định lượng {hasRecipe ? `(${item.recipe.length} nguyên liệu)` : ''}</span>
            <span>{isExpanded ? '▲ Thu gọn' : '▼ Xem chi tiết'}</span>
          </button>

          {isExpanded && (
            <div style={{ marginTop: '6px', background: 'rgba(18, 9, 4, 0.9)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.74rem' }}>
              {hasRecipe ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>
                    Tỷ lệ nguyên liệu chuẩn {sizeDisplay || ''}:
                  </div>
                  {item.recipe.map((r, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#e5d5c5', borderBottom: idx < item.recipe.length - 1 ? '1px dotted rgba(255,255,255,0.08)' : 'none', padding: '2px 0' }}>
                      <span>• {r.ingredient}</span>
                      <strong style={{ color: '#fbbf24' }}>{r.display}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 9. THAO TÁC HÀNH ĐỘNG THEO TIẾN TRÌNH */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          {/* Nút giao ngay cho đồ đóng gói lấy liền (không cần qua pha chế) */}
          {item.is_packaged && item.status !== 'done' && item.status !== 'served' && (
            <button
              type="button"
              className="btn btn-sm"
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                fontWeight: 800,
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                fontSize: '0.82rem',
              }}
              title="Đồ ăn đóng gói có sẵn - Bàn giao cho khách ngay"
              onClick={() => updateStatus(item.id, 'served')}
            >
              ⚡ Giao ngay
            </button>
          )}

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
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onClick={() => updateStatus(item.id, a.status)}
            >
              {a.label}
            </button>
          ))}

          {/* Nút thao tác nhanh cả đơn nếu đơn có nhiều món */}
          {actions.length > 0 && (
            <button
              type="button"
              title={`Cập nhật tất cả món của đơn #${item.order_code}`}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fef3c7',
                borderRadius: '8px',
                padding: '0 10px',
                fontSize: '0.72rem',
                cursor: 'pointer',
                fontWeight: 700,
              }}
              onClick={() => updateOrderAllItems(item.order_id, item.order_code, actions[0].status)}
            >
              ⚡ Cả đơn
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TOP HEADER & METRICS */}
      <div
        style={{
          background: 'rgba(32, 20, 13, 0.85)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2rem' }}>🍹</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: '#fef3c7', letterSpacing: '0.5px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
              MÀN HÌNH PHA CHẾ (KDS)
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '0.78rem', color: '#c4a482' }}>
              <span>Đồng bộ thời gian thực theo từng đơn và công thức</span>
              <span>•</span>
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>⏰ Hiện tại: {currentTime}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(20, 10, 5, 0.7)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#34d399' }}>Trực tuyến (Socket.IO)</span>
          </div>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { playNotificationSound(); toast.success('🔔 Âm báo chuông sẵn sàng!'); }}
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fbbf24',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            🔔 Thử chuông
          </button>
        </div>
      </div>

      {/* 2. FILTER & SEARCH BAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          background: 'rgba(32, 20, 13, 0.65)',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(245, 158, 11, 0.18)'
        }}
      >
        {/* Filter channels & Categories */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${channelFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: '6px',
              background: channelFilter === 'all' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
              borderColor: 'rgba(245, 158, 11, 0.3)',
              color: channelFilter === 'all' ? '#fff' : '#fef3c7'
            }}
            onClick={() => setChannelFilter('all')}
          >
            📋 Tất cả ({items.length})
          </button>

          <button
            type="button"
            className={`btn btn-sm ${channelFilter === 'drinks' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: '6px',
              background: channelFilter === 'drinks' ? 'linear-gradient(135deg, #b45309, #78350f)' : 'transparent',
              borderColor: 'rgba(245, 158, 11, 0.3)',
              color: channelFilter === 'drinks' ? '#fff' : '#fbbf24'
            }}
            onClick={() => setChannelFilter('drinks')}
          >
            ☕ Đồ uống cần pha ({drinksCount})
          </button>

          <button
            type="button"
            className={`btn btn-sm ${channelFilter === 'packaged' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: '6px',
              background: channelFilter === 'packaged' ? 'linear-gradient(135deg, #ca8a04, #a16207)' : 'transparent',
              borderColor: 'rgba(234, 179, 8, 0.3)',
              color: channelFilter === 'packaged' ? '#fff' : '#fde047'
            }}
            onClick={() => setChannelFilter('packaged')}
          >
            📦 Đồ đóng gói ({packagedCount})
          </button>

          <button
            type="button"
            className={`btn btn-sm ${channelFilter === 'takeaway' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: '6px',
              background: channelFilter === 'takeaway' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
              borderColor: 'rgba(245, 158, 11, 0.3)',
              color: channelFilter === 'takeaway' ? '#fff' : '#fbbf24'
            }}
            onClick={() => setChannelFilter('takeaway')}
          >
            🛍️ Đơn mang về ({takeawayCount})
          </button>

          <button
            type="button"
            className={`btn btn-sm ${channelFilter === 'dine_in' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: '6px',
              background: channelFilter === 'dine_in' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'transparent',
              borderColor: 'rgba(56, 189, 248, 0.3)',
              color: channelFilter === 'dine_in' ? '#fff' : '#38bdf8'
            }}
            onClick={() => setChannelFilter('dine_in')}
          >
            🪑 Đơn tại bàn ({dineInCount})
          </button>
        </div>

        {/* Search & Manual Refresh Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => {
              load();
              toast.success('🔄 Đã làm mới hàng đợi pha chế!');
            }}
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '6px 12px',
              borderRadius: '8px',
              borderColor: 'rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              background: 'rgba(245, 158, 11, 0.1)',
              cursor: 'pointer'
            }}
            title="Tải lại dữ liệu thời gian thực"
          >
            🔄 Làm mới
          </button>

          <input
            type="text"
            className="form-input"
            placeholder="🔍 Tìm mã đơn, tên món, khách hàng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '240px',
              padding: '6px 10px',
              fontSize: '0.8rem',
              background: 'rgba(20, 10, 5, 0.8)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fff',
              borderRadius: '8px'
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. 3 KANBAN COLUMNS (TIẾN TRÌNH PHA CHẾ) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px', minHeight: 'calc(100vh - 250px)' }}>
        {/* Column 1: Pending */}
        <div className="barista-col" style={{ borderTop: '4px solid #f59e0b', background: 'rgba(32, 20, 13, 0.55)', borderRadius: '12px' }}>
          <div className="barista-col-header" style={{ padding: '12px 14px', borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>
              <span>⏳</span>
              <span>1. CHỜ PHA CHẾ</span>
            </div>
            <span
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '20px',
                padding: '3px 10px',
                fontSize: '0.82rem',
                fontWeight: 900,
              }}
            >
              {pending.length} món
            </span>
          </div>

          <div className="barista-items" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pending.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>☕</div>
                <div style={{ color: '#c4a482', fontSize: '0.88rem' }}>Không có món nào đang chờ pha chế</div>
              </div>
            ) : (
              pending.map((i) =>
                renderItem(i, [
                  { label: '▶️ Bắt đầu pha chế (Bước 2)', status: 'preparing', bg: 'linear-gradient(135deg, #d97706, #b45309)' },
                ])
              )
            )}
          </div>
        </div>

        {/* Column 2: Preparing */}
        <div className="barista-col" style={{ borderTop: '4px solid #38bdf8', background: 'rgba(32, 20, 13, 0.55)', borderRadius: '12px' }}>
          <div className="barista-col-header" style={{ padding: '12px 14px', borderBottom: '1px solid rgba(56, 189, 248, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 800, fontSize: '0.95rem' }}>
              <span>🔄</span>
              <span>2. ĐANG PHA CHẾ</span>
            </div>
            <span
              style={{
                background: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '20px',
                padding: '3px 10px',
                fontSize: '0.82rem',
                fontWeight: 900,
              }}
            >
              {preparing.length} món
            </span>
          </div>

          <div className="barista-items" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {preparing.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🍹</div>
                <div style={{ color: '#c4a482', fontSize: '0.88rem' }}>Không có món nào đang pha chế</div>
              </div>
            ) : (
              preparing.map((i) =>
                renderItem(i, [
                  { label: '🔔 Pha xong & Báo chuông (Bước 3)', status: 'done', bg: 'linear-gradient(135deg, #10b981, #059669)' },
                ])
              )
            )}
          </div>
        </div>

        {/* Column 3: Done */}
        <div className="barista-col" style={{ borderTop: '4px solid #10b981', background: 'rgba(32, 20, 13, 0.55)', borderRadius: '12px' }}>
          <div className="barista-col-header" style={{ padding: '12px 14px', borderBottom: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 800, fontSize: '0.95rem' }}>
              <span>✅</span>
              <span>3. PHA XONG &amp; TRẢ MÓN</span>
            </div>
            <span
              style={{
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '20px',
                padding: '3px 10px',
                fontSize: '0.82rem',
                fontWeight: 900,
              }}
            >
              {done.length} món
            </span>
          </div>

          <div className="barista-items" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {done.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎉</div>
                <div style={{ color: '#c4a482', fontSize: '0.88rem' }}>Chưa có món nào hoàn tất cần trả</div>
              </div>
            ) : (
              done.map((i) =>
                renderItem(i, [
                  { label: '🛎️ Đã trả món cho khách (Hoàn tất)', status: 'served', bg: 'linear-gradient(135deg, #7c3aed, #6d28d9)' },
                ])
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
