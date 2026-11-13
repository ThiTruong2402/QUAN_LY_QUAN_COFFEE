import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

// Chuyển đổi định lượng tồn kho thành định lượng Barista và quy tắc trừ kho thực tế
const formatBaristaRecipe = (ingName, qty, unit) => {
  const q = Number(qty || 0);
  const name = ingName || '';

  // Sữa tươi (hộp 1L -> trừ theo hộp)
  if (name.includes('Sữa tươi') || (unit === 'hộp' && name.includes('Sữa tươi'))) {
    const ml = Math.round(q * 1000);
    const cupsPerUnit = q > 0 ? (1 / q).toFixed(1).replace('.0', '') : '12.5';
    return {
      icon: '🥛',
      baristaAmount: `${ml} ml sữa tươi`,
      rawAmount: `${q.toFixed(3)} hộp`,
      action: `Mỗi ly trừ ${q.toFixed(3)} hộp ➔ ${cupsPerUnit} ly cộng dồn hết tròn 1 hộp (1L)`,
      badgeColor: '#e0f2fe'
    };
  }

  // Sữa đặc (hộp 380g -> trừ theo hộp)
  if (name.includes('Sữa đặc')) {
    const ml = Math.round(q * 300);
    const cupsPerUnit = q > 0 ? Math.round(1 / q) : 25;
    return {
      icon: '🥛',
      baristaAmount: `${ml} ml sữa đặc`,
      rawAmount: `${q.toFixed(3)} hộp`,
      action: `Mỗi ly trừ ${q.toFixed(3)} hộp ➔ ${cupsPerUnit} ly cộng dồn hết tròn 1 hộp (380g)`,
      badgeColor: '#fed7aa'
    };
  }

  // Cà phê hạt/bột (kg -> trừ theo cân)
  if (name.includes('Cà phê') || name.includes('Robusta') || name.includes('Arabica')) {
    const grams = Math.round(q * 1000);
    const mlCote = Math.round(grams * 1.8);
    const cupsPerUnit = q > 0 ? Math.round(1 / q) : 40;
    return {
      icon: '☕',
      baristaAmount: `${grams} g cà phê (~${mlCote}ml cốt)`,
      rawAmount: `${q.toFixed(3)} cân (kg)`,
      action: `Mỗi ly trừ ${q.toFixed(3)} kg ➔ ${cupsPerUnit} ly cộng dồn hết tròn 1 cân cà phê`,
      badgeColor: '#fbbf24'
    };
  }

  // Đá viên (kg -> trừ theo cân)
  if (name.includes('Đá viên') || name.toLowerCase().includes('đá')) {
    const grams = Math.round(q * 1000);
    const cupsPerUnit = q > 0 ? (1 / q).toFixed(1).replace('.0', '') : '6.7';
    return {
      icon: '🧊',
      baristaAmount: `${grams} g đá viên`,
      rawAmount: `${q.toFixed(3)} cân (kg)`,
      action: `Mỗi ly trừ ${q.toFixed(3)} kg ➔ ${cupsPerUnit} ly cộng dồn hết tròn 1 cân đá`,
      badgeColor: '#38bdf8'
    };
  }

  // Đường cát (kg -> trừ theo cân)
  if (name.includes('Đường')) {
    const grams = Math.round(q * 1000);
    const spoons = (grams / 10).toFixed(1).replace('.0', '');
    const cupsPerUnit = q > 0 ? Math.round(1 / q) : 66;
    return {
      icon: '🍬',
      baristaAmount: `${grams} g (${spoons} muỗng)`,
      rawAmount: `${q.toFixed(3)} cân (kg)`,
      action: `Mỗi ly trừ ${q.toFixed(3)} kg ➔ ${cupsPerUnit} ly cộng dồn hết tròn 1 cân đường`,
      badgeColor: '#fef08a'
    };
  }

  // Nước sôi / Nước lọc (L -> trừ theo Lít)
  if (name.includes('Nước lọc') || name.includes('Nước sôi') || unit === 'L') {
    const ml = Math.round(q * 1000);
    const cupsPerUnit = q > 0 ? Math.round(1 / q) : 20;
    return {
      icon: '💧',
      baristaAmount: `${ml} ml nước sôi 95°C`,
      rawAmount: `${q.toFixed(3)} L`,
      action: `Mỗi ly trừ ${q.toFixed(3)} L ➔ ${cupsPerUnit} ly cộng dồn hết tròn 1 Lít nước`,
      badgeColor: '#60a5fa'
    };
  }

  // Kem béo Rich (hộp -> trừ theo hộp)
  if (name.includes('Rich') || name.includes('Kem béo')) {
    const ml = Math.round(q * 454);
    const cupsPerUnit = q > 0 ? Math.round(1 / q) : 15;
    return {
      icon: '🧁',
      baristaAmount: `${ml} ml kem béo Rich`,
      rawAmount: `${q.toFixed(3)} hộp`,
      action: `Mỗi ly trừ ${q.toFixed(3)} hộp ➔ ${cupsPerUnit} ly cộng dồn hết tròn 1 hộp kem`,
      badgeColor: '#fbcfe8'
    };
  }

  // Trứng gà (quả -> trừ theo quả)
  if (name.includes('Trứng') || unit === 'quả') {
    const eggs = Math.round(q);
    return {
      icon: '🥚',
      baristaAmount: `${eggs} lòng đỏ trứng tươi`,
      rawAmount: `${eggs} quả`,
      action: `Mỗi ly trừ ${eggs} quả ➔ Trừ trực tiếp theo quả thực tế`,
      badgeColor: '#fef08a'
    };
  }

  // Muối (g hoặc kg)
  if (name.includes('Muối')) {
    const grams = unit === 'kg' ? Math.round(q * 1000) : Math.round(q);
    return {
      icon: '🧂',
      baristaAmount: `${grams} g muối hồng`,
      rawAmount: `${q} ${unit}`,
      action: `Mỗi ly dùng ${grams}g tạo vị kem mặn béo`,
      badgeColor: '#fda4af'
    };
  }

  // Đào ngâm / Vải ngâm (hộp -> lát/trái)
  if (name.includes('Đào') || name.includes('Vải')) {
    const pieces = Math.max(2, Math.round(q * 40));
    return {
      icon: '🍑',
      baristaAmount: `${pieces} miếng/trái ngâm giòn`,
      rawAmount: `${q.toFixed(3)} hộp`,
      action: `Mỗi ly dùng ${pieces} miếng ➔ ~13 ly hết 1 hộp ngâm`,
      badgeColor: '#fed7aa'
    };
  }

  // Trà (kg -> g)
  if (name.includes('Trà') && unit === 'kg') {
    const grams = Math.round(q * 1000);
    const cupsPerUnit = q > 0 ? Math.round(1 / q) : 100;
    return {
      icon: '🍃',
      baristaAmount: `${grams} g lá trà hảo hạng`,
      rawAmount: `${q.toFixed(3)} cân (kg)`,
      action: `Mỗi ly trừ ${q.toFixed(3)} kg ➔ ${cupsPerUnit} ly hết 1 cân trà`,
      badgeColor: '#bbf7d0'
    };
  }

  // Bột Matcha / Cacao (g hoặc kg)
  if (name.includes('Matcha') || name.includes('Cacao')) {
    const grams = unit === 'kg' ? Math.round(q * 1000) : Math.round(q);
    return {
      icon: '🍵',
      baristaAmount: `${grams} g bột nguyên chất`,
      rawAmount: `${q} ${unit}`,
      action: `Cân đúng ${grams}g cho mỗi ly`,
      badgeColor: '#a7f3d0'
    };
  }

  // Bơ sáp (kg -> g)
  if (name.includes('Bơ') && unit === 'kg') {
    const grams = Math.round(q * 1000);
    const cupsPerUnit = q > 0 ? (1 / q).toFixed(1) : '6.7';
    return {
      icon: '🥑',
      baristaAmount: `${grams} g bơ sáp tươi`,
      rawAmount: `${q.toFixed(3)} cân (kg)`,
      action: `Mỗi ly trừ ${q.toFixed(3)} kg ➔ ${cupsPerUnit} ly hết 1 cân bơ`,
      badgeColor: '#bef264'
    };
  }

  // Sả cây
  if (name.includes('Sả')) {
    return {
      icon: '🌿',
      baristaAmount: `1 nhánh sả tươi (~15g)`,
      rawAmount: `${q} ${unit}`,
      action: '1 nhánh sả thơm đập dập / ly',
      badgeColor: '#86efac'
    };
  }

  // Default fallback
  if (unit === 'kg') {
    return {
      icon: '🥄',
      baristaAmount: `${Math.round(q * 1000)} g`,
      rawAmount: `${q} cân (kg)`,
      action: `Trừ ${q} kg kho / ly`,
      badgeColor: '#d5bba2'
    };
  }

  return {
    icon: '🥄',
    baristaAmount: `${q} ${unit}`,
    rawAmount: `${q} ${unit}`,
    action: `Trừ ${q} ${unit} kho / ly`,
    badgeColor: '#d5bba2'
  };
};

export default function MenuManage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'manager'].includes(user?.role);
  const isStaff = ['admin', 'manager', 'barista', 'cashier', 'waiter', 'warehouse'].includes(user?.role);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  // Recipes state
  const [allRecipes, setAllRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [activeRightTab, setActiveRightTab] = useState('product'); // 'product' | 'recipe'
  const [selectedSizeId, setSelectedSizeId] = useState(null);

  // Recipe edit form (for admin)
  const [recipeForm, setRecipeForm] = useState({
    ingredient_id: '',
    quantity: 0.02,
    unit: 'kg',
  });

  const FALLBACK_DRINK_IMG = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80';

  // Product Form
  const [form, setForm] = useState({
    code: 'M001',
    name: '',
    category_id: 1,
    price: 30000,
    description: '',
    image_url: FALLBACK_DRINK_IMG,
  });

  const loadData = async (keepId) => {
    try {
      const [prodRes, recipeRes] = await Promise.all([
        api.get('/products'),
        isStaff ? api.get('/recipes').catch(() => ({ data: { data: {} } })) : Promise.resolve({ data: { data: {} } }),
      ]);

      const prods = prodRes.data.data.products || [];
      const cats = prodRes.data.data.categories || [];
      setProducts(prods);
      setCategories(cats);

      if (isStaff && recipeRes.data?.data) {
        setAllRecipes(recipeRes.data.data.recipes || []);
        const ings = recipeRes.data.data.ingredients || [];
        setIngredients(ings);
        if (ings.length > 0 && !recipeForm.ingredient_id) {
          setRecipeForm((prev) => ({
            ...prev,
            ingredient_id: ings[0].id,
            unit: ings[0].unit,
          }));
        }
      }

      const targetId = keepId !== undefined ? keepId : selectedProduct?.id;
      if (targetId) {
        const found = prods.find((p) => p.id === targetId);
        if (found) selectRow(found);
      } else if (prods.length > 0) {
        selectRow(prods[0]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải thực đơn & công thức');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectRow = (p) => {
    setSelectedProduct(p);
    const defaultSize = p.sizes?.find((s) => s.is_default) || p.sizes?.[0];
    setSelectedSizeId(defaultSize?.id || null);
    const defaultPrice = defaultSize?.price || 30000;
    setForm({
      code: p.code || `M00${p.id}`,
      name: p.name,
      category_id: p.category_id,
      price: defaultPrice,
      description: p.description || '',
      image_url: p.image_url || FALLBACK_DRINK_IMG,
    });
  };

  // Kích thước (Size) đang được chọn
  const activeSize = selectedProduct?.sizes?.find((s) => s.id === selectedSizeId) || selectedProduct?.sizes?.[0];

  // Lọc công thức: Ưu tiên lọc chính xác theo Size đang chọn để Barista xem rõ ràng
  const currentProductRecipes = allRecipes.filter((r) => {
    if (!selectedProduct) return false;
    if (activeSize) {
      return r.product_size_id === activeSize.id;
    }
    return r.product_id === selectedProduct.id;
  });

  const handleCreateProduct = async () => {
    if (!canEdit) return toast.error('Chỉ Admin hoặc Quản lý mới có quyền thêm món mới!');
    if (!form.name) return toast.error('Vui lòng nhập tên món!');
    try {
      const res = await api.post('/products', {
        ...form,
        sizes: [{ name: 'M', price: form.price, is_default: true }],
      });
      toast.success('Thêm món mới thành công! ☕');
      loadData(res.data?.data?.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleUpdateProduct = async () => {
    if (!canEdit) return toast.error('Chỉ Admin hoặc Quản lý mới có quyền chỉnh sửa món!');
    if (!selectedProduct) return toast.error('Vui lòng chọn món cần sửa!');
    try {
      await api.put(`/products/${selectedProduct.id}`, {
        ...form,
        is_available: selectedProduct.is_available ?? 1,
        is_active: 1,
      });
      toast.success('Cập nhật món và giá tiền thành công!');
      loadData(selectedProduct.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật');
    }
  };

  const handleDeleteProduct = async () => {
    if (!canEdit) return toast.error('Chỉ Admin hoặc Quản lý mới có quyền xóa món!');
    if (!selectedProduct) return toast.error('Vui lòng chọn món cần xóa!');
    if (!window.confirm(`Bạn có chắc muốn xóa món "${selectedProduct.name}"?`)) return;
    try {
      await api.delete(`/products/${selectedProduct.id}`);
      toast.success('Đã xóa món!');
      setSelectedProduct(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa món');
    }
  };

  // Thêm nguyên liệu vào đúng Size đang chọn (Admin & Manager)
  const handleAddRecipeIngredient = async (e) => {
    e.preventDefault();
    if (!canEdit) return toast.error('Chỉ Admin hoặc Quản lý mới có quyền sửa công thức!');
    if (!selectedProduct) return toast.error('Chưa chọn món đồ uống');

    const targetSizeId = activeSize?.id || selectedProduct.sizes?.[0]?.id;
    if (!targetSizeId) return toast.error('Món này chưa có kích thước hợp lệ');

    try {
      await api.post('/recipes', {
        product_size_id: targetSizeId,
        ingredient_id: recipeForm.ingredient_id,
        quantity: recipeForm.quantity,
      });
      toast.success(`Đã thêm nguyên liệu vào Size ${activeSize?.name || 'M'} thành công!`);
      loadData(selectedProduct.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu công thức');
    }
  };

  // Delete Recipe Ingredient (Admin & Manager)
  const handleDeleteRecipeIngredient = async (recipeId) => {
    if (!canEdit) return toast.error('Chỉ Admin hoặc Quản lý mới có quyền xóa nguyên liệu khỏi công thức!');
    if (!window.confirm('Xác nhận xóa nguyên liệu này khỏi công thức?')) return;
    try {
      await api.delete(`/recipes/${recipeId}`);
      toast.success('Đã xóa nguyên liệu khỏi công thức!');
      loadData(selectedProduct?.id);
    } catch (err) {
      toast.error('Lỗi khi xóa công thức');
    }
  };

  const filteredProducts = products.filter((p) => {
    if (catFilter !== 'all' && String(p.category_id) !== catFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q);
  });

  return (
    <div className="animate-fade-in mockup-split-grid">
      {/* LEFT: DANH SÁCH MÓN */}
      <div className="mockup-panel">
        <div className="mockup-panel-header">
          <div className="mockup-panel-title">
            <span>☕</span>
            <span>DANH SÁCH THỰC ĐƠN ({filteredProducts.length} MÓN)</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Tìm kiếm món..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '160px', padding: '6px 10px', fontSize: '0.85rem' }}
            />
            <select
              className="form-select"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              style={{ width: '130px', padding: '6px 8px', fontSize: '0.85rem' }}
            >
              <option value="all">Tất cả loại</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
          <table className="mockup-table">
            <thead>
              <tr>
                <th style={{ width: '55px' }}>Ảnh</th>
                <th style={{ width: '85px' }}>Mã Món</th>
                <th>Tên Món</th>
                <th style={{ width: '100px' }}>Loại</th>
                <th style={{ width: '95px', textAlign: 'right' }}>Giá bán</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const isSelected = selectedProduct?.id === p.id;
                const price = p.sizes?.find((s) => s.is_default)?.price || p.sizes?.[0]?.price || 30000;
                return (
                  <tr
                    key={p.id}
                    onClick={() => selectRow(p)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(217, 119, 6, 0.22)' : undefined,
                      borderLeft: isSelected ? '3px solid #fbbf24' : '3px solid transparent',
                    }}
                  >
                    <td>
                      <img
                        src={p.image_url || FALLBACK_DRINK_IMG}
                        alt={p.name}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                        }}
                      />
                    </td>
                    <td style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.82rem' }}>
                      {p.code || `M00${p.id}`}
                    </td>
                    <td style={{ fontWeight: 600, color: '#fef3c7' }}>
                      <div>{p.name}</div>
                      {p.sizes && p.sizes.length > 1 && (
                        <div style={{ fontSize: '0.72rem', color: '#c4a482' }}>
                          Sizes: {p.sizes.map((s) => s.name).join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#d5bba2' }}>
                      {p.category_name || categories.find((c) => c.id === p.category_id)?.name || 'Đồ uống'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#fbbf24', fontSize: '0.85rem' }}>
                      {fmt(price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: GỘP THÔNG TIN MÓN & CÔNG THỨC PHA CHẾ */}
      <div className="mockup-panel">
        {/* Sub-Tabs Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(245, 158, 11, 0.2)', background: 'rgba(32, 20, 13, 0.85)' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '12px 16px',
              background: activeRightTab === 'product' ? 'rgba(245, 158, 11, 0.18)' : 'transparent',
              color: activeRightTab === 'product' ? '#fbbf24' : '#c4a482',
              fontWeight: 800,
              fontSize: '0.85rem',
              border: 'none',
              borderBottom: activeRightTab === 'product' ? '3px solid #d97706' : '3px solid transparent',
              cursor: 'pointer',
            }}
            onClick={() => setActiveRightTab('product')}
          >
            📋 THÔNG TIN MÓN &amp; GIÁ BÁN
          </button>

          <button
            type="button"
            style={{
              flex: 1,
              padding: '12px 16px',
              background: activeRightTab === 'recipe' ? 'rgba(245, 158, 11, 0.18)' : 'transparent',
              color: activeRightTab === 'recipe' ? '#fbbf24' : '#c4a482',
              fontWeight: 800,
              fontSize: '0.85rem',
              border: 'none',
              borderBottom: activeRightTab === 'recipe' ? '3px solid #d97706' : '3px solid transparent',
              cursor: 'pointer',
            }}
            onClick={() => setActiveRightTab('recipe')}
          >
            🧪 CÔNG THỨC PHA CHẾ ({currentProductRecipes.length} NGUYÊN LIỆU)
          </button>
        </div>

        <div className="mockup-panel-body" style={{ padding: '20px' }}>
          {/* TAB 1: THÔNG TIN MÓN & GIÁ BÁN */}
          {activeRightTab === 'product' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <img
                  src={form.image_url || FALLBACK_DRINK_IMG}
                  alt={form.name}
                  style={{ width: '85px', height: '85px', borderRadius: '12px', objectFit: 'cover', border: '1.5px solid rgba(245, 158, 11, 0.35)' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fef3c7' }}>
                    {form.name || 'Tên món'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#fbbf24', marginTop: '2px' }}>
                    Mã món: <strong>{form.code}</strong> • Giá chuẩn: <strong>{fmt(form.price)}</strong>
                  </div>
                  {!canEdit && (
                    <div style={{ fontSize: '0.74rem', color: '#34d399', marginTop: '4px' }}>
                      🔒 Chế độ xem thực đơn cho nhân viên (Read-only)
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">MÃ MÓN:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    disabled={!canEdit}
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
                <div>
                  <label className="form-label">DANH MỤC:</label>
                  <select
                    className="form-select"
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: parseInt(e.target.value) })}
                    disabled={!canEdit}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">TÊN MÓN ĐỒ UỐNG:</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={!canEdit}
                  style={{ width: '100%', padding: '8px' }}
                  placeholder="Ví dụ: Cà phê Muối Cốm"
                />
              </div>

              <div>
                <label className="form-label">GIÁ BÁN TIÊU CHUẨN (VNĐ):</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  disabled={!canEdit}
                  style={{ width: '100%', padding: '8px', color: '#fbbf24', fontWeight: 800 }}
                />
              </div>

              <div>
                <label className="form-label">MÔ TẢ MÓN:</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={!canEdit}
                  style={{ width: '100%', padding: '8px' }}
                  placeholder="Hương vị thơm béo, đậm đà..."
                />
              </div>

              <div>
                <label className="form-label">LINK ẢNH MÓN (URL):</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  disabled={!canEdit}
                  style={{ width: '100%', padding: '8px', fontSize: '0.8rem' }}
                />
              </div>

              {/* Action Buttons: Admin & Manager can edit */}
              {canEdit && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ borderColor: '#ef4444', color: '#f87171' }}
                    onClick={handleDeleteProduct}
                  >
                    🗑️ XÓA MÓN
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}
                    onClick={handleCreateProduct}
                  >
                    ➕ THÊM MÓN MỚI
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1, background: 'linear-gradient(135deg, #d97706, #b45309)', borderColor: '#d97706', fontWeight: 800 }}
                    onClick={handleUpdateProduct}
                  >
                    💾 LƯU THAY ĐỔI
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CÔNG THỨC PHA CHẾ */}
          {activeRightTab === 'recipe' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!isStaff ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#fbbf24' }}>
                  🔒 Công thức pha chế là tài sản độc quyền của quán. Khách hàng không có quyền truy cập.
                </div>
              ) : (
                <>
                  {/* Top Header & Size Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(38, 22, 14, 0.85)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#fef3c7', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>☕</span>
                          <span>Công thức: {selectedProduct?.name || 'Chưa chọn món'}</span>
                          {activeSize && (
                            <span style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#ffffff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                              Size {activeSize.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ color: '#fbbf24', fontSize: '0.78rem', fontWeight: 700 }}>
                        {currentProductRecipes.length} thành phần
                      </div>
                    </div>

                    {/* Bộ nút chọn kích cỡ (Size S, M, L) */}
                    {selectedProduct?.sizes && selectedProduct.sizes.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid rgba(245, 158, 11, 0.15)' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d5bba2' }}>
                          Kích cỡ (Size):
                        </span>
                        {selectedProduct.sizes.map((sz) => {
                          const isCurrent = (selectedSizeId || selectedProduct.sizes[0]?.id) === sz.id;
                          return (
                            <button
                              key={sz.id}
                              type="button"
                              onClick={() => setSelectedSizeId(sz.id)}
                              style={{
                                padding: '4px 12px',
                                borderRadius: '16px',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                border: isCurrent ? '1.5px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.25)',
                                background: isCurrent ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(255, 255, 255, 0.05)',
                                color: isCurrent ? '#ffffff' : '#d5bba2',
                                boxShadow: isCurrent ? '0 2px 8px rgba(217, 119, 6, 0.35)' : 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              Size {sz.name} ({fmt(sz.price)})
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bảng định lượng nguyên liệu Barista chuẩn */}
                  <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', background: 'rgba(24, 14, 9, 0.6)' }}>
                    <table className="mockup-table">
                      <thead>
                        <tr>
                          <th>Nguyên liệu</th>
                          <th style={{ textAlign: 'left' }}>Định lượng / Ly</th>
                          <th style={{ textAlign: 'center', width: '110px' }}>Trừ kho / Ly</th>
                          <th>Quy đổi trừ kho</th>
                          {canEdit && <th style={{ width: '40px', textAlign: 'center' }}>Xóa</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {currentProductRecipes.length === 0 ? (
                          <tr>
                            <td colSpan={canEdit ? 5 : 4} style={{ textAlign: 'center', padding: '30px 20px', color: '#c4a482' }}>
                              Chưa có định lượng công thức cho Size {activeSize?.name || 'này'}. Quản lý có thể thêm bên dưới!
                            </td>
                          </tr>
                        ) : (
                          currentProductRecipes.map((r) => {
                            const ing = ingredients.find((i) => i.id === r.ingredient_id);
                            const ingName = r.ingredient_name || ing?.name || 'Nguyên liệu';
                            const ingUnit = r.ingredient_unit || ing?.unit || 'g';
                            const bData = formatBaristaRecipe(ingName, r.quantity, ingUnit);

                            return (
                              <tr key={r.id}>
                                <td style={{ fontWeight: 700, color: '#fef3c7' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '1.1rem' }}>{bData.icon}</span>
                                    <span>{ingName}</span>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontWeight: 900, color: '#fbbf24', fontSize: '0.88rem', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                    {bData.baristaAmount}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                                    {bData.rawAmount}
                                  </span>
                                </td>
                                <td style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>
                                  {bData.action}
                                </td>
                                {canEdit && (
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRecipeIngredient(r.id)}
                                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 800 }}
                                      title="Xóa nguyên liệu này khỏi công thức"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Form Thêm nguyên liệu: Admin & Manager (Gắn đúng theo Size đang chọn) */}
                  {canEdit ? (
                    <form onSubmit={handleAddRecipeIngredient} style={{ background: 'rgba(28, 17, 10, 0.95)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fbbf24' }}>
                          ➕ THÊM NGUYÊN LIỆU VÀO SIZE {activeSize?.name || 'M'}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.74rem' }}>Chọn nguyên liệu:</label>
                          <select
                            className="form-select"
                            value={recipeForm.ingredient_id}
                            onChange={(e) => {
                              const ing = ingredients.find((i) => String(i.id) === e.target.value);
                              setRecipeForm({
                                ...recipeForm,
                                ingredient_id: e.target.value,
                                unit: ing?.unit || 'kg',
                              });
                            }}
                            style={{ width: '100%', padding: '6px' }}
                            required
                          >
                            {ingredients.map((i) => (
                              <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="form-label" style={{ fontSize: '0.74rem' }}>Định lượng kho:</label>
                          <input
                            type="number"
                            step="0.001"
                            className="form-input"
                            value={recipeForm.quantity}
                            onChange={(e) => setRecipeForm({ ...recipeForm, quantity: Number(e.target.value) })}
                            style={{ width: '100%', padding: '6px', fontWeight: 700 }}
                            required
                          />
                        </div>

                        <div>
                          <label className="form-label" style={{ fontSize: '0.74rem' }}>Đơn vị:</label>
                          <input
                            type="text"
                            className="form-input"
                            value={recipeForm.unit}
                            disabled
                            style={{ width: '100%', padding: '6px', opacity: 0.8 }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          type="submit"
                          className="btn btn-sm"
                          style={{ background: 'linear-gradient(135deg, #15803d, #166534)', color: '#ffffff', fontWeight: 800, padding: '7px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                        >
                          + LƯU VÀO SIZE {activeSize?.name || 'M'}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
