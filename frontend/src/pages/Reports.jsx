import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
 
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const fmtShort = (v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
 
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
 
const METHOD_LABELS = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản / VietQR',
  card: 'Thẻ ngân hàng',
  points: 'Điểm tích lũy',
  momo: 'Ví MoMo',
  zalopay: 'ZaloPay',
};
 
const PIE_COLORS = ['#D97706', '#38BDF8', '#34D399', '#A855F7', '#F43F5E'];
const STOCK_PIE_COLORS = ['#10B981', '#F59E0B', '#EF4444'];
 
const DARK_TOOLTIP = {
  backgroundColor: '#1E1E22',
  border: '1px solid #32323A',
  borderRadius: '10px',
  color: '#F4F1EC',
  fontSize: '0.82rem',
};
 
export default function Reports() {
  const { user } = useAuth();
  const isWarehouseOnly = user?.role === 'warehouse';
 
  const [activeTab, setActiveTab] = useState(isWarehouseOnly ? 'stock' : 'revenue');
  const [fromDate, setFromDate] = useState(daysAgoISO(30));
  const [toDate, setToDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
 
  const [dash, setDash] = useState(null);
  const [revData, setRevData] = useState({ daily: [], byMethod: [], topProducts: [] });
  const [stockData, setStockData] = useState({ items: [], summary: {}, top_consumed: [] });
 
  const loadReports = async () => {
    setLoading(true);
    try {
      const tasks = [api.get('/reports/stock')];
      if (!isWarehouseOnly) {
        tasks.push(api.get('/reports/dashboard'));
        tasks.push(api.get(`/reports/revenue?from=${fromDate}&to=${toDate}`));
      }
      const results = await Promise.all(tasks);
      if (results[0]?.data?.success) setStockData(results[0].data.data);
      if (!isWarehouseOnly) {
        if (results[1]?.data?.success) setDash(results[1].data.data);
        if (results[2]?.data?.success) setRevData(results[2].data.data);
      }
    } catch {
      toast.error('Không thể tải dữ liệu báo cáo');
    } finally {
      setLoading(false);
    }
  };
 
  useEffect(() => { loadReports(); }, [fromDate, toDate]);
 
  // 1. Dữ liệu biểu đồ Vùng (Doanh thu theo ngày)
  const rangeRevenue = (revData.daily || []).reduce((s, r) => s + Number(r.revenue || 0), 0);
  const rangeOrders = (revData.daily || []).reduce((s, r) => s + Number(r.orders || 0), 0);
  const dailyChart = (revData.daily || []).map((d) => ({
    date: String(d.date).slice(5, 10).split('-').reverse().join('/'),
    revenue: Number(d.revenue || 0),
    orders: Number(d.orders || 0),
  }));
 
  // 2. Dữ liệu biểu đồ Tròn Donut (Cơ cấu phương thức thanh toán)
  const paymentPieData = (revData.byMethod || [])
    .map((m) => ({
      name: METHOD_LABELS[m.method] || m.method,
      value: Number(m.total || 0),
    }))
    .filter((x) => x.value > 0);
 
  // 3. Dữ liệu biểu đồ Cột đứng (Khung giờ cao điểm)
  const hourlyBarData = (dash?.hourly_trend || []).map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    revenue: Number(h.revenue || 0),
    orders: Number(h.count || 0),
  }));
 
  // 4. Dữ liệu biểu đồ Cột ngang (Top 5 sản phẩm bán chạy nhất — vá lỗi màu #1)
  const topProductsBar = (revData.topProducts || []).slice(0, 6).map((p) => ({
    name: p.product_name.length > 20 ? p.product_name.slice(0, 20) + '…' : p.product_name,
    fullName: p.product_name,
    qty: Number(p.qty || 0),
    revenue: Number(p.revenue || 0),
  }));
 
  // 5. Dữ liệu biểu đồ Kho (Top nguyên liệu tiêu hao & Donut trạng thái tồn kho)
  const topConsumedBar = (stockData.top_consumed || []).slice(0, 6).map((c) => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    fullName: c.name,
    cost: Number(c.total_cost || 0),
    qty: Number(c.total_consumed || 0),
    unit: c.unit,
  }));
 
  const stockItems = stockData.items || [];
  const outCount = stockItems.filter((i) => Number(i.current_stock) <= 0).length;
  const lowCount = stockItems.filter((i) => Number(i.current_stock) > 0 && i.is_low).length;
  const okCount = Math.max(0, stockItems.length - outCount - lowCount);
  const stockStatusPie = [
    { name: 'Ổn định', value: okCount },
    { name: 'Sắp hết hàng', value: lowCount },
    { name: 'Hết hàng', value: outCount },
  ].filter((x) => x.value > 0);
 
  const handleExportCsv = () => {
    const rows = activeTab === 'revenue'
      ? [['Ngay', 'So don', 'Doanh thu'], ...(revData.daily || []).map((r) => [String(r.date).slice(0, 10), r.orders, r.revenue])]
      : [['Ma NL', 'Nguyen lieu', 'Ton kho', 'Don vi', 'Gia tri ton'], ...stockItems.map((i) => [i.code, i.name, i.current_stock, i.unit, i.total_value])];
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeTab === 'revenue' ? `doanh-thu-${fromDate}_${toDate}.csv` : `ton-kho-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất file CSV');
  };
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', minWidth: 0 }}>
      {/* THANH TAB GỌN KHÔNG CÒN THANH CUỘN DỌC THỪA */}
      <div style={{
        background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px',
        padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'
      }}>
        <div className="ui-underline-tabs" style={{ borderBottom: 'none', overflowY: 'hidden' }}>
          {!isWarehouseOnly && (
            <button type="button" className={`ui-underline-tab ${activeTab === 'revenue' ? 'active' : ''}`} onClick={() => setActiveTab('revenue')}>
              Doanh thu & Bán hàng
            </button>
          )}
          <button type="button" className={`ui-underline-tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>
            <span>Kho & Nguyên liệu</span>
            <span style={{ background: '#26262B', color: '#D4D4D8', padding: '1px 8px', borderRadius: '999px', fontSize: '0.72rem' }}>
              {stockData.summary?.total_items || 0}
            </span>
          </button>
        </div>
 
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {activeTab === 'revenue' && (
            <>
              <input type="date" className="ui-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <span style={{ color: '#A1A1AA', fontSize: '0.82rem' }}>đến</span>
              <input type="date" className="ui-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={loadReports}>Làm mới</button>
          <button type="button" className="ui-btn ui-btn-outline" onClick={handleExportCsv}>Xuất CSV</button>
          <button type="button" className="ui-btn ui-btn-brand" onClick={() => window.print()}>In báo cáo</button>
        </div>
      </div>
 
      {/* ================= TAB 1: DOANH THU & BÁN HÀNG (4 BIỂU ĐỒ) ================= */}
      {activeTab === 'revenue' && !isWarehouseOnly && (
        <>
          {/* 4 Thẻ KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA', fontWeight: 600 }}>Doanh thu hôm nay</div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#F59E0B', margin: '6px 0 4px' }}>{fmt(dash?.today_revenue)}</div>
              <div style={{ fontSize: '0.76rem', color: '#71717A' }}>{dash?.today_orders || 0} đơn đã thanh toán</div>
            </div>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA', fontWeight: 600 }}>Doanh thu kỳ lọc</div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#F4F1EC', margin: '6px 0 4px' }}>{fmt(rangeRevenue)}</div>
              <div style={{ fontSize: '0.76rem', color: '#71717A' }}>{rangeOrders} đơn trong kỳ</div>
            </div>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA', fontWeight: 600 }}>Tổng doanh thu lũy kế</div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#34D399', margin: '6px 0 4px' }}>{fmt(dash?.total_revenue)}</div>
              <div style={{ fontSize: '0.76rem', color: '#71717A' }}>{dash?.total_paid_orders || 0} đơn toàn thời gian</div>
            </div>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.78rem', color: '#A1A1AA', fontWeight: 600 }}>Giá trị trung bình / đơn</div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#38BDF8', margin: '6px 0 4px' }}>{fmt(dash?.avg_order_value)}</div>
              <div style={{ fontSize: '0.76rem', color: '#71717A' }}>{dash?.total_customers || 0} khách thành viên</div>
            </div>
          </div>
 
          {/* HÀNG BIỂU ĐỒ 1: AreaChart (Xu hướng ngày) + PieChart Donut (Phương thức thanh toán) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: '16px' }}>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>Xu hướng doanh thu theo ngày</span>
                <span style={{ fontSize: '0.76rem', color: '#71717A' }}>VNĐ</span>
              </div>
              <div style={{ height: '270px' }}>
                {loading || dailyChart.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '100px', color: '#71717A', fontSize: '0.84rem' }}>
                    {loading ? 'Đang tải...' : 'Chưa có đơn hàng trong khoảng ngày đã chọn.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyChart}>
                      <defs>
                        <linearGradient id="darkRevGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D97706" stopOpacity={0.38} />
                          <stop offset="95%" stopColor="#D97706" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272B" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#A1A1AA', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#A1A1AA', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                      <Tooltip formatter={(val) => [fmt(val), 'Doanh thu']} contentStyle={DARK_TOOLTIP} />
                      <Area type="monotone" dataKey="revenue" stroke="#F59E0B" strokeWidth={2.5} fill="url(#darkRevGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
 
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>Cơ cấu phương thức thanh toán</span>
                
              </div>
              <div style={{ height: '270px' }}>
                {paymentPieData.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '100px', color: '#71717A', fontSize: '0.84rem' }}>Chưa có giao dịch thanh toán.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentPieData} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={56} outerRadius={86} paddingAngle={4}>
                        {paymentPieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(val) => fmt(val)} contentStyle={DARK_TOOLTIP} />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.78rem', color: '#D4D4D8' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
 
          {/* HÀNG BIỂU ĐỒ 2: Horizontal BarChart (Top món bán chạy) + Vertical BarChart (Khung giờ cao điểm) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>Top món bán chạy nhất (Doanh thu)</span>
                
              </div>
              <div style={{ height: '260px' }}>
                {topProductsBar.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '95px', color: '#71717A', fontSize: '0.84rem' }}>Chưa có dữ liệu món bán.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductsBar} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272B" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#A1A1AA', fontSize: 11 }} tickFormatter={fmtShort} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={135} tick={{ fill: '#F4F1EC', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(val, _, item) => [`${fmt(val)} (${item.payload.qty} ly)`, item.payload.fullName]}
                        contentStyle={DARK_TOOLTIP}
                      />
                      <Bar dataKey="revenue" radius={[0, 8, 8, 0]} barSize={20}>
                        {topProductsBar.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? '#F59E0B' : i === 1 ? '#D97706' : '#B45309'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
 
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>Phân bổ doanh thu theo khung giờ hôm nay</span>
                
              </div>
              <div style={{ height: '260px' }}>
                {hourlyBarData.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '95px', color: '#71717A', fontSize: '0.84rem' }}>Hôm nay chưa phát sinh giao dịch theo giờ.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272B" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#A1A1AA', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#A1A1AA', fontSize: 11 }} tickFormatter={fmtShort} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val, _, item) => [`${fmt(val)} (${item.payload.orders} đơn)`, 'Doanh thu']} contentStyle={DARK_TOOLTIP} />
                      <Bar dataKey="revenue" fill="#38BDF8" radius={[8, 8, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </>
      )}
 
      {/* ================= TAB 2: THỐNG KÊ KHO (2 BIỂU ĐỒ + BẢNG TỒN) ================= */}
      {activeTab === 'stock' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '16px' }}>
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>Top nguyên liệu tiêu hao giá trị lớn nhất</span>
                
              </div>
              <div style={{ height: '240px' }}>
                {topConsumedBar.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '85px', color: '#71717A', fontSize: '0.84rem' }}>Chưa có lịch sử xuất bán nguyên liệu.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topConsumedBar} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272B" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#A1A1AA', fontSize: 11 }} tickFormatter={fmtShort} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={135} tick={{ fill: '#F4F1EC', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val, _, item) => [`${fmt(val)} (${item.payload.qty} ${item.payload.unit})`, item.payload.fullName]} contentStyle={DARK_TOOLTIP} />
                      <Bar dataKey="cost" fill="#34D399" radius={[0, 8, 8, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
 
            <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>Tỷ lệ trạng thái tồn kho</span>
                
              </div>
              <div style={{ height: '240px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stockStatusPie} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={50} outerRadius={78} paddingAngle={4}>
                      {stockStatusPie.map((_, idx) => <Cell key={idx} fill={STOCK_PIE_COLORS[idx % STOCK_PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val) => `${val} mặt hàng`} contentStyle={DARK_TOOLTIP} />
                    <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.78rem', color: '#D4D4D8' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
 
          {/* Bảng tồn kho chi tiết */}
          <div style={{ background: '#18181B', border: '1px solid #2A2A30', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '15px 20px', borderBottom: '1px solid #26262A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F4F1EC' }}>Giá trị tồn kho & Cảnh báo nhập hàng</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="ui-badge ui-badge-amber">Tổng giá trị: {fmt(stockData.summary?.total_inventory_value)}</span>
                <span className="ui-badge ui-badge-red">Sắp hết: {stockData.summary?.low_stock_count || 0}</span>
              </div>
            </div>
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr><th>Mã NL</th><th>Nguyên liệu</th><th style={{ textAlign: 'right' }}>Tồn hiện tại</th><th style={{ textAlign: 'right' }}>Định mức tối thiểu</th><th style={{ textAlign: 'right' }}>Giá trị tồn</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {stockItems.map((item) => (
                    <tr key={item.id}>
                      <td className="ui-nowrap"><strong>{item.code}</strong></td>
                      <td>{item.name}</td>
                      <td className="ui-nowrap" style={{ textAlign: 'right', fontWeight: 700 }}>{Number(item.current_stock).toFixed(2)} {item.unit}</td>
                      <td className="ui-nowrap" style={{ textAlign: 'right', color: '#A1A1AA' }}>{Number(item.min_stock).toFixed(2)} {item.unit}</td>
                      <td className="ui-nowrap" style={{ textAlign: 'right', fontWeight: 700, color: '#F59E0B' }}>{fmt(item.total_value)}</td>
                      <td>
                        <span className={`ui-badge ${item.is_low ? 'ui-badge-red' : 'ui-badge-green'}`}>
                          <span className="ui-badge-dot" style={{ background: item.is_low ? '#F87171' : '#34D399' }} />
                          {item.is_low ? 'Sắp hết' : 'Ổn định'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
