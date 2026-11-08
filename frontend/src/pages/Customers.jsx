import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ phone: '', name: '', birthday: '', tier_id: 1 });

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      setCustomers(res.data.data.customers || []);
      setTiers(res.data.data.tiers || []);
    } catch {
      toast.error('Lỗi tải danh sách khách hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const openCreate = () => {
    setEditId(null);
    setForm({ phone: '', name: '', birthday: '', tier_id: 1 });
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditId(c.id);
    setForm({
      phone: c.phone,
      name: c.name || '',
      birthday: c.birthday ? c.birthday.split('T')[0] : '',
      tier_id: c.tier_id || 1,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/customers/${editId}`, form);
        toast.success('Cập nhật khách hàng thành công!');
      } else {
        await api.post('/customers', form);
        toast.success('Thêm khách hàng mới thành công!');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const getTierBadge = (tierName) => {
    switch (tierName) {
      case 'Kim Cương':
        return (
          <span
            style={{
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            💎 {tierName}
          </span>
        );
      case 'Vàng':
        return (
          <span
            style={{
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            👑 {tierName}
          </span>
        );
      case 'Bạc':
        return (
          <span
            style={{
              background: 'rgba(148, 163, 184, 0.2)',
              color: '#cbd5e1',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            🥈 {tierName}
          </span>
        );
      default:
        return (
          <span
            style={{
              background: 'rgba(217, 119, 6, 0.2)',
              color: '#f59e0b',
              border: '1px solid rgba(217, 119, 6, 0.35)',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            🥉 {tierName || 'Đồng'}
          </span>
        );
    }
  };

  const getTierIcon = (name) => {
    if (name === 'Kim Cương') return '💎';
    if (name === 'Vàng') return '👑';
    if (name === 'Bạc') return '🥈';
    return '🥉';
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.8rem' }}>👤</span>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
            KHÁCH HÀNG &amp; THÀNH VIÊN
          </h1>
        </div>

        <button
          type="button"
          onClick={openCreate}
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
          <span>THÊM KHÁCH HÀNG MỚI</span>
        </button>
      </div>

      {/* 2. TIER EXPLANATION CARDS (4 HẠNG THÀNH VIÊN) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {tiers.map((t) => (
          <div
            key={t.id}
            className="mockup-panel"
            style={{
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
              border: '1px solid rgba(245, 158, 11, 0.22)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>{getTierIcon(t.name)}</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fef3c7' }}>{t.name}</span>
              </div>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '12px',
                }}
              >
                Giảm {t.discount_pct}%
              </span>
            </div>

            <div style={{ fontSize: '0.82rem', color: '#c4a482', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>
                Chi tiêu từ: <strong style={{ color: '#fef3c7' }}>{fmt(t.min_spent)}</strong>
              </div>
              <div>
                Tích lũy: <strong style={{ color: '#fbbf24' }}>{t.points_per_10k} điểm</strong> / 10.000đ
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. CUSTOMER DATA TABLE PANEL */}
      <div className="mockup-panel">
        <div className="mockup-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div className="mockup-panel-title">
            <span>📋</span>
            <span>DANH SÁCH KHÁCH HÀNG &amp; SỔ TÍCH ĐIỂM</span>
          </div>

          <div style={{ width: '320px', maxWidth: '100%' }}>
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Tìm theo số điện thoại hoặc họ tên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 12px', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <div style={{ color: '#c4a482', marginTop: '12px', fontSize: '0.85rem' }}>Đang tải danh sách khách hàng...</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
            <table className="mockup-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>STT</th>
                  <th style={{ width: '150px' }}>Số điện thoại</th>
                  <th>Họ và tên</th>
                  <th style={{ width: '140px' }}>Hạng hội viên</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Điểm tích lũy</th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Tổng chi tiêu</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#c4a482' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔍</div>
                      Không tìm thấy khách hàng nào khớp với tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  customers.map((c, idx) => (
                    <tr key={c.id}>
                      <td style={{ color: '#c4a482', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ fontWeight: 800, color: '#fbbf24', letterSpacing: '0.5px' }}>
                        📞 {c.phone}
                      </td>
                      <td style={{ fontWeight: 700, color: '#fef3c7' }}>
                        {c.name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Khách vãng lai</span>}
                      </td>
                      <td>{getTierBadge(c.tier_name)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#fbbf24' }}>
                        ⭐ {c.points_balance || 0} pts
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#34d399' }}>
                        {fmt(c.total_spent)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          onClick={() => openEdit(c)}
                        >
                          ✏️ Sửa
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 18px', background: 'rgba(32, 20, 13, 0.75)', borderTop: '1px solid rgba(245, 158, 11, 0.18)', fontSize: '0.82rem', color: '#c4a482', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Hiển thị <strong>{customers.length}</strong> khách hàng trong hệ thống</span>
          <span>Tự động cập nhật hạng theo tổng chi tiêu POS</span>
        </div>
      </div>

      {/* 4. MODAL THÊM / CẬP NHẬT KHÁCH HÀNG */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editId ? '✏️ Cập nhật khách hàng' : '👥 Thêm khách hàng mới'}
              </h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>📞 Số điện thoại *</label>
                  <input
                    className="form-input"
                    placeholder="VD: 0901234567"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>👤 Họ và tên</label>
                  <input
                    className="form-input"
                    placeholder="VD: Nguyễn Văn A"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>🎂 Ngày sinh</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.birthday}
                    onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>👑 Hạng thành viên</label>
                  <select
                    className="form-select"
                    value={form.tier_id}
                    onChange={(e) => setForm({ ...form, tier_id: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px' }}
                  >
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (Giảm {t.discount_pct}% • Tích {t.points_per_10k} pts/10k)
                      </option>
                    ))}
                  </select>
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
                  {editId ? 'LƯU THAY ĐỔI' : 'TẠO MỚI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
