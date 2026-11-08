import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function CustomerPortal() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | 'vouchers' | 'history' | 'about'
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vouchers, setVouchers] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories')
      ]);
      setProducts(prodRes.data?.data || []);
      setCategories(catRes.data?.data || []);

      // Lấy voucher
      try {
        const promoRes = await api.get('/promotions/active');
        setVouchers(promoRes.data?.data || []);
      } catch (err) {
        console.warn('Could not load promotions:', err);
      }

      // Lấy lịch sử đơn hàng
      try {
        const historyRes = await api.get('/orders/my-history');
        setOrderHistory(historyRes.data?.data || []);
      } catch (err) {
        console.warn('Could not load order history:', err);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Không thể tải thực đơn. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(`Đã sao chép mã [${code}]! Đưa mã cho Thu ngân khi thanh toán để được giảm giá ✨`);
  };

  // Lọc sản phẩm theo danh mục và từ khóa tìm kiếm
  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'all' || String(p.category_id) === String(selectedCategory);
    const matchSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  const customerInfo = user?.customer_info || {};
  const points = customerInfo.points_balance || 0;
  const tierName = customerInfo.tier_name || 'Đồng';
  const discountPct = Number(customerInfo.discount_pct || 0);

  const getTierBadge = (t) => {
    switch (t) {
      case 'Kim Cương':
        return { label: '💎 Hạng Kim Cương', color: '#06b6d4', bg: 'linear-gradient(135deg, #083344, #164e63)', border: '#22d3ee' };
      case 'Vàng':
        return { label: '🥇 Hạng Vàng', color: '#f59e0b', bg: 'linear-gradient(135deg, #451a03, #78350f)', border: '#f59e0b' };
      case 'Bạc':
        return { label: '🥈 Hạng Bạc', color: '#94a3b8', bg: 'linear-gradient(135deg, #1e293b, #334155)', border: '#94a3b8' };
      default:
        return { label: '🥉 Hạng Đồng', color: '#d97706', bg: 'linear-gradient(135deg, #2a1508, #451a03)', border: '#b45309' };
    }
  };
  const tierStyle = getTierBadge(tierName);

  return (
    <div style={{ minHeight: '100vh', background: '#130c08', color: '#f5efe6', paddingBottom: '60px' }}>
      {/* 1. TOP HEADER & GREETING */}
      <div style={{
        background: 'linear-gradient(180deg, #24140b 0%, #170d07 100%)',
        borderBottom: '1px solid #3d2314',
        padding: '24px 20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.8rem' }}>☕</span>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#fde68a', fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>
                  MY COFFEE HOUSE • THÀNH VIÊN
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#d4b094' }}>
                  Xin chào, <strong style={{ color: '#fff' }}>{user?.full_name || 'Quý khách'}</strong>! Chúc bạn một ngày tràn đầy năng lượng!
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/')}
                style={{
                  background: '#b45309',
                  border: '1px solid #d97706',
                  color: '#fff',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 700
                }}
              >
                👑 Về Bàn Quản Lý
              </button>
            )}
            <button
              onClick={() => { refreshUser(); toast.success('Đã làm mới thông tin tài khoản!'); }}
              title="Làm mới điểm"
              style={{
                background: '#2b170c',
                border: '1px solid #5a341e',
                color: '#fde68a',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🔄 Cập nhật điểm
            </button>
            <button
              onClick={logout}
              style={{
                background: '#451a03',
                border: '1px solid #78350f',
                color: '#fca5a5',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              Đăng xuất
            </button>
          </div>
        </div>

        {/* 2. VIP MEMBERSHIP CARD (THẺ HỘI VIÊN SỐ ĐIỆN TỬ) */}
        <div style={{ maxWidth: '1200px', margin: '20px auto 0' }}>
          <div style={{
            background: tierStyle.bg,
            border: `2px solid ${tierStyle.border}`,
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            alignItems: 'center'
          }}>
            <div>
              <div style={{
                display: 'inline-block',
                background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${tierStyle.color}`,
                color: tierStyle.color,
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {tierStyle.label}
              </div>
              <h2 style={{ margin: '8px 0 2px', fontSize: '1.3rem', color: '#fff' }}>
                {user?.full_name || 'Khách hàng'}
              </h2>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                📱 SĐT: <strong style={{ color: '#fde68a' }}>{user?.phone || user?.username}</strong>
              </div>
            </div>

            {/* Loyalty points display */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#d4b094', textTransform: 'uppercase' }}>Điểm tích lũy</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: '2px 0' }}>
                {points.toLocaleString('vi-VN')} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>điểm</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                ≈ {(points * 100).toLocaleString('vi-VN')} đ (Dùng trừ thẳng vào hóa đơn)
              </div>
            </div>

            {/* Discount privilege */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#d4b094', textTransform: 'uppercase' }}>Đặc quyền giảm giá</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', margin: '2px 0' }}>
                {discountPct > 0 ? `-${discountPct}%` : 'Chuẩn giá'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {discountPct > 0 ? 'Tự động giảm trên mọi đơn hàng' : 'Tích thêm điểm để nâng hạng'}
              </div>
            </div>

            {/* Gift banner */}
            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px dashed #f59e0b',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '0.8rem',
              color: '#fef3c7',
              lineHeight: 1.4
            }}>
              🎁 <strong>Mẹo tích điểm:</strong> Cung cấp SĐT cho thu ngân mỗi khi gọi món tại quầy để tự động tích 1 điểm cho mỗi 10.000đ chi tiêu!
            </div>
          </div>
        </div>
      </div>

      {/* 3. NAVIGATION TABS */}
      <div style={{ maxWidth: '1200px', margin: '20px auto 0', padding: '0 20px' }}>
        <div style={{
          display: 'flex',
          gap: '10px',
          borderBottom: '2px solid #2b170c',
          paddingBottom: '10px',
          overflowX: 'auto'
        }}>
          {[
            { id: 'menu', label: '☕ Thực Đơn Quán', count: filteredProducts.length },
            { id: 'vouchers', label: '🎁 Mã Khuyến Mãi', count: vouchers.length },
            { id: 'history', label: '📜 Lịch Sử Mua Hàng', count: orderHistory.length },
            { id: 'about', label: '📍 Thông Tin Quán' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? '#d97706' : '#1f130b',
                color: activeTab === tab.id ? '#ffffff' : '#d4b094',
                border: activeTab === tab.id ? '1px solid #f59e0b' : '1px solid #3d2314',
                padding: '10px 18px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease'
              }}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span style={{
                  background: activeTab === tab.id ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.1)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75rem'
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 4. MAIN TAB CONTENT */}
      <div style={{ maxWidth: '1200px', margin: '20px auto 0', padding: '0 20px' }}>
        {/* TAB 1: THỰC ĐƠN QUÁN */}
        {activeTab === 'menu' && (
          <div>
            {/* Search & Category Filter */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  onClick={() => setSelectedCategory('all')}
                  style={{
                    background: selectedCategory === 'all' ? '#b45309' : '#23140a',
                    color: selectedCategory === 'all' ? '#fff' : '#d4b094',
                    border: '1px solid #3d2314',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: selectedCategory === 'all' ? 700 : 500
                  }}
                >
                  Tất cả ({products.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{
                      background: String(selectedCategory) === String(cat.id) ? '#b45309' : '#23140a',
                      color: String(selectedCategory) === String(cat.id) ? '#fff' : '#d4b094',
                      border: '1px solid #3d2314',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: String(selectedCategory) === String(cat.id) ? 700 : 500
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative', minWidth: '260px' }}>
                <input
                  type="text"
                  placeholder="🔍 Tìm tên món, cà phê, trà..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#23140a',
                    border: '1px solid #4a2815',
                    color: '#fff',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#d4b094' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>☕</div>
                <div>Đang tải danh sách đồ uống hảo hạng...</div>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', background: '#1c1008', borderRadius: '12px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔍</div>
                <div>Không tìm thấy món ăn/đồ uống phù hợp với từ khóa của bạn.</div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
                gap: '20px'
              }}>
                {filteredProducts.map((p) => {
                  const sizes = p.sizes || [];
                  const defaultPrice = sizes.length > 0 ? sizes[0].price : (p.price || 0);

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: '#1d1109',
                        border: '1px solid #382012',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.2s, box-shadow 0.2s'
                      }}
                    >
                      {/* Product Image */}
                      <div style={{ position: 'relative', width: '100%', height: '180px', overflow: 'hidden', background: '#2a160b' }}>
                        <img
                          src={p.image_url || 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80'}
                          alt={p.name}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=400&auto=format&fit=crop&q=80';
                          }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {p.category_name && (
                          <span style={{
                            position: 'absolute',
                            top: '10px',
                            left: '10px',
                            background: 'rgba(0,0,0,0.7)',
                            backdropFilter: 'blur(4px)',
                            color: '#fde68a',
                            fontSize: '0.72rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(245, 158, 11, 0.4)'
                          }}>
                            {p.category_name}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff', fontWeight: 700 }}>
                              {p.name}
                            </h3>
                            {p.code && (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: '#29160c', padding: '2px 6px', borderRadius: '4px' }}>
                                {p.code}
                              </span>
                            )}
                          </div>

                          <p style={{ margin: '8px 0 12px', fontSize: '0.8rem', color: '#d4b094', lineHeight: 1.4, minHeight: '36px' }}>
                            {p.description || 'Thức uống được pha chế từ nguyên liệu sạch, tươi ngon đặc trưng của quán.'}
                          </p>
                        </div>

                        <div>
                          {/* Sizes & Prices list */}
                          <div style={{
                            background: '#24140b',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            marginBottom: '10px',
                            border: '1px solid #3d2314'
                          }}>
                            <div style={{ fontSize: '0.7rem', color: '#a8a29e', textTransform: 'uppercase', marginBottom: '4px' }}>Giá theo kích thước:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {sizes.length > 0 ? (
                                sizes.map((s, idx) => (
                                  <div key={idx} style={{ fontSize: '0.8rem', color: '#fde68a' }}>
                                    <strong style={{ color: '#fff' }}>Size {s.size}:</strong> {Number(s.price).toLocaleString('vi-VN')} đ
                                  </div>
                                ))
                              ) : (
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b' }}>
                                  {Number(defaultPrice).toLocaleString('vi-VN')} đ
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>✓</span> Phục vụ tại chỗ hoặc mang về
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: KHUYẾN MÃI & MÃ GIẢM GIÁ */}
        {activeTab === 'vouchers' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#fde68a' }}>
                🎁 Mã Khuyến Mãi Đang Áp Dụng
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#d4b094' }}>
                Đọc mã khuyến mãi này cho nhân viên thu ngân hoặc nhập khi đặt hàng để nhận giảm giá ngay lập tức!
              </p>
            </div>

            {vouchers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', background: '#1c1008', borderRadius: '12px', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎫</div>
                <div>Hiện chưa có mã giảm giá chung nào đang phát hành. Hãy kiểm tra lại sau nhé!</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {vouchers.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      background: 'linear-gradient(135deg, #24140b 0%, #1a0e07 100%)',
                      border: '2px dashed #f59e0b',
                      borderRadius: '12px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.4)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{
                          background: '#b45309',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '1rem',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          letterSpacing: '1px'
                        }}>
                          {v.code}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>
                          ● ĐANG HOẠT ĐỘNG
                        </span>
                      </div>

                      <h4 style={{ margin: '0 0 6px', fontSize: '1.05rem', color: '#fff' }}>
                        {v.name}
                      </h4>
                      <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#d4b094', lineHeight: 1.4 }}>
                        {v.description || 'Ưu đãi dành cho tất cả quý khách hàng thân thiết.'}
                      </p>

                      <div style={{ fontSize: '0.75rem', color: '#a8a29e', borderTop: '1px solid #382012', paddingTop: '8px' }}>
                        <div>Đơn tối thiểu: <strong>{Number(v.min_order_value || 0).toLocaleString('vi-VN')} đ</strong></div>
                        {v.max_discount && <div>Giảm tối đa: <strong>{Number(v.max_discount).toLocaleString('vi-VN')} đ</strong></div>}
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopyCode(v.code)}
                      style={{
                        marginTop: '16px',
                        background: '#d97706',
                        color: '#fff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      📋 Sao Chép Mã Voucher
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LỊCH SỬ ĐƠN HÀNG */}
        {activeTab === 'history' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#fde68a' }}>
                📜 Lịch Sử Đơn Hàng Của Bạn
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#d4b094' }}>
                Theo dõi các hóa đơn và điểm thưởng đã tích lũy gắn liền với số điện thoại {user?.phone || user?.username}.
              </p>
            </div>

            {orderHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', background: '#1c1008', borderRadius: '12px', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>☕</div>
                <div>Bạn chưa có đơn hàng nào tại quán. Hãy ghé quán thưởng thức đồ uống ngon tuyệt nhé!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {orderHistory.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      background: '#1d1109',
                      border: '1px solid #382012',
                      borderRadius: '10px',
                      padding: '16px 20px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 700, color: '#fde68a', fontSize: '1rem' }}>
                          #{o.code}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: o.payment_status === 'paid' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: o.payment_status === 'paid' ? '#10b981' : '#ef4444',
                          border: `1px solid ${o.payment_status === 'paid' ? '#10b981' : '#ef4444'}`
                        }}>
                          {o.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#a8a29e', marginTop: '4px' }}>
                        Thời gian: {new Date(o.opened_at).toLocaleString('vi-VN')} {o.table_code ? `• Bàn: ${o.table_code}` : '• Mang về'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                        {Number(o.total || 0).toLocaleString('vi-VN')} đ
                      </div>
                      {o.discount_total > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#10b981' }}>
                          Đã giảm: -{Number(o.discount_total).toLocaleString('vi-VN')} đ
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: THÔNG TIN QUÁN & LIÊN HỆ */}
        {activeTab === 'about' && (
          <div style={{
            background: '#1d1109',
            border: '1px solid #382012',
            borderRadius: '16px',
            padding: '30px 24px',
            maxWidth: '800px',
            margin: '0 auto'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '8px' }}>☕</div>
              <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#f59e0b', fontSize: '1.6rem' }}>
                MY COFFEE HOUSE
              </h2>
              <p style={{ margin: '4px 0 0', color: '#d4b094', fontStyle: 'italic', fontSize: '0.9rem' }}>
                ~ Good coffee – Good day ~
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <div style={{ background: '#24140b', padding: '16px', borderRadius: '10px', border: '1px solid #3d2314' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>📍 Địa Chỉ Quán</div>
                <div style={{ fontSize: '0.88rem', color: '#fff', fontWeight: 600 }}>123 Đường Cà Phê, Quận 1</div>
                <div style={{ fontSize: '0.8rem', color: '#a8a29e' }}>Thành phố Hồ Chí Minh</div>
              </div>

              <div style={{ background: '#24140b', padding: '16px', borderRadius: '10px', border: '1px solid #3d2314' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>⏰ Giờ Mở Cửa</div>
                <div style={{ fontSize: '0.88rem', color: '#fff', fontWeight: 600 }}>06:30 – 23:00 Hàng ngày</div>
                <div style={{ fontSize: '0.8rem', color: '#a8a29e' }}>Phục vụ cả các ngày lễ Tết</div>
              </div>

              <div style={{ background: '#24140b', padding: '16px', borderRadius: '10px', border: '1px solid #3d2314' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>📶 Wi-Fi Quán</div>
                <div style={{ fontSize: '0.88rem', color: '#fde68a', fontWeight: 700 }}>MyCoffeeHouse_5G</div>
                <div style={{ fontSize: '0.8rem', color: '#a8a29e' }}>Mật khẩu: <code>coffeehouse123</code></div>
              </div>

              <div style={{ background: '#24140b', padding: '16px', borderRadius: '10px', border: '1px solid #3d2314' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>📞 Hotline Đặt Bàn</div>
                <div style={{ fontSize: '1rem', color: '#10b981', fontWeight: 800 }}>1900 1234</div>
                <div style={{ fontSize: '0.8rem', color: '#a8a29e' }}>Hỗ trợ tư vấn & đặt bàn trước</div>
              </div>
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              fontSize: '0.85rem',
              color: '#fde68a'
            }}>
              ❤️ Cảm ơn bạn đã luôn đồng hành cùng <strong>MY COFFEE HOUSE</strong>. Mọi góp ý và phản hồi của quý khách là động lực to lớn để quán ngày một hoàn thiện hơn!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
