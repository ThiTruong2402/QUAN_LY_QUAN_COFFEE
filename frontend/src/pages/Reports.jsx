import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart, Area, Bar, BarChart,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Percent, AlertTriangle,
  RefreshCw, Download, Printer, Search, Package, Flame, Award, Layers, Users,
} from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const fmtShort = (v) => {
  const n = Number(v || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
};
const cleanText = (s) => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const daysAgoVN = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
};
const startOfMonthVN = () => `${todayVN().slice(0, 7)}-01`;

const METHOD_LABELS = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản / VietQR',
  card: 'Thẻ ngân hàng',
  points: 'Điểm tích lũy',
};
const ORDER_TYPE_LABELS = {
  dine_in: 'Dùng tại quán',
  takeaway: 'Mang về / Online',
  delivery: 'Giao hàng',
};

const DONUT_COLORS = ['#D97706', '#38BDF8', '#34D399', '#A855F7'];
const CATEGORY_COLORS = ['#F59E0B', '#38BDF8', '#34D399', '#C084FC', '#FB7185', '#94A3B8'];
const STOCK_COLORS = ['#10B981', '#F59E0B', '#EF4444'];

const DARK_TOOLTIP = {
  backgroundColor: '#1E1E22',
  border: '1px solid #32323A',
  borderRadius: '10px',
  color: '#F4F1EC',
  fontSize: '0.8rem',
};

function ChartTooltip({ active, payload, label, mode }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div style={{
      background: 'rgba(20, 20, 24, 0.96)', backdropFilter: 'blur(8px)',
      border: '1px solid #32323D', borderRadius: '12px', padding: '10px 14px',
      boxShadow: '0 12px 28px rgba(0,0,0,0.48)', minWidth: '165px',
    }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#A1A1AA', marginBottom: '6px' }}>
        {mode === 'hourly' ? `Khung giờ ${label}` : `Ngày ${label}`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '0.82rem', marginBottom: '3px' }}>
        <span style={{ color: '#D4D4D8' }}>Doanh thu</span>
        <strong className="ui-money" style={{ color: '#FBBF24' }}>{fmt(row.revenue)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '0.8rem' }}>
        <span style={{ color: '#A1A1AA' }}>Số đơn</span>
        <strong className="ui-money" style={{ color: '#38BDF8' }}>{row.orders || 0} đơn</strong>
      </div>
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const isWarehouseOnly = user?.role === 'warehouse';

  const [activeTab, setActiveTab] = useState(isWarehouseOnly ? 'stock' : 'revenue');
  const [preset, setPreset] = useState('30d');
  const [fromDate, setFromDate] = useState(daysAgoVN(29));
  const [toDate, setToDate] = useState(todayVN());
  const [loading, setLoading] = useState(true);

  const [revData, setRevData] = useState({
    summary: {}, daily: [], hourly: [], byMethod: [], byOrderType: [], byCategory: [], topProducts: [], byStaff: [],
  });
  const [stockData, setStockData] = useState({ items: [], summary: {}, top_consumed: [] });

  const [donutMode, setDonutMode] = useState('method');   // 'method' | 'channel'
  const [topMode, setTopMode] = useState('revenue');      // 'revenue' | 'qty'
  const [stockFilter, setStockFilter] = useState('all');  // 'all' | 'low' | 'ok'
  const [stockSearch, setStockSearch] = useState('');

  const applyPreset = (key) => {
    setPreset(key);
    const t = todayVN();
    if (key === 'today') { setFromDate(t); setToDate(t); }
    else if (key === '7d') { setFromDate(daysAgoVN(6)); setToDate(t); }
    else if (key === '30d') { setFromDate(daysAgoVN(29)); setToDate(t); }
    else if (key === 'month') { setFromDate(startOfMonthVN()); setToDate(t); }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      const stockUrl = `/reports/stock?from=${fromDate}&to=${toDate}`;
      const tasks = [api.get(stockUrl)];
      if (!isWarehouseOnly) {
        tasks.push(api.get(`/reports/revenue?from=${fromDate}&to=${toDate}`));
      }
      const results = await Promise.all(tasks);
      if (results[0]?.data?.success) setStockData(results[0].data.data);
      if (!isWarehouseOnly && results[1]?.data?.success) setRevData(results[1].data.data);
    } catch {
      toast.error('Không thể tải dữ liệu thống kê');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReports(); }, [fromDate, toDate]);

  const s = revData.summary || {};
  const totalOrdersCount = Number(s.orders || 0);
  const itemsPerOrder = totalOrdersCount > 0 ? (Number(s.total_items_sold || 0) / totalOrdersCount).toFixed(1) : '0.0';
  const cancelRatePct = (totalOrdersCount + Number(s.cancelled_orders || 0)) > 0
    ? Math.round((Number(s.cancelled_orders || 0) / (totalOrdersCount + Number(s.cancelled_orders || 0))) * 100)
    : 0;

  // 1. Xu hướng doanh thu & số đơn theo ngày
  // Fill đủ mọi ngày trong khoảng fromDate..toDate (kể cả ngày 0 đơn)
  // để X-axis hiển thị liên tục, không bị "1 cột" khi dữ liệu sparse
  const dailyChart = useMemo(() => {
    const dataMap = new Map(
      (revData.daily || []).map((d) => [
        String(d.date).slice(0, 10), // key: yyyy-mm-dd
        { revenue: Number(d.revenue || 0), orders: Number(d.orders || 0) },
      ])
    );
    // Nếu không có fromDate/toDate, fallback về map thuần
    if (!fromDate || !toDate) {
      return (revData.daily || []).map((d) => ({
        date: String(d.date).slice(5, 10).split('-').reverse().join('/'),
        revenue: Number(d.revenue || 0),
        orders: Number(d.orders || 0),
      }));
    }
    const result = [];
    const cur = new Date(`${fromDate}T12:00:00+07:00`);
    const end = new Date(`${toDate}T12:00:00+07:00`);
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10); // yyyy-mm-dd UTC (đủ dùng vì +07:00 offset cố định)
      // key theo VN: dùng toLocaleDateString
      const keyVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(cur);
      const val = dataMap.get(keyVN) || { revenue: 0, orders: 0 };
      result.push({
        date: keyVN.slice(5, 10).split('-').reverse().join('/'), // dd/mm
        ...val,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [revData.daily, fromDate, toDate]);

  // 2. Donut Thanh toán / Kênh phục vụ
  const donutList = useMemo(() => {
    const raw = donutMode === 'method'
      ? (revData.byMethod || []).map((m) => ({
          name: METHOD_LABELS[m.method] || m.method,
          value: Number(m.total || 0),
          orders: Number(m.orders || 0),
        }))
      : (revData.byOrderType || []).map((o) => ({
          name: ORDER_TYPE_LABELS[o.order_type] || o.order_type,
          value: Number(o.total || 0),
          orders: Number(o.orders || 0),
        }));
    const valid = raw.filter((x) => x.value > 0);
    const total = valid.reduce((acc, x) => acc + x.value, 0);
    return valid.map((x) => ({ ...x, pct: total > 0 ? Math.round((x.value / total) * 100) : 0 }));
  }, [revData.byMethod, revData.byOrderType, donutMode]);
  const donutTotal = donutList.reduce((acc, x) => acc + x.value, 0);

  // 3. Khung giờ cao điểm trong toàn bộ kỳ lọc (giữ mọi giờ 00h-05h có đơn & luôn lấp đủ 06h-23h)
  const hourlyChart = useMemo(() => {
    const hourMap = new Map();
    (revData.hourly || []).forEach((h) => {
      hourMap.set(Number(h.hour), { revenue: Number(h.revenue || 0), orders: Number(h.orders || 0) });
    });
    if (hourMap.size === 0) return [];
    const fullHours = [];
    for (let hr = 0; hr <= 23; hr++) {
      const val = hourMap.get(hr) || { revenue: 0, orders: 0 };
      if (hr >= 6 || val.orders > 0 || val.revenue > 0) {
        fullHours.push({
          hour: `${String(hr).padStart(2, '0')}h`,
          revenue: val.revenue,
          orders: val.orders,
        });
      }
    }
    const maxRev = Math.max(0, ...fullHours.map((x) => x.revenue));
    return fullHours.map((x) => ({ ...x, isPeak: maxRev > 0 && x.revenue === maxRev }));
  }, [revData.hourly]);
  const peakHourObj = hourlyChart.find((x) => x.isPeak);

  // 4. Top món bán chạy (LUÔN sắp giảm dần theo đúng chỉ số đang chọn)
  const sortedTopProducts = useMemo(() => {
    const list = [...(revData.topProducts || [])].map((p) => ({
      name: p.product_name,
      qty: Number(p.qty || 0),
      revenue: Number(p.revenue || 0),
    }));
    list.sort((a, b) => (topMode === 'revenue' ? b.revenue - a.revenue : b.qty - a.qty));
    const maxVal = Math.max(1, ...list.map((x) => (topMode === 'revenue' ? x.revenue : x.qty)));
    return list.slice(0, 6).map((x) => ({
      ...x,
      barPct: Math.max(8, Math.round(((topMode === 'revenue' ? x.revenue : x.qty) / maxVal) * 100)),
    }));
  }, [revData.topProducts, topMode]);

  // 5. Doanh thu theo nhóm món & Nhân sự thu ngân
  const categoryBreakdown = useMemo(() => {
    const list = (revData.byCategory || []).map((c) => ({
      name: cleanText(c.category_name),
      qty: Number(c.qty || 0),
      revenue: Number(c.revenue || 0),
    }));
    const total = list.reduce((acc, x) => acc + x.revenue, 0);
    return list.map((x) => ({ ...x, pct: total > 0 ? Math.round((x.revenue / total) * 100) : 0 }));
  }, [revData.byCategory]);

  const staffBreakdown = useMemo(() => {
    const list = (revData.byStaff || []).map((st) => ({
      name: st.staff_name,
      role: st.role_label,
      orders: Number(st.orders || 0),
      revenue: Number(st.revenue || 0),
    }));
    const maxRev = Math.max(1, ...list.map((x) => x.revenue));
    return list.map((x) => ({ ...x, barPct: Math.max(8, Math.round((x.revenue / maxRev) * 100)) }));
  }, [revData.byStaff]);

  // 6. Dữ liệu Kho (LUÔN sắp giảm dần theo chi phí tiêu hao, Leaderboard không cắt chữ)
  const topConsumedList = useMemo(() => {
    const list = [...(stockData.top_consumed || [])]
      .map((c) => ({
        name: c.name,
        code: c.code,
        cost: Number(c.total_cost || 0),
        qty: Number(c.total_consumed || 0),
        unit: c.unit,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 6);
    const maxCost = Math.max(1, ...list.map((x) => x.cost));
    return list.map((x) => ({ ...x, barPct: Math.max(8, Math.round((x.cost / maxCost) * 100)) }));
  }, [stockData.top_consumed]);

  const stockSum = stockData.summary || {};
  const stockPie = useMemo(() => [
    { name: 'Ổn định', value: Number(stockSum.ok_stock_count || 0), color: STOCK_COLORS[0] },
    { name: 'Sắp hết', value: Number(stockSum.low_stock_count || 0), color: STOCK_COLORS[1] },
    { name: 'Hết hàng', value: Number(stockSum.out_of_stock_count || 0), color: STOCK_COLORS[2] },
  ].filter((x) => x.value > 0), [stockSum]);
  const healthyStockPct = stockSum.total_items > 0
    ? Math.round((Number(stockSum.ok_stock_count || 0) / Number(stockSum.total_items)) * 100)
    : 100;

  const filteredStockItems = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    return (stockData.items || []).filter((item) => {
      if (stockFilter === 'low' && !item.is_low) return false;
      if (stockFilter === 'ok' && item.is_low) return false;
      if (q && !String(item.name).toLowerCase().includes(q) && !String(item.code).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stockData.items, stockFilter, stockSearch]);

  const escapeCsvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const handleExportCsv = () => {
    const rows = activeTab === 'revenue'
      ? [
          ['Ngày', 'Số đơn', 'Doanh thu (VNĐ)'],
          ...(revData.daily || []).map((r) => [r.date, r.orders, r.revenue]),
        ]
      : [
          ['Mã NL', 'Tên nguyên liệu', 'Tồn hiện tại', 'Định mức tối thiểu', 'Đơn vị', 'Giá trị tồn (VNĐ)', 'Trạng thái'],
          ...(stockData.items || []).map((i) => [
            i.code,
            i.name,
            i.current_stock,
            i.min_stock,
            i.unit,
            i.total_value,
            Number(i.current_stock) <= 0 ? 'Hết hàng' : i.is_low ? 'Sắp hết' : 'Ổn định',
          ]),
        ];
    const csv = '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeTab === 'revenue' ? `bao-cao-doanh-thu-${fromDate}_${toDate}.csv` : `bao-cao-ton-kho-${todayVN()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất file CSV chuẩn Excel');
  };

  return (
    <div className="rep-v6-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', minWidth: 0 }}>
      {/* THANH ĐIỀU KHIỂN CHÍNH */}
      <div style={{
        background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px',
        padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="ui-underline-tabs" style={{ borderBottom: 'none', overflowY: 'hidden' }}>
            {!isWarehouseOnly && (
              <button type="button" className={`ui-underline-tab ${activeTab === 'revenue' ? 'active' : ''}`} onClick={() => setActiveTab('revenue')}>
                Doanh thu &amp; Bán hàng
              </button>
            )}
            <button type="button" className={`ui-underline-tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>
              <span>Kho &amp; Nguyên liệu</span>
              <span style={{ background: '#26262B', color: '#D4D4D8', padding: '1px 8px', borderRadius: '999px', fontSize: '0.72rem' }}>
                {stockSum.total_items || 0}
              </span>
            </button>
          </div>
          {activeTab === 'revenue' && !isWarehouseOnly && (
            <span style={{
              fontSize: '0.73rem', fontWeight: 600, color: '#FBBF24',
              background: 'rgba(217, 119, 6, 0.14)', border: '1px solid rgba(245, 158, 11, 0.25)',
              padding: '4px 10px', borderRadius: '999px',
            }}>
              Kỳ lọc: {fromDate.split('-').reverse().join('/')} – {toDate.split('-').reverse().join('/')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {activeTab === 'revenue' && (
            <>
              <div style={{ display: 'inline-flex', background: '#121214', padding: '3px', borderRadius: '9px', border: '1px solid #2A2A30' }}>
                {[
                  { id: 'today', label: 'Hôm nay' },
                  { id: '7d', label: '7 ngày' },
                  { id: '30d', label: '30 ngày' },
                  { id: 'month', label: 'Tháng này' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    style={{
                      border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      background: preset === p.id ? '#D97706' : 'transparent',
                      color: preset === p.id ? '#FFFFFF' : '#A1A1AA',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input type="date" className="ui-input" value={fromDate} onChange={(e) => { setPreset('custom'); setFromDate(e.target.value); }} />
              <span style={{ color: '#71717A', fontSize: '0.8rem' }}>–</span>
              <input type="date" className="ui-input" value={toDate} onChange={(e) => { setPreset('custom'); setToDate(e.target.value); }} />
            </>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={loadReports}><RefreshCw size={14} /> Làm mới</button>
          <button type="button" className="ui-btn ui-btn-outline" onClick={handleExportCsv}><Download size={14} /> CSV</button>
          <button type="button" className="ui-btn ui-btn-brand" onClick={() => window.print()}><Printer size={14} /> In báo cáo</button>
        </div>
      </div>

      {/* ================= TAB 1: DOANH THU & BÁN HÀNG ================= */}
      {activeTab === 'revenue' && !isWarehouseOnly && (
        <>
          {/* 4 THẺ KPI BENTO TÀI CHÍNH CỐT LÕI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderTop: '3px solid #F59E0B', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#A1A1AA', fontSize: '0.78rem', fontWeight: 600 }}>
                <span>Doanh thu thuần</span>
                <DollarSign size={15} color="#F59E0B" />
              </div>
              <div className="ui-money" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F59E0B', margin: '8px 0 6px' }}>
                {fmt(s.net_revenue)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#A1A1AA', flexWrap: 'wrap' }}>
                <span>{s.orders || 0} đơn hoàn tất</span>
                {s.revenue_growth_pct !== null && s.revenue_growth_pct !== undefined && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 7px', borderRadius: '999px', fontWeight: 600,
                    background: s.revenue_growth_pct >= 0 ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
                    color: s.revenue_growth_pct >= 0 ? '#34D399' : '#F87171',
                  }}>
                    {s.revenue_growth_pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {s.revenue_growth_pct >= 0 ? '+' : ''}{s.revenue_growth_pct}%
                  </span>
                )}
              </div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderTop: '3px solid #34D399', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#A1A1AA', fontSize: '0.78rem', fontWeight: 600 }}>
                <span>Lợi nhuận gộp ước tính</span>
                <Percent size={15} color="#34D399" />
              </div>
              <div className="ui-money" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34D399', margin: '8px 0 6px' }}>
                {fmt(s.gross_profit)}
              </div>
              <div className="ui-money" style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                {Number(s.total_cogs || 0) > 0
                  ? <>Biên LN: <strong style={{ color: '#F4F1EC' }}>{s.gross_margin_pct || 0}%</strong> · Giá vốn {fmt(s.total_cogs)}</>
                  : 'Chưa phát sinh định lượng xuất kho trong kỳ'}
              </div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderTop: '3px solid #38BDF8', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#A1A1AA', fontSize: '0.78rem', fontWeight: 600 }}>
                <span>Giá trị TB / đơn (AOV)</span>
                <ShoppingBag size={15} color="#38BDF8" />
              </div>
              <div className="ui-money" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F4F1EC', margin: '8px 0 6px' }}>
                {fmt(s.avg_order_value)}
              </div>
              <div className="ui-money" style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                <strong style={{ color: '#38BDF8' }}>{s.total_items_sold || 0} ly</strong> · TB <strong style={{ color: '#F4F1EC' }}>{itemsPerOrder}</strong> món/đơn
              </div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderTop: '3px solid #F87171', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#A1A1AA', fontSize: '0.78rem', fontWeight: 600 }}>
                <span>Giảm giá &amp; Đơn hủy</span>
                <AlertTriangle size={15} color="#F87171" />
              </div>
              <div className="ui-money" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F4F1EC', margin: '8px 0 6px' }}>
                {fmt(s.total_discount)}
              </div>
              <div className="ui-money" style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                Hủy: <strong style={{ color: (s.cancelled_orders || 0) > 0 ? '#F87171' : '#34D399' }}>{s.cancelled_orders || 0} đơn ({cancelRatePct}%)</strong> · {fmt(s.cancelled_value)}
              </div>
            </div>
          </div>

          {/* HÀNG 2: BIỂU ĐỒ KẾT HỢP DOANH THU & SỐ ĐƠN + DONUT THANH TOÁN / KÊNH BÁN */}
          <div className="rep-grid-2-wide">
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC' }}>Xu hướng doanh thu &amp; đơn hàng theo ngày</span>
                <span style={{ fontSize: '0.74rem', color: '#71717A' }}>VNĐ · Số đơn</span>
              </div>
              <div style={{ height: '275px' }}>
                {loading || dailyChart.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '110px', color: '#71717A', fontSize: '0.84rem' }}>
                    {loading ? 'Đang tải...' : 'Không có dữ liệu doanh thu trong kỳ đã chọn.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyChart}>
                      <defs>
                        <linearGradient id="cafeRevArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D97706" stopOpacity={0.38} />
                          <stop offset="95%" stopColor="#D97706" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#26262B" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#A1A1AA', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="rev" tick={{ fill: '#A1A1AA', fontSize: 11 }} tickFormatter={fmtShort} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="ord" orientation="right" allowDecimals={false} tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar yAxisId="ord" dataKey="orders" fill="rgba(56, 189, 248, 0.25)" radius={[6, 6, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                      <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }} activeDot={{ r: 5 }} fill="url(#cafeRevArea)" isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC' }}>
                  {donutMode === 'method' ? 'Phương thức thanh toán' : 'Kênh phục vụ'}
                </span>
                <div style={{ display: 'inline-flex', background: '#121214', padding: '2px', borderRadius: '8px', border: '1px solid #2A2A30' }}>
                  {[
                    { id: 'method', label: 'Thanh toán' },
                    { id: 'channel', label: 'Kênh bán' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDonutMode(t.id)}
                      style={{
                        border: 'none', borderRadius: '6px', padding: '4px 9px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                        background: donutMode === t.id ? '#27272B' : 'transparent',
                        color: donutMode === t.id ? '#F4F1EC' : '#71717A',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {donutList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '90px 0', color: '#71717A', fontSize: '0.84rem' }}>Chưa có giao dịch trong kỳ lọc.</div>
              ) : (
                <>
                  <div style={{ position: 'relative', height: '185px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                      <Pie data={donutList} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none" isAnimationActive={false}>
                        {donutList.map((_, idx) => <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />)}
                      </Pie>
                        <Tooltip formatter={(val) => fmt(val)} contentStyle={DARK_TOOLTIP} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <span style={{ fontSize: '0.7rem', color: '#A1A1AA' }}>Tổng thu</span>
                      <span className="ui-money" style={{ fontSize: '0.96rem', fontWeight: 700, color: '#F4F1EC' }}>{fmtShort(donutTotal)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    {donutList.map((item, idx) => (
                      <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                          <span style={{ color: '#D4D4D8' }}>{item.name}</span>
                        </div>
                        <div className="ui-money" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ color: '#F4F1EC', fontWeight: 600 }}>{fmt(item.value)}</span>
                          <span style={{ color: '#A1A1AA', minWidth: '34px', textAlign: 'right' }}>{item.pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* HÀNG 3: TOP MÓN BÁN CHẠY (SORT GIẢM DẦN CHUẨN) + KHUNG GIỜ CAO ĐIỂM THEO KỲ LỌC */}
          <div className="rep-grid-2-eq">
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                  <Award size={16} color="#F59E0B" /> Top món bán chạy nhất
                </span>
                <div style={{ display: 'inline-flex', background: '#121214', padding: '2px', borderRadius: '8px', border: '1px solid #2A2A30' }}>
                  {[
                    { id: 'revenue', label: 'Doanh thu' },
                    { id: 'qty', label: 'Số ly' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTopMode(t.id)}
                      style={{
                        border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                        background: topMode === t.id ? '#D97706' : 'transparent',
                        color: topMode === t.id ? '#FFFFFF' : '#71717A',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {sortedTopProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '75px 0', color: '#71717A', fontSize: '0.84rem' }}>Chưa có dữ liệu món bán trong kỳ.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                  {sortedTopProducts.map((item, idx) => (
                    <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{
                            width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 700,
                            background: idx === 0 ? '#D97706' : '#26262B',
                            color: idx === 0 ? '#FFFFFF' : '#A1A1AA',
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ color: '#F4F1EC', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                        </div>
                        <span className="ui-money" style={{ color: '#F59E0B', fontWeight: 600, flexShrink: 0, marginLeft: '10px' }}>
                          {item.qty} ly · {fmt(item.revenue)}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '7px', borderRadius: '999px', background: '#26262B', overflow: 'hidden' }}>
                        <div style={{
                          width: `${item.barPct}%`, height: '100%', borderRadius: '999px',
                          background: idx === 0
                            ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                            : idx === 1 ? '#D97706' : '#B45309',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC' }}>Khung giờ cao điểm trong kỳ lọc</span>
                {peakHourObj && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', fontWeight: 600,
                    background: 'rgba(217, 119, 6, 0.14)', color: '#FBBF24', padding: '3px 9px', borderRadius: '999px',
                  }}>
                    <Flame size={12} /> Cao điểm: {peakHourObj.hour}
                  </span>
                )}
              </div>
              <div style={{ height: '250px' }}>
                {hourlyChart.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '95px', color: '#71717A', fontSize: '0.84rem' }}>Chưa có giao dịch theo khung giờ trong kỳ.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#26262B" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#A1A1AA', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#A1A1AA', fontSize: 11 }} tickFormatter={fmtShort} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip mode="hourly" />} />
                      <Bar dataKey="revenue" radius={[7, 7, 0, 0]} maxBarSize={34} isAnimationActive={false}>
                        {hourlyChart.map((entry, idx) => (
                          <Cell key={idx} fill={entry.isPeak ? '#F59E0B' : '#38BDF8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* HÀNG 4: STACKED MIX BAR NHÓM MÓN & HIỆU SUẤT NHÂN SỰ THU NGÂN */}
          <div className="rep-grid-2-eq">
            {categoryBreakdown.length > 0 && (
              <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                    <Layers size={15} color="#F59E0B" /> Tỷ trọng doanh thu theo nhóm thực đơn
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#71717A' }}>{categoryBreakdown.length} nhóm</span>
                </div>
                {/* Thanh trộn Stacked Bar toàn bộ nhóm */}
                <div style={{ display: 'flex', width: '100%', height: '10px', borderRadius: '999px', overflow: 'hidden', background: '#121214', gap: '2px' }}>
                  {categoryBreakdown.map((cat, idx) => (
                    <div
                      key={cat.name}
                      title={`${cat.name}: ${cat.pct}% (${fmt(cat.revenue)})`}
                      style={{
                        width: `${Math.max(3, cat.pct)}%`,
                        height: '100%',
                        background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '10px' }}>
                  {categoryBreakdown.map((cat, idx) => (
                    <div key={cat.name} style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '12px', padding: '11px 13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#F4F1EC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} />
                          {cat.name}
                        </span>
                        <span className="ui-money" style={{ fontSize: '0.74rem', fontWeight: 700, color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length], flexShrink: 0 }}>
                          {cat.pct}%
                        </span>
                      </div>
                      <div className="ui-money" style={{ fontSize: '0.98rem', fontWeight: 700, color: '#F4F1EC' }}>{fmt(cat.revenue)}</div>
                      <div style={{ fontSize: '0.71rem', color: '#A1A1AA', marginTop: '2px' }}>{cat.qty} ly / phần</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {staffBreakdown.length > 0 && (
              <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                    <Users size={15} color="#38BDF8" /> Doanh thu theo nguồn tạo đơn &amp; Nhân sự thu ngân
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#71717A' }}>{staffBreakdown.length} nguồn</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {staffBreakdown.map((st, idx) => (
                    <div key={`${st.name}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{
                            width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 700,
                            background: idx === 0 ? '#0284C7' : '#26262B',
                            color: idx === 0 ? '#FFFFFF' : '#A1A1AA',
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ color: '#F4F1EC', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {st.name}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#A1A1AA', flexShrink: 0 }}>({st.role})</span>
                        </div>
                        <span className="ui-money" style={{ color: '#F59E0B', fontWeight: 700, flexShrink: 0 }}>
                          {st.orders} đơn · {fmt(st.revenue)}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: '#26262B', overflow: 'hidden' }}>
                        <div style={{
                          width: `${st.barPct}%`, height: '100%', borderRadius: '999px',
                          background: idx === 0 ? 'linear-gradient(90deg, #38BDF8, #0284C7)' : '#38BDF8',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ================= TAB 2: KHO & NGUYÊN LIỆU ================= */}
      {activeTab === 'stock' && (
        <>
          {/* 3 THẺ KPI KHO */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A1A1AA', fontSize: '0.78rem', fontWeight: 600 }}>
                <span>Tổng giá trị tồn kho</span>
                <Package size={15} color="#F59E0B" />
              </div>
              <div className="ui-money" style={{ fontSize: '1.45rem', fontWeight: 700, color: '#F59E0B', margin: '8px 0 4px' }}>
                {fmt(stockSum.total_inventory_value)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>{stockSum.total_items || 0} mã nguyên liệu đang theo dõi</div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ color: '#A1A1AA', fontSize: '0.78rem', fontWeight: 600 }}>Chi phí xuất bán lũy kế (COGS)</div>
              <div className="ui-money" style={{ fontSize: '1.45rem', fontWeight: 700, color: '#34D399', margin: '8px 0 4px' }}>
                {fmt(stockSum.total_sale_cost)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>Hao hụt / hủy hỏng: {fmt(stockSum.total_waste_cost)}</div>
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ color: '#A1A1AA', fontSize: '0.78rem', fontWeight: 600 }}>Cảnh báo định mức tồn ({healthyStockPct}% an toàn)</div>
              <div className="ui-money" style={{ fontSize: '1.45rem', fontWeight: 700, color: (stockSum.low_stock_count || 0) > 0 ? '#F87171' : '#34D399', margin: '8px 0 4px' }}>
                {(stockSum.low_stock_count || 0) + (stockSum.out_of_stock_count || 0)} mặt hàng
              </div>
              <div style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                Ổn định: {stockSum.ok_stock_count || 0} · Sắp hết: {stockSum.low_stock_count || 0} · Hết: {stockSum.out_of_stock_count || 0}
              </div>
            </div>
          </div>

          {/* 2 BIỂU ĐỒ KHO */}
          <div className="rep-grid-2-wide">
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC' }}>Top nguyên liệu tiêu hao giá trị lớn nhất</span>
                <span style={{ fontSize: '0.74rem', color: '#71717A' }}>VNĐ (theo kỳ lọc)</span>
              </div>
              {topConsumedList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '75px 0', color: '#71717A', fontSize: '0.84rem' }}>Chưa có lịch sử xuất bán nguyên liệu trong kỳ.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                  {topConsumedList.map((item, idx) => (
                    <div key={item.code || item.name} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{
                            width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 700,
                            background: idx === 0 ? '#10B981' : '#26262B',
                            color: idx === 0 ? '#FFFFFF' : '#A1A1AA',
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ color: '#F4F1EC', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                        </div>
                        <span className="ui-money" style={{ color: '#34D399', fontWeight: 600, flexShrink: 0 }}>
                          {item.qty} {item.unit} · {fmt(item.cost)}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '7px', borderRadius: '999px', background: '#26262B', overflow: 'hidden' }}>
                        <div style={{
                          width: `${item.barPct}%`, height: '100%', borderRadius: '999px',
                          background: idx === 0 ? 'linear-gradient(90deg, #34D399, #10B981)' : '#059669',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC' }}>Tình trạng tồn kho</span>
              <div style={{ position: 'relative', height: '180px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stockPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={80} paddingAngle={stockPie.length > 1 ? 3 : 0} stroke="none" isAnimationActive={false}>
                      {stockPie.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(val) => `${val} mặt hàng`} contentStyle={DARK_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span className="ui-money" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#F4F1EC' }}>{stockSum.total_items || 0}</span>
                  <span style={{ fontSize: '0.7rem', color: '#A1A1AA' }}>mặt hàng</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '0.78rem' }}>
                {stockPie.map((item) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                    <span style={{ color: '#D4D4D8' }}>{item.name}: <strong>{item.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BẢNG TỒN KHO CHI TIẾT CÓ TÌM KIẾM & LỌC TRẠNG THÁI */}
          <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #26262B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#F4F1EC' }}>Giá trị tồn kho &amp; Cảnh báo nhập hàng</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#71717A' }} />
                  <input
                    className="ui-input"
                    style={{ paddingLeft: '32px', width: '200px' }}
                    placeholder="Tìm tên hoặc mã NL..."
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                  />
                </div>
                <div style={{ display: 'inline-flex', background: '#121214', padding: '3px', borderRadius: '9px', border: '1px solid #2A2A30' }}>
                  {[
                    { id: 'all', label: 'Tất cả' },
                    { id: 'low', label: 'Cần nhập' },
                    { id: 'ok', label: 'Ổn định' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStockFilter(f.id)}
                      style={{
                        border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                        background: stockFilter === f.id ? '#27272B' : 'transparent',
                        color: stockFilter === f.id ? '#F4F1EC' : '#71717A',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Mã NL</th>
                    <th>Nguyên liệu</th>
                    <th style={{ textAlign: 'right' }}>Tồn hiện tại</th>
                    <th style={{ textAlign: 'right' }}>Định mức tối thiểu</th>
                    <th style={{ textAlign: 'right' }}>Giá trị tồn</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockItems.map((item) => (
                    <tr key={item.id}>
                      <td className="ui-nowrap"><strong>{item.code}</strong></td>
                      <td>{item.name}</td>
                      <td className="ui-nowrap ui-money" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {Number(item.current_stock).toFixed(2)} {item.unit}
                      </td>
                      <td className="ui-nowrap ui-money" style={{ textAlign: 'right', color: '#A1A1AA' }}>
                        {Number(item.min_stock).toFixed(2)} {item.unit}
                      </td>
                      <td className="ui-nowrap ui-money" style={{ textAlign: 'right', fontWeight: 600, color: '#F59E0B' }}>
                        {fmt(item.total_value)}
                      </td>
                      <td>
                        <span className={`ui-badge ${item.is_low ? 'ui-badge-red' : 'ui-badge-green'}`}>
                          <span className="ui-badge-dot" style={{ background: item.is_low ? '#F87171' : '#34D399' }} />
                          {Number(item.current_stock) <= 0 ? 'Hết hàng' : item.is_low ? 'Sắp hết' : 'Ổn định'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredStockItems.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '28px', color: '#71717A' }}>Không tìm thấy nguyên liệu phù hợp.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
