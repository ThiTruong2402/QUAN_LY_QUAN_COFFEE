import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import socket from '../api/socket';
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
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- STATE ĐẶT MÓN & CHỌN SIZE ---
  const [selectedProductForSize, setSelectedProductForSize] = useState(null); // Món đang mở modal chọn size
  const [modalSelectedSize, setModalSelectedSize] = useState(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [modalNote, setModalNote] = useState('');

  // --- STATE GIỎ HÀNG & CHECKOUT ---
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('customer_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [orderType, setOrderType] = useState('dine_in'); // 'dine_in' | 'takeaway'
  const [selectedTableId, setSelectedTableId] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherCodeInput, setVoucherCodeInput] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer'); // 'bank_transfer' | 'cash'
  const [orderGeneralNote, setOrderGeneralNote] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Lưu giỏ hàng vào localStorage
  useEffect(() => {
    try {
      localStorage.setItem('customer_cart', JSON.stringify(cart));
    } catch (e) {
      console.warn('Could not save cart to localStorage', e);
    }
  }, [cart]);

  // Lấy dữ liệu ban đầu
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Lắng nghe Socket.IO thời gian thực để cập nhật đơn hàng ngay khi Quầy/Barista thao tác
  useEffect(() => {
    const handleOrderSync = () => {
      loadOrderHistory();
      refreshUser();
    };

    socket.on('order:created', handleOrderSync);
    socket.on('order:status_updated', handleOrderSync);
    socket.on('barista:item_updated', handleOrderSync);
    socket.on('order:cancelled', handleOrderSync);

    const interval = setInterval(loadOrderHistory, 15000); // Polling dự phòng 15s

    return () => {
      clearInterval(interval);
      socket.off('order:created', handleOrderSync);
      socket.off('order:status_updated', handleOrderSync);
      socket.off('barista:item_updated', handleOrderSync);
      socket.off('order:cancelled', handleOrderSync);
    };
  }, []);

  const loadOrderHistory = async () => {
    try {
      const historyRes = await api.get('/orders/my-history');
      const rawHistory = historyRes.data?.data;
      setOrderHistory(Array.isArray(rawHistory) ? rawHistory : []);
    } catch (err) {
      console.warn('Could not load order history:', err);
    }
  };

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes, tablesRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/tables').catch(() => ({ data: { data: [] } }))
      ]);

      const rawProducts = prodRes.data?.data?.products || (Array.isArray(prodRes.data?.data) ? prodRes.data.data : []);
      const rawCategories = Array.isArray(catRes.data?.data) ? catRes.data.data : (prodRes.data?.data?.categories || []);
      const rawTables = tablesRes.data?.data?.tables || (Array.isArray(tablesRes.data?.data) ? tablesRes.data.data : []);

      setProducts(Array.isArray(rawProducts) ? rawProducts : []);
      setCategories(Array.isArray(rawCategories) ? rawCategories : []);
      setTables(Array.isArray(rawTables) ? rawTables : []);

      // Mặc định chọn bàn đầu tiên nếu có
      if (Array.isArray(rawTables) && rawTables.length > 0) {
        setSelectedTableId(String(rawTables[0].id));
      }

      // Lấy voucher
      try {
        const promoRes = await api.get('/promotions/active');
        const rawPromos = promoRes.data?.data;
        setVouchers(Array.isArray(rawPromos) ? rawPromos : []);
      } catch (err) {
        console.warn('Could not load promotions:', err);
        setVouchers([]);
      }

      // Lấy lịch sử đơn
      await loadOrderHistory();
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Không thể tải thực đơn. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  // --- XỬ LÝ CHỌN SIZE & THÊM VÀO GIỎ ---
  const handleOpenSizeModal = (product) => {
    setSelectedProductForSize(product);
    const sizes = product.sizes || [];
    if (sizes.length > 0) {
      // Ưu tiên size M hoặc size mặc định
      const defaultSize = sizes.find(s => s.is_default) || sizes.find(s => s.size === 'M') || sizes[0];
      setModalSelectedSize(defaultSize);
    } else {
      setModalSelectedSize({
        id: null,
        size: 'Tiêu chuẩn',
        price: product.price || 0
      });
    }
    setModalQuantity(1);
    setModalNote('');
  };

  const handleCloseSizeModal = () => {
    setSelectedProductForSize(null);
    setModalSelectedSize(null);
    setModalQuantity(1);
    setModalNote('');
  };

  const handleAddToCart = () => {
    if (!selectedProductForSize || !modalSelectedSize) return;

    const unitPrice = Number(modalSelectedSize.price || selectedProductForSize.price || 0);
    const cartItemId = `${selectedProductForSize.id}-${modalSelectedSize.id || modalSelectedSize.size}-${modalNote.trim()}`;

    setCart(prevCart => {
      const existingIdx = prevCart.findIndex(item => item.cartItemId === cartItemId);
      if (existingIdx > -1) {
        const updated = [...prevCart];
        updated[existingIdx].quantity += modalQuantity;
        return updated;
      } else {
        return [
          ...prevCart,
          {
            cartItemId,
            product_id: selectedProductForSize.id,
            product_size_id: modalSelectedSize.id || null,
            name: selectedProductForSize.name,
            size_name: modalSelectedSize.size || modalSelectedSize.name || 'M',
            price: unitPrice,
            quantity: modalQuantity,
            note: modalNote.trim(),
            image_url: selectedProductForSize.image_url
          }
        ];
      }
    });

    toast.success(`Đã thêm "${selectedProductForSize.name} (${modalSelectedSize.size})" vào giỏ hàng! ☕`);
    handleCloseSizeModal();
  };

  const handleUpdateCartQuantity = (cartItemId, delta) => {
    setCart(prevCart => {
      return prevCart
        .map(item => {
          if (item.cartItemId === cartItemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  const handleRemoveFromCart = (cartItemId) => {
    setCart(prevCart => prevCart.filter(item => item.cartItemId !== cartItemId));
    toast.success('Đã xóa món khỏi giỏ hàng');
  };

  const handleClearCart = () => {
    setCart([]);
    toast.success('Đã làm trống giỏ hàng');
  };

  // --- TÍNH TOÁN TIỀN TỆ & GIẢM GIÁ ---
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Tính voucher
  let voucherDiscount = 0;
  if (appliedVoucher) {
    const minOrder = Number(appliedVoucher.min_order_value || 0);
    if (cartSubtotal >= minOrder) {
      const promoVal = Number(appliedVoucher.value ?? appliedVoucher.discount_value ?? 0);
      const isPercentage = appliedVoucher.type === 'percent_order' || appliedVoucher.type === 'percentage' || appliedVoucher.discount_type === 'percentage';
      if (isPercentage) {
        voucherDiscount = Math.round((cartSubtotal * promoVal) / 100);
        if (appliedVoucher.max_discount) {
          voucherDiscount = Math.min(voucherDiscount, Number(appliedVoucher.max_discount));
        }
      } else {
        voucherDiscount = Math.min(cartSubtotal, promoVal);
      }
    }
  }

  // Thông tin hội viên
  const customerInfo = user?.customer_info || {};
  const currentPoints = customerInfo.points_balance || 0;
  const tierName = customerInfo.tier_name || 'Đồng';
  const discountPct = Number(customerInfo.discount_pct || 0);

  // Hạng thành viên tự động giảm giá % (nếu có đặc quyền hạng)
  const tierDiscount = discountPct > 0 ? Math.round(((cartSubtotal - voucherDiscount) * discountPct) / 100) : 0;

  // Tính điểm tích lũy dùng giảm giá (1 điểm = 100đ)
  const subtotalAfterPromo = Math.max(0, cartSubtotal - voucherDiscount - tierDiscount);
  const maxRedeemablePoints = Math.min(currentPoints, Math.floor(subtotalAfterPromo / 100));
  const effectivePointsToRedeem = usePoints ? Math.min(pointsToRedeem, maxRedeemablePoints) : 0;
  const pointsDiscountAmount = effectivePointsToRedeem * 100;

  // Tổng thanh toán cuối cùng
  const finalTotal = Math.max(0, subtotalAfterPromo - pointsDiscountAmount);
  const pointsToEarn = Math.floor(finalTotal / 10000);

  const handleApplyVoucherCode = (code) => {
    const clean = String(code || voucherCodeInput).trim().toUpperCase();
    if (!clean) {
      toast.error('Vui lòng nhập mã khuyến mãi');
      return;
    }
    const found = vouchers.find(v => String(v.code).trim().toUpperCase() === clean);
    if (found) {
      const minVal = Number(found.min_order_value || 0);
      if (cartSubtotal < minVal) {
        toast.error(`Mã ${found.code} yêu cầu đơn tối thiểu ${minVal.toLocaleString('vi-VN')} đ`);
        return;
      }
      setAppliedVoucher(found);
      setVoucherCodeInput(clean);
      toast.success(`Đã áp dụng voucher [${found.code}]! ✨`);
    } else {
      toast.error(`Mã voucher [${clean}] không hợp lệ hoặc đã hết hạn`);
    }
  };

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null);
    setVoucherCodeInput('');
    toast.success('Đã hủy áp dụng voucher');
  };

  // --- XÁC NHẬN ĐẶT ĐƠN & GỬI NHÂN VIÊN ---
  const handleConfirmOrder = async () => {
    if (cart.length === 0) {
      toast.error('Giỏ hàng đang trống!');
      return;
    }

    if (orderType === 'dine_in' && !selectedTableId) {
      toast.error('Vui lòng chọn số bàn bạn đang ngồi!');
      return;
    }

    try {
      setSubmittingOrder(true);
      const payload = {
        order_type: orderType,
        table_id: orderType === 'dine_in' ? Number(selectedTableId) : null,
        items: cart.map(it => ({
          product_id: it.product_id,
          product_size_id: it.product_size_id,
          name: it.name,
          size_name: it.size_name,
          price: it.price,
          quantity: it.quantity,
          note: it.note
        })),
        payment_method: paymentMethod,
        coupon_code: appliedVoucher?.code || null,
        points_to_redeem: effectivePointsToRedeem,
        note: orderGeneralNote.trim() || null,
        initialStatus: 'pending' // Đơn hàng mới luôn ở trạng thái 'pending' để Barista pha chế
      };

      const res = await api.post('/orders/direct-checkout', payload);

      if (res.data?.success) {
        toast.success(
          `🎉 ĐẶT ĐƠN THÀNH CÔNG!\nĐơn #${res.data?.data?.orderCode || ''} đã được tự động chuyển đến Barista và Thu ngân!`,
          { duration: 6000 }
        );

        // Dọn giỏ hàng & modal
        setCart([]);
        setIsCheckoutOpen(false);
        setOrderGeneralNote('');
        setAppliedVoucher(null);
        setUsePoints(false);
        setPointsToRedeem(0);

        // Làm mới điểm & lịch sử đơn
        refreshUser();
        await loadOrderHistory();

        // Chuyển sang tab lịch sử để khách theo dõi trạng thái pha chế
        setActiveTab('history');
      } else {
        toast.error(res.data?.message || 'Không thể tạo đơn hàng');
      }
    } catch (err) {
      console.error('Error submitting order:', err);
      toast.error(err.response?.data?.message || 'Lỗi kết nối khi gửi đơn hàng. Vui lòng thử lại!');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(`Đã sao chép mã [${code}]!`);
    setVoucherCodeInput(code);
  };

  const productList = Array.isArray(products) ? products : [];
  const categoryList = Array.isArray(categories) ? categories : [];
  const voucherList = Array.isArray(vouchers) ? vouchers : [];
  const historyList = Array.isArray(orderHistory) ? orderHistory : [];
  const tableList = Array.isArray(tables) ? tables : [];

  // Lọc món ăn theo danh mục và tìm kiếm
  const filteredProducts = productList.filter((p) => {
    if (!p) return false;
    const matchCat = selectedCategory === 'all' || String(p.category_id) === String(selectedCategory);
    const matchSearch =
      (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

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

  const customerPhone = user?.phone || user?.username || '0900000000';
  const vietQrUrl = `https://img.vietqr.io/image/vietinbank-101870000000-compact2.png?amount=${finalTotal}&addInfo=CF%20${customerPhone}%20DH&accountName=MY%20COFFEE%20HOUSE`;

  return (
    <div style={{ minHeight: '100vh', background: '#130c08', color: '#f5efe6', paddingBottom: cart.length > 0 ? '110px' : '60px' }}>
      {/* 1. HEADER CHÍNH */}
      <div style={{
        background: 'linear-gradient(180deg, #24140b 0%, #170d07 100%)',
        borderBottom: '1px solid #3d2314',
        padding: '24px 20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '2rem' }}>☕</span>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                👑 Bàn Quản Lý
              </button>
            )}
            <button
              onClick={() => { refreshUser(); loadOrderHistory(); toast.success('Đã cập nhật số điểm & đơn hàng!'); }}
              title="Làm mới điểm & đơn hàng"
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
              🔄 Cập nhật
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

        {/* 2. THẺ HỘI VIÊN VIP */}
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

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#d4b094', textTransform: 'uppercase' }}>Điểm tích lũy</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: '2px 0' }}>
                {currentPoints.toLocaleString('vi-VN')} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>điểm</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                ≈ {(currentPoints * 100).toLocaleString('vi-VN')} đ (Dùng trừ thẳng khi đặt hàng)
              </div>
            </div>

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
                {discountPct > 0 ? 'Tự động giảm trên mọi đơn' : 'Tích thêm điểm để nâng hạng'}
              </div>
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px dashed #f59e0b',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '0.8rem',
              color: '#fef3c7',
              lineHeight: 1.4
            }}>
              ✨ <strong>Tự đặt online:</strong> Khách tự chọn món, chọn size, áp voucher & thanh toán ngân hàng trực tiếp tại bàn! Đơn sẽ tự động chuyển đến Barista pha chế ngay lập tức!
            </div>
          </div>
        </div>
      </div>

      {/* 3. THANH ĐIỀU HƯỚNG TABS */}
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
            { id: 'vouchers', label: '🎁 Mã Khuyến Mãi', count: voucherList.length },
            { id: 'history', label: '📜 Lịch Sử Đơn Hàng', count: historyList.length },
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

      {/* 4. NỘI DUNG CHÍNH */}
      <div style={{ maxWidth: '1200px', margin: '20px auto 0', padding: '0 20px' }}>
        {/* TAB 1: THỰC ĐƠN QUÁN */}
        {activeTab === 'menu' && (
          <div>
            {/* Lọc danh mục & Tìm kiếm */}
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
                  Tất cả ({productList.length})
                </button>
                {categoryList.map((cat) => (
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

              {/* Tìm kiếm */}
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
                      {/* Ảnh món */}
                      <div
                        onClick={() => handleOpenSizeModal(p)}
                        style={{ position: 'relative', width: '100%', height: '180px', overflow: 'hidden', background: '#2a160b', cursor: 'pointer' }}
                      >
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
                            background: 'rgba(0,0,0,0.75)',
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
                        <span style={{
                          position: 'absolute',
                          bottom: '10px',
                          right: '10px',
                          background: 'rgba(217, 119, 6, 0.9)',
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '8px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                        }}>
                          ⚡ Chọn size để đặt
                        </span>
                      </div>

                      {/* Nội dung chi tiết */}
                      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <h3
                              onClick={() => handleOpenSizeModal(p)}
                              style={{ margin: 0, fontSize: '1.05rem', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                            >
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
                          {/* Bảng kích cỡ & giá tham khảo */}
                          <div style={{
                            background: '#24140b',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            marginBottom: '12px',
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

                          {/* Nút đặt món chọn size */}
                          <button
                            onClick={() => handleOpenSizeModal(p)}
                            style={{
                              width: '100%',
                              background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                              color: '#fff',
                              border: 'none',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              fontWeight: 700,
                              fontSize: '0.88rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
                              transition: 'all 0.2s'
                            }}
                          >
                            <span>🛒 Đặt Món / Chọn Size</span>
                          </button>
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
                Chọn mã để áp dụng thẳng vào giỏ hàng hoặc đọc mã cho thu ngân khi thanh toán tại quầy!
              </p>
            </div>

            {voucherList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', background: '#1c1008', borderRadius: '12px', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎫</div>
                <div>Hiện chưa có mã giảm giá chung nào đang phát hành. Hãy kiểm tra lại sau nhé!</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {voucherList.map((v) => (
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

                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                      <button
                        onClick={() => handleCopyCode(v.code)}
                        style={{
                          flex: 1,
                          background: '#382012',
                          color: '#fde68a',
                          border: '1px solid #5a341e',
                          padding: '8px',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                      >
                        📋 Sao chép
                      </button>
                      <button
                        onClick={() => {
                          handleApplyVoucherCode(v.code);
                          setIsCheckoutOpen(true);
                        }}
                        style={{
                          flex: 2,
                          background: '#d97706',
                          color: '#fff',
                          border: 'none',
                          padding: '8px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ Dùng ngay vào đơn
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LỊCH SỬ ĐƠN HÀNG (LIVE TRẠNG THÁI PHA CHẾ) */}
        {activeTab === 'history' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#fde68a' }}>
                  📜 Lịch Sử Đơn Hàng Của Bạn
                </h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#d4b094' }}>
                  Theo dõi trạng thái pha chế thời gian thực của các đơn hàng.
                </p>
              </div>
              <button
                onClick={() => { loadOrderHistory(); toast.success('Đã làm mới danh sách đơn!'); }}
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
                🔄 Làm mới đơn
              </button>
            </div>

            {historyList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', background: '#1c1008', borderRadius: '12px', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>☕</div>
                <div>Bạn chưa có đơn hàng nào tại quán. Hãy đặt ngay một ly cà phê thơm ngon nhé!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {historyList.map((o) => {
                  // Badge trạng thái pha chế
                  const getStatusBadge = (status) => {
                    switch (status) {
                      case 'pending':
                        return { text: '⏳ Đang chờ pha chế', bg: 'rgba(245, 158, 11, 0.2)', border: '#f59e0b', color: '#fbbf24' };
                      case 'preparing':
                        return { text: '👨‍🍳 Barista đang pha chế...', bg: 'rgba(56, 189, 248, 0.2)', border: '#38bdf8', color: '#38bdf8' };
                      case 'done':
                        return { text: '✅ Đã pha xong - Mời nhận món', bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', color: '#34d399' };
                      case 'served':
                        return { text: '☕ Đã phục vụ', bg: 'rgba(16, 185, 129, 0.15)', border: '#059669', color: '#6ee7b7' };
                      case 'paid':
                        return { text: '✨ Hoàn tất', bg: 'rgba(16, 185, 129, 0.15)', border: '#059669', color: '#a7f3d0' };
                      case 'cancelled':
                        return { text: '❌ Đã hủy', bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', color: '#f87171' };
                      default:
                        return { text: status, bg: 'rgba(148, 163, 184, 0.2)', border: '#94a3b8', color: '#cbd5e1' };
                    }
                  };
                  const statusInfo = getStatusBadge(o.status);

                  return (
                    <div
                      key={o.id}
                      style={{
                        background: '#1d1109',
                        border: '1px solid #382012',
                        borderRadius: '12px',
                        padding: '18px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.3)'
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 800, color: '#fde68a', fontSize: '1.05rem' }}>
                            #{o.code}
                          </span>
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            background: statusInfo.bg,
                            border: `1px solid ${statusInfo.border}`,
                            color: statusInfo.color,
                            fontWeight: 700
                          }}>
                            {statusInfo.text}
                          </span>
                          <span style={{
                            fontSize: '0.72rem',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            background: o.payment_status === 'paid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: o.payment_status === 'paid' ? '#34d399' : '#f87171',
                            border: `1px solid ${o.payment_status === 'paid' ? '#10b981' : '#ef4444'}`
                          }}>
                            {o.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                          </span>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                            {Number(o.total || 0).toLocaleString('vi-VN')} đ
                          </div>
                          {o.discount_total > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#10b981' }}>
                              Đã giảm: -{Number(o.discount_total).toLocaleString('vi-VN')} đ
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Danh sách món ăn tóm tắt */}
                      {o.items_summary && (
                        <div style={{
                          background: '#24140b',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid #3d2314',
                          fontSize: '0.85rem',
                          color: '#fef3c7'
                        }}>
                          🍽️ <strong>Món đã đặt:</strong> {o.items_summary}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#a8a29e' }}>
                        <div>
                          🕒 {new Date(o.opened_at).toLocaleString('vi-VN')}
                        </div>
                        <div>
                          {o.order_type === 'dine_in' ? `🪑 Bàn: ${o.table_code || 'Chưa xếp bàn'}` : '🛍️ Mang về (Takeaway)'}
                        </div>
                      </div>
                    </div>
                  );
                })}
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

      {/* ========================================================================= */}
      {/* 5. MODAL CHỌN SIZE & SỐ LƯỢNG & GHI CHÚ KHI BẤM VÀO MÓN                   */}
      {/* ========================================================================= */}
      {selectedProductForSize && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 9999
        }}>
          <div style={{
            background: '#1c1109',
            border: '2px solid #5a341e',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Ảnh & Nút đóng */}
            <div style={{ position: 'relative', width: '100%', height: '200px', background: '#2a160b' }}>
              <img
                src={selectedProductForSize.image_url || 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80'}
                alt={selectedProductForSize.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <button
                onClick={handleCloseSizeModal}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Chi tiết chọn size */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#fff' }}>
                  {selectedProductForSize.name}
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#d4b094', lineHeight: 1.4 }}>
                  {selectedProductForSize.description || 'Thức uống tươi ngon đặc trưng từ công thức pha chế độc quyền của quán.'}
                </p>
              </div>

              {/* Lựa chọn kích thước (Size) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#fde68a', marginBottom: '8px' }}>
                  📏 Chọn Kích Thước (Size) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  {(selectedProductForSize.sizes && selectedProductForSize.sizes.length > 0) ? (
                    selectedProductForSize.sizes.map((s) => {
                      const isSelected = modalSelectedSize?.id === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => setModalSelectedSize(s)}
                          style={{
                            background: isSelected ? 'rgba(217, 119, 6, 0.25)' : '#24140b',
                            border: isSelected ? '2px solid #f59e0b' : '1px solid #3d2314',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isSelected ? '#fbbf24' : '#fff' }}>
                            Size {s.size}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: isSelected ? '#fff' : '#d4b094', marginTop: '2px' }}>
                            {Number(s.price).toLocaleString('vi-VN')} đ
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{
                      background: 'rgba(217, 119, 6, 0.25)',
                      border: '2px solid #f59e0b',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fbbf24' }}>
                        Size Tiêu Chuẩn
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#fff', marginTop: '2px' }}>
                        {Number(selectedProductForSize.price || 0).toLocaleString('vi-VN')} đ
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Số lượng */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fde68a' }}>
                  Số lượng ly / phần:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => setModalQuantity(q => Math.max(1, q - 1))}
                    style={{
                      background: '#382012',
                      border: '1px solid #5a341e',
                      color: '#fff',
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', minWidth: '24px', textAlign: 'center' }}>
                    {modalQuantity}
                  </span>
                  <button
                    onClick={() => setModalQuantity(q => q + 1)}
                    style={{
                      background: '#382012',
                      border: '1px solid #5a341e',
                      color: '#fff',
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Ghi chú dặn Barista */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#d4b094', marginBottom: '6px' }}>
                  📝 Ghi chú cho Barista pha chế (tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="VD: Ít đường, nhiều đá, không lấy ống hút nhựa..."
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#24140b',
                    border: '1px solid #3d2314',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* Nút thêm vào giỏ */}
              <button
                onClick={handleAddToCart}
                style={{
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(217, 119, 6, 0.4)',
                  marginTop: '6px'
                }}
              >
                <span>Thêm Vào Giỏ Hàng • {((modalSelectedSize?.price || selectedProductForSize.price || 0) * modalQuantity).toLocaleString('vi-VN')} đ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. FLOATING CART BAR (THANH GIỎ HÀNG NỔI Ở ĐÁY MÀN HÌNH)                  */}
      {/* ========================================================================= */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(28, 17, 9, 0.95)',
          backdropFilter: 'blur(10px)',
          borderTop: '2px solid #f59e0b',
          padding: '12px 20px',
          boxShadow: '0 -6px 25px rgba(0,0,0,0.7)',
          zIndex: 9000
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                background: '#d97706',
                color: '#fff',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: 800
              }}>
                🛒
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#d4b094' }}>
                  Giỏ hàng của bạn: <strong style={{ color: '#fff' }}>{cartTotalItems} món</strong>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fde68a' }}>
                  {cartSubtotal.toLocaleString('vi-VN')} đ
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleClearCart}
                style={{
                  background: 'transparent',
                  border: '1px solid #78350f',
                  color: '#fca5a5',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.82rem'
                }}
              >
                Xóa giỏ
              </button>
              <button
                onClick={() => setIsCheckoutOpen(true)}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 22px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Xem Giỏ & Thanh Toán ➔</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. CHECKOUT MODAL: THANH TOÁN & ĐẶT HÀNG TỰ PHỤC VỤ (ONLINE POS)         */}
      {/* ========================================================================= */}
      {isCheckoutOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 9999
        }}>
          <div style={{
            background: '#1a0e07',
            border: '2px solid #5a341e',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #3d2314',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#24140b'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fde68a', fontFamily: "'Playfair Display', serif" }}>
                  ☕ XÁC NHẬN ĐƠN HÀNG & THANH TOÁN
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#d4b094', marginTop: '2px' }}>
                  Khách hàng: <strong>{user?.full_name}</strong> • SĐT: <strong>{customerPhone}</strong>
                </div>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.3rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* BƯỚC 1: DANH SÁCH MÓN TRONG GIỎ */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fde68a' }}>
                    1. Danh sách món ({cartTotalItems} món)
                  </span>
                  <button
                    onClick={() => setIsCheckoutOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    + Chọn thêm món khác
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                  {cart.map((item) => (
                    <div
                      key={item.cartItemId}
                      style={{
                        background: '#24140b',
                        border: '1px solid #3d2314',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                          {item.name} <span style={{ color: '#fbbf24', fontSize: '0.8rem' }}>(Size {item.size_name})</span>
                        </div>
                        {item.note && (
                          <div style={{ fontSize: '0.75rem', color: '#f87171', fontStyle: 'italic' }}>
                            📝 {item.note}
                          </div>
                        )}
                        <div style={{ fontSize: '0.8rem', color: '#d4b094' }}>
                          {item.price.toLocaleString('vi-VN')} đ × {item.quantity} = <strong>{(item.price * item.quantity).toLocaleString('vi-VN')} đ</strong>
                        </div>
                      </div>

                      {/* Nút tăng giảm & xóa */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#180d07', borderRadius: '6px', padding: '2px 6px' }}>
                          <button
                            onClick={() => handleUpdateCartQuantity(item.cartItemId, -1)}
                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', padding: '0 4px' }}
                          >
                            -
                          </button>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fde68a', minWidth: '18px', textAlign: 'center' }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateCartQuantity(item.cartItemId, 1)}
                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', padding: '0 4px' }}
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => handleRemoveFromCart(item.cartItemId)}
                          title="Xóa món"
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', padding: '2px' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BƯỚC 2: HÌNH THỨC NHẬN MÓN (TẠI BÀN / MANG VỀ) */}
              <div>
                <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#fde68a', marginBottom: '10px' }}>
                  2. Hình thức phục vụ
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div
                    onClick={() => setOrderType('dine_in')}
                    style={{
                      background: orderType === 'dine_in' ? 'rgba(217, 119, 6, 0.25)' : '#24140b',
                      border: orderType === 'dine_in' ? '2px solid #f59e0b' : '1px solid #3d2314',
                      borderRadius: '10px',
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.2rem' }}>🪑</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: orderType === 'dine_in' ? '#fbbf24' : '#fff' }}>
                      Uống Tại Quán
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#a8a29e' }}>Chọn số bàn bạn ngồi</div>
                  </div>

                  <div
                    onClick={() => setOrderType('takeaway')}
                    style={{
                      background: orderType === 'takeaway' ? 'rgba(217, 119, 6, 0.25)' : '#24140b',
                      border: orderType === 'takeaway' ? '2px solid #f59e0b' : '1px solid #3d2314',
                      borderRadius: '10px',
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.2rem' }}>🛍️</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: orderType === 'takeaway' ? '#fbbf24' : '#fff' }}>
                      Mang Về (Takeaway)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#a8a29e' }}>Đóng gói đem đi</div>
                  </div>
                </div>

                {orderType === 'dine_in' && (
                  <div style={{ background: '#24140b', padding: '12px', borderRadius: '10px', border: '1px solid #3d2314' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#fde68a', marginBottom: '6px' }}>
                      Vui lòng chọn số bàn của bạn:
                    </label>
                    <select
                      value={selectedTableId}
                      onChange={(e) => setSelectedTableId(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#180d07',
                        border: '1px solid #5a341e',
                        color: '#fff',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600
                      }}
                    >
                      {tableList.length === 0 ? (
                        <option value="">Không có dữ liệu bàn</option>
                      ) : (
                        tableList.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.code} {t.area_name ? `(${t.area_name})` : ''} • {t.status === 'occupied' ? 'Đang có khách' : 'Trống'}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* BƯỚC 3: MÃ GIẢM GIÁ & ĐỔI ĐIỂM HỘI VIÊN */}
              <div>
                <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#fde68a', marginBottom: '10px' }}>
                  3. Ưu đãi & Giảm giá
                </span>

                {/* Áp dụng voucher */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Nhập mã voucher (VD: CHAOMUNG)"
                    value={voucherCodeInput}
                    onChange={(e) => setVoucherCodeInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: '#24140b',
                      border: '1px solid #3d2314',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase'
                    }}
                  />
                  {appliedVoucher ? (
                    <button
                      onClick={handleRemoveVoucher}
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
                      Hủy mã
                    </button>
                  ) : (
                    <button
                      onClick={() => handleApplyVoucherCode()}
                      style={{
                        background: '#d97706',
                        border: 'none',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 700
                      }}
                    >
                      Áp dụng
                    </button>
                  )}
                </div>

                {appliedVoucher && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px dashed #10b981',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    color: '#34d399',
                    marginBottom: '10px',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>Đã áp dụng mã <strong>{appliedVoucher.code}</strong></span>
                    <span>-{voucherDiscount.toLocaleString('vi-VN')} đ</span>
                  </div>
                )}

                {/* Đổi điểm tích lũy */}
                {currentPoints > 0 && (
                  <div style={{
                    background: '#24140b',
                    border: '1px solid #3d2314',
                    borderRadius: '8px',
                    padding: '10px 14px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>
                          🎁 Dùng điểm tích lũy (Bạn có: {currentPoints} điểm)
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          1 điểm = 100 đ giảm trực tiếp
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={usePoints}
                        onChange={(e) => {
                          setUsePoints(e.target.checked);
                          if (e.target.checked) {
                            setPointsToRedeem(maxRedeemablePoints);
                          }
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>

                    {usePoints && (
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#d4b094' }}>Số điểm dùng:</span>
                        <input
                          type="number"
                          min={1}
                          max={maxRedeemablePoints}
                          value={pointsToRedeem}
                          onChange={(e) => setPointsToRedeem(Math.min(maxRedeemablePoints, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          style={{
                            width: '80px',
                            background: '#180d07',
                            border: '1px solid #5a341e',
                            color: '#fbbf24',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>
                          (-{(effectivePointsToRedeem * 100).toLocaleString('vi-VN')} đ)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* BƯỚC 4: PHƯƠNG THỨC THANH TOÁN */}
              <div>
                <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#fde68a', marginBottom: '10px' }}>
                  4. Phương thức thanh toán
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div
                    onClick={() => setPaymentMethod('bank_transfer')}
                    style={{
                      background: paymentMethod === 'bank_transfer' ? 'rgba(217, 119, 6, 0.25)' : '#24140b',
                      border: paymentMethod === 'bank_transfer' ? '2px solid #f59e0b' : '1px solid #3d2314',
                      borderRadius: '10px',
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.2rem' }}>🏦</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: paymentMethod === 'bank_transfer' ? '#fbbf24' : '#fff' }}>
                      QR Ngân Hàng (VietQR)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#a8a29e' }}>Quét mã chuyển khoản tức thì</div>
                  </div>

                  <div
                    onClick={() => setPaymentMethod('cash')}
                    style={{
                      background: paymentMethod === 'cash' ? 'rgba(217, 119, 6, 0.25)' : '#24140b',
                      border: paymentMethod === 'cash' ? '2px solid #f59e0b' : '1px solid #3d2314',
                      borderRadius: '10px',
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.2rem' }}>💵</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: paymentMethod === 'cash' ? '#fbbf24' : '#fff' }}>
                      Tiền Mặt Tại Quầy
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#a8a29e' }}>Thanh toán khi nhận đồ uống</div>
                  </div>
                </div>

                {/* Hiển thị VietQR động nếu chọn Chuyển khoản */}
                {paymentMethod === 'bank_transfer' && (
                  <div style={{
                    background: '#24140b',
                    border: '1px solid #5a341e',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ background: '#fff', padding: '8px', borderRadius: '10px' }}>
                      <img
                        src={vietQrUrl}
                        alt="Mã VietQR thanh toán"
                        style={{ width: '150px', height: '150px', objectFit: 'contain', display: 'block' }}
                      />
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#d4b094', lineHeight: 1.6 }}>
                      <div>Ngân hàng: <strong style={{ color: '#fff' }}>VietinBank (ICB)</strong></div>
                      <div>Số tài khoản: <strong style={{ color: '#fde68a', fontSize: '0.95rem' }}>101870000000</strong></div>
                      <div>Chủ tài khoản: <strong style={{ color: '#fff' }}>MY COFFEE HOUSE</strong></div>
                      <div>Số tiền: <strong style={{ color: '#10b981', fontSize: '1.05rem' }}>{finalTotal.toLocaleString('vi-VN')} đ</strong></div>
                      <div>Nội dung CK: <strong style={{ color: '#fbbf24' }}>CF {customerPhone} DH</strong></div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                        * Quét mã QR bằng App Ngân Hàng bất kỳ. Sau khi quét xong bấm xác nhận bên dưới!
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ghi chú chung cho đơn */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#d4b094', marginBottom: '6px' }}>
                  Ghi chú cho đơn hàng (tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="Ghi chú thêm cho nhân viên phục vụ..."
                  value={orderGeneralNote}
                  onChange={(e) => setOrderGeneralNote(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#24140b',
                    border: '1px solid #3d2314',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* TÓM TẮT CHI PHÍ */}
              <div style={{
                background: '#24140b',
                borderRadius: '12px',
                padding: '16px 20px',
                border: '1px solid #3d2314'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#d4b094', marginBottom: '6px' }}>
                  <span>Tạm tính ({cartTotalItems} món):</span>
                  <span>{cartSubtotal.toLocaleString('vi-VN')} đ</span>
                </div>

                {voucherDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#10b981', marginBottom: '6px' }}>
                    <span>Giảm giá Voucher ({appliedVoucher.code}):</span>
                    <span>-{voucherDiscount.toLocaleString('vi-VN')} đ</span>
                  </div>
                )}

                {tierDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#10b981', marginBottom: '6px' }}>
                    <span>Đặc quyền Hạng {tierName} (-{discountPct}%):</span>
                    <span>-{tierDiscount.toLocaleString('vi-VN')} đ</span>
                  </div>
                )}

                {pointsDiscountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#10b981', marginBottom: '6px' }}>
                    <span>Dùng điểm tích lũy ({effectivePointsToRedeem} điểm):</span>
                    <span>-{pointsDiscountAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid #3d2314',
                  paddingTop: '10px',
                  marginTop: '6px'
                }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    TỔNG THANH TOÁN:
                  </span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fde68a' }}>
                    {finalTotal.toLocaleString('vi-VN')} đ
                  </span>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#f59e0b', marginTop: '4px' }}>
                  🎁 Đơn hàng sẽ tích lũy thêm: <strong>+{pointsToEarn} điểm</strong>
                </div>
              </div>

              {/* NÚT XÁC NHẬN ĐẶT ĐƠN */}
              <button
                onClick={handleConfirmOrder}
                disabled={submittingOrder}
                style={{
                  background: submittingOrder ? '#78350f' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '14px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  cursor: submittingOrder ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)'
                }}
              >
                {submittingOrder ? (
                  <span>⏳ Đang gửi đơn tới Barista & Quầy...</span>
                ) : (
                  <span>🚀 XÁC NHẬN ĐẶT ĐƠN ({finalTotal.toLocaleString('vi-VN')} đ)</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}