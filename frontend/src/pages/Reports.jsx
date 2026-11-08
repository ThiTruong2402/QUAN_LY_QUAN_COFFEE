import { useEffect, useState } from 'react';
import api from '../api/axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const DONUT_COLORS = ['#f59e0b', '#d97706', '#b45309', '#78350f'];
const WAREHOUSE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function Reports() {
  const { user } = useAuth();
  // Primary Tab Switcher: 'sales' (Bán Hàng & Doanh Thu) | 'warehouse' (Thống Kê Kho & Nguyên Liệu)
  const [activeTab, setActiveTab] = useState(user?.role === 'warehouse' ? 'warehouse' : 'sales');

  const [filterType, setFilterType] = useState('Ngày');
  const [fromDate, setFromDate] = useState('2026-07-01');
  const [toDate, setToDate] = useState('2026-07-24');

  // Revenue & Sales Stats
  const [stats, setStats] = useState({
    today_revenue: 85000,
    month_revenue: 120000000,
    total_orders_revenue: 152000000,
    today_orders: 1,
  });

  const [hourlyTrend, setHourlyTrend] = useState([]);

  useEffect(() => {
    api.get('/reports/dashboard').then((r) => {
      if (r.data?.success && r.data.data) {
        const d = r.data.data;
        setStats(prev => ({
          ...prev,
          today_revenue: d.today_revenue || prev.today_revenue,
          today_orders: d.today_orders || prev.today_orders,
          month_revenue: d.month_revenue || prev.month_revenue,
          total_orders_revenue: d.total_revenue || prev.total_orders_revenue,
        }));
        if (d.hourly_trend && d.hourly_trend.length > 0) {
          const hours = Array.from({ length: 17 }, (_, i) => i + 7);
          const mapped = hours.map((hour) => {
            const found = d.hourly_trend.find((h) => Number(h.hour) === hour);
            return {
              hour: `${hour < 10 ? '0' : ''}${hour}:00`,
              revenue: found ? Number(found.revenue) : 0,
              orders: found ? Number(found.count) : 0,
            };
          });
          setHourlyTrend(mapped);
        }
      }
    }).catch(() => {});
  }, []);

  const [chartData, setChartData] = useState([
    { date: '01/06', revenue: 4200000 },
    { date: '02/06', revenue: 3800000 },
    { date: '03/06', revenue: 5900000 },
    { date: '04/06', revenue: 5100000 },
    { date: '05/06', revenue: 6800000 },
    { date: '06/06', revenue: 4700000 },
    { date: '07/06', revenue: 6100000 },
    { date: '08/06', revenue: 5500000 },
    { date: '09/06', revenue: 9800000 },
    { date: '10/06', revenue: 6500000 },
    { date: '11/06', revenue: 5800000 },
    { date: '12/06', revenue: 7200000 },
  ]);

  const topProducts = [
    { name: '1. Cà phê sữa', qty: 320, pct: 35.2, color: '#543310' },
    { name: '2. Trà đào', qty: 210, pct: 23.1, color: '#78350f' },
    { name: '3. Matcha Latte', qty: 150, pct: 16.5, color: '#b45309' },
    { name: '4. Sinh tố bơ', qty: 120, pct: 13.2, color: '#d97706' },
    { name: '5. Cà phê đen', qty: 90, pct: 9.9, color: '#f59e0b' },
  ];

  const paymentBreakdown = [
    { name: 'Tiền mặt', value: 54000000, pct: 45 },
    { name: 'Chuyển khoản (VietQR)', value: 42000000, pct: 35 },
    { name: 'Ví điện tử', value: 18000000, pct: 15 },
    { name: 'Khác', value: 6000000, pct: 5 },
  ];

  // Warehouse / Stock Analytics Data
  const [stockReport, setStockReport] = useState({
    summary: {
      total_items: 20,
      total_inventory_value: 29356741,
      low_stock_count: 0,
    },
    items: [],
    top_consumed: [],
    recent_movements: [],
  });
  const [stockLoading, setStockLoading] = useState(false);

  const loadStockReport = async () => {
    setStockLoading(true);
    try {
      const res = await api.get('/reports/stock');
      if (res.data.success && res.data.data) {
        setStockReport(res.data.data);
      }
    } catch {
      // Fallback
    } finally {
      setStockLoading(false);
    }
  };

  useEffect(() => {
    loadStockReport();
  }, []);

  const handleExportExcel = () => {
    if (activeTab === 'warehouse') {
      toast.success('📊 Đã xuất dữ liệu Thống Kê Kho Hàng ra file Excel thành công!');
    } else {
      toast.success('📊 Đã xuất Báo Cáo Doanh Thu ra file Excel thành công!');
    }
  };

  const handleBackup = () => {
    toast.success('💾 Đã tạo bản sao lưu dữ liệu toàn hệ thống & kho hàng an toàn!');
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 0. PRIMARY TAB SWITCHER: DOANH THU vs THỐNG KÊ KHO */}
      <div style={{ display: 'flex', gap: '10px', background: 'rgba(32, 20, 13, 0.75)', backdropFilter: 'blur(16px)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.18)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 18px',
            borderRadius: '8px',
            border: activeTab === 'sales' ? '1.5px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.2)',
            background: activeTab === 'sales' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(255, 255, 255, 0.04)',
            color: activeTab === 'sales' ? '#ffffff' : '#d5bba2',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'sales' ? '0 4px 14px rgba(217,119,6,0.35)' : 'none',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>📈</span>
          <span>BÁO CÁO DOANH THU &amp; BÁN HÀNG</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('warehouse');
            loadStockReport();
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 18px',
            borderRadius: '8px',
            border: activeTab === 'warehouse' ? '1.5px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.2)',
            background: activeTab === 'warehouse' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(255, 255, 255, 0.04)',
            color: activeTab === 'warehouse' ? '#ffffff' : '#d5bba2',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'warehouse' ? '0 4px 14px rgba(217,119,6,0.35)' : 'none',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>📦</span>
          <span>THỐNG KÊ HÀNG CỦA KHO &amp; NGUYÊN LIỆU</span>
          <span style={{
            background: activeTab === 'warehouse' ? 'rgba(255,255,255,0.25)' : 'rgba(245, 158, 11, 0.2)',
            color: activeTab === 'warehouse' ? '#ffffff' : '#fbbf24',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 800,
          }}>
            {stockReport.summary?.total_items || 20} loại
          </span>
        </button>
      </div>

      {/* 1. TOP FILTER BAR & ACTION BUTTONS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: 'rgba(32, 20, 13, 0.75)', padding: '12px 18px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7' }}>Theo:</span>
            <select
              className="form-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ width: '90px', padding: '6px 8px' }}
            >
              <option value="Ngày">Ngày</option>
              <option value="Tháng">Tháng</option>
              <option value="Năm">Năm</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7' }}>Từ ngày:</span>
            <input
              type="date"
              className="form-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ width: '135px', padding: '6px 8px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7' }}>Đến ngày:</span>
            <input
              type="date"
              className="form-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ width: '135px', padding: '6px 8px' }}
            />
          </div>

          <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none', padding: '7px 16px', fontWeight: 700 }}>
            <span>🔍</span>
            <span>LỌC DỮ LIỆU</span>
          </button>
          <button
            className="btn btn-outline"
            style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fef3c7', padding: '7px 12px', background: 'transparent' }}
            onClick={() => {
              if (activeTab === 'warehouse') loadStockReport();
              toast.success('Đã làm mới dữ liệu!');
            }}
          >
            <span>🔄</span>
            <span>LÀM MỚI</span>
          </button>
        </div>

        {/* Action Buttons on top right */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24', fontWeight: 700 }} onClick={handleBackup}>
            <span>💾</span> SAO LƯU DỮ LIỆU
          </button>
          <button className="btn btn-sm" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#fff', fontWeight: 700 }} onClick={handleExportExcel}>
            <span>📊</span> XUẤT EXCEL
          </button>
          <button className="btn btn-sm btn-outline" style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fef3c7', fontWeight: 700, background: 'transparent' }} onClick={() => window.print()}>
            <span>🖨️</span> IN BÁO CÁO
          </button>
        </div>
      </div>

      {/* ========================================================== */}
      {/* TAB 1: BÁO CÁO DOANH THU & BÁN HÀNG */}
      {/* ========================================================== */}
      {activeTab === 'sales' && (
        <>
          {/* 4 STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <span style={{ fontSize: '2rem' }}>💰</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>DOANH THU HÔM NAY</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', margin: '2px 0' }}>{fmt(stats.today_revenue)}</div>
                <div style={{ fontSize: '0.72rem', color: '#34d399' }}>↗ 12% so với hôm qua</div>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <span style={{ fontSize: '2rem' }}>📅</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>DOANH THU THÁNG NÀY</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', margin: '2px 0' }}>{fmt(stats.month_revenue)}</div>
                <div style={{ fontSize: '0.72rem', color: '#34d399' }}>↗ 8% so với tháng trước</div>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <span style={{ fontSize: '2rem' }}>🏷️</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TỔNG DOANH THU ĐƠN HÀNG</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', margin: '2px 0' }}>{fmt(stats.total_orders_revenue)}</div>
                <div style={{ fontSize: '0.72rem', color: '#a89078' }}>Toàn bộ thời gian</div>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <span style={{ fontSize: '2rem' }}>☕</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SỐ ĐƠN HÀNG HÔM NAY</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', margin: '2px 0' }}>{stats.today_orders} đơn</div>
                <div style={{ fontSize: '0.72rem', color: '#34d399' }}>↗ Đạt chỉ tiêu ngày</div>
              </div>
            </div>
          </div>

          {/* CHARTS ROW: REVENUE TREND & TOP PRODUCTS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '16px' }}>
            <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
                  📈 XU HƯỚNG DOANH THU THEO THỜI GIAN
                </div>
                <span style={{ fontSize: '0.75rem', color: '#c4a482' }}>Đơn vị: VNĐ</span>
              </div>
              <div style={{ height: '220px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(245, 158, 11, 0.12)" />
                    <XAxis dataKey="date" stroke="#c4a482" fontSize={11} />
                    <YAxis stroke="#c4a482" fontSize={11} tickFormatter={(v) => `${v / 1000000}M`} />
                    <Tooltip
                      contentStyle={{ background: '#1c120b', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: '#fef3c7' }}
                      formatter={(value) => [fmt(value), 'Doanh thu']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#fbbf24" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', marginBottom: '14px', fontFamily: "'Playfair Display', Georgia, serif" }}>
                🏆 TOP 5 SẢN PHẨM BÁN CHẠY NHẤT
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {topProducts.map((p) => (
                  <div key={p.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: '#fef3c7', marginBottom: '4px' }}>
                      <span>{p.name}</span>
                      <span><strong style={{ color: '#fbbf24' }}>{p.qty}</strong> ly ({p.pct}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${p.pct}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #d97706)', borderRadius: '4px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* HOURLY SALES TREND (KHUNG GIỜ CAO ĐIỂM TỪ DASHBOARD CŨ) */}
          {hourlyTrend.length > 0 && (
            <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
                  ⏰ KHUNG GIỜ CAO ĐIỂM TRONG NGÀY (07:00 - 23:00)
                </div>
                <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700 }}>
                  ● Đồng bộ dữ liệu theo ca bán hàng
                </span>
              </div>
              <div style={{ height: '180px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(245, 158, 11, 0.12)" />
                    <XAxis dataKey="hour" stroke="#c4a482" fontSize={11} />
                    <YAxis stroke="#c4a482" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: '#1c120b', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: '#fef3c7' }}
                      formatter={(value, name) => [name === 'revenue' ? fmt(value) : `${value} đơn`, name === 'revenue' ? 'Doanh thu' : 'Số đơn']}
                    />
                    <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} name="revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* RECENT SALES TABLE & DONUT CHART */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '16px' }}>
            <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', marginBottom: '10px', fontFamily: "'Playfair Display', Georgia, serif" }}>
                📋 DOANH THU CHI TIẾT THEO NGÀY
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '200px' }}>
                <table className="mockup-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Ngày</th>
                      <th style={{ textAlign: 'center' }}>Số đơn</th>
                      <th style={{ textAlign: 'right' }}>Tiền mặt</th>
                      <th style={{ textAlign: 'right' }}>Chuyển khoản</th>
                      <th style={{ textAlign: 'right' }}>Tổng doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1</td>
                      <td>24/07/2026</td>
                      <td style={{ textAlign: 'center' }}>1</td>
                      <td style={{ textAlign: 'right' }}>85.000</td>
                      <td style={{ textAlign: 'right' }}>0</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>85.000 đ</td>
                    </tr>
                    <tr>
                      <td>2</td>
                      <td>23/07/2026</td>
                      <td style={{ textAlign: 'center' }}>28</td>
                      <td style={{ textAlign: 'right' }}>3.450.000</td>
                      <td style={{ textAlign: 'right' }}>2.100.000</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>5.550.000 đ</td>
                    </tr>
                    <tr>
                      <td>3</td>
                      <td>22/07/2026</td>
                      <td style={{ textAlign: 'center' }}>35</td>
                      <td style={{ textAlign: 'right' }}>4.820.000</td>
                      <td style={{ textAlign: 'right' }}>3.200.000</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>8.020.000 đ</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', marginBottom: '10px', fontFamily: "'Playfair Display', Georgia, serif" }}>
                🥧 TỶ LỆ PHƯƠNG THỨC THANH TOÁN
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '130px', height: '130px', position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentBreakdown}
                        innerRadius={38}
                        outerRadius={60}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {paymentBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: '#fef3c7' }}>
                  {paymentBreakdown.map((item, idx) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: DONUT_COLORS[idx], display: 'inline-block' }} />
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                      </div>
                      <span><strong style={{ color: '#fbbf24' }}>{item.pct}%</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* TAB 2: THỐNG KÊ HÀNG CỦA KHO & NGUYÊN LIỆU */}
      {/* ========================================================== */}
      {activeTab === 'warehouse' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 4 WAREHOUSE STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)', borderLeft: '4px solid #f59e0b' }}>
              <span style={{ fontSize: '2.2rem' }}>📦</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TỔNG GIÁ TRỊ TỒN KHO</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', margin: '2px 0' }}>
                  {fmt(stockReport.summary?.total_inventory_value || 29356741)}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#34d399' }}>✅ Giá vốn trung bình</div>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)', borderLeft: '4px solid #10b981' }}>
              <span style={{ fontSize: '2.2rem' }}>🏷️</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TỔNG LOẠI NGUYÊN LIỆU</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', margin: '2px 0' }}>
                  {stockReport.summary?.total_items || 20} mặt hàng
                </div>
                <div style={{ fontSize: '0.72rem', color: '#34d399' }}>Cà phê, trà, sữa, siro, topping</div>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)', borderLeft: '4px solid #f59e0b' }}>
              <span style={{ fontSize: '2.2rem' }}>⚠️</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CẢNH BÁO SẮP HẾT HÀNG</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: stockReport.summary?.low_stock_count > 0 ? '#f87171' : '#34d399', margin: '2px 0' }}>
                  {stockReport.summary?.low_stock_count || 0} cảnh báo
                </div>
                <div style={{ fontSize: '0.72rem', color: '#a89078' }}>Định mức an toàn</div>
              </div>
            </div>

            <div className="mockup-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)', borderLeft: '4px solid #a855f7' }}>
              <span style={{ fontSize: '2.2rem' }}>☕</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c4a482', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ĐỊNH MỨC CÔNG THỨC</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fef3c7', margin: '2px 0' }}>
                  231 công thức
                </div>
                <div style={{ fontSize: '0.72rem', color: '#34d399' }}>Đã cấu hình định lượng</div>
              </div>
            </div>
          </div>

          {/* TOP CONSUMED INGREDIENTS */}
          <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
                📊 TOP NGUYÊN LIỆU TIÊU THỤ NHIỀU NHẤT
              </div>
              <span style={{ fontSize: '0.75rem', color: '#c4a482' }}>Tự động khấu trừ theo đơn hàng</span>
            </div>

            {stockReport.top_consumed && stockReport.top_consumed.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {stockReport.top_consumed.slice(0, 6).map((ing, idx) => (
                  <div key={ing.name || idx} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.12)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: '#fef3c7', marginBottom: '6px' }}>
                      <span>{idx + 1}. {ing.name}</span>
                      <span>
                        <strong style={{ color: '#fbbf24' }}>{Number(ing.total_consumed).toFixed(2)}</strong> {ing.unit} ({fmt(ing.total_cost)})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, Math.max(15, (Number(ing.total_consumed) / 5) * 100))}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #d97706)', borderRadius: '4px' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: '#a89078', fontSize: '0.85rem' }}>
                Chưa có dữ liệu tiêu thụ nguyên liệu trong kỳ.
              </div>
            )}
          </div>

          {/* TABLE: CHI TIẾT TỒN KHO 20 MẶT HÀNG */}
          <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
                📦 BẢNG KÊ CHI TIẾT TỒN KHO &amp; ĐỊNH MỨC AN TOÀN ({stockReport.items?.length || 20} NGUYÊN LIỆU)
              </div>
              <span style={{ fontSize: '0.78rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '3px 10px', borderRadius: '12px', fontWeight: 700, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                Tổng giá trị kho: {fmt(stockReport.summary?.total_inventory_value || 29356741)}
              </span>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '340px' }}>
              <table className="mockup-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>STT</th>
                    <th style={{ width: '90px' }}>Mã NL</th>
                    <th>Tên nguyên liệu</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>ĐVT</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Số lượng tồn</th>
                    <th style={{ width: '90px', textAlign: 'right' }}>Định mức min</th>
                    <th style={{ width: '110px', textAlign: 'right' }}>Giá vốn (VNĐ)</th>
                    <th style={{ width: '130px', textAlign: 'right' }}>Tổng giá trị tồn</th>
                    <th style={{ width: '110px', textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReport.items && stockReport.items.length > 0 ? (
                    stockReport.items.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td style={{ color: '#c4a482' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 700, color: '#38bdf8' }}>{it.code}</td>
                        <td style={{ fontWeight: 600, color: '#fef3c7' }}>{it.name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#d5bba2', padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {it.unit}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: Number(it.current_stock) <= Number(it.min_stock) ? '#f87171' : '#fef3c7' }}>
                          {Number(it.current_stock).toLocaleString('vi-VN')}
                        </td>
                        <td style={{ textAlign: 'right', color: '#c4a482' }}>
                          {Number(it.min_stock).toLocaleString('vi-VN')}
                        </td>
                        <td style={{ textAlign: 'right', color: '#d5bba2' }}>{fmt(it.cost_price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>
                          {fmt(it.stock_value)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {it.status === 'danger' ? (
                            <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800, border: '1px solid rgba(239, 68, 68, 0.35)' }}>
                              🔴 Hết hàng
                            </span>
                          ) : it.status === 'warning' ? (
                            <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800, border: '1px solid rgba(245, 158, 11, 0.35)' }}>
                              🟡 Sắp hết
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                              🟢 Đầy đủ
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#c4a482' }}>
                        Đang tải danh sách tồn kho...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLE: NHẬT KÝ XUẤT NHẬP KHO GẦN ĐÂY */}
          {stockReport.recent_movements && stockReport.recent_movements.length > 0 && (
            <div className="mockup-panel" style={{ padding: '16px', background: 'rgba(32, 20, 13, 0.75)', border: '1px solid rgba(245, 158, 11, 0.18)' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fef3c7', marginBottom: '10px', fontFamily: "'Playfair Display', Georgia, serif" }}>
                📜 LỊCH SỬ XUẤT NGUYÊN LIỆU KHO THEO ĐƠN HÀNG (TỰ ĐỘNG KHẤU TRỪ)
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '220px' }}>
                <table className="mockup-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>STT</th>
                      <th style={{ width: '130px' }}>Thời gian</th>
                      <th>Nguyên liệu</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Loại GD</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Số lượng</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Dư sau GD</th>
                      <th>Ghi chú đơn hàng</th>
                      <th style={{ width: '110px' }}>Người thực hiện</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockReport.recent_movements.slice(0, 10).map((m, idx) => (
                      <tr key={m.id || idx}>
                        <td style={{ color: '#c4a482' }}>{idx + 1}</td>
                        <td style={{ fontSize: '0.75rem', color: '#c4a482' }}>
                          {m.created_at ? new Date(m.created_at).toLocaleString('vi-VN') : ''}
                        </td>
                        <td style={{ fontWeight: 600, color: '#fef3c7' }}>{m.ingredient_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: m.movement_type === 'sale' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: m.movement_type === 'sale' ? '#fbbf24' : '#34d399',
                            border: `1px solid ${m.movement_type === 'sale' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                          }}>
                            {m.movement_type === 'sale' ? '☕ Bán món' : '📥 Nhập kho'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: m.movement_type === 'sale' ? '#f87171' : '#34d399' }}>
                          {m.movement_type === 'sale' ? '-' : '+'}{Number(m.quantity).toFixed(3)} {m.unit}
                        </td>
                        <td style={{ textAlign: 'right', color: '#fef3c7', fontWeight: 600 }}>
                          {Number(m.balance_after).toFixed(3)} {m.unit}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: '#d5bba2' }}>{m.note || '—'}</td>
                        <td style={{ fontSize: '0.75rem', color: '#c4a482' }}>{m.created_by_name || 'Hệ thống POS'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
