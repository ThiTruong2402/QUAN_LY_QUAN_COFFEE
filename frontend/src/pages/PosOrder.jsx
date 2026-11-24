import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { BANK_CONFIG, generateVietQRUrl } from '../constants/bankConfig';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const FALLBACK_DRINK_IMG = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80';

const getCategoryIcon = (catId) => {
  switch (Number(catId)) {
    case 1: return '☕';
    case 2: return '🍵';
    case 3: return '🍧';
    case 4: return '🍰';
    case 5: return '🍹';
    case 9: return '🥜';
    default: return '☕';
  }
};

export default function PosOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTableId = searchParams.get('table_id');
  const queryTableCode = searchParams.get('table_code');
  const queryCustomerName = searchParams.get('customer_name');
  const queryCustomerPhone = searchParams.get('customer_phone');

  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState('');

  // Selected size per card: { [productId]: 'S' | 'M' | 'L' }
  const [cardSizes, setCardSizes] = useState({});

  // 20 Tables State
  const [tablesList, setTablesList] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(queryTableId || '1');
  const [selectedTableCode, setSelectedTableCode] = useState(queryTableCode || 'Bàn 01');

  // Customer & Loyalty System (10k = 1 điểm, 1 điểm = 1k đ)
  const [customerPhone, setCustomerPhone] = useState(queryCustomerPhone || '');
  const [customerName, setCustomerName] = useState(queryCustomerName || 'Khách');
  const [customerInfo, setCustomerInfo] = useState(null); // { id, name, phone, points_balance, total_spent, tier_name, discount_pct }
  const [usePoints, setUsePoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Payment Modal State
  const [showPayment, setShowPayment] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const [autoRedirectEnabled, setAutoRedirectEnabled] = useState(true);
  const [cashGiven, setCashGiven] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tiền mặt');
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Order Channel: Tại bàn / Mang về
  const [orderType, setOrderType] = useState('dine_in');

  // Voucher / Promotion Coupon System
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [availableCoupons, setAvailableCoupons] = useState([
    { code: 'COFFEE10', name: 'Giảm 10% Cho Cà Phê', desc: 'Giảm 10% tối đa 30k (từ 50k)' },
    { code: 'GIAM20K', name: 'Voucher 20K', desc: 'Giảm trực tiếp 20.000 đ (từ 80k)' },
    { code: 'BANMOI', name: 'Chào Bạn Mới 15K', desc: 'Giảm 15.000 đ cho khách mới' },
    { code: 'MYCOFFEE20', name: 'Khách Thân Thiết 20%', desc: 'Giảm 20% tối đa 50k (từ 100k)' },
  ]);

  // Post-payment Success Modal ("ngay sau khi thanh toán sẽ hiện lên giữa màn hình")
  const [completedOrder, setCompletedOrder] = useState(null);

  const loadTables = async () => {
    try {
      const res = await api.get('/tables');
      if (res.data?.data?.tables) {
        const tbls = res.data.data.tables;
        setTablesList(tbls);
        if (queryTableId) {
          const match = tbls.find((t) => String(t.id) === String(queryTableId));
          if (match) {
            setSelectedTableId(String(match.id));
            setSelectedTableCode(match.code);
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const lookupCustomerByPhone = async (phone) => {
    const clean = (phone || '').trim();
    if (clean.length < 9) {
      setCustomerInfo(null);
      return;
    }
    try {
      const res = await api.get(`/customers/lookup/${clean}`);
      if (res.data?.success && res.data.data) {
        const c = res.data.data;
        setCustomerInfo(c);
        setCustomerName(c.name || 'Khách hàng');
        setPointsToRedeem(Math.min(Number(c.points_balance || 0), 50));
      } else {
        setCustomerInfo(null);
      }
    } catch {
      setCustomerInfo(null);
    }
  };

  const loadProducts = async () => {
    try {
      const r = await api.get('/products');
      setProducts(r.data.data.products || []);
      setCategories(r.data.data.categories || []);
    } catch {
      toast.error('Lỗi tải sản phẩm');
    }
  };

  const loadPromotions = async () => {
    try {
      const r = await api.get('/promotions/active');
      const list = r.data.data || [];
      if (list.length > 0) {
        setAvailableCoupons(list.filter(p => p.code && p.code !== 'FREESHIP').map(p => ({
          code: p.code,
          name: p.name,
          desc: p.description || p.name
        })));
      }
    } catch {
      // Keep defaults
    }
  };

  useEffect(() => {
    loadProducts();
    loadPromotions();
    loadTables();
    if (queryCustomerPhone) {
      lookupCustomerByPhone(queryCustomerPhone);
    }
  }, []);

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCat === 'all' || String(p.category_id) === selectedCat;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Helper: get size object for product
  const getProductSize = (p, overrideSizeName) => {
    const chosenName = overrideSizeName || cardSizes[p.id] || 'M';
    const found = p.sizes?.find((s) => s.name === chosenName);
    if (found) return found;

    // Fallback: ưu tiên size mặc định, hoặc size M, hoặc size đầu tiên có sẵn trong DB
    const defaultM = p.sizes?.find((s) => s.is_default) || p.sizes?.find((s) => s.name === 'M') || p.sizes?.[0] || { id: null, name: 'M', price: 29000 };
    return defaultM;
  };

  // Cart operations
  const addToCart = (p, overrideSizeName) => {
    const sizeObj = getProductSize(p, overrideSizeName);
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === p.id && item.size_name === sizeObj.name);
      if (existing) {
        return prev.map((item) =>
          item.product_id === p.id && item.size_name === sizeObj.name
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_size_id: sizeObj.id,
          name: p.name,
          size_name: sizeObj.name,
          price: sizeObj.price,
          quantity: 1,
        },
      ];
    });
  };

  const updateCartLineQty = (index, delta) => {
    setCart((prev) => {
      const next = [...prev];
      const target = next[index];
      if (!target) return prev;
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        next.splice(index, 1);
      } else {
        next[index] = { ...target, quantity: newQty };
      }
      return next;
    });
  };

  // Switch size of an item in the cart or payment screen (S, M, L)
  const updateCartItemSize = (index, newSizeName) => {
    setCart((prev) => {
      const next = [...prev];
      const target = next[index];
      if (!target || target.size_name === newSizeName) return prev;

      const p = products.find((prod) => prod.id === target.product_id);
      const targetSize = p?.sizes?.find((s) => s.name === newSizeName);
      if (!targetSize) {
        toast.error(`Món "${target.name}" không có Size ${newSizeName}`);
        return prev;
      }

      // Check if another line with this product and newSizeName already exists
      const existingIdx = next.findIndex(
        (it, i) => i !== index && it.product_id === target.product_id && it.size_name === newSizeName
      );

      if (existingIdx !== -1) {
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + target.quantity,
        };
        next.splice(index, 1);
      } else {
        next[index] = {
          ...target,
          product_size_id: targetSize.id,
          size_name: targetSize.name,
          price: targetSize.price,
        };
      }
      return next;
    });
  };

  const getProductTotalQtyInCart = (productId) => {
    return cart
      .filter((c) => c.product_id === productId)
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  const clearCart = () => {
    setCart([]);
    setNote('');
    setAppliedCoupon(null);
    setCouponInput('');
    setDiscount(0);
  };

  // Totals Calculation (direct dine-in / takeaway)
  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Loyalty Tier Discount
  const tierDiscountPercent = Number(customerInfo?.discount_pct || 0);
  const tierDiscount = tierDiscountPercent > 0 ? Math.round((totalAmount * tierDiscountPercent) / 100) : 0;

  // Points Redemption Discount (1 điểm = 1.000 đ)
  const maxRedeemablePoints = Math.min(
    Number(customerInfo?.points_balance || 0),
    Math.floor(Math.max(0, totalAmount - Number(discount) - tierDiscount) / 1000)
  );
  const effectivePointsRedeemed = usePoints ? Math.min(Number(pointsToRedeem || 0), maxRedeemablePoints) : 0;
  const pointsDiscount = effectivePointsRedeemed * 1000;

  // Loyalty Points to earn on this order (10.000 đ tiêu dùng = 1 điểm)
  const totalDiscount = Number(discount) + tierDiscount + pointsDiscount;
  const finalTotal = Math.max(0, totalAmount - totalDiscount + Number(tax));
  const earnedPoints = Math.floor(finalTotal / 10000);
  const changeDue = cashGiven ? Number(cashGiven) - finalTotal : 0;

  // Tự động cập nhật giảm giá khi giỏ hàng thay đổi (tránh giảm giá stale)
  useEffect(() => {
    if (!appliedCoupon) return;
    // Re-validate coupon against current subtotal to get fresh discount
    api.post('/promotions/validate', { code: appliedCoupon.code, subtotal: totalAmount })
      .then(res => {
        if (res.data.valid) {
          setDiscount(res.data.data?.discount || 0);
          setAppliedCoupon(prev => ({ ...prev, discount: res.data.data?.discount || 0 }));
        } else {
          // Coupon no longer valid (e.g., below min_order after removing items)
          setDiscount(0);
          setAppliedCoupon(null);
          setCouponInput('');
          toast.error(res.data.message || 'Mã giảm giá không còn hợp lệ cho đơn hiện tại!');
        }
      })
      .catch(() => {}); // Silently ignore network errors during re-validation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount]);

  // Coupon application handler
  const handleApplyCoupon = async (codeOverride) => {
    const code = (codeOverride || couponInput || '').trim().toUpperCase();
    if (!code) {
      toast.error('Vui lòng nhập hoặc chọn mã giảm giá!');
      return;
    }
    if (totalAmount <= 0) {
      toast.error('Vui lòng chọn món vào giỏ trước khi áp dụng mã!');
      return;
    }

    try {
      const res = await api.post('/promotions/validate', {
        code,
        subtotal: totalAmount,
      });

      if (res.data.valid) {
        const promo = res.data.data;
        setAppliedCoupon({ ...promo, code });
        setDiscount(promo.discount || 0);
        setCouponInput(code);
        toast.success(`🎉 ${res.data.message}`);
      } else {
        toast.error(res.data.message || 'Mã giảm giá không hợp lệ hoặc chưa đủ điều kiện!');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi kiểm tra mã giảm giá');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setDiscount(0);
    toast.success('Đã hủy áp dụng mã giảm giá');
  };

  // Open Payment Screen
  const handleOpenPayment = () => {
    if (cart.length === 0) {
      toast.error('Vui lòng chọn ít nhất một món trước khi thanh toán!');
      return;
    }
    setCashGiven(String(finalTotal));
    setShowPayment(true);
  };

  // Virtual Numpad Handler
  const handleNumpad = (val) => {
    if (val === 'C') {
      setCashGiven('');
    } else if (val === '000') {
      setCashGiven((prev) => (prev ? prev + '000' : ''));
    } else if (val === 'x' || val === '⌫') {
      setCashGiven((prev) => (prev.length > 1 ? prev.slice(0, -1) : ''));
    } else if (val === '+') {
      setCashGiven((prev) => String(Number(prev || 0) + 10000));
    } else if (val === '-') {
      setCashGiven((prev) => String(Math.max(0, Number(prev || 0) - 10000)));
    } else if (val === '.') {
      // ignore
    } else {
      setCashGiven((prev) => (prev === '0' ? val : prev + val));
    }
  };

  // Tự động quay về TRANG CHỦ (Sơ đồ 20 bàn) sau khi thanh toán hoàn tất
  useEffect(() => {
    if (!completedOrder || !autoRedirectEnabled) return;

    if (redirectCountdown <= 0) {
      setAutoRedirectEnabled(false);
      setCompletedOrder(null);
      navigate('/');
      return;
    }

    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [completedOrder, autoRedirectEnabled, redirectCountdown, navigate]);

  // Submit Order (F9) -> LOGIC NGHIỆP VỤ: Khách thanh toán xong mới làm đồ uống
  // Hệ thống lưu payment_status = 'paid', xuất kho nguyên liệu theo đúng công thức món và chuyển sang 'pending' (đang chờ Barista pha chế)
  const handleCompletePayment = async (overrideMethod) => {
    if (cart.length === 0) {
      toast.error('Giỏ hàng đang trống!');
      return;
    }
    if (isSubmitting) return;

    const chosenMethod = overrideMethod || paymentMethod || 'Tiền mặt';

    // Chặn thanh toán nếu thu thiếu tiền mặt
    if (chosenMethod === 'Tiền mặt' && cashGiven !== '' && Number(cashGiven) < finalTotal) {
      toast.error(`Tiền khách đưa (${fmt(cashGiven)}) chưa đủ thanh toán! Còn thiếu ${fmt(finalTotal - Number(cashGiven))}`);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.post('/orders/direct-checkout', {
        items: cart,
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: chosenMethod,
        discount: totalDiscount,
        tax: Number(tax),
        note,
        status: 'pending', // Logic nghiệp vụ: Thanh toán xong -> Đang chờ quầy Barista làm đồ uống
        order_type: orderType,
        table_id: orderType === 'dine_in' ? (selectedTableId || null) : null,
        delivery_address: null,
        shipping_fee: 0,
        recipient_phone: null,
        coupon_code: appliedCoupon ? appliedCoupon.code : (couponInput ? couponInput.trim().toUpperCase() : null),
        payment_status: 'paid', // Bắt buộc: ĐÃ THANH TOÁN XONG MỚI LÀM ĐỒ UỐNG
        points_redeemed: effectivePointsRedeemed,
      });

      const invoiceNo = res.data.data.invoiceNo;
      toast.success(`✅ Thanh toán thành công (${chosenMethod})! Đơn hàng đã chuyển sang quầy Barista.`);

      // Đóng các modal nhập liệu
      setShowQrModal(false);
      setShowPayment(false);

      // Kích hoạt Modal thành công HIỆN GIỮA MÀN HÌNH
      setCompletedOrder({
        invoiceNo,
        orderId: res.data.data.orderId,
        status: res.data.data.status || 'pending',
        orderType,
        tableId: selectedTableId,
        tableCode: orderType === 'dine_in' ? selectedTableCode : 'Mang về',
        deliveryAddress: null,
        recipientPhone: null,
        shippingFee: 0,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        couponName: appliedCoupon ? appliedCoupon.name : null,
        total: finalTotal,
        subtotal: totalAmount,
        discount: totalDiscount,
        totalDiscount,
        tierDiscount,
        tax: Number(tax),
        pointsDiscount,
        pointsRedeemed: effectivePointsRedeemed,
        earnedPoints,
        tax,
        items: [...cart],
        customerName,
        customerPhone,
        customerTier: customerInfo?.tier_name || 'Đồng',
        paymentMethod: chosenMethod,
        cashGiven: cashGiven || finalTotal,
        changeDue: Math.max(0, changeDue),
        note,
        date: new Date().toLocaleString('vi-VN'),
        cashierName: user?.full_name || 'Thu Ngân',
        paymentStatus: 'paid',
      });

      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      setAutoRedirectEnabled(true);
      setRedirectCountdown(4);
      clearCart();
    } catch (err) {
      console.error('POS Payment Error:', err);
      toast.error(err.response?.data?.message || 'Có lỗi khi xác nhận đơn hàng');
    } finally {
      setIsSubmitting(false);
    }
  };



  // Quick action: Start brewing immediately from the confirmation modal
  const handleStartPreparingNow = async (orderId) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: 'preparing' });
      toast.success('☕ Đã chuyển đơn hàng sang trạng thái: ĐANG PHA CHẾ!');
      setCompletedOrder((prev) => (prev ? { ...prev, status: 'preparing' } : null));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi cập nhật trạng thái');
    }
  };

  // Keyboard shortcut F9 & Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F9') {
        e.preventDefault();
        if (showQrModal) {
          handleCompletePayment('QR Banking');
        } else if (showPayment) {
          handleCompletePayment();
        } else if (cart.length > 0) {
          if (paymentMethod === 'QR Banking') {
            setShowQrModal(true);
          } else {
            handleCompletePayment('Tiền mặt');
          }
        }
      } else if (e.key === 'Escape') {
        if (completedOrder) {
          setAutoRedirectEnabled(false);
          setCompletedOrder(null);
          navigate('/');
        } else if (showQrModal) {
          setShowQrModal(false);
        } else if (showPayment) {
          setShowPayment(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPayment, showQrModal, cart, customerName, customerPhone, paymentMethod, discount, tax, note, finalTotal, completedOrder, isSubmitting, navigate]);

  // Copy Account Number
  const copyAccountNumber = () => {
    navigator.clipboard?.writeText(BANK_CONFIG.accountNumberRaw);
    toast.success(`Đã sao chép STK: ${BANK_CONFIG.accountNumberRaw}`);
  };

  // Dynamic VietQR Image URL
  const vietQrUrl = generateVietQRUrl({ amount: finalTotal, memo: 'CF POS DH' });

  return (
    <div className="animate-fade-in">
      {!showPayment ? (
        /* SCREEN 1: POS ORDER (2-Column Dual Independent Scroll) */
        <div className="pos-locked-workspace">
          {/* LEFT: DANH SÁCH MÓN */}
          <div className="pos-menu-column">
            <div className="pos-menu-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--ui-espresso)' }}>
                  Danh sách món ({filteredProducts.length} món)
                </span>
              </div>

              {/* Search & Category Filter */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="🔍 Tìm kiếm món..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '180px' }}
                />

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    className={`btn btn-sm ${selectedCat === 'all' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setSelectedCat('all')}
                  >
                    Tất cả
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      className={`btn btn-sm ${selectedCat === String(c.id) ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setSelectedCat(String(c.id))}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Product Grid with Independent Scroll */}
            <div className="pos-menu-scroll-grid">
                {filteredProducts.map((p) => {
                  const currentSizeName = cardSizes[p.id] || 'M';
                  const currentSizeObj = getProductSize(p, currentSizeName);
                  const inCartQty = getProductTotalQtyInCart(p.id);

                  return (
                    <div
                      key={p.id}
                      className="pos-product-card"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '350px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          height: '155px',
                          flexShrink: 0,
                          overflow: 'hidden',
                          background: '#18181B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img
                          src={p.image_url || FALLBACK_DRINK_IMG}
                          alt={p.name}
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_DRINK_IMG; }}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center center',
                            display: 'block',
                            transition: 'transform 0.3s ease',
                          }}
                        />
                        {inCartQty > 0 && (
                          <span
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: '#d97706',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                            }}
                          >
                            Đã chọn: {inCartQty}
                          </span>
                        )}
                      </div>

                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24', background: 'rgba(251, 191, 36, 0.12)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(251, 191, 36, 0.25)', letterSpacing: '0.5px' }}>
                              {p.code || `ID:${p.id}`}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#a88265', fontWeight: 600 }}>
                              {p.category_id === 9 ? 'Ăn vặt' : 'Đồ uống'}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '6px',
                              fontWeight: 700,
                              fontSize: '0.88rem',
                              color: '#fef3c7',
                              minHeight: '44px',
                              lineHeight: 1.42,
                              paddingTop: '2px',
                              marginBottom: '4px',
                            }}
                          >
                            <span style={{ fontSize: '1.05rem', flexShrink: 0, marginTop: '0px' }}>
                              {getCategoryIcon(p.category_id)}
                            </span>
                            <span
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                              }}
                              title={p.name}
                            >
                              {p.name}
                            </span>
                          </div>
                          <p
                            style={{
                              fontSize: '0.73rem',
                              color: '#c4a482',
                              margin: '0 0 8px',
                              minHeight: '32px',
                              lineHeight: 1.35,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {p.description || 'Hương vị thơm ngon hảo hạng từ MY COFFEE HOUSE'}
                          </p>
                        </div>

                        <div>
                          {/* Size Selection Buttons on Card */}
                          {(() => {
                            const sizesList = p.sizes && p.sizes.length > 1
                              ? Array.from(new Map(p.sizes.map((s) => [s.name, s])).values())
                              : [];
                            if (sizesList.length > 1) {
                              return (
                                <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                  {sizesList.map((sz) => {
                                    const active = currentSizeName === sz.name;
                                    return (
                                      <button
                                        key={sz.name}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCardSizes((prev) => ({ ...prev, [p.id]: sz.name }));
                                        }}
                                        style={{
                                          padding: '2px 8px',
                                          borderRadius: '5px',
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          border: active ? '1.5px solid #F59E0B' : '1px solid #3F3F46',
                                          background: active ? 'linear-gradient(135deg, #D97706, #B45309)' : '#27272B',
                                          color: active ? '#FFFFFF' : '#A1A1AA',
                                          transition: 'all 0.15s ease',
                                        }}
                                      >
                                        Size {sz.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Price & Add to Cart button */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                            <div>
                              <span style={{ fontSize: '0.72rem', color: '#a88265', fontWeight: 600 }}>Giá: </span>
                              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fbbf24' }}>
                                {fmt(currentSizeObj.price)}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="pos-add-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(p, currentSizeName);
                              }}
                            >
                              + Thêm
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          {/* RIGHT: THÔNG TIN ĐƠN HÀNG (CỐ ĐỊNH 100% CHIỀU CAO) */}
          <div className="pos-checkout-column">
            <div style={{ flexShrink: 0, padding: '12px 16px', borderBottom: '1px solid #27272B', background: '#1F1F23', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#F4F1EC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Thông tin đơn hàng ({cart.length} món)</span>
              </div>
              <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34D399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: '12px', fontWeight: 700 }}>
                TT xong mới làm
              </span>
            </div>

            <div className="pos-checkout-body">
              {/* 1. HÌNH THỨC PHỤC VỤ & BÀN */}
              <div
                style={{
                  background: '#202024',
                  border: '1px solid #2A2A30',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC' }}>
                    🪑 VỊ TRÍ PHỤC VỤ:
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      style={{
                        background: orderType === 'dine_in' ? 'linear-gradient(135deg, #D97706, #B45309)' : '#27272B',
                        color: orderType === 'dine_in' ? '#FFFFFF' : '#A1A1AA',
                        border: orderType === 'dine_in' ? '1px solid #F59E0B' : '1px solid #3F3F46',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      onClick={() => setOrderType('dine_in')}
                    >
                      Tại quán
                    </button>
                    <button
                      type="button"
                      style={{
                        background: orderType === 'takeaway' ? 'linear-gradient(135deg, #D97706, #B45309)' : '#27272B',
                        color: orderType === 'takeaway' ? '#FFFFFF' : '#A1A1AA',
                        border: orderType === 'takeaway' ? '1px solid #F59E0B' : '1px solid #3F3F46',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      onClick={() => setOrderType('takeaway')}
                    >
                      Mang về
                    </button>
                  </div>
                </div>

                {orderType === 'dine_in' && (
                  <div>
                    <select
                      className="form-select"
                      value={selectedTableId}
                      onChange={(e) => {
                        setSelectedTableId(e.target.value);
                        const match = tablesList.find((t) => String(t.id) === String(e.target.value));
                        if (match) setSelectedTableCode(match.code);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '0.8rem',
                        background: '#18181B',
                        color: '#F4F1EC',
                        border: '1px solid #2E2E35',
                        borderRadius: '6px',
                      }}
                    >
                      {tablesList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} - {t.area_name || 'Khu vực'} ({t.seats} chỗ) {t.status === 'occupied' ? '• Đang có khách' : t.status === 'reserved' ? '• Đã đặt trước' : '• Trống'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 2. DANH SÁCH MÓN ĐÃ CHỌN (CART ITEMS) - ĐẶT NGAY ĐÂY ĐỂ DỄ THEO DÕI */}
              <div style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: '#27272B', borderBottom: '1px solid #2E2E35', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC' }}>
                    🛒 MÓN ĐANG CHỌN ({cart.reduce((sum, it) => sum + it.quantity, 0)} ly)
                  </span>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCart}
                      style={{ background: 'none', border: 'none', color: '#F87171', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Xóa tất cả
                    </button>
                  )}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#18181B', color: '#A1A1AA', fontSize: '0.72rem', borderBottom: '1px solid #27272B' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tên món</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', width: '70px' }}>SL</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '75px' }}>T.Tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '24px 12px', color: '#71717A' }}>
                          <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>☕</div>
                          Chưa có món nào. Nhấn "+ Thêm" từ danh sách.
                        </td>
                      </tr>
                    ) : (
                      cart.map((item, idx) => {
                        const prod = products.find((p) => p.id === item.product_id);
                        const availableSizes = prod?.sizes && prod.sizes.length > 1
                          ? Array.from(new Map(prod.sizes.map((s) => [s.name, s])).values())
                          : [];

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #27272B', background: idx % 2 === 0 ? '#18181B' : '#1C1C20' }}>
                            <td style={{ padding: '7px 8px' }}>
                              <div style={{ fontWeight: 600, color: '#F4F1EC', lineHeight: 1.25 }}>{item.name}</div>
                              {availableSizes.length > 1 ? (
                                <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                                  {availableSizes.map((sz) => {
                                    const active = item.size_name === sz.name;
                                    return (
                                      <button
                                        key={sz.name}
                                        type="button"
                                        onClick={() => updateCartItemSize(idx, sz.name)}
                                        style={{
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          fontSize: '0.68rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          border: active ? '1px solid #F59E0B' : '1px solid #3F3F46',
                                          background: active ? 'linear-gradient(135deg, #D97706, #B45309)' : '#27272B',
                                          color: active ? '#FFFFFF' : '#A1A1AA',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={`Đổi sang Size ${sz.name} (${fmt(sz.price)})`}
                                      >
                                        {sz.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                item.size_name && item.size_name !== 'Tiêu chuẩn' && item.size_name !== 'default' && (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      marginTop: '2px',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      background: 'rgba(217, 119, 6, 0.15)',
                                      color: '#FBBF24',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid rgba(217, 119, 6, 0.3)',
                                    }}
                                  >
                                    Size {item.size_name}
                                  </span>
                                )
                              )}
                            </td>
                            <td style={{ padding: '7px 4px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <button
                                  type="button"
                                  style={{ width: '20px', height: '20px', borderRadius: '4px', border: '1px solid #3F3F46', background: '#27272B', color: '#F4F1EC', cursor: 'pointer', lineHeight: '16px', fontSize: '12px' }}
                                  onClick={() => updateCartLineQty(idx, -1)}
                                >
                                  -
                                </button>
                                <span style={{ fontWeight: 700, minWidth: '16px', textAlign: 'center', color: '#F4F1EC' }}>{item.quantity}</span>
                                <button
                                  type="button"
                                  style={{ width: '20px', height: '20px', borderRadius: '4px', border: '1px solid #3F3F46', background: '#27272B', color: '#F4F1EC', cursor: 'pointer', lineHeight: '16px', fontSize: '12px' }}
                                  onClick={() => updateCartLineQty(idx, 1)}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#FBBF24' }}>
                              {fmt(item.price * item.quantity)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* 3. HỘI VIÊN & TÍCH ĐIỂM */}
              <div
                style={{
                  background: '#202024',
                  border: '1px solid #2A2A30',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC', margin: 0 }}>
                    👤 HỘI VIÊN &amp; TÍCH ĐIỂM:
                  </label>
                  {customerInfo && (
                    <span style={{ fontSize: '0.7rem', color: '#34D399', fontWeight: 800, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1px 6px', borderRadius: '8px' }}>
                      ⭐ Hạng {customerInfo.tier_name || 'Đồng'}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '6px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="SĐT hội viên"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      lookupCustomerByPhone(e.target.value);
                    }}
                    style={{ padding: '5px 8px', fontSize: '0.8rem', background: '#18181B', border: '1px solid #2E2E35', color: '#F4F1EC', borderRadius: '6px' }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tên khách"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    style={{ padding: '5px 8px', fontSize: '0.8rem', background: '#18181B', border: '1px solid #2E2E35', color: '#F4F1EC', borderRadius: '6px' }}
                  />
                </div>

                {customerInfo && (
                  <div
                    style={{
                      background: '#18181B',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      border: '1px solid #2E2E35',
                      fontSize: '0.74rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA' }}>
                      <span>Điểm tích lũy hiện có:</span>
                      <strong style={{ color: '#34D399' }}>{customerInfo.points_balance || 0} điểm</strong>
                    </div>

                    {Number(customerInfo.points_balance || 0) > 0 && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#FBBF24', marginTop: '2px' }}>
                        <input
                          type="checkbox"
                          checked={usePoints}
                          onChange={(e) => setUsePoints(e.target.checked)}
                        />
                        <span>Đổi {effectivePointsRedeemed} điểm (giảm {fmt(pointsDiscount)})</span>
                      </label>
                    )}
                  </div>
                )}
              </div>

              {/* 5. MÃ GIẢM GIÁ / VOUCHERS */}
              <div style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '10px', padding: '9px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC', margin: 0 }}>
                    🏷️ MÃ GIẢM GIÁ / VOUCHER:
                  </label>
                  {appliedCoupon && (
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      style={{ background: 'none', border: 'none', color: '#F87171', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      ✕ Hủy mã
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Nhập mã (COFFEE10, GIAM20K...)"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    style={{ padding: '5px 8px', fontSize: '0.82rem', textTransform: 'uppercase', fontWeight: 700, background: '#18181B', border: '1px solid #2E2E35', color: '#F4F1EC', borderRadius: '6px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ background: 'linear-gradient(135deg, #D97706, #B45309)', borderColor: '#D97706', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                    onClick={() => handleApplyCoupon()}
                  >
                    Áp dụng
                  </button>
                </div>

                {/* Quick Voucher Pills */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {availableCoupons.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleApplyCoupon(c.code)}
                      title={c.desc}
                      style={{
                        padding: '2px 7px',
                        borderRadius: '4px',
                        border: appliedCoupon?.code === c.code ? '1px solid #10B981' : '1px solid #2E2E35',
                        background: appliedCoupon?.code === c.code ? 'rgba(16, 185, 129, 0.2)' : '#18181B',
                        color: appliedCoupon?.code === c.code ? '#34D399' : '#FBBF24',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {appliedCoupon?.code === c.code ? '✅ ' : '🏷️ '}{c.code}
                    </button>
                  ))}
                </div>

                {appliedCoupon && (
                  <div style={{ marginTop: '6px', fontSize: '0.74rem', color: '#34D399', fontWeight: 700 }}>
                    🎉 Đã áp dụng: {appliedCoupon.name} (-{fmt(discount)})
                  </div>
                )}
              </div>

              {/* 6. Ghi chú đơn */}
              <div style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '10px', padding: '9px 12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC', display: 'block', marginBottom: '4px' }}>
                  📝 Ghi chú đơn:
                </label>
                <textarea
                  className="form-input"
                  rows={1}
                  placeholder="Ghi chú pha chế (ít đá, ít đường, không ngọt...)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ fontSize: '0.82rem', padding: '6px', background: '#18181B', border: '1px solid #2E2E35', color: '#F4F1EC', borderRadius: '6px', width: '100%' }}
                />
              </div>
            </div>

            {/* PINNED FOOTER: TOTALS & ACTION BUTTONS */}
            <div className="pos-checkout-footer">
              {/* Totals Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.84rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#A1A1AA' }}>Tổng tiền hàng:</span>
                  <span style={{ fontWeight: 700, color: '#F4F1EC' }}>{fmt(totalAmount)}</span>
                </div>
                {tierDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34D399' }}>
                    <span>Ưu đãi hạng {customerInfo?.tier_name} (-{customerInfo?.discount_pct}%):</span>
                    <span style={{ fontWeight: 700 }}>-{fmt(tierDiscount)}</span>
                  </div>
                )}
                {pointsDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38BDF8' }}>
                    <span>Đổi điểm tích lũy ({effectivePointsRedeemed} điểm):</span>
                    <span style={{ fontWeight: 700 }}>-{fmt(pointsDiscount)}</span>
                  </div>
                )}
                {Number(discount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#F87171' }}>
                    <span>Giảm giá voucher:</span>
                    <span style={{ fontWeight: 700 }}>-{fmt(discount)}</span>
                  </div>
                )}
                {Number(tax) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA' }}>
                    <span>Thuế:</span>
                    <span style={{ fontWeight: 700, color: '#F4F1EC' }}>+{fmt(tax)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #3F3F46', paddingTop: '6px', marginTop: '2px', fontSize: '1.22rem', fontWeight: 900, color: '#F59E0B' }}>
                  <span>Thành tiền:</span>
                  <span>{fmt(finalTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#A1A1AA', borderTop: '1px solid #27272B', paddingTop: '3px' }}>
                  <span>Tích lũy đơn này (10k = 1đ):</span>
                  <span style={{ color: '#34D399', fontWeight: 800 }}>+{earnedPoints} điểm</span>
                </div>

                {/* Quick Payment Method Selector */}
                <div style={{ marginTop: '4px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#A1A1AA', fontWeight: 600, marginBottom: '4px' }}>
                    Phương thức thanh toán:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        background: paymentMethod === 'Tiền mặt' ? 'linear-gradient(135deg, #D97706, #B45309)' : '#27272B',
                        color: paymentMethod === 'Tiền mặt' ? '#FFFFFF' : '#A1A1AA',
                        border: paymentMethod === 'Tiền mặt' ? '1.5px solid #F59E0B' : '1px solid #3F3F46',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        padding: '7px 4px',
                        boxShadow: paymentMethod === 'Tiền mặt' ? '0 2px 8px rgba(217, 119, 6, 0.35)' : 'none',
                      }}
                      onClick={() => setPaymentMethod('Tiền mặt')}
                    >
                      💵 Tiền mặt
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        background: paymentMethod === 'QR Banking' ? 'linear-gradient(135deg, #D97706, #B45309)' : '#27272B',
                        color: paymentMethod === 'QR Banking' ? '#FFFFFF' : '#A1A1AA',
                        border: paymentMethod === 'QR Banking' ? '1.5px solid #F59E0B' : '1px solid #3F3F46',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        padding: '7px 4px',
                        boxShadow: paymentMethod === 'QR Banking' ? '0 2px 8px rgba(217, 119, 6, 0.35)' : 'none',
                      }}
                      onClick={() => setPaymentMethod('QR Banking')}
                    >
                      💠 Quét QR VietQR
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flex: 1, borderColor: '#3F3F46', background: '#27272B', color: '#F87171', fontWeight: 700, padding: '9px 6px', fontSize: '0.82rem' }}
                    onClick={clearCart}
                    disabled={cart.length === 0 || isSubmitting}
                  >
                    XÓA GIỎ
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      flex: 2,
                      background: isSubmitting ? '#4B5563' : 'linear-gradient(135deg, #D97706, #B45309)',
                      borderColor: '#D97706',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      padding: '9px 12px',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(217, 119, 6, 0.4)',
                    }}
                    onClick={() => {
                      if (paymentMethod === 'QR Banking') {
                        setShowQrModal(true);
                      } else {
                        handleCompletePayment('Tiền mặt');
                      }
                    }}
                    disabled={cart.length === 0 || isSubmitting}
                  >
                    {isSubmitting
                      ? 'Đang xử lý...'
                      : paymentMethod === 'QR Banking'
                      ? 'Thanh toán QR (F9)'
                      : 'Thu tiền mặt (F9)'}
                  </button>
                </div>

                <button
                  type="button"
                  style={{
                    background: '#27272B',
                    border: '1px solid #3F3F46',
                    color: '#E4E4E7',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={handleOpenPayment}
                  disabled={cart.length === 0 || isSubmitting}
                >
                  ⚙️ Quầy thu ngân nâng cao ➔
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* SCREEN 2: PAYMENT & DIRECT CHECKOUT MODAL (matching image4.png + Techcombank VietQR) */
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top 4 Stats Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#F4F1EC' }}>
              <span style={{ fontSize: '1.6rem', background: '#27272B', width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🛍️</span>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>TỔNG TIỀN HÀNG</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#F4F1EC' }}>{fmt(totalAmount)}</div>
              </div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#F4F1EC' }}>
              <span style={{ fontSize: '1.6rem', background: '#27272B', width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🏷️</span>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>GIẢM GIÁ {appliedCoupon ? `(${appliedCoupon.code})` : ''}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: discount > 0 ? '#34D399' : '#F4F1EC' }}>{fmt(discount)}</div>
              </div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#F4F1EC' }}>
              <span style={{ fontSize: '1.6rem', background: '#27272B', width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{orderType === 'takeaway' ? '🛍️' : '☕'}</span>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>HÌNH THỨC</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FBBF24' }}>
                  {orderType === 'takeaway' ? 'Mang về' : 'Tại quán'}
                </div>
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #D97706, #B45309)', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#FFFFFF', boxShadow: '0 4px 16px rgba(217, 119, 6, 0.35)' }}>
              <span style={{ fontSize: '1.6rem', background: 'rgba(255,255,255,0.2)', width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💵</span>
              <div>
                <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)', fontWeight: 700, textTransform: 'uppercase' }}>THÀNH TIỀN (PHẢI THU)</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#FFFFFF' }}>{fmt(finalTotal)}</div>
              </div>
            </div>
          </div>

          {/* 3 Columns Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 1.2fr', gap: '16px' }}>
            {/* Column 1: Thông tin đơn & Danh sách món */}
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '14px', padding: '16px', color: '#F4F1EC' }}>
              <div style={{ borderBottom: '1px solid #27272B', paddingBottom: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F4F1EC' }}>
                    📋 THÔNG TIN ĐƠN HÀNG
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    background: 'rgba(217, 119, 6, 0.15)',
                    color: '#FBBF24',
                    border: '1px solid rgba(217, 119, 6, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 800,
                  }}>
                    ☕ Trực tiếp tại quầy
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '4px', color: '#A1A1AA' }}>
                  <div><strong style={{ color: '#F4F1EC' }}>Mã hóa đơn:</strong> DH-{new Date().toISOString().slice(2, 10).replace(/-/g, '')}-POS</div>
                  <div><strong style={{ color: '#F4F1EC' }}>Hình thức:</strong> ☕ Bán trực tiếp tại quầy (Direct POS)</div>
                  <div><strong style={{ color: '#F4F1EC' }}>Khách hàng:</strong> {customerName}</div>
                  <div><strong style={{ color: '#F4F1EC' }}>Số điện thoại:</strong> {customerPhone}</div>
                  {appliedCoupon && (
                    <div style={{ color: '#34D399' }}><strong>Mã giảm giá:</strong> {appliedCoupon.code} (-{fmt(discount)})</div>
                  )}
                  <div><strong style={{ color: '#F4F1EC' }}>Ngày lập:</strong> {new Date().toLocaleString('vi-VN')}</div>
                  <div><strong style={{ color: '#F4F1EC' }}>Nhân viên:</strong> {user?.full_name || 'Thu Ngân'}</div>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F4F1EC', marginBottom: '8px' }}>
                ☕ DANH SÁCH SẢN PHẨM ({cart.length} món)
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #2A2A30', borderRadius: '8px', marginBottom: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#202024', color: '#A1A1AA', borderBottom: '1px solid #27272B' }}>
                      <th style={{ width: '30px', padding: '7px 8px', textAlign: 'center' }}>STT</th>
                      <th style={{ padding: '7px 8px', textAlign: 'left' }}>Sản phẩm</th>
                      <th style={{ textAlign: 'center', width: '35px', padding: '7px 4px' }}>SL</th>
                      <th style={{ textAlign: 'right', padding: '7px 8px' }}>Đơn giá</th>
                      <th style={{ textAlign: 'right', padding: '7px 8px' }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => {
                      const prod = products.find(p => p.id === item.product_id);
                      const uniqueSizes = prod?.sizes && prod.sizes.length > 1
                        ? Array.from(new Map(prod.sizes.map((s) => [s.name, s])).values())
                        : [];
                      const hasMultiSizes = uniqueSizes.length > 1;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #27272B', background: idx % 2 === 0 ? '#18181B' : '#1C1C20' }}>
                          <td style={{ textAlign: 'center', color: '#71717A', padding: '7px 8px' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600, padding: '7px 8px' }}>
                            <div style={{ fontSize: '0.82rem', color: '#F4F1EC' }}>{item.name}</div>
                            {hasMultiSizes && (
                              <div style={{ display: 'inline-flex', gap: '3px', marginTop: '3px' }}>
                                {uniqueSizes.map((szObj) => {
                                  const sz = szObj.name;
                                  const isCurrent = item.size_name === sz;
                                  return (
                                    <button
                                      key={sz}
                                      type="button"
                                      onClick={() => updateCartItemSize(idx, sz)}
                                      style={{
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.68rem',
                                        fontWeight: 800,
                                        border: isCurrent ? '1.5px solid #F59E0B' : '1px solid #3F3F46',
                                        background: isCurrent ? 'linear-gradient(135deg, #D97706, #B45309)' : '#27272B',
                                        color: isCurrent ? '#ffffff' : '#A1A1AA',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                      }}
                                      title={`Đổi sang Size ${sz}`}
                                    >
                                      Size {sz}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#F4F1EC', padding: '7px 4px' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'right', color: '#A1A1AA', padding: '7px 8px' }}>{fmt(item.price)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#FBBF24', padding: '7px 8px' }}>{fmt(item.price * item.quantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', borderColor: '#3F3F46', background: '#202024', color: '#E4E4E7', fontWeight: 600, fontSize: '0.82rem', padding: '9px' }}
                onClick={() => setShowPayment(false)}
              >
                ← QUAY LẠI ĐƠN HÀNG
              </button>
            </div>

            {/* Column 2: Tiền khách đưa & Phương thức thanh toán + VietQR Techcombank Card */}
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', color: '#F4F1EC' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F4F1EC', display: 'block', marginBottom: '4px' }}>
                  💵 KHÁCH ĐƯA:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    className="form-input"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34D399', padding: '8px 12px', background: '#202024', border: '1px solid #2E2E35' }}
                  />
                  <span style={{ position: 'absolute', right: '12px', top: '10px', fontWeight: 700, color: '#A1A1AA' }}>đ</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F4F1EC', display: 'block', marginBottom: '4px' }}>
                  💸 TIỀN THỪA TRẢ LẠI:
                </label>
                <div style={{
                  padding: '10px', background: '#202024', border: '1px solid #2E2E35', borderRadius: '8px',
                  fontSize: '1.15rem', fontWeight: 800,
                  color: changeDue < 0 ? '#F87171' : '#34D399'
                }}>
                  {changeDue < 0 ? `Thiếu: ${fmt(Math.abs(changeDue))}` : `Thừa: ${fmt(changeDue)}`}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F4F1EC', display: 'block', marginBottom: '6px' }}>
                  💳 PHƯƠNG THỨC THANH TOÁN:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'Tiền mặt', label: '💵 Tiền mặt (Cash)', sub: 'Thu ngân nhận tiền mặt' },
                    { id: 'QR Banking', label: '💠 Quét mã QR', sub: 'VietQR Techcombank 24/7' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="btn btn-sm"
                      style={{
                        background: paymentMethod === m.id ? 'linear-gradient(135deg, #D97706, #B45309)' : '#202024',
                        color: paymentMethod === m.id ? '#FFFFFF' : '#A1A1AA',
                        border: paymentMethod === m.id ? '1.5px solid #F59E0B' : '1px solid #2E2E35',
                        fontWeight: 700,
                        padding: '10px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                        boxShadow: paymentMethod === m.id ? '0 2px 10px rgba(217, 119, 6, 0.4)' : 'none',
                      }}
                      onClick={() => setPaymentMethod(m.id)}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{m.label}</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>{m.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* VietQR Techcombank Card matching Screenshot */}
              {(paymentMethod !== 'Tiền mặt' || showPayment) && (
                <div style={{
                  background: '#202024',
                  border: '1px solid #2E2E35',
                  borderRadius: '10px',
                  padding: '10px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FB7185', fontWeight: 800, fontSize: '0.85rem' }}>
                      <span>💠</span>
                      <span>TECHCOMBANK</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', background: 'rgba(225, 29, 72, 0.15)', color: '#FB7185', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(225, 29, 72, 0.3)' }}>
                      VietQR • Napas247
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <img
                      src={vietQrUrl}
                      alt="Techcombank VietQR"
                      style={{ width: '90px', height: '90px', borderRadius: '6px', border: '1px solid #3F3F46', objectFit: 'contain', background: '#fff' }}
                    />
                    <div style={{ fontSize: '0.78rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ color: '#A1A1AA', fontSize: '0.72rem' }}>Quét mã để chuyển tiền đến:</div>
                      <div style={{ fontWeight: 800, color: '#F4F1EC' }}>{BANK_CONFIG.accountHolder}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: '#FB7185', fontSize: '0.88rem' }}>{BANK_CONFIG.accountNumber}</span>
                        <button
                          type="button"
                          onClick={copyAccountNumber}
                          style={{ border: 'none', background: '#27272B', color: '#F4F1EC', borderRadius: '4px', padding: '2px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}
                        >
                          📋 Copy
                        </button>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                        Số tiền: <strong style={{ color: '#F59E0B' }}>{fmt(finalTotal)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC', display: 'block', marginBottom: '2px' }}>
                  📝 GHI CHÚ:
                </label>
                <textarea
                  className="form-input"
                  rows={1}
                  placeholder="Ghi chú đơn hàng (nếu có)..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ background: '#202024', border: '1px solid #2E2E35', color: '#F4F1EC', borderRadius: '6px' }}
                />
              </div>
            </div>

            {/* Column 3: Virtual Numpad & Submit Buttons */}
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#F4F1EC' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F4F1EC' }}>
                    🔢 NHẬP SỐ TIỀN KHÁCH ĐƯA:
                  </div>
                </div>

                {/* Quick Cash Buttons */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: 'linear-gradient(135deg, #D97706, #B45309)', color: '#ffffff', fontWeight: 700, padding: '6px 10px', fontSize: '0.78rem', border: 'none', borderRadius: '6px' }}
                    onClick={() => setCashGiven(String(finalTotal))}
                  >
                    Đúng tiền
                  </button>
                  {[50000, 100000, 200000, 500000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className="btn btn-sm"
                      style={{ background: '#202024', color: '#E4E4E7', border: '1px solid #2E2E35', fontWeight: 600, padding: '6px 10px', fontSize: '0.78rem', borderRadius: '6px' }}
                      onClick={() => setCashGiven(String(amt))}
                    >
                      {fmt(amt)}
                    </button>
                  ))}
                </div>

                <div className="pos-numpad">
                  {['7', '8', '9', 'x', '4', '5', '6', '+', '1', '2', '3', '-', '0', '000', '.', 'C'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="pos-numpad-btn"
                      onClick={() => handleNumpad(k)}
                      title={k === 'x' ? 'Xóa 1 số (Backspace)' : k === 'C' ? 'Xóa hết' : ''}
                      style={{ background: '#202024', border: '1px solid #2E2E35', color: '#F4F1EC' }}
                    >
                      {k === 'x' ? '⌫' : k}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: 'rgba(217, 119, 6, 0.4)', color: '#FBBF24', background: 'rgba(217, 119, 6, 0.1)', fontWeight: 700, padding: '12px', borderRadius: '8px' }}
                  onClick={() => window.print()}
                >
                  <span>🖨️</span>
                  <span>IN HÓA ĐƠN</span>
                </button>

                {paymentMethod === 'Tiền mặt' && cashGiven !== '' && Number(cashGiven) < finalTotal && (
                  <div style={{ color: '#F87171', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px' }}>
                    ⚠️ Tiền khách đưa chưa đủ (còn thiếu {fmt(finalTotal - Number(cashGiven))})
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    background: (isSubmitting || (paymentMethod === 'Tiền mặt' && cashGiven !== '' && Number(cashGiven) < finalTotal)) ? '#4B5563' : 'linear-gradient(135deg, #D97706, #B45309)',
                    borderColor: (isSubmitting || (paymentMethod === 'Tiền mặt' && cashGiven !== '' && Number(cashGiven) < finalTotal)) ? '#4B5563' : '#D97706',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    padding: '14px',
                    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
                    cursor: (isSubmitting || (paymentMethod === 'Tiền mặt' && cashGiven !== '' && Number(cashGiven) < finalTotal)) ? 'not-allowed' : 'pointer',
                    borderRadius: '8px',
                  }}
                  disabled={isSubmitting || cart.length === 0 || (paymentMethod === 'Tiền mặt' && cashGiven !== '' && Number(cashGiven) < finalTotal)}
                  onClick={() => handleCompletePayment()}
                >
                  <span>{isSubmitting ? '⏳' : '✅'}</span>
                  <span>{isSubmitting ? 'ĐANG XỬ LÝ THANH TOÁN...' : 'XÁC NHẬN THANH TOÁN & BÁO BARISTA (F9)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2.5: HÓA ĐƠN & QUÉT MÃ QR VIETQR (TECHCOMBANK) -> HIỆN THẲNG GIỮA MÀN HÌNH */}
      {showQrModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '24px 16px',
            overflowY: 'auto',
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="animate-fade-in"
            style={{
              background: '#18181B',
              borderRadius: '18px',
              maxWidth: '720px',
              width: '100%',
              maxHeight: 'min(90vh, 580px)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 65px rgba(0,0,0,0.65)',
              border: '1px solid #2A2A30',
              color: '#F4F1EC',
              overflow: 'hidden',
              margin: 'auto',
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: HÓA ĐƠN & QUÉT QR */}
            <div
              style={{
                background: '#202024',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #2A2A30',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>🧾</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#F4F1EC' }}>
                    Hóa đơn &amp; Quét mã QR thanh toán
                  </h3>
                  <div style={{ fontSize: '0.74rem', color: '#F59E0B', marginTop: '2px' }}>
                    Techcombank VietQR Napas247 • Chuyển khoản tức thì
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#A1A1AA',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Body: 2 Columns */}
            <div
              style={{
                padding: '16px 20px',
                display: 'grid',
                gridTemplateColumns: '220px 1fr',
                gap: '16px',
                alignItems: 'start',
                flex: 1,
                overflowY: 'auto',
              }}
            >
              {/* Left Column: QR Code & Bank Info */}
              <div
                style={{
                  background: '#202024',
                  borderRadius: '12px',
                  border: '1px solid #2A2A30',
                  padding: '10px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                }}
              >
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>💠</span>
                  <span>TECHCOMBANK VIETQR</span>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    padding: '6px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  }}
                >
                  <img
                    src={vietQrUrl}
                    alt="Mã QR Chuyển khoản Techcombank"
                    style={{
                      width: '145px',
                      height: '145px',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </div>

                <div style={{ fontSize: '0.76rem', color: '#A1A1AA', width: '100%', textAlign: 'left', lineHeight: 1.35 }}>
                  <div>Chủ TK: <strong style={{ color: '#F4F1EC' }}>{BANK_CONFIG.accountHolder}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                    <span>Số TK: <strong style={{ color: '#F59E0B' }}>{BANK_CONFIG.accountNumber}</strong></span>
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      style={{
                        background: '#2A2A30',
                        border: '1px solid #3F3F46',
                        color: '#F59E0B',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div style={{ marginTop: '2px' }}>
                    Ngân hàng: <strong style={{ color: '#F4F1EC' }}>{BANK_CONFIG.bankName}</strong>
                  </div>
                </div>
              </div>

              {/* Right Column: Order Details & Confirmation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Items Summary */}
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F59E0B', marginBottom: '6px' }}>
                    ☕ Chi tiết món ({cart.length} món):
                  </div>
                  <div
                    style={{
                      maxHeight: '120px',
                      overflowY: 'auto',
                      border: '1px solid #2A2A30',
                      borderRadius: '8px',
                      background: '#202024',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#18181B', color: '#A1A1AA', borderBottom: '1px solid #27272B' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Món</th>
                          <th style={{ textAlign: 'center', width: '35px', padding: '6px 4px' }}>SL</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px' }}>Đơn giá</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px' }}>T.Tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((it, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #27272B', background: idx % 2 === 0 ? '#202024' : '#1C1C20' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: '#F4F1EC' }}>
                              {it.name} {it.size_name && it.size_name !== 'Tiêu chuẩn' ? `(${it.size_name})` : ''}
                            </td>
                            <td style={{ textAlign: 'center', color: '#FBBF24', fontWeight: 700, padding: '6px 4px' }}>{it.quantity}</td>
                            <td style={{ textAlign: 'right', color: '#A1A1AA', padding: '6px 8px' }}>{fmt(it.price)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#FBBF24', padding: '6px 8px' }}>{fmt(it.price * it.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Price Breakdown */}
                <div
                  style={{
                    background: '#202024',
                    border: '1px solid #2A2A30',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA' }}>
                    <span>Tổng tiền hàng:</span>
                    <span style={{ fontWeight: 700, color: '#F4F1EC' }}>{fmt(totalAmount)}</span>
                  </div>
                  {Number(discount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#F87171' }}>
                      <span>Giảm giá voucher ({appliedCoupon?.code || 'KM'}):</span>
                      <span style={{ fontWeight: 700 }}>-{fmt(discount)}</span>
                    </div>
                  )}
                  {Number(tax) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA' }}>
                      <span>Thuế:</span>
                      <span style={{ fontWeight: 700, color: '#F4F1EC' }}>+{fmt(tax)}</span>
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '1px dashed #3F3F46',
                      paddingTop: '6px',
                      marginTop: '2px',
                      fontSize: '1.2rem',
                      fontWeight: 900,
                      color: '#F59E0B',
                    }}
                  >
                    <span>CẦN THANH TOÁN:</span>
                    <span>{fmt(finalTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div
              style={{
                background: '#1F1F23',
                borderTop: '1px solid #27272B',
                padding: '12px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                className="btn btn-outline"
                style={{ borderColor: '#3F3F46', color: '#D4D4D8', fontWeight: 600, padding: '8px 14px', fontSize: '0.85rem' }}
                onClick={() => setShowQrModal(false)}
                disabled={isSubmitting}
              >
                ✕ HỦY BỎ / CHỌN LẠI
              </button>

              <button
                type="button"
                className="btn btn-outline"
                style={{ borderColor: 'rgba(217, 119, 6, 0.4)', color: '#FBBF24', fontWeight: 700, padding: '8px 14px', fontSize: '0.85rem', background: 'rgba(217, 119, 6, 0.1)' }}
                onClick={() => window.print()}
                title="In hóa đơn tạm tính cho khách"
              >
                🖨️ IN TẠM TÍNH
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{
                  background: isSubmitting ? '#4B5563' : 'linear-gradient(135deg, #D97706, #B45309)',
                  borderColor: '#D97706',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  padding: '9px 20px',
                  boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                disabled={isSubmitting}
                onClick={() => handleCompletePayment('QR Banking')}
              >
                <span>{isSubmitting ? '⏳' : '✅'}</span>
                <span>{isSubmitting ? 'ĐANG LƯU ĐƠN HÀNG...' : 'XÁC NHẬN ĐÃ NHẬN TIỀN (HOÀN THÀNH ĐƠN)'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: HÓA ĐƠN BÁN HÀNG & THANH TOÁN (HIỆN LÊN GIỮA MÀN HÌNH NGAY SAU KHI THANH TOÁN) */}
      {completedOrder && createPortal(
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '24px 16px',
            overflowY: 'auto',
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              background: '#18181B',
              borderRadius: '16px',
              maxWidth: '740px',
              width: '100%',
              maxHeight: 'min(90vh, 620px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 65px rgba(0,0,0,0.85), 0 0 0 1px rgba(245, 158, 11, 0.25)',
              border: '1px solid #2A2A30',
              color: '#fdf8f0',
              margin: 'auto',
              flexShrink: 0,
            }}
          >
            {/* Header: HÓA ĐƠN BÁN HÀNG & THANH TOÁN */}
            <div style={{ background: '#1F1F23', color: '#ffffff', padding: '16px 20px', textAlign: 'center', borderBottom: '1px solid #27272B', position: 'relative', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '1.5rem' }}>☕</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '1px' }}>
                  MY COFFEE HOUSE
                </span>
              </div>
              <h2 style={{ margin: '2px 0 4px', fontSize: '1.3rem', fontWeight: 900, color: '#fef3c7', letterSpacing: '0.5px' }}>
                🧾 HÓA ĐƠN BÁN HÀNG &amp; THANH TOÁN
              </h2>
              <div style={{ fontSize: '0.84rem', color: '#fbbf24', fontWeight: 700 }}>
                MÃ HÓA ĐƠN: <span style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.35)' }}>{completedOrder.invoiceNo}</span>
              </div>

              {/* Status Badges */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  padding: '3px 12px',
                  borderRadius: '20px',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                }}>
                  ✅ ĐÃ THANH TOÁN 100% (PAID)
                </span>

                <span style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '3px 12px',
                  borderRadius: '20px',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                }}>
                  ☕ ĐÃ CHUYỂN BARISTA PHA CHẾ
                </span>
              </div>

              {/* Auto Redirect Countdown */}
              <div
                style={{
                  margin: '8px auto 0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8',
                  padding: '3px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                <span>⏳ Tự động chuyển về TRANG CHỦ trong <strong>{redirectCountdown}s</strong>...</span>
                <button
                  type="button"
                  onClick={() => setAutoRedirectEnabled(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fbbf24',
                    textDecoration: 'underline',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    fontWeight: 800,
                  }}
                >
                  [Tạm dừng đếm ngược]
                </button>
              </div>
            </div>

            {/* Content Body: Chi Tiết Hóa Đơn */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
              {/* Order Items Table */}
              <div>
                <div style={{ fontWeight: 700, color: '#fef3c7', marginBottom: '6px', fontSize: '0.85rem', fontFamily: "'Playfair Display', Georgia, serif" }}>
                  ☕ Chi tiết món trong hóa đơn:
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#202024', color: '#A1A1AA', borderBottom: '1px solid #27272B' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Tên món</th>
                      <th style={{ width: '75px', textAlign: 'center', padding: '8px 4px' }}>Size</th>
                      <th style={{ width: '45px', textAlign: 'center', padding: '8px 4px' }}>SL</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Đơn giá</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedOrder.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #27272B', background: idx % 2 === 0 ? '#18181B' : '#1C1C20' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#F4F1EC' }}>{it.name}</td>
                        <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                          {it.size_name && it.size_name !== 'Tiêu chuẩn' ? (
                            <span style={{ background: 'rgba(217, 119, 6, 0.15)', color: '#FBBF24', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '0.74rem', border: '1px solid rgba(217, 119, 6, 0.3)' }}>
                              Size {it.size_name}
                            </span>
                          ) : (
                            <span style={{ color: '#71717A', fontSize: '0.74rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#F4F1EC', padding: '8px 4px' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right', color: '#A1A1AA', padding: '8px 10px' }}>{fmt(it.price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#FBBF24', padding: '8px 10px' }}>
                          {fmt(it.price * it.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Payments Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', background: '#202024', padding: '12px 16px', borderRadius: '12px', border: '1px solid #2A2A30', color: '#fef3c7' }}>
                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Vị trí phục vụ: <strong style={{ color: '#fbbf24' }}>🪑 {completedOrder.tableCode || 'Tại bàn'}</strong></div>
                  <div>Khách hàng: <strong>{completedOrder.customerName}</strong> ({completedOrder.customerTier || 'Đồng'})</div>
                  <div>Số điện thoại: <strong>{completedOrder.customerPhone || '—'}</strong></div>
                  <div>Phương thức: <strong>{completedOrder.paymentMethod}</strong></div>
                  <div>Thu ngân: <strong>{completedOrder.cashierName}</strong></div>
                  <div>Thời gian: <strong>{completedOrder.date}</strong></div>
                </div>

                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                  <div>Tổng tiền hàng: <strong>{fmt(completedOrder.subtotal)}</strong></div>
                  {Number(completedOrder.tierDiscount) > 0 && (
                    <div style={{ color: '#34d399' }}>Ưu đãi hạng hội viên: -{fmt(completedOrder.tierDiscount)}</div>
                  )}
                  {Number(completedOrder.pointsDiscount) > 0 && (
                    <div style={{ color: '#38bdf8' }}>Đổi điểm tích lũy ({completedOrder.pointsRedeemed}đ): -{fmt(completedOrder.pointsDiscount)}</div>
                  )}
                  {Number(completedOrder.discount) > 0 && !completedOrder.tierDiscount && !completedOrder.pointsDiscount && (
                    <div>Giảm giá ({completedOrder.couponCode || 'Voucher'}): <span style={{ color: '#ef4444' }}>-{fmt(completedOrder.discount)}</span></div>
                  )}
                  {Number(completedOrder.tax) > 0 && <div>Thuế: +{fmt(completedOrder.tax)}</div>}
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#34d399', borderTop: '1px solid #2A2A30', paddingTop: '4px' }}>
                    Thành tiền: {fmt(completedOrder.total)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#c4a482' }}>
                    Khách đưa: {fmt(completedOrder.cashGiven)} | Tiền thừa: <strong style={{ color: '#10b981' }}>{fmt(completedOrder.changeDue)}</strong>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#fbbf24', marginTop: '2px' }}>
                    💎 Tích lũy được cộng: <strong>+{completedOrder.earnedPoints || 0} điểm</strong>
                  </div>
                </div>
              </div>

              {/* Techcombank QR Confirmation Box */}
              <div style={{ border: '1px solid #2A2A30', borderRadius: '10px', padding: '10px 14px', background: '#202024', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <img
                  src={`https://img.vietqr.io/image/${BANK_CONFIG.bin}-${BANK_CONFIG.accountNumberRaw}-compact2.png?amount=${completedOrder.total}&addInfo=${encodeURIComponent(completedOrder.invoiceNo)}&accountName=${encodeURIComponent(BANK_CONFIG.accountHolder)}`}
                  alt="VietQR Techcombank"
                  style={{ width: '70px', height: '70px', borderRadius: '8px', border: '1px solid #3F3F46', background: '#ffffff', padding: '2px' }}
                />
                <div style={{ fontSize: '0.8rem', color: '#fef3c7' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#fbbf24', marginBottom: '2px' }}>Mã QR Techcombank đối soát:</div>
                  <div>Chủ TK: <strong>{BANK_CONFIG.accountHolder}</strong></div>
                  <div>Số TK: <strong>{BANK_CONFIG.accountNumber}</strong> (Techcombank)</div>
                  <div>Nội dung: <strong>{completedOrder.invoiceNo}</strong></div>
                </div>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div style={{ background: '#1F1F23', padding: '12px 18px', borderTop: '1px solid #27272B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ borderColor: '#3F3F46', color: '#fef3c7', fontWeight: 700, padding: '7px 12px', fontSize: '0.82rem' }}
                onClick={() => {
                  setAutoRedirectEnabled(false);
                  setCompletedOrder(null);
                  navigate('/orders');
                }}
              >
                <span>📋</span>
                <span>LIST ĐƠN HÀNG</span>
              </button>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {completedOrder.status === 'pending' && (
                  <button
                    type="button"
                    className="btn"
                    style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#ffffff', fontWeight: 700, padding: '7px 12px', fontSize: '0.82rem' }}
                    onClick={() => handleStartPreparingNow(completedOrder.orderId)}
                  >
                    <span>☕</span>
                    <span>BẮT ĐẦU PHA CHẾ</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24', fontWeight: 700, padding: '7px 12px', fontSize: '0.82rem', background: 'rgba(245, 158, 11, 0.1)' }}
                  onClick={() => window.print()}
                >
                  <span>🖨️</span>
                  <span>IN HÓA ĐƠN</span>
                </button>

                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: '#64748b', color: '#e2e8f0', fontWeight: 700, padding: '7px 12px', fontSize: '0.82rem' }}
                  onClick={() => {
                    setAutoRedirectEnabled(false);
                    setCompletedOrder(null);
                  }}
                >
                  <span>➕</span>
                  <span>Ở LẠI BÁN TIẾP</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #D97706, #B45309)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 800,
                    padding: '7px 16px',
                    fontSize: '0.85rem',
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)',
                  }}
                  onClick={() => {
                    setAutoRedirectEnabled(false);
                    setCompletedOrder(null);
                    navigate('/');
                  }}
                >
                  <span>🪑</span>
                  <span>VỀ SƠ ĐỒ BÀN ({redirectCountdown}s)</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* THERMAL PRINTABLE RECEIPT (K80 Format for window.print()) */}
      <div className="pos-thermal-receipt">
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 'bold' }}>MY COFFEE HOUSE</h2>
          <div style={{ fontSize: '11px', color: '#333' }}>Đ/c: 123 Nguyễn Văn Cừ, Quận 5, TP.HCM</div>
          <div style={{ fontSize: '11px', color: '#333' }}>Hotline: 1900 6868 - Wifi: MyCoffee_Free</div>
          <div style={{ margin: '6px 0', borderBottom: '1px dashed #000' }}></div>
          <h3 style={{ margin: '4px 0', fontSize: '14px', fontWeight: 'bold' }}>HÓA ĐƠN THANH TOÁN</h3>
          <div style={{ fontSize: '11px' }}>Thời gian: {new Date().toLocaleString('vi-VN')}</div>
          <div style={{ fontSize: '11px' }}>Thu ngân: {user?.full_name || 'Thu Ngân'}</div>
          <div style={{ fontSize: '11px' }}>Khách hàng: {customerName} ({customerPhone})</div>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ padding: '3px 0' }}>Tên món (Size)</th>
              <th style={{ textAlign: 'center', width: '25px' }}>SL</th>
              <th style={{ textAlign: 'right', width: '60px' }}>Đ.Giá</th>
              <th style={{ textAlign: 'right', width: '65px' }}>T.Tiền</th>
            </tr>
          </thead>
          <tbody>
            {(completedOrder ? completedOrder.items : cart).map((item, i) => (
              <tr key={i}>
                <td style={{ padding: '4px 0' }}>{item.name} ({item.size_name})</td>
                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right' }}>{fmt(item.price)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(item.price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
          <span>Tổng tiền hàng:</span>
          <span>{fmt(completedOrder ? completedOrder.subtotal : totalAmount)}</span>
        </div>
        {Number(completedOrder ? (completedOrder.discount ?? completedOrder.totalDiscount ?? 0) : totalDiscount) > 0 && (
          <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
            <span>Giảm giá:</span>
            <span>-{fmt(completedOrder ? (completedOrder.discount ?? completedOrder.totalDiscount ?? 0) : totalDiscount)}</span>
          </div>
        )}
        {Number(completedOrder ? completedOrder.tax : tax) > 0 && (
          <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
            <span>Thuế:</span>
            <span>+{fmt(completedOrder ? completedOrder.tax : tax)}</span>
          </div>
        )}
        <div style={{ fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', margin: '6px 0', borderTop: '1px solid #000', paddingTop: '4px' }}>
          <span>THÀNH TIỀN:</span>
          <span>{fmt(completedOrder ? completedOrder.total : finalTotal)}</span>
        </div>
        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
          <span>Phương thức:</span>
          <span>{completedOrder ? completedOrder.paymentMethod : paymentMethod}</span>
        </div>
        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
          <span>TK Techcombank:</span>
          <span>2402 2005 6666 (BUI VAN TRUONG)</span>
        </div>
        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
          <span>Khách đưa:</span>
          <span>{fmt(completedOrder ? completedOrder.cashGiven : cashGiven || finalTotal)}</span>
        </div>
        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
          <span>Tiền thừa:</span>
          <span>{fmt(completedOrder ? completedOrder.changeDue : Math.max(0, changeDue))}</span>
        </div>

        <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

        <div style={{ textAlign: 'center', fontSize: '11px' }}>
          <div>❤️ MY COFFEE HOUSE ❤️</div>
          <div>Cảm ơn Quý Khách! Hẹn gặp lại!</div>
          <div style={{ fontSize: '9px', marginTop: '4px', color: '#666' }}>Powered by MY COFFEE HOUSE POS System</div>
        </div>
      </div>
    </div>
  );
}
