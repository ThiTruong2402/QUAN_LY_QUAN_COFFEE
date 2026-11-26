import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Search, Plus, Pencil, Trash2, Beaker, Coffee, X, Check, Layers, Upload, Maximize2, Image as ImageIcon,
} from 'lucide-react';
import api, { resolveProductImage } from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const FALLBACK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'><rect width='400' height='300' fill='%2318181B'/><circle cx='200' cy='150' r='44' fill='%2327272A'/><path d='M182 142h28v18a14 14 0 0 1-28 0v-18zm28 4h5a6 6 0 0 1 0 12h-5' fill='none' stroke='%23D97706' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>";
const cleanLabel = (str) => String(str || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

// Quy đổi định lượng sang đơn vị thực tế pha chế (g / ml)
const formatRecipeQty = (qty, unit) => {
  const n = Number(qty || 0);
  const u = String(unit || '').trim();
  if (u.toLowerCase() === 'kg' && n < 1) return `${Math.round(n * 1000)}g`;
  if ((u.toLowerCase() === 'l' || u.toLowerCase() === 'lít') && n < 1) return `${Math.round(n * 1000)}ml`;
  return `${Number(n.toFixed(3))} ${u}`;
};

// Nén nhẹ và chuẩn hóa kích thước ảnh tải lên từ máy Admin bằng Canvas trình duyệt
const compressImageFileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return reject(new Error('Chưa chọn tệp ảnh'));
  if (!file.type.startsWith('image/')) return reject(new Error('Chỉ hỗ trợ định dạng tệp ảnh (JPG, PNG, WEBP, GIF)'));
  if (file.size > 10 * 1024 * 1024) return reject(new Error('Ảnh gốc quá lớn (tối đa 10MB)'));

  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh'));
  reader.onload = () => {
    const rawDataUrl = reader.result;
    // Giữ nguyên GIF động nhỏ hoặc ảnh PNG/WEBP rất nhỏ
    if (file.type === 'image/gif' && file.size <= 2 * 1024 * 1024) {
      return resolve(rawDataUrl);
    }
    const img = new window.Image();
    img.onerror = () => reject(new Error('Tệp ảnh bị lỗi hoặc không hợp lệ'));
    img.onload = () => {
      const MAX_DIM = 900;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.max(1, Math.round(w * ratio));
        h = Math.max(1, Math.round(h * ratio));
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
});

export default function MenuManage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'manager'].includes(user?.role);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Bộ lọc
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');

  // Món đang chọn & Size đang xem công thức
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [activeSizeId, setActiveSizeId] = useState(null);

  // Form thêm nguyên liệu vào công thức
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [newRecipeIngId, setNewRecipeIngId] = useState('');
  const [newRecipeQty, setNewRecipeQty] = useState('');

  // Modal Thêm / Sửa món & Tải ảnh
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [quickUploading, setQuickUploading] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);

  const modalFileInputRef = useRef(null);
  const quickFileInputRef = useRef(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    category_id: '',
    description: '',
    image_url: '',
    is_available: 1,
    sizes: [{ name: 'M', price: 35000, is_default: 1 }],
  });

  const loadAll = async (focusProductId = null) => {
    try {
      setLoading(true);
      const canReadRecipes = ['admin', 'manager', 'barista', 'warehouse'].includes(user?.role);
      const canReadIngredients = ['admin', 'manager', 'warehouse', 'barista', 'cashier'].includes(user?.role);
      const [prodRes, rcpRes, invRes] = await Promise.all([
        api.get('/products'),
        canReadRecipes ? api.get('/recipes').catch(() => ({ data: { data: { recipes: [], ingredients: [] } } })) : Promise.resolve({ data: { data: { recipes: [], ingredients: [] } } }),
        canReadIngredients ? api.get('/inventory/ingredients').catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
      ]);

      const prodData = prodRes.data?.data || {};
      const prods = Array.isArray(prodData.products) ? prodData.products : [];
      const cats = Array.isArray(prodData.categories) ? prodData.categories : [];
      const rcps = Array.isArray(rcpRes.data?.data?.recipes) ? rcpRes.data.data.recipes : [];

      // Ưu tiên danh sách nguyên liệu từ inventory (có sẵn avg_cost để tính giá vốn)
      const invIngs = Array.isArray(invRes.data?.data) ? invRes.data.data : [];
      const rcpIngs = Array.isArray(rcpRes.data?.data?.ingredients) ? rcpRes.data.data.ingredients : [];
      const mergedIngs = invIngs.length > 0 ? invIngs : rcpIngs;

      setProducts(prods);
      setCategories(cats);
      setRecipes(rcps);
      setIngredients(mergedIngs);

      if (prods.length > 0) {
        const targetId = focusProductId || selectedProductId;
        const keepId = targetId && prods.some((p) => Number(p.id) === Number(targetId))
          ? Number(targetId)
          : prods[0].id;
        setSelectedProductId(keepId);
      }
    } catch {
      toast.error('Không thể tải dữ liệu thực đơn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // Món đang được chọn
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  // Đồng bộ activeSizeId mỗi khi đổi món
  useEffect(() => {
    if (!selectedProduct) {
      setActiveSizeId(null);
      return;
    }
    const sizes = selectedProduct.sizes || [];
    const defSize = sizes.find((s) => s.is_default) || sizes[0];
    setActiveSizeId(defSize?.id || null);
    setAddingRecipe(false);
  }, [selectedProduct?.id]);

  // Bản đồ tra cứu nhanh giá vốn từng nguyên liệu
  const ingredientMap = useMemo(() => {
    const map = new Map();
    ingredients.forEach((ing) => map.set(Number(ing.id), ing));
    return map;
  }, [ingredients]);

  // Đếm tổng số dòng công thức cho mỗi sản phẩm
  const recipeCountByProduct = useMemo(() => {
    const counts = {};
    recipes.forEach((r) => {
      counts[r.product_id] = (counts[r.product_id] || 0) + 1;
    });
    return counts;
  }, [recipes]);

  // Công thức của Size đang chọn trên món đang chọn
  const currentSizeRecipes = useMemo(() => {
    if (!activeSizeId) return [];
    return recipes
      .filter((r) => Number(r.product_size_id) === Number(activeSizeId))
      .map((r) => {
        const ing = ingredientMap.get(Number(r.ingredient_id));
        const avgCost = Number(ing?.avg_cost || 0);
        const lineCost = Math.round(Number(r.quantity || 0) * avgCost);
        return { ...r, avgCost, lineCost };
      });
  }, [recipes, activeSizeId, ingredientMap]);

  const activeSizeObj = useMemo(() => {
    if (!selectedProduct) return null;
    return (selectedProduct.sizes || []).find((s) => Number(s.id) === Number(activeSizeId)) || selectedProduct.sizes?.[0] || null;
  }, [selectedProduct, activeSizeId]);

  const estimatedCogs = currentSizeRecipes.reduce((s, r) => s + r.lineCost, 0);
  const activeSellPrice = Number(activeSizeObj?.price || 0);
  const grossMarginPct = activeSellPrice > 0 && estimatedCogs > 0
    ? Math.round(((activeSellPrice - estimatedCogs) / activeSellPrice) * 100)
    : null;

  // Lọc danh sách món
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = selectedCat === 'all' || String(p.category_id) === String(selectedCat);
      const matchSearch =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, selectedCat, search]);

  // --- TẢI ẢNH MÓN ĂN LÊN SERVER ---
  const uploadFileToServer = async (file) => {
    const dataUrl = await compressImageFileToDataUrl(file);
    const res = await api.post('/products/upload-image', { dataUrl });
    const uploadedUrl = res.data?.data?.image_url;
    if (!uploadedUrl) throw new Error('Server không trả về đường dẫn ảnh');
    return uploadedUrl;
  };

  const handleModalFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setUploadingImage(true);
      const uploadedUrl = await uploadFileToServer(file);
      setForm((prev) => ({ ...prev, image_url: uploadedUrl }));
      toast.success('Đã tải ảnh lên — bấm Lưu để áp dụng');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi tải ảnh lên');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleQuickImageChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedProduct) return;
    try {
      setQuickUploading(true);
      const uploadedUrl = await uploadFileToServer(file);
      await api.put(`/products/${selectedProduct.id}`, { image_url: uploadedUrl });
      toast.success(`Đã cập nhật ảnh mới cho "${selectedProduct.name}"`);
      await loadAll(selectedProduct.id);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Không thể cập nhật ảnh món');
    } finally {
      setQuickUploading(false);
    }
  };

  // --- HÀNH ĐỘNG CÔNG THỨC ---
  const handleAddRecipeItem = async (e) => {
    e.preventDefault();
    if (!activeSizeId || !newRecipeIngId || Number(newRecipeQty) <= 0) {
      return toast.error('Vui lòng chọn nguyên liệu và nhập định lượng lớn hơn 0');
    }
    try {
      await api.post('/recipes', {
        product_size_id: activeSizeId,
        ingredient_id: Number(newRecipeIngId),
        quantity: Number(newRecipeQty),
      });
      toast.success('Đã lưu định lượng công thức');
      setNewRecipeIngId('');
      setNewRecipeQty('');
      setAddingRecipe(false);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu công thức');
    }
  };

  const handleDeleteRecipeItem = async (recipeId) => {
    try {
      await api.delete(`/recipes/${recipeId}`);
      toast.success('Đã xóa nguyên liệu khỏi công thức');
      loadAll();
    } catch {
      toast.error('Lỗi xóa nguyên liệu');
    }
  };

  // --- HÀNH ĐỘNG THÊM / SỬA / XÓA MÓN ---
  const openCreateModal = () => {
    setEditingProduct(null);
    setForm({
      code: '',
      name: '',
      category_id: categories[0]?.id || 1,
      description: '',
      image_url: '',
      is_available: 1,
      sizes: [
        { name: 'S', price: 29000, is_default: 0 },
        { name: 'M', price: 35000, is_default: 1 },
        { name: 'L', price: 42000, is_default: 0 },
      ],
    });
    setEditModalOpen(true);
  };

  const openEditModal = (prod) => {
    setEditingProduct(prod);
    setForm({
      code: prod.code || '',
      name: prod.name || '',
      category_id: prod.category_id || categories[0]?.id || 1,
      description: prod.description || '',
      image_url: prod.image_url || '',
      is_available: prod.is_available ?? 1,
      sizes: (prod.sizes || []).length > 0
        ? prod.sizes.map((s) => ({ id: s.id, name: s.name, price: Number(s.price), is_default: s.is_default ? 1 : 0 }))
        : [{ name: 'M', price: 35000, is_default: 1 }],
    });
    setEditModalOpen(true);
  };

  const handleSizePreset = (presetType) => {
    if (presetType === 'single') {
      const curPrice = Number(form.sizes?.[0]?.price) || 35000;
      setForm((prev) => ({
        ...prev,
        sizes: [{ name: 'Tiêu chuẩn', price: curPrice, is_default: 1 }],
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        sizes: [
          { name: 'S', price: 29000, is_default: 0 },
          { name: 'M', price: 35000, is_default: 1 },
          { name: 'L', price: 42000, is_default: 0 },
        ],
      }));
    }
  };

  const handleAddSizeRow = () => {
    setForm((prev) => ({
      ...prev,
      sizes: [...prev.sizes, { name: '', price: 35000, is_default: 0 }],
    }));
  };

  const handleRemoveSizeRow = (idx) => {
    setForm((prev) => {
      if (prev.sizes.length <= 1) return prev;
      const next = prev.sizes.filter((_, i) => i !== idx);
      if (!next.some((s) => s.is_default) && next.length > 0) {
        next[0] = { ...next[0], is_default: 1 };
      }
      return { ...prev, sizes: next };
    });
  };

  const handleSetDefaultSize = (idx) => {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.map((s, i) => ({ ...s, is_default: i === idx ? 1 : 0 })),
    }));
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Tên món không được để trống');

    const validSizes = form.sizes
      .filter((s) => String(s.name || '').trim())
      .map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        name: String(s.name).trim(),
        price: Math.max(0, Number(s.price) || 0),
        is_default: s.is_default ? 1 : 0,
      }));

    if (validSizes.length === 0) {
      return toast.error('Vui lòng nhập ít nhất 1 kích cỡ và giá bán');
    }

    const payload = { ...form, sizes: validSizes };

    try {
      setSavingProduct(true);
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Đã cập nhật thông tin món');
        setEditModalOpen(false);
        await loadAll(editingProduct.id);
      } else {
        const res = await api.post('/products', payload);
        const newId = res.data?.data?.id || null;
        toast.success('Đã thêm món mới vào thực đơn');
        setEditModalOpen(false);
        await loadAll(newId);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu thông tin món');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (prod) => {
    if (!window.confirm(`Ngừng kinh doanh món "${prod.name}"?`)) return;
    try {
      await api.delete(`/products/${prod.id}`);
      toast.success('Đã ẩn món khỏi thực đơn');
      loadAll();
    } catch {
      toast.error('Lỗi xóa món');
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.25fr) minmax(380px, 1fr)',
      gap: '18px',
      height: 'calc(100vh - 98px)',
      minHeight: '540px',
      overflow: 'hidden',
      width: '100%',
    }}>
      {/* Input file ẩn cho thao tác Đổi ảnh nhanh trên cột chi tiết */}
      <input
        ref={quickFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleQuickImageChange}
      />

      {/* ====================================================================
          CỘT TRÁI (56%): DANH SÁCH THỰC ĐƠN ĐỒNG BỘ MATTE DARK
          ==================================================================== */}
      <section style={{
        background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px',
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden',
      }}>
        {/* Header tìm kiếm + nút Thêm món */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #26262B', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717A' }} />
              <input
                type="text"
                className="ui-input"
                style={{ width: '100%', paddingLeft: '36px' }}
                placeholder="Tìm tên món hoặc mã (CF01, TR02)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canEdit && (
              <button type="button" className="ui-btn ui-btn-brand" onClick={openCreateModal}>
                <Plus size={15} /> Thêm món mới
              </button>
            )}
          </div>

          {/* Dải chip danh mục không emoji */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            <button
              type="button"
              onClick={() => setSelectedCat('all')}
              style={{
                padding: '5px 12px', borderRadius: '999px', fontSize: '0.76rem', fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid',
                background: selectedCat === 'all' ? '#D97706' : '#202024',
                borderColor: selectedCat === 'all' ? '#D97706' : '#2E2E35',
                color: selectedCat === 'all' ? '#FFFFFF' : '#A1A1AA',
              }}
            >
              Tất cả ({products.length})
            </button>
            {categories.map((c) => {
              const active = String(selectedCat) === String(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCat(String(c.id))}
                  style={{
                    padding: '5px 12px', borderRadius: '999px', fontSize: '0.76rem', fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid',
                    background: active ? '#D97706' : '#202024',
                    borderColor: active ? '#D97706' : '#2E2E35',
                    color: active ? '#FFFFFF' : '#A1A1AA',
                  }}
                >
                  {cleanLabel(c.name)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bảng món cuộn độc lập */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <table className="ui-table">
            <thead>
              <tr>
                <th>Món</th>
                <th>Nhóm</th>
                <th>Công thức</th>
                <th style={{ textAlign: 'right' }}>Giá bán</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#71717A' }}>Đang tải thực đơn...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#71717A' }}>Không tìm thấy món phù hợp</td></tr>
              ) : filteredProducts.map((p) => {
                const isSelected = p.id === selectedProductId;
                const sizes = p.sizes || [];
                const defSize = sizes.find((s) => s.is_default) || sizes[0];
                const rCount = recipeCountByProduct[p.id] || 0;

                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(217, 119, 6, 0.1)' : undefined,
                      boxShadow: isSelected ? 'inset 3px 0 0 #D97706' : 'none',
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                        <img
                          src={resolveProductImage(p.image_url, FALLBACK_IMG)}
                          alt={p.name}
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMG; }}
                          style={{ width: '44px', height: '44px', borderRadius: '9px', objectFit: 'cover', objectPosition: 'center center', flexShrink: 0, background: '#121214' }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#F4F1EC', lineHeight: 1.3 }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#71717A', marginTop: '2px' }}>
                            {p.code || `#${p.id}`}
                            {sizes.length > 1 && ` · ${sizes.map((s) => s.name).join(' / ')}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="ui-nowrap" style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>
                      {cleanLabel(p.category_name)}
                    </td>
                    <td className="ui-nowrap">
                      <span className={`ui-badge ${rCount > 0 ? 'ui-badge-green' : 'ui-badge-gray'}`}>
                        {rCount > 0 ? `${rCount} định lượng` : 'Chưa thiết lập'}
                      </span>
                    </td>
                    <td className="ui-nowrap ui-money" style={{ textAlign: 'right', fontWeight: 700, color: '#F59E0B', fontSize: '0.86rem' }}>
                      {fmt(defSize?.price || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ====================================================================
          CỘT PHẢI (44%): ẢNH CĂN GIỮA + CHI TIẾT MÓN & CÔNG THỨC
          ==================================================================== */}
      <aside style={{
        background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px',
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden',
      }}>
        {!selectedProduct ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#71717A', gap: '8px' }}>
            <Coffee size={32} opacity={0.4} />
            <span style={{ fontSize: '0.86rem' }}>Chọn một món để xem chi tiết và công thức</span>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* KHUNG ẢNH CĂN GIỮA CHUẨN 4:3 VỚI NÚT ĐỔI ẢNH NHANH CHO ADMIN */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div
                onClick={() => setPreviewProduct(selectedProduct)}
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '280px',
                  aspectRatio: '4 / 3',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  border: '1px solid #2E2E35',
                  background: '#121214',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  margin: '0 auto',
                }}
              >
                <img
                  src={resolveProductImage(selectedProduct.image_url, FALLBACK_IMG)}
                  alt={selectedProduct.name}
                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMG; }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }}
                />
                <button
                  type="button"
                  title="Phóng to ảnh ở giữa màn hình"
                  onClick={(e) => { e.stopPropagation(); setPreviewProduct(selectedProduct); }}
                  style={{
                    position: 'absolute', bottom: '8px', left: '8px',
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'rgba(18, 18, 20, 0.78)', border: '1px solid rgba(255,255,255,0.16)',
                    color: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <Maximize2 size={13} />
                </button>
                {canEdit && (
                  <button
                    type="button"
                    disabled={quickUploading}
                    onClick={(e) => { e.stopPropagation(); quickFileInputRef.current?.click(); }}
                    style={{
                      position: 'absolute', bottom: '8px', right: '8px',
                      height: '28px', padding: '0 10px', borderRadius: '8px',
                      background: 'rgba(217, 119, 6, 0.92)', border: 'none', color: '#FFFFFF',
                      fontSize: '0.73rem', fontWeight: 700, cursor: quickUploading ? 'wait' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
                    }}
                  >
                    <Upload size={12} /> {quickUploading ? 'Đang tải...' : 'Đổi ảnh'}
                  </button>
                )}
              </div>
            </div>

            {/* PHẦN 1: THÔNG TIN MÓN */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#F59E0B', background: 'rgba(217,119,6,0.14)', padding: '2px 7px', borderRadius: '6px' }}>
                    {selectedProduct.code}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#A1A1AA' }}>
                    {cleanLabel(selectedProduct.category_name)}
                  </span>
                  {Number(selectedProduct.is_available) === 0 && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#F87171', background: 'rgba(239,68,68,0.15)', padding: '2px 7px', borderRadius: '6px' }}>
                      Tạm hết món
                    </span>
                  )}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.14rem', fontWeight: 700, color: '#F4F1EC', lineHeight: 1.25 }}>
                  {selectedProduct.name}
                </h3>
                {selectedProduct.description && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#A1A1AA', lineHeight: 1.45 }}>
                    {selectedProduct.description}
                  </p>
                )}
              </div>

              {canEdit && (
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button type="button" className="ui-btn-icon" title="Chỉnh sửa món & ảnh" onClick={() => openEditModal(selectedProduct)}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="ui-btn-icon" title="Ẩn món" style={{ color: '#F87171' }} onClick={() => handleDeleteProduct(selectedProduct)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Bảng giá theo từng kích cỡ */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '8px' }}>
                <Layers size={14} color="#F59E0B" /> <span>Kích cỡ &amp; Giá niêm yết</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, (selectedProduct.sizes || []).length))}, 1fr)`, gap: '8px' }}>
                {(selectedProduct.sizes || []).map((s) => {
                  const isActive = Number(s.id) === Number(activeSizeId);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSizeId(s.id)}
                      style={{
                        padding: '10px 12px', borderRadius: '11px', textAlign: 'left', cursor: 'pointer',
                        background: isActive ? 'rgba(217, 119, 6, 0.14)' : '#202024',
                        border: isActive ? '1.5px solid #D97706' : '1px solid #2A2A30',
                        transition: 'all 0.14s ease',
                      }}
                    >
                      <div style={{ fontSize: '0.73rem', fontWeight: 600, color: isActive ? '#FBBF24' : '#A1A1AA' }}>
                        {s.name === 'Tiêu chuẩn' ? 'Tiêu chuẩn' : `Size ${s.name}`}
                      </div>
                      <div className="ui-money" style={{ fontSize: '0.96rem', fontWeight: 700, color: '#F4F1EC', marginTop: '2px' }}>
                        {fmt(s.price)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PHẦN 2: CÔNG THỨC PHA CHẾ & ĐỊNH LƯỢNG HIỂN THỊ NGAY BÊN DƯỚI */}
            <div style={{
              background: '#141417', border: '1px solid #26262B', borderRadius: '14px',
              padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Beaker size={16} color="#F59E0B" />
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#F4F1EC' }}>
                    Công thức định lượng {activeSizeObj ? `(${activeSizeObj.name})` : ''}
                  </span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setAddingRecipe((v) => !v)}
                    style={{
                      background: addingRecipe ? '#26262B' : 'rgba(217, 119, 6, 0.16)',
                      border: '1px solid rgba(217, 119, 6, 0.4)', color: '#FBBF24',
                      padding: '4px 10px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {addingRecipe ? <><X size={13} /> Đóng</> : <><Plus size={13} /> Nguyên liệu</>}
                  </button>
                )}
              </div>

              {/* Form thêm nguyên liệu gọn ngay trong khung công thức */}
              {addingRecipe && canEdit && (
                <form onSubmit={handleAddRecipeItem} style={{ display: 'grid', gridTemplateColumns: '1fr 96px auto', gap: '8px', alignItems: 'center' }}>
                  <select className="ui-select" value={newRecipeIngId} onChange={(e) => setNewRecipeIngId(e.target.value)} required>
                    <option value="">Chọn nguyên liệu...</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    className="ui-input"
                    placeholder="Số lượng"
                    value={newRecipeQty}
                    onChange={(e) => setNewRecipeQty(e.target.value)}
                    required
                  />
                  <button type="submit" className="ui-btn ui-btn-brand" style={{ padding: '0 12px' }}>
                    <Check size={15} />
                  </button>
                </form>
              )}

              {/* Danh sách nguyên liệu định lượng rõ ràng */}
              {currentSizeRecipes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '22px 10px', color: '#71717A', fontSize: '0.8rem', border: '1px dashed #2A2A30', borderRadius: '10px' }}>
                  Chưa có định lượng nguyên liệu cho kích cỡ này.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {currentSizeRecipes.map((r) => (
                    <div key={r.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '10px', background: '#1C1C20', border: '1px solid #27272C',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#F4F1EC' }}>{r.ingredient_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#71717A' }}>
                          {r.ingredient_code}{r.lineCost > 0 ? ` · Giá vốn ~${fmt(r.lineCost)}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span className="ui-money" style={{
                          background: 'rgba(217, 119, 6, 0.14)', color: '#FBBF24',
                          padding: '3px 9px', borderRadius: '7px', fontSize: '0.78rem', fontWeight: 700,
                        }}>
                          {formatRecipeQty(r.quantity, r.ingredient_unit)}
                        </span>
                        {canEdit && (
                          <button type="button" onClick={() => handleDeleteRecipeItem(r.id)} style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', padding: '3px' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Thống kê nhanh Giá vốn & Biên lợi nhuận của ly nước */}
              {estimatedCogs > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: '10px', borderTop: '1px solid #26262B', fontSize: '0.78rem',
                }}>
                  <span style={{ color: '#A1A1AA' }}>
                    Giá vốn ước tính: <strong className="ui-money" style={{ color: '#F4F1EC' }}>{fmt(estimatedCogs)}</strong>
                  </span>
                  {grossMarginPct !== null && (
                    <span className="ui-money" style={{ color: '#34D399', fontWeight: 600 }}>
                      Biên lợi nhuận: {grossMarginPct}%
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* MODAL THÊM MỚI / CHỈNH SỬA MÓN & THAY ĐỔI ẢNH */}
      {editModalOpen && (
        <div className="ui-modal-backdrop" onClick={() => setEditModalOpen(false)}>
          <form
            className="ui-modal-box"
            style={{ maxWidth: '560px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveProduct}
          >
            <div className="ui-modal-header" style={{ flexShrink: 0 }}>
              <h3 className="ui-modal-title">{editingProduct ? `Chỉnh sửa: ${editingProduct.name}` : 'Thêm món ăn / thức uống mới'}</h3>
              <button type="button" className="ui-btn-icon" onClick={() => setEditModalOpen(false)}><X size={15} /></button>
            </div>

            <div className="ui-modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              {/* VÙNG XEM TRƯỚC & TẢI ẢNH CĂN GIỮA */}
              <div style={{
                background: '#121214', border: '1px solid #2A2A30', borderRadius: '14px',
                padding: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
              }}>
                <div style={{
                  width: '216px', aspectRatio: '4 / 3', borderRadius: '12px', overflow: 'hidden',
                  border: '1px solid #2E2E35', background: '#18181B',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                }}>
                  {form.image_url ? (
                    <img
                      src={resolveProductImage(form.image_url, FALLBACK_IMG)}
                      alt={form.name || 'Xem trước ảnh món'}
                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMG; }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#71717A', fontSize: '0.76rem' }}>
                      <ImageIcon size={26} opacity={0.6} />
                      <span>Chưa có ảnh món</span>
                    </div>
                  )}
                </div>

                <input
                  ref={modalFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={handleModalFileChange}
                />

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn-brand"
                    disabled={uploadingImage}
                    onClick={() => modalFileInputRef.current?.click()}
                    style={{ height: '34px', fontSize: '0.78rem' }}
                  >
                    <Upload size={14} /> {uploadingImage ? 'Đang tải ảnh lên...' : 'Chọn ảnh từ máy'}
                  </button>
                  {form.image_url && (
                    <button
                      type="button"
                      className="ui-btn ui-btn-outline"
                      onClick={() => setForm((prev) => ({ ...prev, image_url: '' }))}
                      style={{ height: '34px', fontSize: '0.78rem', background: '#202024', borderColor: '#2E2E35', color: '#F4F1EC' }}
                    >
                      Xóa ảnh
                    </button>
                  )}
                </div>

                <div style={{ width: '100%' }}>
                  <label className="ui-modal-label">Hoặc nhập đường dẫn ảnh (/images/... hoặc https://...)</label>
                  <input
                    className="ui-input"
                    style={{ width: '100%' }}
                    placeholder="/images/drinks/... hoặc https://..."
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '12px' }}>
                <div>
                  <label className="ui-modal-label">Mã món</label>
                  <input
                    className="ui-input"
                    style={{ width: '100%' }}
                    placeholder="Tự động nếu trống"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="ui-modal-label">Danh mục</label>
                  <select className="ui-select" style={{ width: '100%' }} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{cleanLabel(c.name)}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '12px' }}>
                <div>
                  <label className="ui-modal-label">Tên món *</label>
                  <input
                    className="ui-input"
                    style={{ width: '100%' }}
                    required
                    placeholder="VD: Trà sữa Oolong nướng"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="ui-modal-label">Trạng thái phục vụ</label>
                  <select
                    className="ui-select"
                    style={{ width: '100%' }}
                    value={Number(form.is_available)}
                    onChange={(e) => setForm({ ...form, is_available: Number(e.target.value) })}
                  >
                    <option value={1}>Đang bán</option>
                    <option value={0}>Tạm hết món</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="ui-modal-label">Mô tả ngắn</label>
                <input
                  className="ui-input"
                  style={{ width: '100%' }}
                  placeholder="Mô tả hương vị đặc trưng của món..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {/* QUẢN LÝ KÍCH CỠ & GIÁ LINH HOẠT */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <label className="ui-modal-label" style={{ marginBottom: 0 }}>Kích cỡ &amp; Giá bán (VNĐ)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleSizePreset('multi')}
                      style={{ background: '#202024', border: '1px solid #2E2E35', color: '#A1A1AA', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      S / M / L
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSizePreset('single')}
                      style={{ background: '#202024', border: '1px solid #2E2E35', color: '#A1A1AA', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      1 giá (Bánh/Hạt)
                    </button>
                    <button
                      type="button"
                      onClick={handleAddSizeRow}
                      style={{ background: 'rgba(217, 119, 6, 0.16)', border: '1px solid rgba(217, 119, 6, 0.4)', color: '#FBBF24', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      + Thêm size
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {form.sizes.map((s, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '105px 1fr auto auto', gap: '8px', alignItems: 'center' }}>
                      <input
                        className="ui-input"
                        placeholder="Size (S/M/L)"
                        value={s.name}
                        onChange={(e) => {
                          const next = form.sizes.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item));
                          setForm({ ...form, sizes: next });
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        className="ui-input ui-money"
                        placeholder="Giá bán"
                        value={s.price}
                        onChange={(e) => {
                          const next = form.sizes.map((item, i) => (i === idx ? { ...item, price: Number(e.target.value) } : item));
                          setForm({ ...form, sizes: next });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSetDefaultSize(idx)}
                        style={{
                          height: '36px', padding: '0 10px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                          background: s.is_default ? 'rgba(217, 119, 6, 0.2)' : '#202024',
                          border: s.is_default ? '1px solid #D97706' : '1px solid #2E2E35',
                          color: s.is_default ? '#FBBF24' : '#71717A',
                        }}
                      >
                        {s.is_default ? 'Mặc định' : 'Đặt mặc định'}
                      </button>
                      {form.sizes.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveSizeRow(idx)}
                          title="Xóa size"
                          style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: '6px' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : <span style={{ width: '27px' }} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ui-modal-footer" style={{ flexShrink: 0 }}>
              <button type="button" className="ui-btn ui-btn-outline" onClick={() => setEditModalOpen(false)}>Hủy</button>
              <button type="submit" className="ui-btn ui-btn-brand" disabled={savingProduct || uploadingImage}>
                {savingProduct ? 'Đang lưu...' : (editingProduct ? 'Lưu thay đổi' : 'Thêm món ngay')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LIGHTBOX XEM ẢNH MÓN CĂN GIỮA MÀN HÌNH */}
      {previewProduct && (
        <div className="ui-modal-backdrop" onClick={() => setPreviewProduct(null)} style={{ zIndex: 1000 }}>
          <div className="ui-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="ui-modal-header">
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#F59E0B', marginRight: '8px' }}>
                  {previewProduct.code}
                </span>
                <span className="ui-modal-title">{previewProduct.name}</span>
              </div>
              <button type="button" className="ui-btn-icon" onClick={() => setPreviewProduct(null)}><X size={15} /></button>
            </div>
            <div style={{
              padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: '12px', background: '#121214',
            }}>
              <div style={{
                width: '100%', aspectRatio: '4 / 3', borderRadius: '14px', overflow: 'hidden',
                border: '1px solid #2A2A30', background: '#18181B',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img
                  src={resolveProductImage(previewProduct.image_url, FALLBACK_IMG)}
                  alt={previewProduct.name}
                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMG; }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }}
                />
              </div>
              {previewProduct.description && (
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#A1A1AA', textAlign: 'center', lineHeight: 1.5 }}>
                  {previewProduct.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
