import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, ShoppingBag, Plus, Minus, Trash2, ArrowRight, Coffee, X, MapPin,
} from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { usePosCart } from '../context/PosCartContext';
 
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80';
 
// Xóa emoji đầu tên danh mục nếu DB còn lưu emoji
const cleanLabel = (str) => String(str || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
 
export default function PosOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    cart, orderMeta, summary,
    addItem, updateQty, removeItem, clearCart, updateMeta, getProductQty,
  } = usePosCart();
 
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
 
  // Lưu size đang chọn trên từng thẻ sản phẩm: { [productId]: sizeObject }
  const [selectedSizes, setSelectedSizes] = useState({});
  // Ngăn kéo xem nhanh giỏ hàng trước khi chuyển trang thanh toán
  const [quickCartOpen, setQuickCartOpen] = useState(false);
 
  // Nhận tham số bàn từ Sơ đồ bàn (?table_id=...&table_code=...)
  useEffect(() => {
    const qTableId = searchParams.get('table_id');
    const qTableCode = searchParams.get('table_code');
    const qName = searchParams.get('customer_name');
    const qPhone = searchParams.get('customer_phone');
    if (qTableId) {
      updateMeta({
        orderType: 'dine_in',
        tableId: qTableId,
        tableCode: qTableCode || `Bàn #${qTableId}`,
        ...(qName ? { customerName: qName } : {}),
        ...(qPhone ? { customerPhone: qPhone } : {}),
      });
    }
  }, [searchParams]);
 
  // Tải thực đơn & danh mục
  useEffect(() => {
    const loadMenu = async () => {
      try {
        setLoading(true);
        const res = await api.get('/products');
        const payload = res.data?.data || {};
        const prods = Array.isArray(payload.products) ? payload.products : [];
        const cats = Array.isArray(payload.categories) ? payload.categories : [];
        setProducts(prods);
        setCategories(cats);
 
        // Khởi tạo size mặc định (ưu tiên is_default hoặc Size M)
        const initSizes = {};
        prods.forEach((p) => {
          const sizes = p.sizes || [];
          const def = sizes.find((s) => s.is_default) || sizes.find((s) => (s.name || s.size) === 'M') || sizes[0];
          if (def) initSizes[p.id] = def;
        });
        setSelectedSizes(initSizes);
      } catch {
        toast.error('Không thể tải danh sách thực đơn');
      } finally {
        setLoading(false);
      }
    };
    loadMenu();
  }, []);
 
  // Phím tắt F9 chuyển thẳng sang trang Thanh toán
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F9') {
        e.preventDefault();
        if (summary.totalItems > 0) navigate('/pos/checkout');
        else toast.error('Giỏ hàng đang trống, hãy chọn ít nhất 1 món!');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [summary.totalItems, navigate]);
 
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || String(p.category_id) === String(selectedCategory);
      const matchSearch =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, search]);
 
  const handleQuickAdd = (product) => {
    const activeSize = selectedSizes[product.id] || product.sizes?.[0] || { id: null, name: 'M', price: product.price || 0 };
    addItem(product, activeSize, 1, '');
    toast.success(`Đã thêm ${product.name}${activeSize.name && activeSize.name !== 'Tiêu chuẩn' ? ` (${activeSize.name})` : ''}`, { duration: 1400 });
  };
 
  return (
    <div className="pos-full-page">
      <style>{`
        .pos-full-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-bottom: ${summary.totalItems > 0 ? '96px' : '24px'};
          width: 100%;
          min-width: 0;
        }
        .pos-topbar-filter {
          background: #18181B;
          border: 1px solid #2A2A30;
          border-radius: 16px;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pos-filter-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .pos-search-box {
          position: relative;
          flex: 1;
          min-width: 240px;
          max-width: 420px;
        }
        .pos-search-box input {
          width: 100%;
          height: 40px;
          background: #121214;
          border: 1px solid #2E2E35;
          border-radius: 11px;
          padding: 0 14px 0 38px;
          color: #F4F1EC;
          font-size: 0.85rem;
          outline: none;
        }
        .pos-search-box input:focus {
          border-color: #D97706;
          box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.14);
        }
        .pos-cat-strip {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pos-cat-btn {
          padding: 7px 14px;
          border-radius: 999px;
          border: 1px solid #2A2A30;
          background: #202024;
          color: #A1A1AA;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .pos-cat-btn:hover { color: #F4F1EC; border-color: #3F3F46; }
        .pos-cat-btn.active {
          background: #D97706;
          border-color: #D97706;
          color: #FFFFFF;
          font-weight: 700;
        }
 
        /* LƯỚI THỰC ĐƠN TOÀN MÀN HÌNH 4-5 CỘT RỘNG THOÁNG */
        .pos-full-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
          grid-auto-rows: max-content;
          gap: 16px;
          width: 100%;
        }
        .pos-item-card {
          background: #18181B;
          border: 1px solid #2A2A30;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .pos-item-card:hover {
          transform: translateY(-3px);
          border-color: rgba(217, 119, 6, 0.6);
          box-shadow: 0 14px 28px rgba(0, 0, 0, 0.35);
        }
        .pos-item-thumb-wrap {
          position: relative;
          width: 100%;
          height: 156px;
          overflow: hidden;
          background: #121214;
          flex-shrink: 0;
        }
        .pos-item-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.32s ease;
        }
        .pos-item-card:hover .pos-item-thumb { transform: scale(1.05); }
 
        .pos-size-pill {
          padding: 4px 10px;
          border-radius: 7px;
          font-size: 0.72rem;
          font-weight: 700;
          border: 1px solid #2E2E35;
          background: #121214;
          color: #A1A1AA;
          cursor: pointer;
          transition: all 0.14s ease;
        }
        .pos-size-pill.active {
          background: rgba(217, 119, 6, 0.16);
          border-color: #D97706;
          color: #FBBF24;
        }
 
        /* THANH GIỎ HÀNG NỔI PHÍA DƯỚI CHUẨN APP F&B HIỆN ĐẠI */
        .pos-floating-cart {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: calc(100% - 280px);
          max-width: 820px;
          background: #1E140E;
          border: 1px solid rgba(217, 119, 6, 0.55);
          border-radius: 18px;
          padding: 12px 18px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          z-index: 60;
        }
        @media (max-width: 1024px) {
          .pos-floating-cart { width: calc(100% - 32px); left: 50%; }
        }
      `}</style>
 
      {/* 1. THANH CÔNG CỤ TÌM KIẾM, BÀN ĐANG CHỌN & NÚT GIỎ HÀNG */}
      <div className="pos-topbar-filter">
        <div className="pos-filter-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
            <div className="pos-search-box">
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717A' }} />
              <input
                type="text"
                placeholder="Tìm tên đồ uống, mã món (CF01, TR02)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
 
            {orderMeta.tableCode && orderMeta.orderType === 'dine_in' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(217, 119, 6, 0.14)', border: '1px solid rgba(217, 119, 6, 0.35)',
                color: '#FBBF24', padding: '6px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700
              }}>
                <MapPin size={14} /> Đang chọn: {orderMeta.tableCode}
              </span>
            )}
          </div>
 
          {/* Nút Giỏ hàng trên góc phải luôn sẵn sàng */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setQuickCartOpen(true)}
              style={{
                height: '40px', padding: '0 14px', borderRadius: '11px',
                background: '#202024', border: '1px solid #2E2E35', color: '#F4F1EC',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '8px'
              }}
            >
              <ShoppingBag size={16} color="#F59E0B" />
              <span>Giỏ hàng ({summary.totalItems})</span>
            </button>
 
            <button
              type="button"
              disabled={summary.totalItems === 0}
              onClick={() => navigate('/pos/checkout')}
              style={{
                height: '40px', padding: '0 18px', borderRadius: '11px', border: 'none',
                background: summary.totalItems > 0 ? '#D97706' : '#27272B',
                color: summary.totalItems > 0 ? '#FFFFFF' : '#71717A',
                fontSize: '0.83rem', fontWeight: 700,
                cursor: summary.totalItems > 0 ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: '7px'
              }}
            >
              <span>Thanh toán</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
 
        {/* Dải lọc Danh mục không emoji */}
        <div className="pos-cat-strip">
          <button
            type="button"
            className={`pos-cat-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Tất cả ({products.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`pos-cat-btn ${String(selectedCategory) === String(c.id) ? 'active' : ''}`}
              onClick={() => setSelectedCategory(String(c.id))}
            >
              {cleanLabel(c.name)}
            </button>
          ))}
        </div>
      </div>
 
      {/* 2. LƯỚI SẢN PHẨM TOÀN MÀN HÌNH (4 - 5 CỘT RỘNG THOÁNG) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#A1A1AA' }}>Đang tải thực đơn quán...</div>
      ) : filteredProducts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '64px 20px', background: '#18181B',
          borderRadius: '16px', border: '1px solid #2A2A30', color: '#A1A1AA'
        }}>
          <Coffee size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
          <div>Không tìm thấy đồ uống phù hợp với từ khóa "{search}".</div>
        </div>
      ) : (
        <div className="pos-full-grid">
          {filteredProducts.map((p) => {
            const sizes = p.sizes || [];
            const activeSize = selectedSizes[p.id] || sizes[0] || { id: null, name: 'M', price: p.price || 0 };
            const qtyInCart = getProductQty(p.id);
            const hasMultiSizes = sizes.length > 1;
 
            return (
              <article key={p.id} className="pos-item-card">
                <div className="pos-item-thumb-wrap" onClick={() => handleQuickAdd(p)} style={{ cursor: 'pointer' }}>
                  <img
                    src={p.image_url || FALLBACK_IMG}
                    alt={p.name}
                    className="pos-item-thumb"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMG; }}
                  />
                  {p.code && (
                    <span style={{
                      position: 'absolute', top: '10px', left: '10px',
                      background: 'rgba(18, 18, 20, 0.78)', backdropFilter: 'blur(6px)',
                      color: '#F4F1EC', fontSize: '0.7rem', fontWeight: 700,
                      padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)'
                    }}>
                      {p.code}
                    </span>
                  )}
                  {qtyInCart > 0 && (
                    <span style={{
                      position: 'absolute', top: '10px', right: '10px',
                      background: '#D97706', color: '#FFFFFF',
                      fontSize: '0.74rem', fontWeight: 800,
                      padding: '3px 10px', borderRadius: '999px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                    }}>
                      {qtyInCart} trong giỏ
                    </span>
                  )}
                </div>
 
                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '0.94rem', fontWeight: 700, color: '#F4F1EC', lineHeight: 1.3 }}>
                      {p.name}
                    </h3>
                    <p style={{
                      margin: 0, fontSize: '0.76rem', color: '#A1A1AA', lineHeight: 1.4,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '32px'
                    }}>
                      {p.description || 'Pha chế chuẩn vị tại My Coffee House'}
                    </p>
                  </div>
 
                  {/* Chọn nhanh Size (chỉ hiển thị khi món có từ 2 size trở lên) */}
                  {hasMultiSizes && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {sizes.map((s) => {
                        const isSelected = activeSize?.id === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`pos-size-pill ${isSelected ? 'active' : ''}`}
                            onClick={() => setSelectedSizes((prev) => ({ ...prev, [p.id]: s }))}
                          >
                            Size {s.name || s.size}
                          </button>
                        );
                      })}
                    </div>
                  )}
 
                  {/* Giá bán & Nút Thêm vào giỏ */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: '10px', borderTop: '1px solid #26262B'
                  }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#F59E0B' }}>
                      {fmt(activeSize?.price || 0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(p)}
                      style={{
                        background: '#D97706', color: '#FFFFFF', border: 'none',
                        padding: '7px 14px', borderRadius: '9px', fontSize: '0.8rem', fontWeight: 700,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'
                      }}
                    >
                      <Plus size={15} /> Thêm
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
 
      {/* 3. THANH GIỎ HÀNG NỔI CẠNH DƯỚI (HIỆN KHI CÓ MÓN TRONG GIỎ) */}
      {summary.totalItems > 0 && (
        <div className="pos-floating-cart">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setQuickCartOpen(true)}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'rgba(217, 119, 6, 0.2)', border: '1px solid rgba(217, 119, 6, 0.45)',
              color: '#FBBF24', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <ShoppingBag size={19} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF' }}>
                {summary.totalItems} món trong giỏ hàng
                {orderMeta.tableCode && orderMeta.orderType === 'dine_in' ? ` • ${orderMeta.tableCode}` : ''}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#D6C7B8' }}>
                Bấm để xem nhanh hoặc chuyển sang trang thanh toán
              </div>
            </div>
          </div>
 
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#B09884' }}>Tạm tính</div>
              <div style={{ fontSize: '1.12rem', fontWeight: 800, color: '#FBBF24' }}>{fmt(summary.subtotal)}</div>
            </div>
 
            <button
              type="button"
              onClick={() => navigate('/pos/checkout')}
              style={{
                background: '#D97706', color: '#FFFFFF', border: 'none',
                height: '42px', padding: '0 20px', borderRadius: '12px',
                fontSize: '0.86rem', fontWeight: 800, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap'
              }}
            >
              <span>Thanh toán (F9)</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
 
      {/* 4. NGĂN KÉO XEM NHANH GIỎ HÀNG (SLIDE-OVER MINI CART) */}
      {quickCartOpen && (
        <div
          onClick={() => setQuickCartOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)',
            backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', justifyContent: 'flex-end'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '420px', height: '100vh',
              background: '#18181B', borderLeft: '1px solid #2A2A30',
              display: 'flex', flexDirection: 'column', color: '#F4F1EC'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>Giỏ hàng đã chọn ({summary.totalItems})</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {cart.length > 0 && (
                  <button type="button" onClick={clearCart} style={{ background: 'none', border: 'none', color: '#F87171', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                    Xóa hết
                  </button>
                )}
                <button type="button" onClick={() => setQuickCartOpen(false)} style={{ background: '#26262B', border: 'none', color: '#F4F1EC', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>
            </div>
 
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 10px', color: '#71717A', fontSize: '0.86rem' }}>
                  Chưa có món nào trong giỏ hàng.
                </div>
              ) : cart.map((item) => (
                <div key={item.key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                  padding: '12px', borderRadius: '12px', background: '#202024', border: '1px solid #2A2A30'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#F4F1EC' }}>{item.name}</div>
                    <div style={{ fontSize: '0.74rem', color: '#A1A1AA', marginTop: '2px' }}>
                      {item.size_name && item.size_name !== 'Tiêu chuẩn' ? `Size ${item.size_name} • ` : ''}{fmt(item.price)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button type="button" onClick={() => updateQty(item.key, -1)} style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#121214', border: '1px solid #32323A', color: '#F4F1EC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Minus size={13} />
                    </button>
                    <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem' }}>{item.quantity}</span>
                    <button type="button" onClick={() => updateQty(item.key, 1)} style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#121214', border: '1px solid #32323A', color: '#F4F1EC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={13} />
                    </button>
                    <button type="button" onClick={() => removeItem(item.key)} style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', padding: '4px' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
 
            <div style={{ padding: '16px 20px', borderTop: '1px solid #27272B', background: '#141417' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'baseline' }}>
                <span style={{ color: '#A1A1AA', fontSize: '0.86rem' }}>Tạm tính</span>
                <span style={{ color: '#F59E0B', fontSize: '1.18rem', fontWeight: 800 }}>{fmt(summary.subtotal)}</span>
              </div>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => { setQuickCartOpen(false); navigate('/pos/checkout'); }}
                style={{
                  width: '100%', height: '44px', borderRadius: '11px', border: 'none',
                  background: cart.length > 0 ? '#D97706' : '#27272B',
                  color: '#FFFFFF', fontWeight: 800, fontSize: '0.9rem', cursor: cart.length > 0 ? 'pointer' : 'not-allowed'
                }}
              >
                Chuyển sang trang Thanh toán →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}