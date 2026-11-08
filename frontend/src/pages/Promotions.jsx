import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

export default function Promotions() {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    type: 'percent_order',
    value: 10,
    min_order_value: 50000,
    max_discount: 30000,
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/promotions');
      setPromotions(res.data.data || []);
    } catch {
      toast.error('Lỗi tải danh sách khuyến mãi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (p) => {
    try {
      const res = await api.put(`/promotions/${p.id}/toggle`);
      toast.success(res.data.message);
      load();
    } catch {
      toast.error('Lỗi thay đổi trạng thái');
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Bạn có chắc muốn xóa khuyến mãi "${p.name}"?`)) return;
    try {
      const res = await api.delete(`/promotions/${p.id}`);
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi xóa khuyến mãi');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/promotions', form);
      toast.success('Tạo chương trình khuyến mãi thành công! 🎁');
      setShowModal(false);
      setForm({
        name: '',
        code: '',
        type: 'percent_order',
        value: 10,
        min_order_value: 50000,
        max_discount: 30000,
        description: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const copyCode = (code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    toast.success(`Đã sao chép mã: ${code}`);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.8rem' }}>🎁</span>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
            KHUYẾN MÃI &amp; VOUCHER GIẢM GIÁ
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="btn"
          style={{
            background: 'linear-gradient(135deg, #d97706, #b45309)',
            color: '#ffffff',
            fontWeight: 800,
            padding: '10px 20px',
            borderRadius: '8px',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>+</span>
          <span>TẠO KHUYẾN MÃI MỚI</span>
        </button>
      </div>

      {/* 2. PROMOTION CARDS GRID */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
          <div style={{ color: '#c4a482', marginTop: '12px', fontSize: '0.85rem' }}>Đang tải danh sách khuyến mãi...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
          {promotions.map((p) => {
            const isPercent = p.type === 'percent_order' || p.type === 'happy_hour';
            return (
              <div
                key={p.id}
                className="mockup-panel"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '20px',
                  border: p.is_active ? '1px solid rgba(245, 158, 11, 0.28)' : '1px dashed rgba(255, 255, 255, 0.2)',
                  opacity: p.is_active ? 1 : 0.65,
                  boxShadow: p.is_active ? '0 8px 24px rgba(0, 0, 0, 0.45)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span
                      style={{
                        background: 'rgba(217, 119, 6, 0.2)',
                        color: '#fbbf24',
                        border: '1px solid rgba(217, 119, 6, 0.35)',
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '0.74rem',
                      }}
                    >
                      {p.type === 'percent_order' ? '🏷️ Giảm % đơn' : p.type === 'happy_hour' ? '⚡ Happy Hour' : '💵 Giảm tiền mặt'}
                    </span>
                    <span
                      style={{
                        background: p.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: p.is_active ? '#34d399' : '#f87171',
                        border: p.is_active ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '0.74rem',
                      }}
                    >
                      {p.is_active ? '● Đang chạy' : '○ Tạm dừng'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px', color: '#fef3c7' }}>
                    {p.name}
                  </h3>

                  {p.code ? (
                    <div style={{ marginBottom: '12px' }}>
                      <span
                        onClick={() => copyCode(p.code)}
                        title="Click để sao chép mã"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          border: '1.5px dashed #f59e0b',
                          borderRadius: '8px',
                          padding: '4px 12px',
                          fontWeight: 800,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          letterSpacing: '0.5px',
                        }}
                      >
                        🏷️ MÃ: <strong>{p.code}</strong> 📋
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#c4a482', marginBottom: '10px' }}>
                      (Áp dụng tự động, không cần nhập mã)
                    </div>
                  )}

                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fbbf24', marginBottom: '8px', letterSpacing: '0.5px' }}>
                    {isPercent ? `-${p.value}%` : `-${fmt(p.value)}`}
                  </div>

                  {p.description && (
                    <div style={{ fontSize: '0.84rem', color: '#d5bba2', marginBottom: '10px', fontStyle: 'italic', lineHeight: 1.4 }}>
                      {p.description}
                    </div>
                  )}

                  <div style={{ fontSize: '0.8rem', color: '#c4a482', display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '8px' }}>
                    {Number(p.min_order_value || 0) > 0 && (
                      <div>Đơn tối thiểu: <strong style={{ color: '#fef3c7' }}>{fmt(p.min_order_value)}</strong></div>
                    )}
                    {isPercent && Number(p.max_discount || 0) > 0 && (
                      <div>Giảm tối đa: <strong style={{ color: '#fef3c7' }}>{fmt(p.max_discount)}</strong></div>
                    )}
                    <div>
                      📅 {p.start_date ? new Date(p.start_date).toLocaleDateString('vi-VN') : 'Vô thời hạn'} – {p.end_date ? new Date(p.end_date).toLocaleDateString('vi-VN') : 'Vô thời hạn'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(245, 158, 11, 0.16)', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      flex: 1,
                      background: p.is_active ? 'rgba(255, 255, 255, 0.08)' : 'linear-gradient(135deg, #10b981, #059669)',
                      color: p.is_active ? '#fbbf24' : '#ffffff',
                      border: p.is_active ? '1px solid rgba(245, 158, 11, 0.3)' : 'none',
                      borderRadius: '6px',
                      padding: '8px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleToggle(p)}
                  >
                    {p.is_active ? '⏸️ Tạm dừng' : '▶️ Bật lại'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      background: 'rgba(239, 68, 68, 0.12)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleDelete(p)}
                    title="Xóa khuyến mãi"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. MODAL TẠO KHUYẾN MÃI MỚI */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 className="modal-title">🎁 Tạo khuyến mãi / Voucher mới</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>Tên chương trình khuyến mãi *</label>
                  <input
                    className="form-input"
                    placeholder="VD: Chào Bạn Mới, Giảm Giá Cà Phê..."
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>Mã Voucher (Nhập ở POS)</label>
                    <input
                      className="form-input"
                      placeholder="VD: BANMOI, COFFEE10..."
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      style={{ textTransform: 'uppercase', fontWeight: 800, width: '100%', padding: '8px 12px', letterSpacing: '0.5px' }}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>Loại ưu đãi</label>
                    <select
                      className="form-select"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px' }}
                    >
                      <option value="percent_order">Giảm % tổng đơn</option>
                      <option value="amount_order">Giảm số tiền cố định (đ)</option>
                      <option value="happy_hour">Happy Hour (Giờ vàng)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>
                      Mức giảm ({form.type === 'amount_order' ? 'VNĐ' : '%'}) *
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: Number(e.target.value) || 0 })}
                      required
                      style={{ width: '100%', padding: '8px 10px' }}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>Đơn tối thiểu (đ)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={form.min_order_value}
                      onChange={(e) => setForm({ ...form, min_order_value: Number(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '8px 10px' }}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>Giảm tối đa (đ)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Không giới hạn"
                      value={form.max_discount || ''}
                      onChange={(e) => setForm({ ...form, max_discount: e.target.value ? Number(e.target.value) : null })}
                      disabled={form.type === 'amount_order'}
                      style={{ width: '100%', padding: '8px 10px' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>Mô tả hiển thị</label>
                  <input
                    className="form-input"
                    placeholder="VD: Giảm 10% tối đa 30k cho đơn từ 50k"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>Từ ngày</label>
                    <input
                      type="date"
                      className="form-input"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px 12px' }}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>Đến ngày</label>
                    <input
                      type="date"
                      className="form-input"
                      value={form.end_date}
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px 12px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#c4a482',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 700,
                  }}
                  onClick={() => setShowModal(false)}
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    background: 'linear-gradient(135deg, #d97706, #b45309)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontWeight: 800,
                  }}
                >
                  LƯU CHƯƠNG TRÌNH
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
