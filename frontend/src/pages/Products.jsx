import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

export default function Products() {
  const [data, setData] = useState({ categories: [], products: [], toppings: [] });
  const [selCategory, setSelCategory] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ category_id: '', name: '', description: '', sizes: [{ name: 'M', price: '', is_default: true }] });

  const load = () => api.get('/products').then(r => setData(r.data.data));
  useEffect(() => { load(); }, []);

  const filtered = data.products.filter(p => selCategory === 'all' || String(p.category_id) === selCategory);

  const toggleAvailable = async (p) => {
    await api.put(`/products/${p.id}`, { ...p, is_available: p.is_available ? 0 : 1 });
    load();
    toast.success(p.is_available ? 'Đã ẩn món' : 'Đã bật lại món');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/products', form);
      toast.success('Đã thêm món mới! ☕');
      setShowModal(false);
      setForm({ category_id: '', name: '', description: '', sizes: [{ name: 'M', price: '', is_default: true }] });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi tạo món');
    }
  };

  const addSize = () => setForm(f => ({ ...f, sizes: [...f.sizes, { name: '', price: '', is_default: false }] }));
  const updateSize = (i, field, val) => setForm(f => ({
    ...f, sizes: f.sizes.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
  }));

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>🍵 Thực đơn</h1>
          <p className="text-muted text-sm">{data.products.length} món · {data.categories.length} nhóm</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Thêm món mới</button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-5" style={{ flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${selCategory === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSelCategory('all')}>
          Tất cả ({data.products.length})
        </button>
        {data.categories.map(c => (
          <button key={c.id} className={`btn btn-sm ${selCategory === String(c.id) ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSelCategory(String(c.id))}>
            {c.name} ({data.products.filter(p => p.category_id === c.id).length})
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
        {filtered.map(p => (
          <div key={p.id} className={`product-card ${!p.is_available ? 'unavailable' : ''}`}>
            {!p.is_available && <div className="product-unavailable-label">HẾT</div>}
            <div className="product-img-placeholder">☕</div>
            <div className="product-info">
              <div className="product-name">{p.name}</div>
              <div className="product-price">
                {p.sizes.length > 0 ? fmt(Math.min(...p.sizes.map(s => s.price))) : 'Liên hệ'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {p.sizes.length} size · {p.category_name}
              </div>
              <button
                className={`btn btn-sm ${p.is_available ? 'btn-ghost' : 'btn-success'}`}
                style={{ width: '100%', marginTop: '8px' }}
                onClick={() => toggleAvailable(p)}
              >
                {p.is_available ? '🔴 Đánh dấu hết' : '✅ Mở lại'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">➕ Thêm món mới</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="input-group">
                  <label className="input-label">Nhóm món *</label>
                  <select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} required>
                    <option value="">-- Chọn nhóm --</option>
                    {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Tên món *</label>
                  <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Vd: Cà phê đen" required />
                </div>
                <div className="input-group">
                  <label className="input-label">Mô tả</label>
                  <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mô tả ngắn" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="input-label">Size & Giá *</label>
                    <button type="button" className="btn btn-outline btn-sm" onClick={addSize}>+ Thêm size</button>
                  </div>
                  {form.sizes.map((s, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input className="input" placeholder="Size (S/M/L)" value={s.name} style={{ width: '80px' }} onChange={e => updateSize(i, 'name', e.target.value)} />
                      <input className="input" placeholder="Giá (VNĐ)" type="number" value={s.price} style={{ flex: 1 }} onChange={e => updateSize(i, 'price', e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">✅ Tạo món</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
