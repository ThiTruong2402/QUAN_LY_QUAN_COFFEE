import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
 
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
 
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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
 
  // Tính tổng doanh thu THẬT trong khoảng ngày đang lọc
  const rangeRevenue = (revData.daily || []).reduce((s, r) => s + Number(r.revenue || 0), 0);
  const rangeOrders  = (revData.daily || []).reduce((s, r) => s + Number(r.orders || 0), 0);
  const chartData = (revData.daily || []).map((d) => ({
    date: String(d.date).slice(5, 10).split('-').reverse().join('/'),
    revenue: Number(d.revenue || 0),
    orders: Number(d.orders || 0),
  }));
 
  const topProducts = (revData.topProducts || []).slice(0, 5);
  const maxTopQty = Math.max(1, ...topProducts.map((p) => Number(p.qty || 0)));
 
  const handleExportCsv = () => {
    const rows = activeTab === 'revenue'
      ? [['Ngay', 'So don', 'Doanh thu (VND)'], ...(revData.daily || []).map((r) => [String(r.date).slice(0, 10), r.orders, r.revenue])]
      : [['Ma NL', 'Ten nguyen lieu', 'Ton kho', 'Don vi', 'Gia von BQ', 'Gia tri ton'], ...(stockData.items || []).map((i) => [i.code, i.name, i.current_stock, i.unit, i.avg_cost, i.total_value])];
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeTab === 'revenue' ? `bao-cao-doanh-thu-${fromDate}_${toDate}.csv` : `thong-ke-kho-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất file báo cáo');
  };
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* THANH TAB GẠCH CHÂN THANH LỊCH + BỘ LỌC TRÊN 1 HÀNG GỌN */}
      <div className="ui-card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div className="ui-underline-tabs" style={{ borderBottom: 'none' }}>
            {!isWarehouseOnly && (
              <button type="button" className={`ui-underline-tab ${activeTab === 'revenue' ? 'active' : ''}`} onClick={() => setActiveTab('revenue')}>
                Doanh thu & Bán hàng
              </button>
            )}
            <button type="button" className={`ui-underline-tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>
              <span>Kho & Nguyên liệu</span>
              <span className="ui-badge ui-badge-gray" style={{ padding: '1px 8px' }}>{stockData.summary?.total_items || 0}</span>
            </button>
          </div>
 
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {activeTab === 'revenue' && (
              <>
                <input type="date" className="ui-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <span style={{ color: '#8C7E74', fontSize: '0.82rem' }}>đến</span>
                <input type="date" className="ui-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </>
            )}
            <button type="button" className="ui-btn ui-btn-outline" onClick={loadReports}>Làm mới</button>
            <button type="button" className="ui-btn ui-btn-outline" onClick={handleExportCsv}>Xuất CSV</button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => window.print()}>In báo cáo</button>
          </div>
        </div>
      </div>
 
      {/* TAB 1: DOANH THU & BÁN HÀNG (100% SỐ LIỆU THẬT TỪ CSDL) */}
      {activeTab === 'revenue' && !isWarehouseOnly && (
        <>
          <div className="ui-kpi-grid">
            <div className="ui-kpi-card">
              <div className="ui-kpi-top"><span className="ui-kpi-label">Doanh thu hôm nay</span></div>
              <div className="ui-kpi-value" style={{ color: '#C25E1A' }}>{fmt(dash?.today_revenue)}</div>
              <div className="ui-kpi-sub">
                {dash?.today_orders || 0} đơn đã thanh toán
                {dash?.revenue_growth !== null && dash?.revenue_growth !== undefined && (
                  <span className={`ui-badge ${dash.revenue_growth >= 0 ? 'ui-badge-green' : 'ui-badge-red'}`}>
                    {dash.revenue_growth >= 0 ? `+${dash.revenue_growth}%` : `${dash.revenue_growth}%`} so với hôm qua
                  </span>
                )}
              </div>
            </div>
 
            <div className="ui-kpi-card">
              <div className="ui-kpi-top"><span className="ui-kpi-label">Doanh thu kỳ lọc</span></div>
              <div className="ui-kpi-value">{fmt(rangeRevenue)}</div>
              <div className="ui-kpi-sub">{rangeOrders} đơn từ {fromDate} đến {toDate}</div>
            </div>
 
            <div className="ui-kpi-card">
              <div className="ui-kpi-top"><span className="ui-kpi-label">Tổng doanh thu lũy kế</span></div>
              <div className="ui-kpi-value">{fmt(dash?.total_revenue)}</div>
              <div className="ui-kpi-sub">{dash?.total_paid_orders || 0} đơn toàn thời gian</div>
            </div>
 
            <div className="ui-kpi-card">
              <div className="ui-kpi-top"><span className="ui-kpi-label">Giá trị trung bình / đơn</span></div>
              <div className="ui-kpi-value">{fmt(dash?.avg_order_value)}</div>
              <div className="ui-kpi-sub">{dash?.total_customers || 0} khách hàng thành viên</div>
            </div>
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: '16px' }}>
            {/* Biểu đồ xu hướng doanh thu Recharts nền sáng */}
            <div className="ui-card">
              <div className="ui-card-header">
                <h3 className="ui-card-title">Xu hướng doanh thu theo ngày</h3>
                <span style={{ fontSize: '0.76rem', color: '#8C7E74' }}>Đơn vị: VNĐ</span>
              </div>
              <div style={{ padding: '18px', height: '300px' }}>
                {loading ? (
                  <div style={{ textAlign: 'center', paddingTop: '110px', color: '#8C7E74' }}>Đang tải biểu đồ...</div>
                ) : chartData.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: '110px', color: '#8C7E74' }}>Chưa có đơn hàng đã thanh toán trong khoảng ngày này.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="mchRevGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#C25E1A" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#C25E1A" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EFEAE2" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#73675E', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#73675E', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                      <Tooltip formatter={(val) => [fmt(val), 'Doanh thu']} contentStyle={{ borderRadius: 12, border: '1px solid #EAE3DA' }} />
                      <Area type="monotone" dataKey="revenue" stroke="#C25E1A" strokeWidth={2.5} fill="url(#mchRevGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
 
            {/* Top 5 sản phẩm bán chạy thật */}
            <div className="ui-card">
              <div className="ui-card-header">
                <h3 className="ui-card-title">Top 5 món bán chạy nhất</h3>
                <span style={{ fontSize: '0.76rem', color: '#8C7E74' }}>Trong kỳ lọc</span>
              </div>
              <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {topProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: '#8C7E74', fontSize: '0.84rem' }}>Chưa có dữ liệu món bán ra.</div>
                ) : topProducts.map((p, idx) => {
                  const pct = Math.round((Number(p.qty) / maxTopQty) * 100);
                  return (
                    <div key={p.product_name || idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '5px' }}>
                        <span style={{ fontWeight: 600, color: '#1E1815' }}>{idx + 1}. {p.product_name}</span>
                        <span style={{ fontWeight: 700, color: '#C25E1A' }}>{p.qty} ly • {fmt(p.revenue)}</span>
                      </div>
                      <div style={{ height: '7px', borderRadius: '999px', background: '#F1ECE4', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '999px', background: idx === 0 ? '#2B1A12' : '#C25E1A' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
 
      {/* TAB 2: THỐNG KÊ KHO & NGUYÊN LIỆU */}
      {activeTab === 'stock' && (
        <div className="ui-card">
          <div className="ui-card-header">
            <h3 className="ui-card-title">Giá trị tồn kho & Cảnh báo nhập hàng</h3>
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
                {(stockData.items || []).map((item) => (
                  <tr key={item.id}>
                    <td className="ui-nowrap"><strong>{item.code}</strong></td>
                    <td>{item.name}</td>
                    <td className="ui-nowrap" style={{ textAlign: 'right', fontWeight: 700 }}>{Number(item.current_stock).toFixed(2)} {item.unit}</td>
                    <td className="ui-nowrap" style={{ textAlign: 'right', color: '#73675E' }}>{Number(item.min_stock).toFixed(2)} {item.unit}</td>
                    <td className="ui-nowrap" style={{ textAlign: 'right', fontWeight: 700, color: '#C25E1A' }}>{fmt(item.total_value)}</td>
                    <td>
                      <span className={`ui-badge ${item.is_low ? 'ui-badge-red' : 'ui-badge-green'}`}>
                        <span className="ui-badge-dot" style={{ background: item.is_low ? '#B91C1C' : '#15803D' }} />
                        {item.is_low ? 'Cần nhập thêm' : 'Ổn định'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
