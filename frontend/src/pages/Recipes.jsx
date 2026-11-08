import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [search, setSearch] = useState('');

  // Form
  const [form, setForm] = useState({
    product_size_id: '',
    ingredient_id: '',
    quantity: 0.02,
    unit: 'kg',
  });

  const loadData = async () => {
    try {
      const res = await api.get('/recipes');
      const rList = res.data.data.recipes || [];
      const pList = res.data.data.products || [];
      const iList = res.data.data.ingredients || [];
      setRecipes(rList);
      setProducts(pList);
      setIngredients(iList);

      if (rList.length > 0 && !selectedRecipe) {
        selectRow(rList[0]);
      } else if (pList.length > 0 && iList.length > 0) {
        setForm({
          product_size_id: pList[0].size_id,
          ingredient_id: iList[0].id,
          quantity: 0.02,
          unit: iList[0].unit,
        });
      }
    } catch {
      toast.error('Lỗi tải danh sách công thức');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectRow = (r) => {
    setSelectedRecipe(r);
    setForm({
      product_size_id: r.product_size_id,
      ingredient_id: r.ingredient_id,
      quantity: r.quantity,
      unit: r.ingredient_unit || 'kg',
    });
  };

  const handleIngredientChange = (ingId) => {
    const ing = ingredients.find((i) => i.id === parseInt(ingId));
    setForm((f) => ({
      ...f,
      ingredient_id: ingId,
      unit: ing?.unit || 'kg',
    }));
  };

  const handleSave = async () => {
    if (!form.product_size_id || !form.ingredient_id || !form.quantity) {
      return toast.error('Vui lòng chọn món, nguyên liệu và số lượng!');
    }
    try {
      await api.post('/recipes', {
        product_size_id: parseInt(form.product_size_id),
        ingredient_id: parseInt(form.ingredient_id),
        quantity: parseFloat(form.quantity),
      });
      toast.success('Lưu công thức định lượng thành công! ☕');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleDelete = async () => {
    if (!selectedRecipe) return toast.error('Vui lòng chọn công thức cần xóa!');
    if (!window.confirm('Bạn có chắc muốn xóa công thức này?')) return;
    try {
      await api.delete(`/recipes/${selectedRecipe.id}`);
      toast.success('Đã xóa công thức!');
      setSelectedRecipe(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa công thức');
    }
  };

  const filteredRecipes = recipes.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.product_name.toLowerCase().includes(q) ||
      r.ingredient_name.toLowerCase().includes(q) ||
      (r.product_code || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate-fade-in mockup-split-grid">
      {/* LEFT: DANH SÁCH CÔNG THỨC (matching image8.png) */}
      <div className="mockup-panel">
        <div className="mockup-panel-header">
          <div className="mockup-panel-title">
            <span>☕</span>
            <span>DANH SÁCH CÔNG THỨC</span>
          </div>
          <div style={{ width: '240px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Tìm kiếm công thức..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
          <table className="mockup-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>ID</th>
                <th>Tên món</th>
                <th>Tên nguyên liệu</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Số lượng</th>
                <th style={{ width: '100px' }}>Đơn vị tính</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipes.map((r) => {
                const isSelected = selectedRecipe?.id === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => selectRow(r)}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 700 }}>{r.product_code || `M00${r.product_id}`}</td>
                    <td style={{ fontWeight: 600 }}>{r.product_name} ({r.size_name})</td>
                    <td>{r.ingredient_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.quantity}</td>
                    <td>{r.ingredient_unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 18px', background: 'rgba(32, 20, 13, 0.75)', borderTop: '1px solid rgba(245, 158, 11, 0.18)', fontSize: '0.82rem', color: '#c4a482' }}>
          Tổng số: {filteredRecipes.length} công thức định lượng
        </div>
      </div>

      {/* RIGHT: THÔNG TIN CÔNG THỨC (matching image8.png) */}
      <div className="mockup-panel">
        <div className="mockup-panel-header">
          <div className="mockup-panel-title">
            <span>📝</span>
            <span>THÔNG TIN CÔNG THỨC</span>
          </div>
        </div>

        <div className="mockup-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.85rem' }}>☕ Tên món :</label>
            <select
              className="form-select"
              value={form.product_size_id}
              onChange={(e) => setForm({ ...form, product_size_id: e.target.value })}
            >
              <option value="">-- Chọn món nước --</option>
              {products.map((p) => (
                <option key={p.size_id} value={p.size_id}>
                  {p.name} ({p.size_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem' }}>🌾 Tên nguyên liệu :</label>
            <select
              className="form-select"
              value={form.ingredient_id}
              onChange={(e) => handleIngredientChange(e.target.value)}
            >
              <option value="">-- Chọn nguyên liệu --</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem' }}>⚖️ Số lượng :</label>
            <input
              type="number"
              step="any"
              className="form-input"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem' }}>📏 Đơn vị tính :</label>
            <input
              className="form-input"
              value={form.unit}
              readOnly
              style={{ fontWeight: 600 }}
            />
          </div>

          {/* 3 Circular Action Buttons (matching image8.png) */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
            <button
              type="button"
              className="circle-btn circle-btn-green"
              title="Thêm mới"
              onClick={handleSave}
            >
              +
            </button>
            <button
              type="button"
              className="circle-btn circle-btn-blue"
              title="Lưu sửa"
              onClick={handleSave}
            >
              ✏️
            </button>
            <button
              type="button"
              className="circle-btn circle-btn-red"
              title="Xóa"
              onClick={handleDelete}
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
