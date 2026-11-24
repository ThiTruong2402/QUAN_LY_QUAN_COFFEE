import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Minus, Trash2, Banknote, QrCode, Tag, UserCheck, Printer, CheckCircle2,
} from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { usePosCart } from '../context/PosCartContext';
import { BANK_CONFIG, generateVietQRUrl } from '../constants/bankConfig';
 
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&auto=format&fit=crop&q=80';
const QUICK_CASH_NOTES = [50000, 100000, 200000, 500000];
 
export default function PosCheckout() {
  const navigate = useNavigate();
  const {
    cart, orderMeta, summary,
    updateQty, updateItemNote, removeItem, updateMeta, resetAll,
  } = usePosCart();
 
  const [tables, setTables] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
 
  // Hội viên & Tích điểm
  const [member, setMember] = useState(null);
  const [usePoints, setUsePoints] = useState(false);
 
  // Phương thức thanh toán
  const [paymentMethod, setPaymentMethod] = useState('Tiền mặt'); // 'Tiền mặt' | 'QR Banking'
  const [cashGiven, setCashGiven] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
 
  useEffect(() => {
    const loadCheckoutDeps = async () => {
      try {
        const [tblRes, promoRes] = await Promise.all([
          api.get('/tables'),
          api.get('/promotions/active').catch(() => ({ data: { data: [] } })),
        ]);
        const tblList = tblRes.data?.data?.tables || [];
        setTables(tblList);
        if (!orderMeta.tableId && orderMeta.orderType === 'dine_in' && tblList.length > 0) {
          const firstEmpty = tblList.find((t) => t.status === 'empty') || tblList[0];
          updateMeta({ tableId: String(firstEmpty.id), tableCode: firstEmpty.code });
        }
        const rawPromos = Array.isArray(promoRes.data?.data) ? promoRes.data.data : [];
        setCoupons(rawPromos.filter((p) => p.code && p.code !== 'FREESHIP'));
      } catch {
        toast.error('Lỗi tải dữ liệu bàn và khuyến mãi');
      }
    };
    loadCheckoutDeps();
  }, []);
 
  // Tra cứu hội viên theo SĐT (debounce nhẹ)
  const handleLookupMember = async () => {
    const phone = (orderMeta.customerPhone || '').trim();
    if (phone.length < 9) {
      setMember(null);
      return;
    }
    try {
      const res = await api.get(`/customers/lookup/${encodeURIComponent(phone)}`);
      if (res.data?.success && res.data.data) {
        const c = res.data.data;
        setMember(c);
        updateMeta({ customerName: c.name || orderMeta.customerName });
        toast.success(`Đã nhận diện hội viên ${c.name} (${c.points_balance || 0} điểm)`);
      }
    } catch {
      setMember(null);
    }
  };
 
  // Tính toán giảm giá & tổng thanh toán
  const subtotal = summary.subtotal;
 
  let promoDiscount = 0;
  if (appliedCoupon) {
    const minOrder = Number(appliedCoupon.min_order_value || 0);
    if (subtotal >= minOrder) {
      const val = Number(appliedCoupon.value || 0);
      const isPct = ['percent_order', 'happy_hour', 'percentage'].includes(appliedCoupon.type);
      promoDiscount = isPct ? Math.round((subtotal * val) / 100) : Math.min(subtotal, val);
      if (isPct && appliedCoupon.max_discount) {
        promoDiscount = Math.min(promoDiscount, Number(appliedCoupon.max_discount));
      }
    }
  }
 
  const tierPct = Number(member?.discount_pct || 0);
  const tierDiscount = tierPct > 0 ? Math.round(((subtotal - promoDiscount) * tierPct) / 100) : 0;
  const afterTier = Math.max(0, subtotal - promoDiscount - tierDiscount);
  const maxRedeemPts = Math.min(Number(member?.points_balance || 0), Math.floor(afterTier / 1000));
  const pointsToRedeem = usePoints ? maxRedeemPts : 0;
  const pointsDiscount = pointsToRedeem * 1000;
 
  const totalDiscount = promoDiscount + tierDiscount + pointsDiscount;
  const finalTotal = Math.max(0, subtotal - totalDiscount);
  const earnedPoints = Math.floor(finalTotal / 10000);
  const numericCash = Number(cashGiven || 0);
  const changeAmount = Math.max(0, numericCash - finalTotal);
 
  const vietQrUrl = generateVietQRUrl({
    amount: finalTotal,
    memo: `POS ${orderMeta.tableCode || 'MV'} ${Date.now().toString().slice(-4)}`,
  });
 
  const handleApplyCoupon = (codeOverride) => {
    const code = (codeOverride || couponInput || '').trim().toUpperCase();
    if (!code) return toast.error('Vui lòng nhập mã ưu đãi');
    const found = coupons.find((c) => String(c.code).toUpperCase() === code);
    if (!found) return toast.error(`Mã ${code} không hợp lệ hoặc đã hết hạn`);
    if (subtotal < Number(found.min_order_value || 0)) {
      return toast.error(`Mã ${found.code} áp dụng cho đơn từ ${fmt(found.min_order_value)}`);
    }
    setAppliedCoupon(found);
    setCouponInput(found.code);
    toast.success(`Đã áp dụng mã ${found.code}`);
  };
 
  const handleSubmitCheckout = async () => {
    if (cart.length === 0 || submitting) return;
    if (paymentMethod === 'Tiền mặt' && cashGiven !== '' && numericCash < finalTotal) {
      return toast.error(`Tiền khách đưa còn thiếu ${fmt(finalTotal - numericCash)}`);
    }
 
    setSubmitting(true);
    try {
      const payload = {
        items: cart.map((it) => ({
          product_id: it.product_id,
          product_size_id: it.product_size_id,
          name: it.name,
          size_name: it.size_name,
          price: it.price,
          quantity: it.quantity,
          note: it.note,
        })),
        customer_name: (orderMeta.customerName || 'Khách lẻ').trim(),
        customer_phone: (orderMeta.customerPhone || '').trim() || null,
        order_type: orderMeta.orderType,
        table_id: orderMeta.orderType === 'dine_in' ? Number(orderMeta.tableId) || null : null,
        coupon_code: appliedCoupon ? appliedCoupon.code : null,
        points_to_redeem: pointsToRedeem,
        payment_method: paymentMethod,
        note: (orderMeta.note || '').trim() || null,
        status: 'pending',
      };
 
      const res = await api.post('/orders/direct-checkout', payload);
      if (res.data?.success) {
        const d = res.data.data;
        setCompletedOrder({
          orderCode: d.orderCode || d.invoiceNo,
          tableCode: orderMeta.orderType === 'dine_in' ? orderMeta.tableCode : 'Mang về',
          items: [...cart],
          subtotal,
          discount: d.discount_total ?? totalDiscount,
          total: d.total ?? finalTotal,
          paymentMethod,
          cashGiven: paymentMethod === 'Tiền mặt' ? (numericCash || finalTotal) : finalTotal,
          changeAmount: paymentMethod === 'Tiền mặt' && numericCash > finalTotal ? numericCash - finalTotal : 0,
          createdAt: new Date().toLocaleString('vi-VN'),
        });
        toast.success(`Thanh toán thành công đơn #${d.orderCode}! Đã đẩy xuống quầy pha chế.`);
        resetAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi thanh toán đơn hàng');
    } finally {
      setSubmitting(false);
    }
  };
 
  // Màn hình hoàn tất + In hóa đơn nhiệt K80
  if (completedOrder) {
    return (
      <div style={{ maxWidth: '520px', margin: '36px auto', textAlign: 'center' }}>
        <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '20px', padding: '32px 28px' }}>
          <CheckCircle2 size={54} color="#34D399" style={{ marginBottom: '12px' }} />
          <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem', color: '#F4F1EC' }}>Thanh toán thành công</h2>
          <p style={{ margin: '0 0 20px', color: '#A1A1AA', fontSize: '0.86rem' }}>
            Mã hóa đơn <strong style={{ color: '#F59E0B' }}>#{completedOrder.orderCode}</strong> đã được chuyển xuống quầy Barista.
          </p>
 
          <div style={{ background: '#121214', borderRadius: '12px', padding: '14px 16px', textAlign: 'left', fontSize: '0.84rem', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A1A1AA' }}>Vị trí:</span><strong>{completedOrder.tableCode}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A1A1AA' }}>Hình thức:</span><strong>{completedOrder.paymentMethod}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A1A1AA' }}>Tổng thanh toán:</span><strong style={{ color: '#F59E0B', fontSize: '1rem' }}>{fmt(completedOrder.total)}</strong></div>
            {completedOrder.changeAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A1A1AA' }}>Tiền thừa trả khách:</span><strong style={{ color: '#34D399' }}>{fmt(completedOrder.changeAmount)}</strong></div>
            )}
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button type="button" className="ui-btn ui-btn-outline" onClick={() => window.print()}>
              <Printer size={16} /> In hóa đơn K80
            </button>
            <button type="button" className="ui-btn ui-btn-brand" onClick={() => navigate('/pos')}>
              Tạo đơn mới →
            </button>
          </div>
        </div>
 
        {/* Khối hóa đơn nhiệt K80 ẩn, chỉ hiện khi bấm In */}
        <style>{`
          .pos-thermal-receipt { display: none; }
          @media print {
            body * { visibility: hidden; }
            .pos-thermal-receipt, .pos-thermal-receipt * { visibility: visible; }
            .pos-thermal-receipt {
              display: block !important;
              position: fixed;
              left: 0;
              top: 0;
              width: 80mm;
              margin: 0;
              padding: 10px;
              font-family: monospace;
              color: #000000;
              background: #ffffff;
            }
          }
        `}</style>
        <div className="pos-thermal-receipt">
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '14px' }}>MY COFFEE HOUSE</div>
          <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '6px' }}>Hóa đơn #{completedOrder.orderCode} • {completedOrder.createdAt}</div>
          <div style={{ borderTop: '1px dashed #000', padding: '6px 0' }}>
            {completedOrder.items.map((it) => (
              <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', margin: '3px 0' }}>
                <span>{it.name} ({it.size_name}) x{it.quantity}</span>
                <span>{fmt(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '12px' }}>
            {completedOrder.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Giảm giá:</span><span>-{fmt(completedOrder.discount)}</span></div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px' }}>
              <span>TỔNG CỘNG:</span><span>{fmt(completedOrder.total)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Header quay lại chọn thêm món */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <button
          type="button"
          onClick={() => navigate('/pos')}
          style={{
            background: '#18181B', border: '1px solid #2A2A30', color: '#F4F1EC',
            padding: '8px 14px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 700,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px'
          }}
        >
          <ArrowLeft size={16} /> Quay lại chọn thêm món
        </button>
        <div style={{ fontSize: '0.84rem', color: '#A1A1AA' }}>
          Kiểm tra lại danh sách đồ uống và hoàn tất thu tiền tại quầy
        </div>
      </div>
 
      {cart.length === 0 ? (
        <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '56px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#F4F1EC', marginBottom: '8px' }}>Giỏ hàng đang trống</div>
          <div style={{ fontSize: '0.84rem', color: '#A1A1AA', marginBottom: '18px' }}>Hãy quay lại thực đơn để chọn đồ uống trước khi thanh toán.</div>
          <button type="button" className="ui-btn ui-btn-brand" onClick={() => navigate('/pos')}>Quay lại thực đơn</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(360px, 1fr)', gap: '20px', alignItems: 'start' }}>
          {/* CỘT TRÁI (58%): CHI TIẾT GIỎ HÀNG RỘNG RÃI */}
          <section style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #26262B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#F4F1EC' }}>
                Danh sách đồ uống đã chọn ({summary.totalItems} món)
              </span>
              <button type="button" onClick={() => navigate('/pos')} style={{ background: 'none', border: 'none', color: '#F59E0B', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                + Chọn thêm món
              </button>
            </div>
 
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cart.map((item) => (
                <div key={item.key} style={{
                  display: 'flex', gap: '14px', padding: '14px', borderRadius: '14px',
                  background: '#202024', border: '1px solid #2A2A30', alignItems: 'center'
                }}>
                  <img
                    src={item.image_url || FALLBACK_IMG}
                    alt={item.name}
                    style={{ width: '62px', height: '62px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#F4F1EC' }}>
                        {item.name}
                        {item.size_name && item.size_name !== 'Tiêu chuẩn' && (
                          <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#2A2A30', color: '#FBBF24', padding: '2px 8px', borderRadius: '6px' }}>
                            Size {item.size_name}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 800, color: '#F59E0B', whiteSpace: 'nowrap' }}>
                        {fmt(item.price * item.quantity)}
                      </div>
                    </div>
 
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Ghi chú riêng (ít đá, 50% đường...)"
                        value={item.note || ''}
                        onChange={(e) => updateItemNote(item.key, e.target.value)}
                        style={{
                          flex: 1, minWidth: '170px', height: '32px', background: '#141417',
                          border: '1px solid #2E2E35', borderRadius: '8px', padding: '0 10px',
                          color: '#F4F1EC', fontSize: '0.78rem', outline: 'none'
                        }}
                      />
 
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button type="button" onClick={() => updateQty(item.key, -1)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#141417', border: '1px solid #32323A', color: '#F4F1EC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Minus size={14} />
                        </button>
                        <span style={{ minWidth: '22px', textAlign: 'center', fontWeight: 800 }}>{item.quantity}</span>
                        <button type="button" onClick={() => updateQty(item.key, 1)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#141417', border: '1px solid #32323A', color: '#F4F1EC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={14} />
                        </button>
                        <button type="button" onClick={() => removeItem(item.key)} style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', padding: '4px' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
 
              {/* Ghi chú chung cả đơn */}
              <div style={{ marginTop: '4px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '6px' }}>Ghi chú chung cho đơn hàng</label>
                <input
                  type="text"
                  className="ui-input"
                  style={{ width: '100%' }}
                  placeholder="Ví dụ: Mang ra cùng lúc, lấy thêm ống hút giấy..."
                  value={orderMeta.note || ''}
                  onChange={(e) => updateMeta({ note: e.target.value })}
                />
              </div>
            </div>
          </section>
 
          {/* CỘT PHẢI (42%): THÔNG TIN THANH TOÁN RỘNG RÃI, KHÔNG CẮT CHỮ */}
          <aside style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Hình thức & Vị trí bàn */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '14px', borderBottom: '1px solid #26262B' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F4F1EC' }}>Vị trí phục vụ</span>
                <div style={{ display: 'inline-flex', background: '#121214', padding: '3px', borderRadius: '9px', border: '1px solid #2A2A30' }}>
                  {[
                    { id: 'dine_in', label: 'Tại quán' },
                    { id: 'takeaway', label: 'Mang về' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateMeta({ orderType: opt.id })}
                      style={{
                        border: 'none', borderRadius: '7px', padding: '5px 12px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                        background: orderMeta.orderType === opt.id ? '#D97706' : 'transparent',
                        color: orderMeta.orderType === opt.id ? '#FFFFFF' : '#A1A1AA'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
 
              {orderMeta.orderType === 'dine_in' && (
                <select
                  className="ui-select"
                  style={{ width: '100%' }}
                  value={orderMeta.tableId}
                  onChange={(e) => {
                    const found = tables.find((t) => String(t.id) === e.target.value);
                    updateMeta({ tableId: e.target.value, tableCode: found?.code || '' });
                  }}
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.area_name} ({t.seats} ghế • {t.status === 'empty' ? 'Trống' : 'Đang dùng'})
                    </option>
                  ))}
                </select>
              )}
            </div>
 
            {/* 2. Hội viên & Tích điểm */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '14px', borderBottom: '1px solid #26262B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#F4F1EC' }}>
                <UserCheck size={15} color="#F59E0B" /> <span>Hội viên &amp; Tích điểm</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  className="ui-input"
                  placeholder="SĐT hội viên..."
                  value={orderMeta.customerPhone || ''}
                  onChange={(e) => updateMeta({ customerPhone: e.target.value })}
                  onBlur={handleLookupMember}
                />
                <input
                  className="ui-input"
                  placeholder="Tên khách lẻ"
                  value={orderMeta.customerName || ''}
                  onChange={(e) => updateMeta({ customerName: e.target.value })}
                />
              </div>
              {member && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '8px 12px', fontSize: '0.78rem' }}>
                  <div style={{ color: '#34D399', fontWeight: 700 }}>
                    Hạng {member.tier_name} {tierPct > 0 ? `(Giảm ${tierPct}%)` : ''} • Hiện có {member.points_balance} điểm
                  </div>
                  {maxRedeemPts > 0 && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '5px', cursor: 'pointer', color: '#F4F1EC' }}>
                      <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
                      <span>Dùng {maxRedeemPts} điểm (-{fmt(maxRedeemPts * 1000)})</span>
                    </label>
                  )}
                </div>
              )}
            </div>
 
            {/* 3. Mã giảm giá / Voucher */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '14px', borderBottom: '1px solid #26262B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#F4F1EC' }}>
                <Tag size={15} color="#F59E0B" /> <span>Mã ưu đãi / Voucher</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="ui-input"
                  style={{ flex: 1, textTransform: 'uppercase' }}
                  placeholder="Nhập mã giảm giá..."
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                />
                {appliedCoupon ? (
                  <button type="button" className="ui-btn ui-btn-danger" onClick={() => { setAppliedCoupon(null); setCouponInput(''); }}>Bỏ mã</button>
                ) : (
                  <button type="button" className="ui-btn ui-btn-outline" onClick={() => handleApplyCoupon()}>Áp dụng</button>
                )}
              </div>
              {coupons.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {coupons.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleApplyCoupon(c.code)}
                      style={{
                        padding: '4px 10px', borderRadius: '999px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer',
                        background: appliedCoupon?.code === c.code ? 'rgba(217, 119, 6, 0.2)' : '#202024',
                        border: appliedCoupon?.code === c.code ? '1px solid #D97706' : '1px solid #2E2E35',
                        color: appliedCoupon?.code === c.code ? '#FBBF24' : '#D4D4D8'
                      }}
                    >
                      {c.code}
                    </button>
                  ))}
                </div>
              )}
            </div>
 
            {/* 4. Phương thức thanh toán: Tiền mặt (có mệnh giá nhanh) hoặc VietQR lớn */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #26262B' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Tiền mặt')}
                  style={{
                    height: '40px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    background: paymentMethod === 'Tiền mặt' ? 'rgba(217, 119, 6, 0.16)' : '#202024',
                    border: paymentMethod === 'Tiền mặt' ? '1.5px solid #D97706' : '1px solid #2E2E35',
                    color: paymentMethod === 'Tiền mặt' ? '#FBBF24' : '#A1A1AA'
                  }}
                >
                  <Banknote size={16} /> Tiền mặt
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('QR Banking')}
                  style={{
                    height: '40px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    background: paymentMethod === 'QR Banking' ? 'rgba(217, 119, 6, 0.16)' : '#202024',
                    border: paymentMethod === 'QR Banking' ? '1.5px solid #D97706' : '1px solid #2E2E35',
                    color: paymentMethod === 'QR Banking' ? '#FBBF24' : '#A1A1AA'
                  }}
                >
                  <QrCode size={16} /> Chuyển khoản QR
                </button>
              </div>
 
              {paymentMethod === 'Tiền mặt' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="number"
                    className="ui-input"
                    placeholder={`Tiền khách đưa (mặc định đủ ${fmt(finalTotal)})`}
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {QUICK_CASH_NOTES.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashGiven(String(amt))}
                        style={{
                          flex: 1, minWidth: '68px', padding: '5px 8px', borderRadius: '8px',
                          background: '#202024', border: '1px solid #2E2E35', color: '#D4D4D8',
                          fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        {amt / 1000}k
                      </button>
                    ))}
                  </div>
                  {numericCash > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', paddingTop: '2px' }}>
                      <span style={{ color: '#A1A1AA' }}>Tiền thừa trả khách:</span>
                      <strong style={{ color: numericCash >= finalTotal ? '#34D399' : '#F87171' }}>
                        {numericCash >= finalTotal ? fmt(changeAmount) : `Thiếu ${fmt(finalTotal - numericCash)}`}
                      </strong>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#121214', padding: '12px', borderRadius: '12px', border: '1px solid #2A2A30' }}>
                  <img src={vietQrUrl} alt="VietQR" style={{ width: '112px', height: '112px', borderRadius: '10px', background: '#FFFFFF', padding: '4px' }} />
                  <div style={{ fontSize: '0.78rem', color: '#D4D4D8', lineHeight: 1.55 }}>
                    <div style={{ fontWeight: 800, color: '#F4F1EC' }}>{BANK_CONFIG.bankName}</div>
                    <div>STK: <strong>{BANK_CONFIG.accountNumber}</strong></div>
                    <div>Chủ TK: <strong>{BANK_CONFIG.accountHolder}</strong></div>
                    <div style={{ color: '#F59E0B', fontWeight: 700 }}>Số tiền: {fmt(finalTotal)}</div>
                  </div>
                </div>
              )}
            </div>
 
            {/* 5. Tổng kết & Nút xác nhận thanh toán */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA' }}>
                <span>Tạm tính</span><span>{fmt(subtotal)}</span>
              </div>
              {totalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34D399' }}>
                  <span>Tổng giảm giá</span><span>-{fmt(totalDiscount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '6px' }}>
                <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#F4F1EC' }}>Thành tiền</span>
                <span style={{ fontWeight: 800, fontSize: '1.35rem', color: '#F59E0B' }}>{fmt(finalTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#71717A' }}>
                <span>Điểm thưởng dự kiến</span><span style={{ color: '#34D399', fontWeight: 700 }}>+{earnedPoints} điểm</span>
              </div>
            </div>
 
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitCheckout}
              style={{
                width: '100%', height: '48px', borderRadius: '12px', border: 'none',
                background: '#D97706', color: '#FFFFFF', fontSize: '0.94rem', fontWeight: 800,
                cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1
              }}
            >
              {submitting ? 'Đang xử lý đơn hàng...' : `Xác nhận thanh toán • ${fmt(finalTotal)}`}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}