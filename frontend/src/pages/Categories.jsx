import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', sort_order: 0 });

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/categories');
      setCategories(res.data.data);
    } catch {
      toast.error('Lỗi tải danh mục món');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', description: '', sort_order: categories.length + 1 });
    setShowModal(true);
  };

  const openEdit = (cat) => {
    setEditId(cat.id);
    setForm({ name: cat.name, description: cat.description || '', sort_order: cat.sort_order || 0 });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/categories/${editId}`, form);
        toast.success('Cập nhật nhóm món thành công!');
      } else {
        await api.post('/categories', form);
        toast.success('Thêm nhóm món mới thành công!');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc muốn xóa nhóm "${name}" không?`)) return;
    try {
      await api.delete(`/categories/${id}`);
      toast.success('Đã xóa nhóm món');
      load();
    } catch {
      toast.error('Không thể xóa nhóm món');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>📂 Nhóm món & Danh mục</h1>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Thêm nhóm món</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Thứ tự</th>
                  <th>Tên nhóm</th>
                  <th>Mô tả</th>
                  <th style={{ textAlign: 'center' }}>Số lượng món</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px' }} className="text-muted">
                      Chưa có nhóm món nào. Hãy tạo nhóm đầu tiên!
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id}>
                      <td>
                        <span className="badge badge-coffee" style={{ fontWeight: 700 }}>
                          #{cat.sort_order}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                          ☕ {cat.name}
                        </div>
                      </td>
                      <td className="text-muted">{cat.description || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-info">
                          {cat.product_count || 0} món
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-sm btn-outline"
                          style={{ marginRight: '8px' }}
                          onClick={() => openEdit(cat)}
                        >
                          ✏️ Sửa
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}
                          onClick={() => handleDelete(cat.id, cat.name)}
                        >
                          🗑️ Xóa
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editId ? '✏️ Sửa nhóm món' : '📂 Thêm nhóm món mới'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group mb-4">
                  <label className="form-label">Tên nhóm món *</label>
                  <input
                    className="form-input"
                    placeholder="VD: Cà phê, Trà sữa, Bánh ngọt..."
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group mb-4">
                  <label className="form-label">Thứ tự hiển thị</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mô tả nhóm món</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Ghi chú về nhóm món này..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  {editId ? 'Lưu thay đổi' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
