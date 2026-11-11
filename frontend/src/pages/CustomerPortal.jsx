import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import socket from '../api/socket';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const FALLBACK_DRINK_IMG = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80';

// Cấu hình ngân hàng VietQR Techcombank đồng bộ giống giao diện Admin
const BANK_CONFIG = {
  bankName: 'Techcombank',
  bankFullName: 'Ngân hàng TMCP Kỹ Thương Việt Nam',
  accountNumber: '2402 2005 6666',
  accountNumberRaw: '240220056666',
  accountHolder: 'BUI VAN TRUONG',
  bin: '970407', // Techcombank BIN
};

const getCategoryIcon = (catId) => {
  switch (Number(catId)) {
    case 1: return '☕';
    case 2: return '🍵';
    case 3: return '🍧';
    case 4: return '🍰';
    case 5: return '🍹';
    case 6: return '🥜';
    case 9: return '🥜';
    default: return '☕';
  }
};

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
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- STATE GIỎ HÀNG (PANEL THANH TOÁN BÊN PHẢI GIỐNG ADMIN POS) ---
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('customer_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // --- STATE CHỌN SIZE KHI BẤM "+ THÊM" ---
  const [selectedProductForSize, setSelectedProductForSize] = useState(null);
  const [modalSelectedSize, setModalSelectedSize] = useState(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [modalNote, setModalNote] = useState('');

  // --- STATE THANH TOÁN & ƯU ĐÃI ---
  const [orderGeneralNote, setOrderGeneralNote] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherCodeInput, setVoucherCodeInput] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('QR Banking'); // 'QR Banking' | 'Tiền mặt'
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [completedOrderModal, setCompletedOrderModal] = useState(null);
  const [customerRedirectCountdown, setCustomerRedirectCountdown] = useState(4);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Tự động chuyển sang Lịch Sử Đơn Hàng / Tiến trình pha chế sau khi đặt đơn thành công
  useEffect(() => {
    if (!completedOrderModal) return;

    if (customerRedirectCountdown <= 0) {
      setCompletedOrderModal(null);
      setActiveTab('history');
      return;
    }

    const timer = setTimeout(() => {
      setCustomerRedirectCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [completedOrderModal, customerRedirectCountdown]);

  // --- STATE GIỜ MỞ CỬA & HẸN GIỜ ĐẶT TRƯỚC (QUÁN ĐÓNG CỬA HOẶC KHÁCH CHỦ ĐỘNG HẸN) ---
  const [storeHours, setStoreHours] = useState({
    isOpen: true,
    open_time: '06:30',
    close_time: '23:00',
    slot_step_minutes: 15,
    min_lead_time_minutes: 30,
    auto_dispatch_before_minutes: 15,
    max_advance_days: 2,
    currentVietnamTime: '',
    availableSlots: [],
  });
  const [orderTimingMode, setOrderTimingMode] = useState('now'); // 'now' | 'scheduled'
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedSlotDatetime, setSelectedSlotDatetime] = useState('');
  const [selectedSlotLabel, setSelectedSlotLabel] = useState('');

  // Lưu giỏ hàng vào localStorage
  useEffect(() => {
    try {
      localStorage.setItem('customer_cart', JSON.stringify(cart));
    } catch (e) {
      console.warn('Could not save cart', e);
    }
  }, [cart]);

  // Lấy dữ liệu thực đơn, voucher, lịch sử
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Lắng nghe Socket.IO thời gian thực để đồng bộ trạng thái đơn hàng của khách
  useEffect(() => {
    const handleOrderSync = () => {
      loadOrderHistory();
      refreshUser();
    };

    socket.on('order:created', handleOrderSync);
    socket.on('order:status_updated', handleOrderSync);
    socket.on('barista:item_updated', handleOrderSync);
    socket.on('order:cancelled', handleOrderSync);

    const interval = setInterval(loadOrderHistory, 15000);
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
      const res = await api.get('/orders/my-history');
      setOrderHistory(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.warn('Could not load order history:', err);
    }
  };

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories')
      ]);

      const rawProducts = prodRes.data?.data?.products || (Array.isArray(prodRes.data?.data) ? prodRes.data.data : []);
      const rawCategories = Array.isArray(catRes.data?.data) ? catRes.data.data : (prodRes.data?.data?.categories || []);

      setProducts(Array.isArray(rawProducts) ? rawProducts : []);
      setCategories(Array.isArray(rawCategories) ? rawCategories : []);

      // Lấy danh sách vouchers active
      try {
        const promoRes = await api.get('/promotions/active');
        setVouchers(Array.isArray(promoRes.data?.data) ? promoRes.data.data : []);
      } catch (err) {
        console.warn('Could not load promos', err);
        setVouchers([]);
      }

      // Lấy cấu hình giờ mở cửa & slot hẹn giờ nhận hàng (Configurable từ store_settings)
      try {
        const storeRes = await api.get('/settings/store-hours');
        if (storeRes.data?.success && storeRes.data?.data) {
          const sData = storeRes.data.data;
          setStoreHours(sData);
          if (!sData.isOpen) {
            setOrderTimingMode('scheduled');
          }
          if (sData.availableSlots && sData.availableSlots.length > 0) {
            const firstDay = sData.availableSlots[0];
            if (firstDay.slots && firstDay.slots.length > 0) {
              setSelectedSlotDatetime(firstDay.slots[0].datetime);
              setSelectedSlotLabel(firstDay.slots[0].label);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load store hours:', err);
      }

      await loadOrderHistory();
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Không thể tải thực đơn. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCustomerOrder = async (orderId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy đơn hàng này không?')) return;
    try {
      await api.put(`/orders/${orderId}/cancel`, { cancel_reason: 'Khách tự hủy đơn trên cổng online' });
      toast.success('Đã hủy đơn hàng thành công!');
      await loadOrderHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi hủy đơn');
    }
  };

  // Helper kiểm tra món là đồ uống (có size S, M, L) hay đồ ăn nhanh / điểm tâm (không có chữ size)
  const isDrinkProduct = (product) => {
    if (!product) return false;
    const catId = Number(product.category_id);
    // Nhóm 4 (Bánh & Điểm tâm) và Nhóm 9 (Đồ ăn vặt & Hạt) là đồ ăn nhanh / điểm tâm
    if ([4, 9].includes(catId)) return false;

    // Kiểm tra tên danh mục nếu có
    const catName = (product.category_name || '').toLowerCase();
    if (catName.includes('bánh') || catName.includes('ăn vặt') || catName.includes('hạt') || catName.includes('điểm tâm')) {
      return false;
    }

    // Kiểm tra tên món
    const productName = (product.name || '').toLowerCase();
    const snackKeywords = ['bánh', 'khô', 'hạt', 'đậu phộng', 'rong biển', 'bắp bò', 'snack', 'ăn vặt', 'khoai'];
    if (snackKeywords.some(k => productName.includes(k))) {
      return false;
    }

    const sizes = product.sizes || [];
    // Nếu trong sizes có chứa size chuẩn S, M, L, XL
    const hasLetterSize = sizes.some(s => {
      const name = String(s.name || s.size || s.size_name || '').trim().toUpperCase();
      return ['S', 'M', 'L', 'XL'].includes(name) || name.includes('SIZE');
    });
    if (hasLetterSize) return true;

    // Nếu chỉ có 1 size và tên là Tiêu chuẩn hoặc Phần
    if (sizes.length <= 1) {
      return false;
    }

    return true;
  };

  // Helper định dạng nhãn Size cho đồ uống chuẩn: "Size S", "Size M (Chuẩn)", "Size L (Lớn)" (tuyệt đối không hiển thị chỉ chữ "Size")
  const getDrinkSizeLabel = (s, idx) => {
    const raw = String(s?.name || s?.size || s?.size_name || '').trim().toUpperCase();
    if (raw === 'S' || raw === 'SIZE S') return 'Size S';
    if (raw === 'M' || raw === 'SIZE M') return 'Size M (Chuẩn)';
    if (raw === 'L' || raw === 'SIZE L') return 'Size L (Lớn)';
    if (raw === 'XL' || raw === 'SIZE XL') return 'Size XL';
    if (raw.startsWith('SIZE ') && raw.length > 5) return raw;
    if (['TIÊU CHUẨN', 'PHẦN', 'MẶC ĐỊNH', 'SIZE', ''].includes(raw)) {
      return idx === 0 ? 'Size S' : (idx === 1 ? 'Size M (Chuẩn)' : 'Size L (Lớn)');
    }
    return `Size ${raw}`;
  };

  // --- XỬ LÝ CHỌN SIZE & THÊM VÀO GIỎ ---
  const handleOpenSizeModal = (product) => {
    setSelectedProductForSize(product);
    const isDrink = isDrinkProduct(product);
    const sizes = product.sizes || [];

    if (isDrink && sizes.length > 0) {
      // Đồ uống: chọn size mặc định hoặc Size M hoặc size đầu tiên
      const defaultSize = sizes.find(s => s.is_default) || sizes.find(s => (s.name || s.size) === 'M') || sizes[0];
      setModalSelectedSize(defaultSize);
    } else {
      // Đồ ăn nhanh / điểm tâm: Không dùng khái niệm size
      const firstSize = sizes[0] || {};
      setModalSelectedSize({
        id: firstSize.id || null,
        name: '',
        size: '',
        price: firstSize.price || product.price || 0,
        isFood: true
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

    const isDrink = isDrinkProduct(selectedProductForSize);
    const unitPrice = Number(modalSelectedSize.price || selectedProductForSize.price || 0);
    const rawSizeName = modalSelectedSize.name || modalSelectedSize.size || '';
    const sizeName = isDrink ? (rawSizeName || 'M') : '';
    const cartItemId = `${selectedProductForSize.id}-${modalSelectedSize.id || sizeName || 'standard'}-${modalNote.trim()}`;

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
            size_name: sizeName,
            is_drink: isDrink,
            price: unitPrice,
            quantity: modalQuantity,
            note: modalNote.trim(),
            image_url: selectedProductForSize.image_url
          }
        ];
      }
    });

    if (isDrink && sizeName) {
      toast.success(`Đã thêm "${selectedProductForSize.name} (Size ${sizeName})" vào đơn hàng!`);
    } else {
      toast.success(`Đã thêm "${selectedProductForSize.name}" vào đơn hàng!`);
    }
    handleCloseSizeModal();
  };

  const updateCartLineQty = (index, delta) => {
    setCart(prev => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  const removeCartLine = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
    toast.success('Đã xóa món khỏi đơn');
  };

  const clearCart = () => {
    setCart([]);
    toast.success('Đã làm trống đơn hàng');
  };

  // Số lượng sản phẩm này đã có trong giỏ
  const getProductTotalQtyInCart = (productId) => {
    return cart.filter(item => item.product_id === productId).reduce((sum, it) => sum + it.quantity, 0);
  };

  // --- TÍNH TOÁN TIỀN TỆ & GIẢM GIÁ ---
  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Voucher discount
  let voucherDiscount = 0;
  if (appliedVoucher) {
    const minOrder = Number(appliedVoucher.min_order_value || 0);
    if (totalAmount >= minOrder) {
      const promoVal = Number(appliedVoucher.value ?? appliedVoucher.discount_value ?? 0);
      const isPercentage = appliedVoucher.type === 'percent_order' || appliedVoucher.type === 'percentage' || appliedVoucher.discount_type === 'percentage';
      if (isPercentage) {
        voucherDiscount = Math.round((totalAmount * promoVal) / 100);
        if (appliedVoucher.max_discount) {
          voucherDiscount = Math.min(voucherDiscount, Number(appliedVoucher.max_discount));
        }
      } else {
        voucherDiscount = Math.min(totalAmount, promoVal);
      }
    }
  }

  // Khách hàng & Điểm tích lũy (10.000đ = 1 điểm, 1 điểm = 100đ giảm giá)
  const customerInfo = user?.customer_info || {};
  const currentPoints = customerInfo.points_balance || 0;
  const tierName = customerInfo.tier_name || 'Đồng';
  const discountPct = Number(customerInfo.discount_pct || 0);

  // Giảm giá theo hạng thành viên (nếu có đặc quyền)
  const tierDiscount = discountPct > 0 ? Math.round(((totalAmount - voucherDiscount) * discountPct) / 100) : 0;

  // Dùng điểm tích lũy (Chuẩn thống nhất hệ thống: 1 điểm = 1.000 đ)
  const subtotalAfterPromo = Math.max(0, totalAmount - voucherDiscount - tierDiscount);
  const maxRedeemablePoints = Math.min(currentPoints, Math.floor(subtotalAfterPromo / 1000));
  const effectivePointsRedeemed = usePoints ? maxRedeemablePoints : 0;
  const pointsDiscount = effectivePointsRedeemed * 1000;

  // Thành tiền cuối cùng
  const finalTotal = Math.max(0, subtotalAfterPromo - pointsDiscount);
  const earnedPoints = Math.floor(finalTotal / 10000);

  const isFirstTimeCustomer = (Array.isArray(orderHistory) && orderHistory.length === 0) && Number(customerInfo?.total_spent || 0) === 0;

  const handleApplyCoupon = (codeOverride) => {
    const code = (codeOverride || voucherCodeInput || '').trim().toUpperCase();
    if (!code) {
      toast.error('Vui lòng nhập mã giảm giá!');
      return;
    }
    if (totalAmount <= 0) {
      toast.error('Vui lòng chọn món vào đơn trước khi áp dụng mã!');
      return;
    }

    if (code === 'FREESHIP') {
      toast.error('Mã FREESHIP chỉ áp dụng cho đơn giao hàng. Quán phục vụ đóng cốc tại chỗ / mang về không tính phí ship!');
      return;
    }

    if ((code === 'BANMOI' || code === 'BANMOI20') && !isFirstTimeCustomer) {
      toast.error('Mã chào bạn mới chỉ áp dụng cho đơn hàng đầu tiên của khách hàng mới!');
      return;
    }

    const found = vouchers.find(v => String(v.code).trim().toUpperCase() === code);
    if (found) {
      const minVal = Number(found.min_order_value || 0);
      if (totalAmount < minVal) {
        toast.error(`Mã ${found.code} yêu cầu đơn tối thiểu ${fmt(minVal)} (đơn hiện tại: ${fmt(totalAmount)})`);
        return;
      }
      setAppliedVoucher(found);
      setVoucherCodeInput(code);
      toast.success(`🎉 Đã áp dụng voucher [${found.code}]!`);
    } else {
      toast.error(`Mã voucher [${code}] không hợp lệ hoặc đã hết hạn`);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedVoucher(null);
    setVoucherCodeInput('');
    toast.success('Đã hủy áp dụng mã giảm giá');
  };

  // --- XÁC NHẬN ĐẶT ĐƠN (ĐẨY TỰ ĐỘNG CHO BARISTA & THU NGÂN) ---
  // Lưu ý: Quán mặc định làm vào cốc đóng sẵn nên không cần hỏi hình thức phục vụ (tại quán/mang về)
  const handleCompleteOrder = async () => {
    if (cart.length === 0) {
      toast.error('Vui lòng chọn ít nhất một món trước khi đặt đơn!');
      return;
    }
    if (submittingOrder) return;

    const isScheduledOrder = !storeHours.isOpen || orderTimingMode === 'scheduled';
    if (isScheduledOrder && !selectedSlotDatetime) {
      toast.error('Vui lòng chọn thời gian nhận hàng trước khi đặt đơn!');
      return;
    }

    const customerName = (user?.full_name || guestName || '').trim();
    const customerPhone = (user?.phone || user?.username || guestPhone || '').trim();

    if (!customerName) {
      toast.error('Vui lòng nhập họ và tên của bạn để quán chuẩn bị đồ uống!');
      return;
    }
    if (!customerPhone || customerPhone.length < 9) {
      toast.error('Vui lòng nhập số điện thoại hợp lệ (tối thiểu 9 số) để nhận thông báo đơn hàng!');
      return;
    }

    try {
      setSubmittingOrder(true);
      const chosenMethod = paymentMethod === 'Tiền mặt' ? 'cash' : 'bank_transfer';

      const payload = {
        items: cart.map(it => ({
          product_id: it.product_id,
          product_size_id: it.product_size_id,
          name: it.name,
          size_name: it.size_name,
          price: it.price,
          quantity: it.quantity,
          note: it.note
        })),
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: chosenMethod,
        discount: voucherDiscount + tierDiscount,
        tax: 0,
        note: orderGeneralNote.trim() || null,
        status: isScheduledOrder ? 'scheduled' : 'pending',
        order_type: 'takeaway', // Mặc định làm vào cốc đóng sẵn tiện lợi
        table_id: null,
        coupon_code: appliedVoucher ? appliedVoucher.code : null,
        payment_status: 'paid', // Đã ghi nhận thanh toán
        points_to_redeem: effectivePointsRedeemed,
        pickup_time: isScheduledOrder ? selectedSlotDatetime : null,
      };

      const res = await api.post('/orders/direct-checkout', payload);

      if (res.data?.success) {
        const orderData = res.data.data;
        const isSched = orderData?.status === 'scheduled' || isScheduledOrder;
        toast.success(
          isSched
            ? `🗓️ Đặt trước thành công! Đơn sẽ tự động chuyển Barista trước giờ nhận 15 phút.`
            : `🎉 Đặt đơn thành công! Đơn hàng đã chuyển sang quầy Barista pha chế.`
        );

        // Hiển thị modal hoàn tất đơn hàng giữa màn hình
        setCompletedOrderModal({
          orderCode: orderData?.orderCode || orderData?.invoiceNo,
          total: finalTotal,
          items: [...cart],
          paymentMethod,
          earnedPoints,
          isScheduled: isSched,
          pickupTimeLabel: isSched ? (orderData?.pickupDisplayLabel || selectedSlotLabel) : null,
        });
        setCustomerRedirectCountdown(4);

        // Dọn giỏ hàng & làm mới dữ liệu
        setCart([]);
        setOrderGeneralNote('');
        setAppliedVoucher(null);
        setUsePoints(false);

        refreshUser();
        await loadOrderHistory();
      } else {
        toast.error(res.data?.message || 'Có lỗi khi đặt đơn hàng');
      }
    } catch (err) {
      console.error('Order checkout error:', err);
      toast.error(err.response?.data?.message || 'Có lỗi khi gửi đơn hàng. Vui lòng thử lại!');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const productList = Array.isArray(products) ? products : [];
  const categoryList = Array.isArray(categories) ? categories : [];
  const voucherList = Array.isArray(vouchers) ? vouchers : [];
  const historyList = Array.isArray(orderHistory) ? orderHistory : [];

  // Lọc voucher mà khách hàng thực sự có quyền và phù hợp quy tắc quán
  // 1. Loại bỏ FREESHIP (quán phục vụ đồ uống đóng cốc sẵn sàng mang về/dùng tại quán, không giao hàng tính ship)
  const availableVouchers = voucherList.filter(v => v.code && v.code !== 'FREESHIP');
  // 2. Lọc mã "BANMOI" chỉ dành cho khách chưa từng phát sinh đơn hàng
  const myEligibleVouchers = availableVouchers.filter(v => {
    if (['BANMOI', 'BANMOI20'].includes(v.code) && !isFirstTimeCustomer) return false;
    return true;
  });
  // 3. Những mã đủ điều kiện áp dụng ngay cho đơn hàng hiện tại (đạt đơn tối thiểu)
  const readyToUseVouchers = myEligibleVouchers.filter(v => totalAmount >= Number(v.min_order_value || 0));

  // Lọc sản phẩm
  const filteredProducts = productList.filter((p) => {
    if (!p) return false;
    const matchCat = selectedCategory === 'all' || String(p.category_id) === String(selectedCategory);
    const matchSearch =
      (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  const customerPhone = user?.phone || user?.username || guestPhone || '0901234567';
  const vietQrUrl = `https://img.vietqr.io/image/${BANK_CONFIG.bin}-${BANK_CONFIG.accountNumberRaw}-compact2.png?amount=${finalTotal}&addInfo=${encodeURIComponent('MYCOFFEE ' + customerPhone)}&accountName=${encodeURIComponent(BANK_CONFIG.accountHolder)}`;

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', background: '#130c08', color: '#f5efe6', paddingBottom: '60px' }}>
      <style>{`
        .customer-product-card {
          background: #1c120b;
          border: 1px solid #3d2618;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0,0,0,0.35);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease;
          cursor: pointer;
        }
        .customer-product-card:hover {
          transform: translateY(-4px) translateZ(0);
          box-shadow: 0 10px 24px -4px rgba(84, 51, 16, 0.4), 0 4px 8px -2px rgba(84, 51, 16, 0.2);
          border-color: #d97706 !important;
        }
        .customer-product-card .card-img {
          width: 100%;
          height: 140px;
          object-fit: cover;
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .customer-product-card:hover .card-img {
          transform: scale(1.06);
        }
      `}</style>
      {/* 1. TOP HEADER & GREETING */}
      <div style={{
        background: 'linear-gradient(180deg, #24140b 0%, #170d07 100%)',
        borderBottom: '1px solid #3d2314',
        padding: '18px 24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.8rem' }}>☕</span>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.35rem', color: '#fde68a', fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>
                MY COFFEE HOUSE • ĐẶT MÓN ONLINE
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#d4b094' }}>
                Xin chào, <strong style={{ color: '#fff' }}>{user?.full_name || 'Quý khách'}</strong>! Tự chọn đồ uống đóng cốc sẵn sàng mang về hoặc dùng tại quán.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Live Store Opening Hours Badge */}
            {storeHours.isOpen ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                color: '#34d399',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: '20px',
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                <span>🟢 Đang mở cửa ({storeHours.open_time} – {storeHours.close_time})</span>
              </div>
            ) : (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: '20px',
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>
                <span>🔴 Quán đóng cửa • Hẹn giờ nhận ({storeHours.open_time} – {storeHours.close_time})</span>
              </div>
            )}
            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/')}
                style={{
                  background: '#b45309',
                  border: '1px solid #d97706',
                  color: '#fff',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 700
                }}
              >
                👑 Bàn Quản Lý
              </button>
            )}
            {user ? (
              <>
                <button
                  onClick={() => { refreshUser(); loadOrderHistory(); toast.success('Đã cập nhật số điểm & đơn hàng!'); }}
                  style={{
                    background: '#2b170c',
                    border: '1px solid #5a341e',
                    color: '#fde68a',
                    padding: '7px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
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
                    padding: '7px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate('/login')}
                style={{
                  background: '#15803d',
                  border: '1px solid #22c55e',
                  color: '#fff',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                }}
              >
                🔐 Đăng nhập / Đăng ký
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS */}
      <div style={{ maxWidth: '1440px', margin: '16px auto 0', padding: '0 24px' }}>
        <div style={{
          display: 'flex',
          gap: '10px',
          borderBottom: '2px solid #2b170c',
          paddingBottom: '10px',
          overflowX: 'auto'
        }}>
          {[
            { id: 'menu', label: '☕ Thực Đơn & Đặt Món', count: filteredProducts.length },
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
                padding: '9px 18px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '0.86rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span style={{
                  background: activeTab === tab.id ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.1)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem'
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 3. MAIN CONTENT */}
      <div style={{ maxWidth: '1440px', margin: '20px auto 0', padding: '0 24px' }}>
        <div key={activeTab} className="page-unfold-transition">
          {/* TAB 1: THỰC ĐƠN & BANNER THANH TOÁN BÊN PHẢI (CHUẨN POS ADMIN) */}
          {activeTab === 'menu' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 440px',
              gap: '24px',
              alignItems: 'start'
            }}>
              {/* CỘT TRÁI: DANH SÁCH MÓN */}
              <div className="mockup-panel">
                <div className="mockup-panel-header">
                  <div className="mockup-panel-title">
                    <span>☕</span>
                    <span>DANH SÁCH MÓN ({filteredProducts.length} MÓN)</span>
                  </div>
                </div>

                <div className="mockup-panel-body">
                  {/* Thanh tìm kiếm & lọc danh mục */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="🔍 Tìm kiếm món..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ flex: 1, minWidth: '180px', padding: '7px 12px', fontSize: '0.85rem' }}
                    />

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className={`btn btn-sm ${selectedCategory === 'all' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setSelectedCategory('all')}
                        style={{
                          background: selectedCategory === 'all' ? '#d97706' : '#24160e',
                          color: selectedCategory === 'all' ? '#fff' : '#c4a482',
                          border: selectedCategory === 'all' ? '1px solid #fbbf24' : '1px solid #4a2c18',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Tất cả
                      </button>
                      {categoryList.map((c) => (
                        <button
                          key={c.id}
                          className={`btn btn-sm ${String(selectedCategory) === String(c.id) ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setSelectedCategory(String(c.id))}
                          style={{
                            background: String(selectedCategory) === String(c.id) ? '#d97706' : '#24160e',
                            color: String(selectedCategory) === String(c.id) ? '#fff' : '#c4a482',
                            border: String(selectedCategory) === String(c.id) ? '1px solid #fbbf24' : '1px solid #4a2c18',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {getCategoryIcon(c.id)} {c.name}
                        </button>
                      ))}
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
                      <div>Không tìm thấy món nào phù hợp với từ khóa của bạn.</div>
                    </div>
                  ) : (
                    /* Grid danh sách món thẻ dark luxury chuẩn POS với hiệu ứng lật trang 3D mượt mà */
                    <div
                      key={selectedCategory}
                      className="page-unfold-transition"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
                        gap: '16px'
                      }}
                    >
                      {filteredProducts.map((p) => {
                        const sizes = p.sizes || [];
                        const defaultPrice = sizes.length > 0 ? sizes[0].price : (p.price || 0);
                        const inCartQty = getProductTotalQtyInCart(p.id);

                        return (
                          <div
                            key={p.id}
                            className="product-card customer-product-card"
                            onClick={() => handleOpenSizeModal(p)}
                          >
                            {/* Ảnh món */}
                            <div style={{ position: 'relative', overflow: 'hidden', height: '140px', background: '#24140b' }}>
                              <img
                                src={p.image_url || FALLBACK_DRINK_IMG}
                                alt={p.name}
                                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_DRINK_IMG; }}
                                className="card-img"
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
                                    zIndex: 2
                                  }}
                                >
                                  Đã chọn: {inCartQty}
                                </span>
                              )}
                            </div>

                            {/* Chi tiết */}
                            <div style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24', background: 'rgba(251, 191, 36, 0.12)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(251, 191, 36, 0.25)', letterSpacing: '0.5px' }}>
                                  {p.code || `ID:${p.id}`}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#a88265', fontWeight: 600 }}>
                                  {p.category_id === 9 ? 'Đồ ăn vặt' : 'Đồ uống'}
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
                                  minHeight: '48px',
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
                                  margin: '0 0 10px',
                                  minHeight: '34px',
                                  lineHeight: 1.35,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {p.description || 'Hương vị thơm ngon hảo hạng từ MY COFFEE HOUSE'}
                              </p>

                              {/* Giá & Nút + Thêm (khi click sẽ mở chọn size) */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#a88265', fontWeight: 600 }}>Giá: </span>
                                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fbbf24' }}>
                                    {fmt(defaultPrice)}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{
                                    background: '#15803d',
                                    color: '#fff',
                                    fontWeight: 700,
                                    padding: '5px 14px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                    border: 'none',
                                    cursor: 'pointer'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenSizeModal(p);
                                  }}
                                >
                                  <span>+ Thêm</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* CỘT PHẢI: BANNER THANH TOÁN & THÔNG TIN ĐƠN HÀNG (STICKY GIỐNG ADMIN POS) */}
              <div
                className="mockup-panel pos-sticky-cart"
                style={{
                  position: 'sticky',
                  top: '16px',
                  maxHeight: 'calc(100vh - 32px)',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 6px 25px rgba(0,0,0,0.5)',
                  zIndex: 10,
                }}
              >
                <div className="mockup-panel-header" style={{ flexShrink: 0, flexWrap: 'wrap', gap: '8px' }}>
                  <div className="mockup-panel-title">
                    <span>📋</span>
                    <span>THÔNG TIN ĐƠN HÀNG ({cartTotalCount} MÓN)</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '3px 8px', borderRadius: '12px', fontWeight: 800, border: '1px solid #10b981' }}>
                    ☕ CỐC ĐÓNG SẴN
                  </span>
                </div>

                <div
                  className="mockup-panel-body"
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '14px 16px',
                  }}
                >
                  {/* 1. THÔNG TIN KHÁCH HÀNG & TÍCH ĐIỂM */}
                  <div
                    style={{
                      background: 'rgba(36, 22, 14, 0.85)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24' }}>
                        👤 HỘI VIÊN: <span style={{ color: '#fff' }}>{user?.full_name || 'Khách hàng'}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 800 }}>
                        ⭐ Hạng {tierName}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: '#c4a482' }}>
                      <span>SĐT: <strong style={{ color: '#fef3c7' }}>{customerPhone}</strong></span>
                      <span>Điểm: <strong style={{ color: '#34d399' }}>{currentPoints} điểm</strong></span>
                    </div>

                    {currentPoints > 0 && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#fbbf24', marginTop: '2px', fontSize: '0.78rem' }}>
                        <input
                          type="checkbox"
                          checked={usePoints}
                          onChange={(e) => setUsePoints(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Đổi {effectivePointsRedeemed} điểm (giảm {fmt(pointsDiscount)})</span>
                      </label>
                    )}
                  </div>

                  {/* 2. MÃ GIẢM GIÁ / VOUCHERS */}
                  <div style={{ background: 'rgba(36, 22, 14, 0.85)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', margin: 0 }}>
                        🏷️ MÃ GIẢM GIÁ / VOUCHER:
                      </label>
                      {appliedVoucher && (
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          ✕ Hủy mã
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Nhập mã (CHAOMUNG, COFFEE10...)"
                        value={voucherCodeInput}
                        onChange={(e) => setVoucherCodeInput(e.target.value.toUpperCase())}
                        style={{ padding: '5px 8px', fontSize: '0.82rem', textTransform: 'uppercase', fontWeight: 700, flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ background: '#d97706', borderColor: '#d97706', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        onClick={() => handleApplyCoupon()}
                      >
                        Áp dụng
                      </button>
                    </div>

                    {/* Quick Voucher Pills: Khách hàng chỉ nhìn thấy & sử dụng những mã mình có quyền và đủ điều kiện */}
                    {readyToUseVouchers.length > 0 ? (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {readyToUseVouchers.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => handleApplyCoupon(c.code)}
                            title={c.description}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              border: appliedVoucher?.code === c.code ? '1.5px solid #16a34a' : '1px dashed #d97706',
                              background: appliedVoucher?.code === c.code ? 'rgba(22, 163, 74, 0.25)' : '#24160e',
                              color: appliedVoucher?.code === c.code ? '#4ade80' : '#fbbf24',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {appliedVoucher?.code === c.code ? '✅ ' : '⚡ '}{c.code}
                          </button>
                        ))}
                      </div>
                    ) : (
                      myEligibleVouchers.length > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#c4a482', fontStyle: 'italic', marginTop: '2px' }}>
                          {totalAmount > 0
                            ? `💡 Mua thêm ${fmt(Math.max(0, Number(myEligibleVouchers[0].min_order_value || 0) - totalAmount))} để dùng mã [${myEligibleVouchers[0].code}]!`
                            : '💡 Thêm món vào đơn để sử dụng mã ưu đãi của bạn.'}
                        </div>
                      )
                    )}

                    {appliedVoucher && (
                      <div style={{ marginTop: '6px', fontSize: '0.74rem', color: '#4ade80', fontWeight: 700 }}>
                        🎉 Đã áp dụng: {appliedVoucher.name} (-{fmt(voucherDiscount)})
                      </div>
                    )}
                  </div>

                  {/* 3. GHI CHÚ ĐƠN */}
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '2px' }}>
                      📝 Ghi chú đơn hàng (dặn Barista):
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ghi chú pha chế (ít đá, ít đường, không sữa...)"
                      value={orderGeneralNote}
                      onChange={(e) => setOrderGeneralNote(e.target.value)}
                      style={{ fontSize: '0.8rem', padding: '6px 8px', width: '100%' }}
                    />
                  </div>

                  {/* 4. BẢNG MÓN ĐÃ CHỌN TRONG ĐƠN HÀNG */}
                  <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px' }}>
                    <table className="mockup-table">
                      <thead>
                        <tr>
                          <th style={{ width: '26px' }}>STT</th>
                          <th>Món / Size</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>SL</th>
                          <th style={{ textAlign: 'right' }}>Đ.Giá</th>
                          <th style={{ textAlign: 'right' }}>T.Tiền</th>
                          <th style={{ width: '24px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#c4a482', fontSize: '0.82rem' }}>
                              Chưa có món nào. Bấm <strong>+ Thêm</strong> từ thực đơn bên trái để chọn món!
                            </td>
                          </tr>
                        ) : (
                          cart.map((item, idx) => (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td style={{ fontWeight: 600 }}>
                                <div style={{ fontSize: '0.82rem', color: '#fef3c7', lineHeight: 1.2 }}>{item.name}</div>
                                {item.size_name && ['S', 'M', 'L', 'XL'].includes(item.size_name.toUpperCase()) && (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      marginTop: '2px',
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      background: 'rgba(245, 158, 11, 0.2)',
                                      color: '#fbbf24',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      border: '1px solid rgba(245, 158, 11, 0.35)',
                                    }}
                                  >
                                    Size {item.size_name}
                                  </span>
                                )}
                                {item.note && (
                                  <div style={{ fontSize: '0.7rem', color: '#f87171', fontStyle: 'italic', marginTop: '2px' }}>
                                    📝 {item.note}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <button
                                    type="button"
                                    style={{ width: '20px', height: '20px', borderRadius: '4px', border: '1px solid #4a2c18', background: '#24160e', color: '#fef3c7', cursor: 'pointer', lineHeight: '16px', fontSize: '11px' }}
                                    onClick={() => updateCartLineQty(idx, -1)}
                                  >
                                    -
                                  </button>
                                  <span style={{ fontWeight: 700, width: '16px', textAlign: 'center', fontSize: '0.82rem', color: '#fef3c7' }}>{item.quantity}</span>
                                  <button
                                    type="button"
                                    style={{ width: '20px', height: '20px', borderRadius: '4px', border: '1px solid #4a2c18', background: '#24160e', color: '#fef3c7', cursor: 'pointer', lineHeight: '16px', fontSize: '11px' }}
                                    onClick={() => updateCartLineQty(idx, 1)}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', fontSize: '0.78rem', color: '#c4a482' }}>{fmt(item.price)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24', fontSize: '0.8rem' }}>
                                {fmt(item.price * item.quantity)}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => removeCartLine(idx)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                                  title="Xóa món"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* 4.5. THỜI GIAN NHẬN MÓN (LÀM NGAY HOẶC HẸN GIỜ ĐẶT TRƯỚC) */}
                  <div style={{
                    background: 'rgba(28, 17, 10, 0.95)',
                    border: storeHours.isOpen ? '1px solid rgba(245, 158, 11, 0.3)' : '1.5px solid #ef4444',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fde68a', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                        <span>⏰</span>
                        <span>THỜI GIAN NHẬN HÀNG:</span>
                      </label>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: storeHours.isOpen ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: storeHours.isOpen ? '#34d399' : '#f87171',
                        border: `1px solid ${storeHours.isOpen ? '#10b981' : '#ef4444'}`
                      }}>
                        {storeHours.isOpen ? `● Quán mở (${storeHours.open_time} - ${storeHours.close_time})` : `● Đang đóng cửa`}
                      </span>
                    </div>

                    {!storeHours.isOpen ? (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        fontSize: '0.74rem',
                        color: '#fca5a5',
                        lineHeight: 1.4
                      }}>
                        ⚠️ <strong>Quán hiện đang đóng cửa</strong> (Giờ phục vụ: {storeHours.open_time} – {storeHours.close_time}). Quý khách vui lòng chọn thời gian nhận hàng bên dưới để đặt trước:
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            background: orderTimingMode === 'now' ? 'linear-gradient(135deg, #15803d, #166534)' : '#24160e',
                            color: orderTimingMode === 'now' ? '#ffffff' : '#c4a482',
                            border: orderTimingMode === 'now' ? '1.5px solid #22c55e' : '1px solid #4a2c18',
                            fontWeight: 800,
                            fontSize: '0.76rem',
                            padding: '6px 4px',
                            cursor: 'pointer'
                          }}
                          onClick={() => setOrderTimingMode('now')}
                        >
                          ⚡ Nhận ngay (10-15p)
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            background: orderTimingMode === 'scheduled' ? 'linear-gradient(135deg, #9333ea, #7e22ce)' : '#24160e',
                            color: orderTimingMode === 'scheduled' ? '#ffffff' : '#c4a482',
                            border: orderTimingMode === 'scheduled' ? '1.5px solid #c084fc' : '1px solid #4a2c18',
                            fontWeight: 800,
                            fontSize: '0.76rem',
                            padding: '6px 4px',
                            cursor: 'pointer'
                          }}
                          onClick={() => setOrderTimingMode('scheduled')}
                        >
                          🗓️ Hẹn giờ nhận trước
                        </button>
                      </div>
                    )}

                    {/* Khi chọn Hẹn giờ nhận trước hoặc khi quán đang đóng cửa */}
                    {(orderTimingMode === 'scheduled' || !storeHours.isOpen) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        {/* Chọn Ngày */}
                        {storeHours.availableSlots && storeHours.availableSlots.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#c4a482', fontWeight: 600, marginBottom: '4px' }}>
                              📅 Chọn ngày nhận hàng:
                            </div>
                            <div style={{ display: 'flex', gap: '5px', overflowX: 'auto' }}>
                              {storeHours.availableSlots.map((d, dIdx) => (
                                <button
                                  key={d.date}
                                  type="button"
                                  onClick={() => {
                                    setSelectedDayIndex(dIdx);
                                    if (d.slots && d.slots.length > 0) {
                                      setSelectedSlotDatetime(d.slots[0].datetime);
                                      setSelectedSlotLabel(d.slots[0].label);
                                    }
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: selectedDayIndex === dIdx ? '#a855f7' : '#1f130b',
                                    color: selectedDayIndex === dIdx ? '#fff' : '#d4b094',
                                    border: selectedDayIndex === dIdx ? '1px solid #c084fc' : '1px solid #4a2c18',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {d.dayLabel}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Chọn Giờ (Slot 15 phút) */}
                        {storeHours.availableSlots && storeHours.availableSlots[selectedDayIndex]?.slots?.length > 0 ? (
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#c4a482', fontWeight: 600, marginBottom: '4px' }}>
                              🕒 Chọn khung giờ nhận ({storeHours.slot_step_minutes} phút/khung):
                            </div>
                            <select
                              className="form-input"
                              value={selectedSlotDatetime}
                              onChange={(e) => {
                                const found = storeHours.availableSlots[selectedDayIndex]?.slots?.find(s => s.datetime === e.target.value);
                                setSelectedSlotDatetime(e.target.value);
                                if (found) setSelectedSlotLabel(found.label);
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                fontSize: '0.82rem',
                                background: '#24140b',
                                border: '1.5px solid #a855f7',
                                color: '#fef3c7',
                                fontWeight: 700,
                                borderRadius: '6px'
                              }}
                            >
                              {storeHours.availableSlots[selectedDayIndex].slots.map(s => (
                                <option key={s.datetime} value={s.datetime}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.72rem', color: '#f87171', fontStyle: 'italic' }}>
                            Không còn khung giờ trống trong ngày này. Vui lòng chọn ngày khác!
                          </div>
                        )}

                        <div style={{ fontSize: '0.7rem', color: '#c4a482', lineHeight: 1.35, fontStyle: 'italic' }}>
                          💡 Hệ thống sẽ tự động chuyển đơn cho Barista trước giờ nhận {storeHours.auto_dispatch_before_minutes} phút để đảm bảo đồ uống luôn tươi mới.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. PHƯƠNG THỨC THANH TOÁN */}
                  <div style={{ marginTop: '2px' }}>
                    <div style={{ fontSize: '0.74rem', color: '#c4a482', fontWeight: 600, marginBottom: '4px' }}>
                      Phương thức thanh toán:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: paymentMethod === 'QR Banking' ? 'linear-gradient(135deg, #d97706, #b45309)' : '#24160e',
                          color: paymentMethod === 'QR Banking' ? '#ffffff' : '#c4a482',
                          border: paymentMethod === 'QR Banking' ? '1.5px solid #fbbf24' : '1px solid #4a2c18',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          padding: '6px 4px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setPaymentMethod('QR Banking')}
                      >
                        💠 Quét QR VietQR
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: paymentMethod === 'Tiền mặt' ? 'linear-gradient(135deg, #d97706, #b45309)' : '#24160e',
                          color: paymentMethod === 'Tiền mặt' ? '#ffffff' : '#c4a482',
                          border: paymentMethod === 'Tiền mặt' ? '1.5px solid #fbbf24' : '1px solid #4a2c18',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          padding: '6px 4px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setPaymentMethod('Tiền mặt')}
                      >
                        💵 Tiền mặt tại quầy
                      </button>
                    </div>
                  </div>

                  {/* Hiển thị QR Ngân hàng trực tiếp trong banner nếu chọn QR */}
                  {paymentMethod === 'QR Banking' && finalTotal > 0 && (
                    <div style={{
                      background: '#1c120b',
                      border: '1px solid #3d2618',
                      borderRadius: '8px',
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <div style={{ background: '#fff', padding: '4px', borderRadius: '6px', flexShrink: 0 }}>
                        <img
                          src={vietQrUrl}
                          alt="QR VietinBank"
                          style={{ width: '84px', height: '84px', objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#c4a482', lineHeight: 1.5 }}>
                        <div>Ngân hàng: <strong style={{ color: '#fff' }}>{BANK_CONFIG.bankName}</strong></div>
                        <div>STK: <strong style={{ color: '#fde68a' }}>{BANK_CONFIG.accountNumber}</strong></div>
                        <div>Chủ TK: <strong style={{ color: '#fff' }}>{BANK_CONFIG.accountHolder}</strong></div>
                        <div>Số tiền: <strong style={{ color: '#34d399' }}>{fmt(finalTotal)}</strong></div>
                        <div style={{ color: '#fbbf24', fontSize: '0.7rem' }}>Nội dung: <strong>CF {customerPhone} DH</strong></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* FOOTER PINNED: TỔNG TIỀN & NÚT ĐẶT ĐƠN */}
                <div
                  style={{
                    flexShrink: 0,
                    background: 'rgba(38, 24, 15, 0.96)',
                    borderTop: '1px solid rgba(245, 158, 11, 0.2)',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Bảng chi tiết tính tiền */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#c4a482' }}>Tổng tiền hàng:</span>
                      <span style={{ fontWeight: 700, color: '#fef3c7' }}>{fmt(totalAmount)}</span>
                    </div>
                    {tierDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399' }}>
                        <span>Ưu đãi hạng {tierName} (-{discountPct}%):</span>
                        <span style={{ fontWeight: 700 }}>-{fmt(tierDiscount)}</span>
                      </div>
                    )}
                    {pointsDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
                        <span>Đổi điểm tích lũy ({effectivePointsRedeemed} điểm):</span>
                        <span style={{ fontWeight: 700 }}>-{fmt(pointsDiscount)}</span>
                      </div>
                    )}
                    {voucherDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f87171' }}>
                        <span>Giảm giá voucher:</span>
                        <span style={{ fontWeight: 700 }}>-{fmt(voucherDiscount)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(245, 158, 11, 0.3)', paddingTop: '5px', marginTop: '2px', fontSize: '1.12rem', fontWeight: 800, color: '#fbbf24' }}>
                      <span>Thành tiền:</span>
                      <span>{fmt(finalTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#a88265', borderTop: '1px solid rgba(245, 158, 11, 0.1)', paddingTop: '3px' }}>
                      <span>Tích lũy đơn này:</span>
                      <span style={{ color: '#34d399', fontWeight: 800 }}>+{earnedPoints} điểm</span>
                    </div>
                  </div>

                  {/* Thông tin khách hàng vãng lai (nếu chưa đăng nhập) */}
                  {!user && (
                    <div style={{
                      background: 'rgba(217, 119, 6, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>👤 THÔNG TIN ĐẶT MÓN</span>
                        <span
                          style={{ fontSize: '0.7rem', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => navigate('/login')}
                        >
                          Đăng nhập thành viên
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Họ và tên *"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          style={{ padding: '6px 8px', fontSize: '0.78rem', background: '#190e07', border: '1px solid #5a341e', color: '#fff', borderRadius: '5px' }}
                        />
                        <input
                          type="tel"
                          className="form-input"
                          placeholder="Số điện thoại *"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          style={{ padding: '6px 8px', fontSize: '0.78rem', background: '#190e07', border: '1px solid #5a341e', color: '#fff', borderRadius: '5px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Các nút hành động */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ flex: 1, borderColor: '#4a2c18', background: '#24160e', color: '#f3e8d8', fontWeight: 700, padding: '9px 6px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px' }}
                      onClick={clearCart}
                      disabled={cart.length === 0 || submittingOrder}
                    >
                      XÓA GIỎ
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{
                        flex: 2,
                        background: submittingOrder ? '#4b5563' : 'linear-gradient(135deg, #15803d, #166534)',
                        borderColor: '#15803d',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        padding: '9px 12px',
                        cursor: submittingOrder || cart.length === 0 ? 'not-allowed' : 'pointer',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(21, 128, 61, 0.4)'
                      }}
                      onClick={handleCompleteOrder}
                      disabled={cart.length === 0 || submittingOrder}
                    >
                      {submittingOrder ? '⏳ Đang gửi đơn...' : (orderTimingMode === 'scheduled' || !storeHours.isOpen ? '🗓️ XÁC NHẬN ĐẶT TRƯỚC' : '🚀 XÁC NHẬN ĐẶT ĐƠN')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MÃ KHUYẾN MÃI */}
          {activeTab === 'vouchers' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#fde68a' }}>
                  🎁 Mã Khuyến Mãi Đang Áp Dụng
                </h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#d4b094' }}>
                  Bấm "Áp dụng vào đơn" để được trừ tiền trực tiếp trên giỏ hàng của bạn!
                </p>
              </div>

              {availableVouchers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', background: '#1c1008', borderRadius: '12px', color: '#94a3b8' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎫</div>
                  <div>Hiện chưa có mã giảm giá chung nào đang phát hành. Hãy kiểm tra lại sau nhé!</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {availableVouchers.map((v) => {
                    const isNewCode = ['BANMOI', 'BANMOI20'].includes(v.code);
                    const isBlockedNew = isNewCode && !isFirstTimeCustomer;
                    const isQualified = totalAmount >= Number(v.min_order_value || 0) && !isBlockedNew;
                    const needMore = Math.max(0, Number(v.min_order_value || 0) - totalAmount);

                    return (
                      <div
                        key={v.id}
                        style={{
                          background: 'linear-gradient(135deg, #24140b 0%, #1a0e07 100%)',
                          border: isQualified ? '2px solid #16a34a' : (isBlockedNew ? '1px solid #4a2c18' : '2px dashed #f59e0b'),
                          borderRadius: '12px',
                          padding: '18px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                          opacity: isBlockedNew ? 0.6 : 1
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{
                              background: isBlockedNew ? '#4a2c18' : '#b45309',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: '1rem',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              letterSpacing: '1px'
                            }}>
                              {v.code}
                            </span>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: isBlockedNew ? '#94a3b8' : (isQualified ? '#34d399' : '#fbbf24')
                            }}>
                              {isBlockedNew
                                ? '● DÀNH CHO BẠN MỚI'
                                : (isQualified ? '● ĐỦ ĐIỀU KIỆN SỬ DỤNG' : `● CẦN THÊM ${fmt(needMore)}`)}
                            </span>
                          </div>

                          <h4 style={{ margin: '0 0 6px', fontSize: '1.05rem', color: '#fff' }}>
                            {v.name}
                          </h4>
                          <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#d4b094', lineHeight: 1.4 }}>
                            {v.description || 'Ưu đãi dành cho tất cả quý khách hàng thân thiết.'}
                          </p>

                          <div style={{ fontSize: '0.75rem', color: '#a8a29e', borderTop: '1px solid #382012', paddingTop: '8px' }}>
                            <div>Đơn tối thiểu: <strong>{fmt(v.min_order_value || 0)}</strong></div>
                            {v.max_discount && <div>Giảm tối đa: <strong>{fmt(v.max_discount)}</strong></div>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                          {isBlockedNew ? (
                            <button
                              disabled
                              style={{
                                width: '100%',
                                background: '#382012',
                                color: '#8c7667',
                                border: '1px solid #4a2c18',
                                padding: '9px',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'not-allowed'
                              }}
                            >
                              🔒 Chỉ áp dụng cho đơn đầu tiên
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (!isQualified && totalAmount < Number(v.min_order_value || 0)) {
                                  toast.error(`Mã ${v.code} yêu cầu đơn từ ${fmt(v.min_order_value)}. Hãy chọn thêm món!`);
                                  setActiveTab('menu');
                                  return;
                                }
                                handleApplyCoupon(v.code);
                                setActiveTab('menu');
                              }}
                              style={{
                                width: '100%',
                                background: isQualified ? '#15803d' : '#d97706',
                                color: '#fff',
                                border: 'none',
                                padding: '9px',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer'
                              }}
                            >
                              {isQualified ? '⚡ Áp dụng mã này vào đơn hàng' : '🛒 Chọn thêm món để áp dụng'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                    Theo dõi trạng thái pha chế thời gian thực của các ly cà phê đã đặt.
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
                    const getStatusBadge = (status) => {
                      switch (status) {
                        case 'scheduled':
                          return {
                            text: o.pickup_time ? `🗓️ Hẹn giờ: ${String(o.pickup_time).replace('T', ' ').slice(11, 16)} (${String(o.pickup_time).slice(8, 10)}/${String(o.pickup_time).slice(5, 7)})` : '🗓️ Đã hẹn giờ nhận món',
                            bg: 'rgba(168, 85, 247, 0.2)',
                            border: '#a855f7',
                            color: '#c084fc'
                          };
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
                          border: o.status === 'scheduled' ? '1.5px solid #a855f7' : '1px solid #382012',
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
                              background: o.payment_status === 'paid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: o.payment_status === 'paid' ? '#34d399' : '#fbbf24',
                              border: `1px solid ${o.payment_status === 'paid' ? '#10b981' : '#f59e0b'}`
                            }}>
                              {o.payment_status === 'paid' ? 'Đã thanh toán' : 'Chờ xác nhận chuyển khoản'}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                              {fmt(o.total || 0)}
                            </div>
                            {o.discount_total > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#10b981' }}>
                                Đã giảm: -{fmt(o.discount_total)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Thông báo hẹn giờ nếu có */}
                        {o.status === 'scheduled' && o.pickup_time && (
                          <div style={{
                            background: 'rgba(168, 85, 247, 0.12)',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                            fontSize: '0.82rem',
                            color: '#e9d5ff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>🗓️</span>
                            <span>
                              <strong>Đơn hẹn giờ:</strong> Dự kiến nhận lúc <strong>{String(o.pickup_time).replace('T', ' ').slice(0, 16)}</strong>. Hệ thống tự động chuyển Barista pha chế trước giờ nhận 15 phút!
                            </span>
                          </div>
                        )}

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

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#a8a29e', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            🕒 {new Date(o.opened_at).toLocaleString('vi-VN')}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {['scheduled', 'pending'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => handleCancelCustomerOrder(o.id)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid #ef4444',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                ❌ Hủy đơn này
                              </button>
                            )}
                            <span>☕ Cốc đóng sẵn mang về / tại quán</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: THÔNG TIN QUÁN */}
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
                  <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>📞 Hotline Hỗ Trợ</div>
                  <div style={{ fontSize: '1rem', color: '#10b981', fontWeight: 800 }}>1900 1234</div>
                  <div style={{ fontSize: '0.8rem', color: '#a8a29e' }}>Tư vấn đồ uống & hỗ trợ khách hàng</div>
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
                ❤️ Cảm ơn bạn đã đồng hành cùng <strong>MY COFFEE HOUSE</strong>. Quán chúc quý khách một ngày thật nhiều niềm vui!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL CHỌN KÍCH THƯỚC (SIZE) KHI BẤM "+ THÊM" HOẶC BẤM VÀO THẺ MÓN   */}
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
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Ảnh & Header Modal */}
            <div style={{ position: 'relative', width: '100%', height: '170px', background: '#2a160b' }}>
              <img
                src={selectedProductForSize.image_url || FALLBACK_DRINK_IMG}
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

            {/* Nội dung chọn size */}
            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', color: '#fff' }}>
                  {selectedProductForSize.name}
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#d4b094', lineHeight: 1.4 }}>
                  {selectedProductForSize.description || 'Thức uống tươi ngon đặc trưng từ công thức pha chế độc quyền của quán.'}
                </p>
              </div>

              {/* Lựa chọn kích thước cho đồ uống HOẶC hiển thị đơn giá cho đồ ăn nhanh */}
              {isDrinkProduct(selectedProductForSize) ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#fde68a', marginBottom: '8px' }}>
                    📏 Chọn Kích Thước (Size):
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                    {selectedProductForSize.sizes && selectedProductForSize.sizes.length > 0 ? (
                      selectedProductForSize.sizes.map((s, idx) => {
                        const isSelected = modalSelectedSize?.id === s.id;
                        const sizeLabel = getDrinkSizeLabel(s, idx);
                        return (
                          <div
                            key={s.id || idx}
                            onClick={() => setModalSelectedSize(s)}
                            style={{
                              background: isSelected ? 'rgba(217, 119, 6, 0.25)' : '#24140b',
                              border: isSelected ? '2px solid #f59e0b' : '1px solid #3d2314',
                              borderRadius: '8px',
                              padding: '10px 8px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isSelected ? '#fbbf24' : '#fff' }}>
                              {sizeLabel}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: isSelected ? '#fff' : '#d4b094', marginTop: '2px' }}>
                              {fmt(s.price)}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{
                        background: 'rgba(217, 119, 6, 0.25)',
                        border: '2px solid #f59e0b',
                        borderRadius: '8px',
                        padding: '10px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fbbf24' }}>
                          Size M
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#fff', marginTop: '2px' }}>
                          {fmt(selectedProductForSize.price || 0)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Đồ ăn nhanh / bánh / đồ ăn vặt: Tuyệt đối không có chữ size */
                <div style={{
                  background: 'rgba(217, 119, 6, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.85rem', color: '#d4b094', fontWeight: 600 }}>
                    🍿 Đơn giá món:
                  </span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24' }}>
                    {fmt(modalSelectedSize?.price || selectedProductForSize.price || 0)}
                  </span>
                </div>
              )}

              {/* Số lượng */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fde68a' }}>
                  {isDrinkProduct(selectedProductForSize) ? 'Số lượng ly:' : 'Số lượng phần:'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setModalQuantity(q => Math.max(1, q - 1))}
                    style={{
                      background: '#382012',
                      border: '1px solid #5a341e',
                      color: '#fff',
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', minWidth: '22px', textAlign: 'center' }}>
                    {modalQuantity}
                  </span>
                  <button
                    onClick={() => setModalQuantity(q => q + 1)}
                    style={{
                      background: '#382012',
                      border: '1px solid #5a341e',
                      color: '#fff',
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      fontSize: '1rem',
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
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#d4b094', marginBottom: '4px' }}>
                  📝 Ghi chú cho món này (tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="VD: Ít đường, nhiều đá, tách riêng sữa..."
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#24140b',
                    border: '1px solid #3d2314',
                    color: '#fff',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              {/* Nút thêm vào đơn */}
              <button
                onClick={handleAddToCart}
                style={{
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '11px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(21, 128, 61, 0.4)',
                  marginTop: '4px'
                }}
              >
                <span>Thêm Vào Đơn Hàng • {fmt((modalSelectedSize?.price || selectedProductForSize.price || 0) * modalQuantity)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL THÔNG BÁO HOÀN TẤT ĐẶT ĐƠN HIỆN GIỮA MÀN HÌNH                   */}
      {/* ========================================================================= */}
      {completedOrderModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 10000
        }}>
          <div style={{
            background: '#1a0e07',
            border: completedOrderModal.isScheduled ? '2px solid #a855f7' : '2px solid #10b981',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 25px 50px rgba(0,0,0,0.9)'
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>
              {completedOrderModal.isScheduled ? '🗓️' : '🎉'}
            </div>
            <h3 style={{
              margin: '0 0 6px',
              fontSize: '1.4rem',
              color: completedOrderModal.isScheduled ? '#c084fc' : '#34d399',
              fontWeight: 800
            }}>
              {completedOrderModal.isScheduled ? 'ĐẶT TRƯỚC THÀNH CÔNG!' : 'ĐẶT ĐƠN THÀNH CÔNG!'}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: '#fef3c7' }}>
              Mã đơn hàng: <strong style={{ color: '#fbbf24', fontSize: '1.05rem' }}>#{completedOrderModal.orderCode}</strong>
            </p>

            <div style={{
              background: '#24140b',
              border: completedOrderModal.isScheduled ? '1.5px solid #a855f7' : '1px solid #3d2314',
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'left',
              marginBottom: '18px',
              fontSize: '0.84rem',
              color: '#d4b094',
              lineHeight: 1.6
            }}>
              {completedOrderModal.isScheduled && (
                <div style={{ background: 'rgba(168, 85, 247, 0.18)', border: '1px solid #a855f7', borderRadius: '8px', padding: '10px', marginBottom: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: '#e9d5ff', fontWeight: 700 }}>⏰ THỜI GIAN HẸN NHẬN HÀNG:</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f5d0fe', margin: '2px 0' }}>{completedOrderModal.pickupTimeLabel}</div>
                  <div style={{ fontSize: '0.72rem', color: '#d8b4fe' }}>Hệ thống tự động chuyển đơn cho Barista trước giờ nhận 15 phút!</div>
                </div>
              )}
              <div>Tổng tiền: <strong style={{ color: '#fbbf24', fontSize: '1rem' }}>{fmt(completedOrderModal.total)}</strong></div>
              <div>Thanh toán: <strong style={{ color: '#fff' }}>{completedOrderModal.paymentMethod}</strong></div>
              <div>Trạng thái: <strong style={{ color: completedOrderModal.isScheduled ? '#c084fc' : '#fbbf24' }}>{completedOrderModal.isScheduled ? '🗓️ Đã lên lịch hẹn (SCHEDULED)' : '⏳ Chờ pha chế (PENDING)'}</strong></div>
              <div>Hình thức: <strong style={{ color: '#34d399' }}>Đóng cốc sẵn sàng</strong></div>
              <div>Điểm thưởng cộng thêm: <strong style={{ color: '#34d399' }}>+{completedOrderModal.earnedPoints} điểm</strong></div>
              <div style={{ marginTop: '8px', borderTop: '1px dashed #3d2314', paddingTop: '8px', color: '#a8a29e', fontSize: '0.78rem' }}>
                {completedOrderModal.isScheduled
                  ? '☕ Đơn hàng hẹn giờ đã được ghi nhận. Bạn có thể theo dõi tiến độ ở tab Lịch Sử Đơn Hàng!'
                  : '☕ Đơn hàng đã được chuyển thẳng tới máy pha chế của Barista. Bạn có thể theo dõi tiến độ ở tab Lịch Sử Đơn Hàng!'}
              </div>
            </div>

            {/* Auto Redirect Countdown */}
            <div
              style={{
                margin: '0 auto 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#38bdf8',
                padding: '4px 14px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              <span>⏳ Tự động chuyển xem tiến trình sau <strong>{customerRedirectCountdown}s</strong>...</span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setCompletedOrderModal(null);
                  setActiveTab('history');
                }}
                style={{
                  flex: 1,
                  background: '#d97706',
                  color: '#fff',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                📜 Xem Tiến Độ Pha Chế ({customerRedirectCountdown}s)
              </button>
              <button
                onClick={() => setCompletedOrderModal(null)}
                style={{
                  flex: 1,
                  background: '#24140b',
                  color: '#fef3c7',
                  border: '1px solid #3d2314',
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}