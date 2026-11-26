import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { resolveProductImage } from '../api/axios';
import socket from '../api/socket';
import toast from 'react-hot-toast';
import {
  Coffee, Ticket, Clock, MapPin, Wifi, Phone, Copy, ExternalLink, Lock, ArrowRight, User, Award, KeyRound, LogOut, RefreshCw, ClipboardList, ChevronLeft, ChevronRight, Menu, X
} from 'lucide-react';
import { BANK_CONFIG, generateVietQRUrl } from '../constants/bankConfig';

const readPortalCart = (key) => {
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const FALLBACK_DRINK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'><rect width='400' height='300' fill='%2318181B'/><circle cx='200' cy='150' r='44' fill='%2327272A'/><path d='M182 142h28v18a14 14 0 0 1-28 0v-18zm28 4h5a6 6 0 0 1 0 12h-5' fill='none' stroke='%23D97706' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>";

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

const QUICK_SUGAR_OPTIONS = ['100% đường', '70% đường', '50% đường', 'Không đường'];
const QUICK_ICE_OPTIONS = ['Đá chung', 'Ít đá', 'Đá riêng', 'Không đá'];

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

  // --- STATE GIỎ HÀNG CÔ LẬP THEO USER.ID (CHỐNG DÍNH GIỎ GIỮA CÁC TÀI KHOẢN) ---
  const cartStorageKey = user?.id ? `customer_cart_u${user.id}` : 'customer_cart_guest';
  const loadedCartKeyRef = useRef(cartStorageKey);
  const [cart, setCart] = useState(() => readPortalCart(cartStorageKey));

  // --- STATE CHỌN SIZE KHI BẤM "+ THÊM" ---
  const [selectedProductForSize, setSelectedProductForSize] = useState(null);
  const [modalSelectedSize, setModalSelectedSize] = useState(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [modalSugar, setModalSugar] = useState('100% đường');
  const [modalIce, setModalIce] = useState('Đá chung');
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
  const [showAuthRequiredModal, setShowAuthRequiredModal] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // --- STATE HỒ SƠ CÁ NHÂN & ĐỔI MẬT KHẨU ---
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', birthday: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false); // ẩn form đổi mật khẩu mặc định

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || '',
        email: user.email || '',
        birthday: user.birthday ? String(user.birthday).slice(0, 10) : '',
      });
    }
  }, [user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (profileForm.full_name.trim().length < 2) {
      return toast.error('Họ và tên cần có ít nhất 2 ký tự');
    }
    try {
      setSavingProfile(true);
      const res = await api.put('/auth/profile', profileForm);
      toast.success(res.data?.message || 'Đã cập nhật thông tin cá nhân thành công!');
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật hồ sơ cá nhân');
    } finally {
      setSavingProfile(false);
    }
  };

  const closePwForm = () => {
    setShowPwForm(false);
    setPwForm({ current_password: '', new_password: '', confirm_password: '' });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password.length < 6) {
      return toast.error('Mật khẩu mới phải có tối thiểu 6 ký tự');
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      return toast.error('Mật khẩu xác nhận không khớp');
    }
    try {
      setSavingPw(true);
      const res = await api.put('/auth/change-password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      toast.success(res.data?.message || 'Đổi mật khẩu thành công!');
      closePwForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi đổi mật khẩu');
    } finally {
      setSavingPw(false);
    }
  };

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

  // Nạp lại giỏ hàng cô lập mỗi khi chuyển đổi user.id
  useEffect(() => {
    const nextCart = readPortalCart(cartStorageKey);
    loadedCartKeyRef.current = cartStorageKey;
    setCart(nextCart);
    setAppliedVoucher(null);
    setUsePoints(false);
  }, [cartStorageKey]);

  // Chỉ ghi localStorage sau khi đã hydrate đúng key user hiện tại
  useEffect(() => {
    if (loadedCartKeyRef.current !== cartStorageKey) return;
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch (e) {
      console.warn('Could not save cart', e);
    }
  }, [cart, cartStorageKey]);

  const loadOrderHistory = async () => {
    if (!user) {
      setOrderHistory([]);
      return;
    }
    try {
      const res = await api.get('/orders/my-history');
      setOrderHistory(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.warn('Could not load order history:', err);
      setOrderHistory([]);
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
    setModalSugar('100% đường');
    setModalIce('Đá chung');
    setModalNote('');
  };

  const handleCloseSizeModal = () => {
    setSelectedProductForSize(null);
    setModalSelectedSize(null);
    setModalQuantity(1);
    setModalSugar('100% đường');
    setModalIce('Đá chung');
    setModalNote('');
  };

  const handleAddToCart = () => {
    if (!selectedProductForSize || !modalSelectedSize) return;

    const isDrink = isDrinkProduct(selectedProductForSize);
    const unitPrice = Number(modalSelectedSize.price || selectedProductForSize.price || 0);
    const rawSizeName = modalSelectedSize.name || modalSelectedSize.size || '';
    const sizeName = isDrink ? (rawSizeName || 'M') : '';

    const noteParts = [];
    if (isDrink) {
      if (modalSugar && modalSugar !== '100% đường') noteParts.push(modalSugar);
      if (modalIce && modalIce !== 'Đá chung') noteParts.push(modalIce);
    }
    if (modalNote && modalNote.trim()) noteParts.push(modalNote.trim());
    const finalNote = noteParts.join(', ');

    const cartItemId = `${selectedProductForSize.id}-${modalSelectedSize.id || sizeName || 'standard'}-${finalNote}`;

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
            note: finalNote,
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

  // --- XÁC NHẬN ĐẶT ĐƠN (YÊU CẦU ĐĂNG NHẬP - AUTH-REQUIRED) ---
  const handleCompleteOrder = async () => {
    if (!user) {
      toast.error('Vui lòng đăng nhập hoặc đăng ký tài khoản để đặt món và thanh toán!');
      setShowAuthRequiredModal(true);
      return;
    }
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

    const customerName = (user.full_name || user.username || '').trim();
    const customerPhone = (user.phone || user.username || '').trim();

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

  const customerPhone = user?.phone || user?.username || '';
  const vietQrUrl = generateVietQRUrl({
    amount: finalTotal,
    memo: `CF ${customerPhone || 'KHACH'} DH`
  });

  const portalNavGroups = [
    {
      title: 'ĐẶT MÓN & ƯU ĐÃI',
      items: [
        { id: 'menu', label: 'Thực Đơn', title: 'Thực đơn đặt món', icon: <Coffee size={18} />, count: filteredProducts.length },
        { id: 'vouchers', label: 'Mã Khuyến Mãi', title: 'Ưu đãi & Mã khuyến mãi', icon: <Ticket size={18} />, count: availableVouchers.length },
        { id: 'history', label: 'Lịch Sử Đơn Hàng', title: 'Lịch sử đơn hàng', icon: <ClipboardList size={18} />, count: historyList.length },
      ],
    },
    {
      title: 'CỬA HÀNG & TÀI KHOẢN',
      items: [
        { id: 'about', label: 'Thông Tin Quán', title: 'Thông tin quán', icon: <MapPin size={18} /> },
        ...(user ? [{ id: 'profile', label: 'Thông Tin Cá Nhân', title: 'Thông Tin Cá Nhân', icon: <User size={18} /> }] : []),
      ],
    },
  ];

  const currentTabMeta =
    portalNavGroups.flatMap((g) => g.items).find((it) => it.id === activeTab) ||
    { title: 'Thực đơn đặt món' };

  return (
    <div className={`mch-shell cp-portal-shell ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
      {mobileMenuOpen && (
        <div className="cp-sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* 1. SIDEBAR DỌC BÊN TRÁI ĐỒNG BỘ HOÀN TOÀN VỚI ADMIN */}
      <aside className={`mch-sidebar ${mobileMenuOpen ? 'is-mobile-open' : ''}`}>
        <div className="mch-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #F59E0B, #B45309)', color: '#FFFFFF',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.85rem'
            }}>
              ☕
            </div>
            {!sidebarCollapsed && (
              <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF', lineHeight: 1.15 }}>My Coffee House</div>
                <div style={{ fontSize: '0.67rem', color: '#B09884' }}>Cổng đặt món trực tuyến</div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="cp-collapse-btn"
            onClick={() => setSidebarCollapsed((c) => !c)}
            style={{ background: 'transparent', border: 'none', color: '#B09884', cursor: 'pointer', padding: '4px', display: 'flex' }}
            title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            type="button"
            className="cp-mobile-sidebar-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="mch-nav-scroll">
          {portalNavGroups.map((group) => (
            <div key={group.title}>
              {!sidebarCollapsed && <div className="mch-group-label">{group.title}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={sidebarCollapsed ? item.label : undefined}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`mch-nav-link ${activeTab === item.id ? 'active' : ''}`}
                    style={{
                      justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    }}
                  >
                    <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                    {!sidebarCollapsed && (
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </span>
                    )}
                    {!sidebarCollapsed && typeof item.count === 'number' && (
                      <span style={{
                        marginLeft: 'auto',
                        background: activeTab === item.id ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.1)',
                        color: activeTab === item.id ? '#FFFFFF' : '#D6C7B8',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '10px',
                      }}>
                        {item.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!sidebarCollapsed && (
          <div style={{
            padding: '14px 14px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.07)',
            background: 'rgba(0, 0, 0, 0.18)',
            flexShrink: 0,
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '11px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#F4F1EC' }}>Chi nhánh Cầu Giấy</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: '0.68rem', fontWeight: 600, color: '#34D399',
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                  Trực tuyến
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#A38B78', lineHeight: 1.4 }}>
                100 Cầu Giấy, Q. Cầu Giấy, Hà Nội
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* 2. KHUNG CHÍNH BÊN PHẢI: TOPBAR + NỘI DUNG */}
      <div className="mch-main">
        <header className="mch-topbar" style={{
          background: '#18181B',
          borderBottom: '1px solid #27272B',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          zIndex: 30,
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button
              type="button"
              className="cp-mobile-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
            >
              <Menu size={18} />
            </button>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#F4F1EC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentTabMeta.title}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Live Store Opening Hours Badge */}
            {storeHours.isOpen ? (
              <div className="cp-topbar-hide-sm" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#202024',
                border: '1px solid #2E2E35',
                color: '#34D399',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '5px 10px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
              }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981' }} />
                <span>Đang mở cửa ({storeHours.open_time} – {storeHours.close_time})</span>
              </div>
            ) : (
              <div className="cp-topbar-hide-sm" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#FCA5A5',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '5px 10px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
              }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#EF4444' }} />
                <span>Quán đóng cửa • Hẹn giờ ({storeHours.open_time} – {storeHours.close_time})</span>
              </div>
            )}

            {user && user.role !== 'customer' && (
              <button
                type="button"
                onClick={() => navigate('/tables')}
                style={{
                  background: 'rgba(217, 119, 6, 0.15)',
                  border: '1px solid rgba(217, 119, 6, 0.35)',
                  color: '#FBBF24',
                  padding: '6px 13px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                Quay lại POS
              </button>
            )}

            <div className="cp-topbar-hide-sm" style={{ width: '1px', height: '22px', background: '#2E2E35' }} />

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="cp-topbar-hide-sm"
                  onClick={() => { refreshUser(); loadOrderHistory(); toast.success('Đã cập nhật số điểm & đơn hàng!'); }}
                  style={{
                    background: '#202024',
                    border: '1px solid #2E2E35',
                    color: '#FBBF24',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <RefreshCw size={13} />
                  <span>Cập nhật</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  title="Xem hồ sơ & điểm thưởng"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: '#27272B',
                    border: '1px solid #3F3F46',
                    color: '#F59E0B',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {(user.full_name || user.username || 'K').charAt(0).toUpperCase()}
                  </div>
                  <div className="cp-topbar-hide-sm" style={{ lineHeight: 1.2 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F4F1EC' }}>
                      {user.full_name || user.username}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#A1A1AA' }}>
                      Hạng {tierName} · {currentPoints} điểm
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={logout}
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                  style={{
                    marginLeft: '2px',
                    background: 'rgba(220, 38, 38, 0.15)',
                    border: '1px solid rgba(220, 38, 38, 0.3)',
                    color: '#F87171',
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/login')}
                style={{
                  background: '#D97706',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                Đăng nhập / Đăng ký
              </button>
            )}
          </div>
        </header>

        {/* 3. MAIN CONTENT */}
        <main className="mch-content">
          <div key={activeTab} className="page-unfold-transition">
          {/* TAB 1: THỰC ĐƠN + GIỎ HÀNG STICKY BÊN CẠNH MÀN HÌNH */}
          {activeTab === 'menu' && (
            <div className={`cp-menu-layout ${cart.length > 0 ? 'has-cart' : ''}`}>
              {/* CỘT TRÁI: TÌM KIẾM, DANH MỤC & LƯỚI MÓN ĂN CHUẨN 4:3 */}
              <section style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px',
                  padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      className="ui-input"
                      style={{ flex: 1, minWidth: '220px', maxWidth: '420px', background: '#121214', color: '#F4F1EC', borderColor: '#2E2E35' }}
                      placeholder="Tìm tên đồ uống, mã món (CF01, TR02)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#A1A1AA', fontWeight: 600 }}>
                      {filteredProducts.length} món có sẵn
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      style={{
                        padding: '6px 14px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
                        cursor: 'pointer', border: '1px solid',
                        background: selectedCategory === 'all' ? '#D97706' : '#202024',
                        borderColor: selectedCategory === 'all' ? '#D97706' : '#2E2E35',
                        color: selectedCategory === 'all' ? '#FFFFFF' : '#A1A1AA',
                      }}
                    >
                      Tất cả
                    </button>
                    {categoryList.map((c) => {
                      const active = String(selectedCategory) === String(c.id);
                      const label = String(c.name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCategory(String(c.id))}
                          style={{
                            padding: '6px 14px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
                            cursor: 'pointer', border: '1px solid',
                            background: active ? '#D97706' : '#202024',
                            borderColor: active ? '#D97706' : '#2E2E35',
                            color: active ? '#FFFFFF' : '#A1A1AA',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: '#A1A1AA' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>☕</div>
                    <div>Đang tải danh sách đồ uống hảo hạng...</div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717A', background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px' }}>
                    Không tìm thấy món nào phù hợp với từ khóa của bạn.
                  </div>
                ) : (
                  <div key={selectedCategory} className="cp-products-grid">
                    {filteredProducts.map((p) => {
                      const sizes = p.sizes || [];
                      const defaultPrice = sizes.length > 0 ? sizes[0].price : (p.price || 0);
                      const inCartQty = getProductTotalQtyInCart(p.id);
                      return (
                        <article key={p.id} className="cp-product-card" onClick={() => handleOpenSizeModal(p)}>
                          <div className="cp-product-thumb-wrap">
                            <img
                              src={resolveProductImage(p.image_url, FALLBACK_DRINK_IMG)}
                              alt={p.name}
                              className="cp-product-thumb"
                              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_DRINK_IMG; }}
                            />
                            {p.code && (
                              <span style={{
                                position: 'absolute', top: '10px', left: '10px',
                                background: 'rgba(18, 18, 20, 0.82)', color: '#F4F1EC',
                                fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}>
                                {p.code}
                              </span>
                            )}
                            {inCartQty > 0 && (
                              <span style={{
                                position: 'absolute', top: '10px', right: '10px',
                                background: '#D97706', color: '#FFFFFF',
                                fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: '999px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                              }}>
                                {inCartQty} trong giỏ
                              </span>
                            )}
                          </div>

                          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', gap: '10px' }}>
                            <div>
                              <h3 style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 600, color: '#F4F1EC', lineHeight: 1.35 }} title={p.name}>
                                {p.name}
                              </h3>
                              <p style={{
                                margin: 0, fontSize: '0.75rem', color: '#A1A1AA', lineHeight: 1.4,
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '32px'
                              }}>
                                {p.description || 'Pha chế chuẩn vị tại My Coffee House'}
                              </p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #26262B' }}>
                              <span className="ui-money" style={{ fontWeight: 700, fontSize: '0.96rem', color: '#F59E0B' }}>
                                {fmt(defaultPrice)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenSizeModal(p); }}
                                style={{
                                  background: '#D97706', color: '#FFFFFF', border: 'none',
                                  padding: '6px 12px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                + Thêm
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* CỘT PHẢI: GIỎ HÀNG & THANH TOÁN LUÔN CỐ ĐỊNH BÊN CẠNH */}
              {cart.length > 0 && (
                <aside className={`cp-side-cart ${mobileCartOpen ? 'is-mobile-open' : ''}`}>
                  <div className="cp-side-cart-header">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#F4F1EC' }}>
                        Giỏ hàng ({cartTotalCount} món)
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#A1A1AA', marginTop: '2px' }}>
                        {user?.full_name || 'Thành viên'} · Hạng {tierName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => { clearCart(); setMobileCartOpen(false); }}
                        style={{ background: 'none', border: 'none', color: '#F87171', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Xóa hết
                      </button>
                      <button
                        type="button"
                        className="cp-mobile-close-btn"
                        onClick={() => setMobileCartOpen(false)}
                        aria-label="Đóng giỏ hàng"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="cp-side-cart-body">
                    {/* 1. Danh sách món trong giỏ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {cart.map((item, idx) => (
                        <div key={item.cartItemId || idx} style={{
                          background: '#202024', border: '1px solid #2A2A30', borderRadius: '11px',
                          padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#F4F1EC' }}>
                              {item.name} {item.size_name && ['S', 'M', 'L', 'XL'].includes(item.size_name.toUpperCase()) ? `(${item.size_name})` : ''}
                            </div>
                            {item.note && (
                              <div style={{ fontSize: '0.72rem', color: '#A1A1AA', marginTop: '2px' }}>{item.note}</div>
                            )}
                            <div className="ui-money" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#F59E0B', marginTop: '3px' }}>
                              {fmt(item.price * item.quantity)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                            <button type="button" onClick={() => updateCartLineQty(idx, -1)} style={{ width: '25px', height: '25px', borderRadius: '7px', background: '#141417', border: '1px solid #32323A', color: '#F4F1EC', cursor: 'pointer' }}>−</button>
                            <span className="ui-money" style={{ minWidth: '18px', textAlign: 'center', fontWeight: 700, fontSize: '0.82rem' }}>{item.quantity}</span>
                            <button type="button" onClick={() => updateCartLineQty(idx, 1)} style={{ width: '25px', height: '25px', borderRadius: '7px', background: '#141417', border: '1px solid #32323A', color: '#F4F1EC', cursor: 'pointer' }}>+</button>
                            <button type="button" onClick={() => removeCartLine(idx)} title="Xóa món" style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 2. Ghi chú chung đơn hàng */}
                    <input
                      type="text"
                      className="ui-input"
                      style={{ background: '#121214', color: '#F4F1EC', borderColor: '#2E2E35', fontSize: '0.78rem' }}
                      placeholder="Ghi chú chung cho quầy pha chế..."
                      value={orderGeneralNote}
                      onChange={(e) => setOrderGeneralNote(e.target.value)}
                    />

                    {/* 3. Thời gian nhận món (Nhận ngay / Hẹn giờ lấy + chọn ngày) */}
                    <div style={{ paddingTop: '10px', borderTop: '1px solid #26262B', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {!storeHours.isOpen && (
                        <div style={{
                          background: 'rgba(239, 68, 68, 0.14)', border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '8px', padding: '7px 10px', fontSize: '0.73rem', color: '#FCA5A5', lineHeight: 1.4
                        }}>
                          Quán đang đóng cửa ({storeHours.open_time} – {storeHours.close_time}). Vui lòng chọn giờ đặt trước:
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: '#121214', padding: '3px', borderRadius: '9px', border: '1px solid #2A2A30' }}>
                        <button
                          type="button"
                          disabled={!storeHours.isOpen}
                          onClick={() => setOrderTimingMode('now')}
                          style={{
                            height: '32px', borderRadius: '7px', border: 'none', fontSize: '0.76rem', fontWeight: 600,
                            cursor: storeHours.isOpen ? 'pointer' : 'not-allowed',
                            background: orderTimingMode === 'now' && storeHours.isOpen ? '#D97706' : 'transparent',
                            color: orderTimingMode === 'now' && storeHours.isOpen ? '#FFFFFF' : '#71717A',
                          }}
                        >
                          Nhận ngay
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderTimingMode('scheduled')}
                          style={{
                            height: '32px', borderRadius: '7px', border: 'none', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                            background: orderTimingMode === 'scheduled' || !storeHours.isOpen ? '#D97706' : 'transparent',
                            color: orderTimingMode === 'scheduled' || !storeHours.isOpen ? '#FFFFFF' : '#A1A1AA',
                          }}
                        >
                          Hẹn giờ lấy
                        </button>
                      </div>

                      {(orderTimingMode === 'scheduled' || !storeHours.isOpen) && storeHours.availableSlots && storeHours.availableSlots.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                                  padding: '4px 9px', borderRadius: '7px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                  background: selectedDayIndex === dIdx ? '#D97706' : '#202024',
                                  color: selectedDayIndex === dIdx ? '#FFFFFF' : '#A1A1AA',
                                  border: '1px solid ' + (selectedDayIndex === dIdx ? '#D97706' : '#2E2E35'),
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {d.dayLabel}
                              </button>
                            ))}
                          </div>
                          {storeHours.availableSlots[selectedDayIndex]?.slots?.length > 0 ? (
                            <select
                              className="ui-select"
                              style={{ width: '100%', background: '#121214', color: '#F4F1EC', borderColor: '#2E2E35' }}
                              value={selectedSlotDatetime}
                              onChange={(e) => {
                                const slot = storeHours.availableSlots[selectedDayIndex].slots.find((s) => s.datetime === e.target.value);
                                setSelectedSlotDatetime(e.target.value);
                                setSelectedSlotLabel(slot?.label || '');
                              }}
                            >
                              {storeHours.availableSlots[selectedDayIndex].slots.map((s) => (
                                <option key={s.datetime} value={s.datetime}>{s.label}</option>
                              ))}
                            </select>
                          ) : (
                            <div style={{ fontSize: '0.72rem', color: '#F87171' }}>Hết khung giờ hôm nay, vui lòng chọn ngày khác.</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 4. Mã ưu đãi & Điểm thưởng */}
                    <div style={{ paddingTop: '10px', borderTop: '1px solid #26262B', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          className="ui-input"
                          style={{ flex: 1, background: '#121214', color: '#F4F1EC', borderColor: '#2E2E35', textTransform: 'uppercase' }}
                          placeholder="Nhập mã ưu đãi..."
                          value={voucherCodeInput}
                          onChange={(e) => setVoucherCodeInput(e.target.value.toUpperCase())}
                        />
                        {appliedVoucher ? (
                          <button type="button" className="ui-btn ui-btn-danger" onClick={handleRemoveCoupon}>Bỏ</button>
                        ) : (
                          <button type="button" className="ui-btn ui-btn-outline" style={{ background: '#202024', color: '#F4F1EC', borderColor: '#32323A' }} onClick={() => handleApplyCoupon()}>Áp dụng</button>
                        )}
                      </div>
                      {readyToUseVouchers.length > 0 && (
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {readyToUseVouchers.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => handleApplyCoupon(c.code)}
                              style={{
                                padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                border: appliedVoucher?.code === c.code ? '1px solid #10B981' : '1px dashed #D97706',
                                background: appliedVoucher?.code === c.code ? 'rgba(16,185,129,0.16)' : '#121214',
                                color: appliedVoucher?.code === c.code ? '#34D399' : '#FBBF24',
                              }}
                            >
                              {c.code}
                            </button>
                          ))}
                        </div>
                      )}
                      {maxRedeemablePoints > 0 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.78rem', color: '#D4D4D8', cursor: 'pointer' }}>
                          <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
                          <span>Dùng {maxRedeemablePoints} điểm thưởng (-{fmt(maxRedeemablePoints * 1000)})</span>
                        </label>
                      )}
                    </div>

                    {/* 5. Phương thức thanh toán */}
                    <div style={{ paddingTop: '10px', borderTop: '1px solid #26262B', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {['QR Banking', 'Tiền mặt'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m)}
                            style={{
                              height: '36px', borderRadius: '9px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                              background: paymentMethod === m ? 'rgba(217, 119, 6, 0.16)' : '#202024',
                              border: paymentMethod === m ? '1.5px solid #D97706' : '1px solid #2E2E35',
                              color: paymentMethod === m ? '#FBBF24' : '#A1A1AA',
                            }}
                          >
                            {m === 'QR Banking' ? 'Chuyển khoản QR' : 'Trả tại quầy'}
                          </button>
                        ))}
                      </div>

                      {paymentMethod === 'QR Banking' && finalTotal > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#121214', padding: '10px', borderRadius: '11px', border: '1px solid #2A2A30' }}>
                          <img src={vietQrUrl} alt="VietQR" style={{ width: '88px', height: '88px', borderRadius: '8px', background: '#FFFFFF', padding: '3px', flexShrink: 0 }} />
                          <div style={{ fontSize: '0.73rem', color: '#D4D4D8', lineHeight: 1.5 }}>
                            <div style={{ fontWeight: 700, color: '#F4F1EC' }}>{BANK_CONFIG.bankName}</div>
                            <div>STK: <strong>{BANK_CONFIG.accountNumber}</strong></div>
                            <div>CTK: <strong>{BANK_CONFIG.accountHolder}</strong></div>
                            <div>Nội dung: <strong style={{ color: '#FBBF24' }}>CF {customerPhone} DH</strong></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer ghim cố định ở đáy Panel bên cạnh */}
                  <div className="cp-side-cart-footer">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA' }}>
                        <span>Tạm tính</span><span className="ui-money">{fmt(totalAmount)}</span>
                      </div>
                      {(voucherDiscount + tierDiscount + pointsDiscount) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34D399' }}>
                          <span>Giảm giá</span><span className="ui-money">-{fmt(voucherDiscount + tierDiscount + pointsDiscount)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#F4F1EC' }}>Tổng thanh toán</span>
                        <span className="ui-money" style={{ fontWeight: 700, fontSize: '1.22rem', color: '#F59E0B' }}>{fmt(finalTotal)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={submittingOrder}
                      onClick={!user ? () => setShowAuthRequiredModal(true) : handleCompleteOrder}
                      className="ui-money"
                      style={{
                        width: '100%', height: '42px', borderRadius: '11px', border: 'none',
                        background: '#D97706', color: '#FFFFFF', fontSize: '0.86rem', fontWeight: 700,
                        cursor: submittingOrder ? 'not-allowed' : 'pointer', opacity: submittingOrder ? 0.6 : 1,
                      }}
                    >
                      {submittingOrder ? 'Đang gửi đơn...' : `Đặt đơn & Thanh toán · ${fmt(finalTotal)}`}
                    </button>
                  </div>
                </aside>
              )}

              {/* THANH THU GỌN TRÊN MOBILE (CHỈ HIỆN KHI <= 820px VÀ CHƯA BUNG PANEL) */}
              {cart.length > 0 && !mobileCartOpen && (
                <div className="cp-mobile-cart-bar" onClick={() => setMobileCartOpen(true)}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F4F1EC' }}>
                      🛒 Giỏ hàng ({cartTotalCount} món)
                    </span>
                    <span className="ui-money" style={{ fontSize: '0.76rem', fontWeight: 700, color: '#F59E0B' }}>
                      Tổng: {fmt(finalTotal)}
                    </span>
                  </div>
                  <span style={{
                    background: '#D97706', color: '#FFFFFF', padding: '7px 14px',
                    borderRadius: '9px', fontSize: '0.8rem', fontWeight: 700
                  }}>
                    Xem &amp; Đặt đơn →
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MÃ KHUYẾN MÃI */}
          {activeTab === 'vouchers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 700, color: '#F4F1EC', letterSpacing: '-0.02em' }}>
                  Ưu đãi &amp; Mã khuyến mãi
                </h2>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#A1A1AA' }}>
                  Chọn mã phù hợp để tự động khấu trừ trực tiếp vào đơn hàng của bạn.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '16px' }}>
                {availableVouchers.map((v) => {
                  const isNewCode = ['BANMOI', 'BANMOI20'].includes(v.code);
                  const isBlockedNew = isNewCode && !isFirstTimeCustomer;
                  const minOrder = Number(v.min_order_value || 0);
                  const missingAmt = Math.max(0, minOrder - totalAmount);
                  const isQualified = !isBlockedNew && missingAmt === 0 && totalAmount > 0;

                  const isPct = ['percent_order', 'happy_hour', 'percentage'].includes(v.type);
                  const shortVal = isPct ? `-${Number(v.value)}%` : `-${Math.round(Number(v.value) / 1000)}K`;

                  return (
                    <div
                      key={v.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '104px 1fr',
                        background: '#18181B',
                        border: isQualified ? '1px solid rgba(217, 119, 6, 0.55)' : '1px solid #2A2A30',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        opacity: isBlockedNew ? 0.58 : 1,
                        transition: 'border-color 0.16s ease, transform 0.16s ease',
                      }}
                    >
                      {/* Cuống vé bên trái: Mức giảm nổi bật */}
                      <div style={{
                        background: isBlockedNew
                          ? '#202024'
                          : 'linear-gradient(160deg, rgba(217, 119, 6, 0.22) 0%, rgba(180, 83, 9, 0.08) 100%)',
                        borderRight: '1px dashed #2E2E35',
                        padding: '16px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '6px',
                      }}>
                        <Ticket size={18} color={isBlockedNew ? '#71717A' : '#F59E0B'} />
                        <div className="ui-money" style={{ fontSize: '1.25rem', fontWeight: 700, color: isBlockedNew ? '#A1A1AA' : '#F59E0B', lineHeight: 1.1 }}>
                          {shortVal}
                        </div>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                          background: '#121214', color: '#D4D4D8', letterSpacing: '0.04em',
                        }}>
                          {v.code}
                        </span>
                      </div>

                      {/* Chi tiết điều kiện & Nút hành động */}
                      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#F4F1EC', marginBottom: '4px' }}>
                            {v.name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#A1A1AA', lineHeight: 1.4 }}>
                            {v.description || 'Áp dụng cho mọi đồ uống tại quán.'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingTop: '8px', borderTop: '1px solid #242428' }}>
                          <span className="ui-money" style={{
                            fontSize: '0.72rem', fontWeight: 600,
                            color: isBlockedNew ? '#71717A' : isQualified ? '#34D399' : '#FBBF24',
                          }}>
                            {isBlockedNew
                              ? 'Chỉ áp dụng đơn đầu tiên'
                              : isQualified
                                ? 'Đủ điều kiện áp dụng'
                                : totalAmount === 0
                                  ? `Đơn từ ${fmt(minOrder)}`
                                  : `Cần thêm ${fmt(missingAmt)}`}
                          </span>

                          <button
                            type="button"
                            disabled={isBlockedNew}
                            onClick={() => {
                              if (isQualified) {
                                handleApplyCoupon(v.code);
                                setActiveTab('menu');
                              } else {
                                setActiveTab('menu');
                              }
                            }}
                            style={{
                              height: '32px', padding: '0 12px', borderRadius: '8px', border: 'none',
                              fontSize: '0.76rem', fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              cursor: isBlockedNew ? 'not-allowed' : 'pointer',
                              background: isBlockedNew ? '#26262B' : isQualified ? '#D97706' : '#26262B',
                              color: isBlockedNew ? '#71717A' : isQualified ? '#FFFFFF' : '#F4F1EC',
                            }}
                          >
                            {isBlockedNew ? (
                              <><Lock size={12} /> Không khả dụng</>
                            ) : isQualified ? (
                              <>Áp dụng ngay <ArrowRight size={13} /></>
                            ) : (
                              <>Chọn món <ArrowRight size={13} /></>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: LỊCH SỬ ĐƠN HÀNG */}
          {activeTab === 'history' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#F4F1EC' }}>
                    📜 Lịch Sử Đơn Hàng Của Bạn
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#A1A1AA' }}>
                    Theo dõi trạng thái pha chế thời gian thực của các ly cà phê đã đặt.
                  </p>
                </div>
                <button
                  onClick={() => { loadOrderHistory(); toast.success('Đã làm mới danh sách đơn!'); }}
                  style={{
                    background: '#202024',
                    border: '1px solid #32323A',
                    color: '#FBBF24',
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

              {!user ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#18181B', border: '1px solid #2A2A30', borderRadius: '14px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🔒</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', color: '#F4F1EC', fontWeight: 700 }}>
                    Đăng nhập để xem lịch sử đơn hàng
                  </h3>
                  <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#A1A1AA', maxWidth: '420px', marginInline: 'auto', lineHeight: 1.5 }}>
                    Vui lòng đăng nhập tài khoản thành viên để theo dõi tiến trình pha chế trực tuyến và xem lại các đơn hàng đã đặt.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/login?redirect=/customer')}
                    style={{
                      background: '#D97706', color: '#FFFFFF', border: 'none', borderRadius: '8px',
                      padding: '10px 22px', fontWeight: 600, fontSize: '0.86rem', cursor: 'pointer'
                    }}
                  >
                    Đăng nhập ngay
                  </button>
                </div>
              ) : historyList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#18181B', border: '1px solid #2A2A30', borderRadius: '14px', color: '#A1A1AA' }}>
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
                          background: '#18181B',
                          border: o.status === 'scheduled' ? '1.5px solid #A855F7' : '1px solid #2A2A30',
                          borderRadius: '14px',
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
                            background: '#202024',
                            padding: '10px 14px',
                            borderRadius: '9px',
                            border: '1px solid #2A2A30',
                            fontSize: '0.85rem',
                            color: '#F4F1EC'
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
            <div style={{ maxWidth: '840px', margin: '8px auto 0' }}>
              <div style={{
                background: '#18181B',
                border: '1px solid #2A2A30',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.32)',
              }}>
                {/* Banner thương hiệu đồng bộ Espresso -> Matte Dark */}
                <div style={{
                  background: 'linear-gradient(135deg, #24150D 0%, #18181B 100%)',
                  borderBottom: '1px solid #2A2A30',
                  padding: '32px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: '52px', height: '52px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #F59E0B, #B45309)',
                    color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '14px', boxShadow: '0 6px 18px rgba(217, 119, 6, 0.35)',
                  }}>
                    <Coffee size={26} />
                  </div>
                  <h2 style={{ margin: '0 0 6px', fontSize: '1.55rem', fontWeight: 700, color: '#F4F1EC', letterSpacing: '-0.02em' }}>
                    My Coffee House
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#A1A1AA', maxWidth: '460px', lineHeight: 1.5 }}>
                    Cà phê rang xay nguyên bản &amp; không gian làm việc ấm cúng tại trung tâm Cầu Giấy, Hà Nội.
                  </p>
                </div>

                {/* 4 Thẻ thông tin chuẩn Matte Dark + Lucide Icons */}
                <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
                  {/* 1. Địa chỉ cửa hàng — 100 Cầu Giấy, Hà Nội */}
                  <div style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(217, 119, 6, 0.14)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '3px' }}>Địa chỉ cửa hàng</div>
                        <div style={{ fontSize: '0.94rem', fontWeight: 600, color: '#F4F1EC' }}>100 Cầu Giấy, Hà Nội</div>
                        <div style={{ fontSize: '0.78rem', color: '#71717A', marginTop: '2px' }}>Quận Cầu Giấy, Thành phố Hà Nội</div>
                      </div>
                    </div>
                    <a
                      href="https://www.google.com/maps/search/?api=1&query=100+Cau+Giay+Ha+Noi"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                        fontSize: '0.76rem', fontWeight: 600, color: '#F59E0B', textDecoration: 'none',
                      }}
                    >
                      Xem chỉ đường trên Google Maps <ExternalLink size={13} />
                    </a>
                  </div>

                  {/* 2. Giờ mở cửa (Đồng bộ động theo cấu hình Admin) */}
                  <div style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '14px', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.14)', color: '#38BDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '3px' }}>Giờ phục vụ</div>
                      <div className="ui-money" style={{ fontSize: '0.94rem', fontWeight: 600, color: '#F4F1EC' }}>
                        {storeHours.open_time} – {storeHours.close_time} hàng ngày
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#71717A', marginTop: '2px' }}>
                        Phục vụ cả cuối tuần &amp; ngày lễ • Hỗ trợ đặt hẹn giờ trước
                      </div>
                    </div>
                  </div>

                  {/* 3. Wi-Fi quán kèm nút sao chép mật khẩu */}
                  <div style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '14px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.14)', color: '#C084FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Wifi size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '3px' }}>Wi-Fi tốc độ cao tại quán</div>
                        <div style={{ fontSize: '0.94rem', fontWeight: 600, color: '#F4F1EC' }}>MyCoffeeHouse_5G</div>
                        <div style={{ fontSize: '0.78rem', color: '#A1A1AA', marginTop: '2px' }}>
                          Mật khẩu: <strong style={{ color: '#F4F1EC', fontWeight: 600 }}>coffeehouse123</strong>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('coffeehouse123');
                        toast.success('Đã sao chép mật khẩu Wi-Fi');
                      }}
                      style={{
                        background: '#18181B', border: '1px solid #2E2E35', color: '#D4D4D8',
                        padding: '6px 9px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 600,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0,
                      }}
                    >
                      <Copy size={13} /> Chép
                    </button>
                  </div>

                  {/* 4. Hotline hỗ trợ */}
                  <div style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '14px', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.14)', color: '#34D399', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Phone size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '3px' }}>Hotline hỗ trợ</div>
                      <div className="ui-money" style={{ fontSize: '0.98rem', fontWeight: 700, color: '#34D399' }}>1900 1234</div>
                      <div style={{ fontSize: '0.78rem', color: '#71717A', marginTop: '2px' }}>
                        Đặt bàn nhóm, tư vấn đồ uống &amp; phản hồi chất lượng
                      </div>
                    </div>
                  </div>
                </div>


              </div>
            </div>
          )}

          {/* TAB 5: THÔNG TIN CÁ NHÂN KHÁCH HÀNG & ĐỔI MẬT KHẨU */}
          {activeTab === 'profile' && user && (() => {
            const cInfo = user.customer_info || {};
            const spent = Number(cInfo.total_spent || 0);
            const nextTier = cInfo.next_tier || null;
            const nextMin = nextTier ? Number(nextTier.min_spent || 0) : spent;
            const progressPct = nextTier && nextMin > 0 ? Math.min(100, Math.round((spent / nextMin) * 100)) : 100;
            const loyaltyLogs = Array.isArray(cInfo.recent_loyalty) ? cInfo.recent_loyalty : [];

            return (
              <div style={{ maxWidth: '1040px', margin: '8px auto 0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* THẺ HỘI VIÊN */}
                <div className="cp-profile-hero">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{
                      width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #F59E0B, #B45309)', color: '#FFFFFF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800,
                    }}>
                      {(user.full_name || user.username || 'K').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: '1.28rem', fontWeight: 700, color: '#F4F1EC' }}>{user.full_name}</h2>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          fontSize: '0.74rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px',
                          background: 'rgba(245, 158, 11, 0.16)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#FBBF24',
                        }}>
                          <Award size={12} />
                          Hạng {cInfo.tier_name || 'Đồng'} {Number(cInfo.discount_pct || 0) > 0 ? `· Giảm ${cInfo.discount_pct}%` : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.84rem', color: '#A1A1AA', marginTop: '4px' }}>
                        SĐT / Tài khoản: <strong style={{ color: '#F4F1EC' }}>{user.phone || user.username}</strong>
                        {user.code ? ` · Mã TV: ${user.code}` : ''}
                      </div>
                      {nextTier ? (
                        <div style={{ marginTop: '12px', maxWidth: '380px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#A1A1AA', marginBottom: '5px', gap: '8px' }}>
                            <span>Tiến độ lên hạng <strong style={{ color: '#FBBF24' }}>{nextTier.name}</strong></span>
                            <span className="ui-money">Còn thiếu {fmt(Math.max(0, nextMin - spent))}</span>
                          </div>
                          <div style={{ height: '6px', borderRadius: '99px', background: '#26262E', overflow: 'hidden' }}>
                            <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #F59E0B, #D97706)' }} />
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#34D399', fontWeight: 600 }}>
                          Bạn đang ở hạng thành viên cao nhất của My Coffee House
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3 Ô CHỈ SỐ CÁ NHÂN */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    <div style={{ background: '#121214', border: '1px solid #2A2A30', borderRadius: '12px', padding: '12px' }}>
                      <div style={{ fontSize: '0.72rem', color: '#A1A1AA' }}>Điểm khả dụng</div>
                      <div className="ui-money" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34D399', marginTop: '4px' }}>
                        {cInfo.points_balance || 0}
                      </div>
                      <div className="ui-money" style={{ fontSize: '0.68rem', color: '#71717A' }}>≈ {fmt((cInfo.points_balance || 0) * 1000)}</div>
                    </div>
                    <div style={{ background: '#121214', border: '1px solid #2A2A30', borderRadius: '12px', padding: '12px' }}>
                      <div style={{ fontSize: '0.72rem', color: '#A1A1AA' }}>Tổng chi tiêu</div>
                      <div className="ui-money" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FBBF24', marginTop: '4px' }}>
                        {fmt(spent)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#71717A' }}>Lũy kế</div>
                    </div>
                    <div style={{ background: '#121214', border: '1px solid #2A2A30', borderRadius: '12px', padding: '12px' }}>
                      <div style={{ fontSize: '0.72rem', color: '#A1A1AA' }}>Đơn đã đặt</div>
                      <div className="ui-money" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38BDF8', marginTop: '4px' }}>
                        {cInfo.completed_orders ?? historyList.length}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#71717A' }}>Đơn hàng</div>
                    </div>
                  </div>
                </div>

                {/* THÔNG TIN CÁ NHÂN */}
                <form onSubmit={handleSaveProfile} style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#F4F1EC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={16} color="#F59E0B" /> Thông tin cá nhân
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div>
                      <label className="ui-modal-label">Số điện thoại (tên đăng nhập)</label>
                      <input className="ui-input" style={{ width: '100%', opacity: 0.65 }} value={user.phone || user.username || ''} disabled />
                    </div>
                    <div>
                      <label className="ui-modal-label">Họ và tên *</label>
                      <input className="ui-input" style={{ width: '100%' }} required value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} />
                    </div>
                    <div>
                      <label className="ui-modal-label">Email</label>
                      <input type="email" className="ui-input" style={{ width: '100%' }} placeholder="email@domain.com" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="ui-modal-label">Ngày sinh</label>
                      <input type="date" className="ui-input" style={{ width: '100%' }} value={profileForm.birthday} onChange={(e) => setProfileForm({ ...profileForm, birthday: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button type="submit" disabled={savingProfile} className="ui-btn ui-btn-brand">
                      {savingProfile ? 'Đang lưu...' : 'Lưu thông tin cá nhân'}
                    </button>
                  </div>
                </form>

                {/* BẢO MẬT & ĐỔI MẬT KHẨU – ẩn form mặc định, chỉ mở khi bấm "Thay đổi mật khẩu" */}
                <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#F4F1EC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <KeyRound size={16} color="#F59E0B" /> Bảo mật &amp; Đổi mật khẩu
                      </h3>
                      {!showPwForm && (
                        <span style={{ fontSize: '0.8rem', color: '#A1A1AA' }}>
                          Bảo vệ tài khoản và điểm thưởng bằng mật khẩu riêng tư.
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-expanded={showPwForm}
                      className={`ui-btn ${showPwForm ? 'ui-btn-outline btn-sm' : 'ui-btn-outline'}`}
                      onClick={() => (showPwForm ? closePwForm() : setShowPwForm(true))}
                    >
                      {showPwForm ? <><X size={14} /> Đóng</> : <><KeyRound size={14} color="#F59E0B" /> Thay đổi mật khẩu</>}
                    </button>
                  </div>

                  {showPwForm && (
                    <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '10px', borderTop: '1px solid #26262B' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                        <div>
                          <label className="ui-modal-label">Mật khẩu hiện tại *</label>
                          <input type="password" autoComplete="current-password" className="ui-input" style={{ width: '100%' }} required value={pwForm.current_password} onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} />
                        </div>
                        <div>
                          <label className="ui-modal-label">Mật khẩu mới (tối thiểu 6 ký tự) *</label>
                          <input type="password" autoComplete="new-password" minLength={6} className="ui-input" style={{ width: '100%' }} required value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} />
                        </div>
                        <div>
                          <label className="ui-modal-label">Nhập lại mật khẩu mới *</label>
                          <input type="password" autoComplete="new-password" minLength={6} className="ui-input" style={{ width: '100%' }} required value={pwForm.confirm_password} onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button type="button" className="ui-btn ui-btn-outline" onClick={closePwForm}>
                          Hủy
                        </button>
                        <button type="submit" disabled={savingPw} className="ui-btn ui-btn-brand">
                          {savingPw ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* LỊCH SỬ BIẾN ĐỘNG ĐIỂM THƯỞNG GẦN NHẤT */}
                {loyaltyLogs.length > 0 && (
                  <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #26262B', fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>
                      Lịch sử điểm thưởng gần nhất
                    </div>
                    <div className="ui-table-wrap">
                      <table className="ui-table">
                        <thead>
                          <tr><th>Thời gian</th><th>Loại giao dịch</th><th style={{ textAlign: 'right' }}>Biến động điểm</th></tr>
                        </thead>
                        <tbody>
                          {loyaltyLogs.map((l) => {
                            const isPlus = ['earn', 'refund'].includes(l.type) || Number(l.points) > 0;
                            const labelMap = { earn: 'Tích điểm đơn hàng', redeem: 'Đổi điểm giảm giá', refund: 'Hoàn điểm hủy đơn', clawback: 'Thu hồi điểm hủy đơn' };
                            return (
                              <tr key={l.id}>
                                <td style={{ color: '#A1A1AA', fontSize: '0.8rem' }}>{new Date(l.created_at).toLocaleString('vi-VN')}</td>
                                <td>{labelMap[l.type] || l.type}{l.order_id ? ` (Đơn #${l.order_id})` : ''}</td>
                                <td className="ui-money" style={{ textAlign: 'right', fontWeight: 700, color: isPlus ? '#34D399' : '#F87171' }}>
                                  {l.type === 'redeem' ? `-${Math.abs(l.points)}` : `${Number(l.points) > 0 ? '+' : ''}${l.points}`} điểm
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          </div>
        </main>
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
            background: '#18181B',
            border: '1px solid #2A2A30',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 24px 60px rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Ảnh & Header Modal */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', maxHeight: '260px', background: '#121214', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img
                src={resolveProductImage(selectedProductForSize.image_url, FALLBACK_DRINK_IMG)}
                alt={selectedProductForSize.name}
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_DRINK_IMG; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }}
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
                              background: isSelected ? 'rgba(217, 119, 6, 0.2)' : '#202024',
                              border: isSelected ? '2px solid #D97706' : '1px solid #2A2A30',
                              borderRadius: '9px',
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

              {/* Tùy chọn Mức Đường & Mức Đá cho đồ uống */}
              {isDrinkProduct(selectedProductForSize) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Chọn mức đường */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fde68a', marginBottom: '6px' }}>
                      🍯 Mức đường:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {QUICK_SUGAR_OPTIONS.map((sugar) => {
                        const isSelected = modalSugar === sugar;
                        return (
                          <button
                            key={sugar}
                            type="button"
                            onClick={() => setModalSugar(sugar)}
                            style={{
                              padding: '7px 4px',
                              fontSize: '0.74rem',
                              fontWeight: isSelected ? 800 : 500,
                              borderRadius: '6px',
                              border: isSelected ? '1.5px solid #D97706' : '1px solid #2A2A30',
                              background: isSelected ? 'rgba(217, 119, 6, 0.2)' : '#202024',
                              color: isSelected ? '#FBBF24' : '#A1A1AA',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {sugar}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chọn mức đá */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fde68a', marginBottom: '6px' }}>
                      🧊 Mức đá:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {QUICK_ICE_OPTIONS.map((ice) => {
                        const isSelected = modalIce === ice;
                        return (
                          <button
                            key={ice}
                            type="button"
                            onClick={() => setModalIce(ice)}
                            style={{
                              padding: '7px 4px',
                              fontSize: '0.74rem',
                              fontWeight: isSelected ? 800 : 500,
                              borderRadius: '6px',
                              border: isSelected ? '1.5px solid #38BDF8' : '1px solid #2A2A30',
                              background: isSelected ? 'rgba(56, 189, 248, 0.18)' : '#202024',
                              color: isSelected ? '#38BDF8' : '#A1A1AA',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {ice}
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
                      background: '#202024',
                      border: '1px solid #32323A',
                      color: '#F4F1EC',
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
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: '#F4F1EC', minWidth: '22px', textAlign: 'center' }}>
                    {modalQuantity}
                  </span>
                  <button
                    onClick={() => setModalQuantity(q => q + 1)}
                    style={{
                      background: '#202024',
                      border: '1px solid #32323A',
                      color: '#F4F1EC',
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
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '4px' }}>
                  📝 Ghi chú cho món:
                </label>
                <input
                  type="text"
                  placeholder="VD: Ít đường, nhiều đá, tách riêng sữa..."
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#121214',
                    border: '1px solid #2E2E35',
                    color: '#F4F1EC',
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
            background: '#18181B',
            border: completedOrderModal.isScheduled ? '1.5px solid #A855F7' : '1.5px solid #10B981',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 25px 50px rgba(0,0,0,0.85)'
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
            <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: '#F4F1EC' }}>
              Mã đơn hàng: <strong style={{ color: '#FBBF24', fontSize: '1.05rem' }}>#{completedOrderModal.orderCode}</strong>
            </p>

            <div style={{
              background: '#202024',
              border: completedOrderModal.isScheduled ? '1px solid #A855F7' : '1px solid #2A2A30',
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'left',
              marginBottom: '18px',
              fontSize: '0.84rem',
              color: '#D4D4D8',
              lineHeight: 1.6
            }}>
              {completedOrderModal.isScheduled && (
                <div style={{ background: 'rgba(168, 85, 247, 0.18)', border: '1px solid #a855f7', borderRadius: '8px', padding: '10px', marginBottom: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: '#e9d5ff', fontWeight: 700 }}>⏰ THỜI GIAN HẸN NHẬN HÀNG:</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f5d0fe', margin: '2px 0' }}>{completedOrderModal.pickupTimeLabel}</div>
                  <div style={{ fontSize: '0.72rem', color: '#d8b4fe' }}>Hệ thống tự động chuyển đơn cho Barista trước giờ nhận 15 phút!</div>
                </div>
              )}
              <div>Tổng tiền: <strong style={{ color: '#FBBF24', fontSize: '1rem' }}>{fmt(completedOrderModal.total)}</strong></div>
              <div>Thanh toán: <strong style={{ color: '#fff' }}>{completedOrderModal.paymentMethod}</strong></div>
              <div>Trạng thái: <strong style={{ color: completedOrderModal.isScheduled ? '#c084fc' : '#FBBF24' }}>{completedOrderModal.isScheduled ? '🗓️ Đã lên lịch hẹn (SCHEDULED)' : '⏳ Chờ pha chế (PENDING)'}</strong></div>
              <div>Hình thức: <strong style={{ color: '#34d399' }}>Đóng cốc sẵn sàng</strong></div>
              <div>Điểm thưởng cộng thêm: <strong style={{ color: '#34d399' }}>+{completedOrderModal.earnedPoints} điểm</strong></div>
              <div style={{ marginTop: '8px', borderTop: '1px dashed #2A2A30', paddingTop: '8px', color: '#A1A1AA', fontSize: '0.78rem' }}>
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
                  background: '#202024',
                  color: '#F4F1EC',
                  border: '1px solid #2A2A30',
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

      {/* MODAL YÊU CẦU ĐĂNG NHẬP / ĐĂNG KÝ (AUTH-REQUIRED) */}
      {showAuthRequiredModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setShowAuthRequiredModal(false)}
        >
          <div
            style={{
              background: '#18181B',
              border: '1px solid #2A2A30',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              color: '#F4F1EC',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#F4F1EC' }}>
                🔑 Yêu cầu tài khoản hội viên
              </h3>
              <button
                type="button"
                onClick={() => setShowAuthRequiredModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#A1A1AA',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.86rem', color: '#D4D4D8', lineHeight: 1.55 }}>
              Hệ thống yêu cầu đăng nhập tài khoản trước khi gửi đơn hàng và thanh toán. Các món bạn đã chọn ({cartTotalCount} món) vẫn được lưu tự động trong giỏ hàng.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => navigate('/login?mode=register&redirect=/customer')}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: '10px',
                  background: '#202024',
                  border: '1px solid #2E2E35',
                  color: '#F4F1EC',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                Đăng ký (+50đ)
              </button>
              <button
                type="button"
                onClick={() => navigate('/login?redirect=/customer')}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#D97706',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                Đăng nhập ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}