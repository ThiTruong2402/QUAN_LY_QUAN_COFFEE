import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

export default function Accounts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' | 'customers' | 'promotions'

  // STAFF STATE
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [staffForm, setStaffForm] = useState({
    code: 'NV005',
    username: '',
    password: '',
    full_name: '',
    birthday: '1995-01-01',
    gender: 'Nam',
    phone: '',
    email: '',
    role_id: 2,
    is_active: 1,
  });

  // CUSTOMERS STATE
  const [customers, setCustomers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    id: null,
    phone: '',
    name: '',
    birthday: '',
    tier_id: 1,
  });

  // PROMOTIONS STATE
  const [promotions, setPromotions] = useState([]);
  const [promoModal, setPromoModal] = useState(false);
  const [promoForm, setPromoForm] = useState({
    name: '',
    code: '',
    type: 'percent_order',
    value: 10,
    min_order_value: 0,
    max_discount: 50000,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  // Load Data based on active tab
  const loadStaff = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/staff');
      setUsers(res.data.data.users || []);
      setRoles(res.data.data.roles || []);
      if (res.data.data.users?.length > 0 && !selectedUser) {
        selectStaffRow(res.data.data.users[0]);
      }
    } catch {
      toast.error('Lỗi tải dữ liệu nhân viên');
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data.data.customers || []);
      setTiers(res.data.data.tiers || []);
    } catch {
      toast.error('Lỗi tải dữ liệu khách hàng');
    }
  };

  const loadPromotions = async () => {
    try {
      const res = await api.get('/promotions');
      setPromotions(res.data.data.promotions || []);
    } catch {
      toast.error('Lỗi tải dữ liệu khuyến mãi');
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') loadStaff();
    if (activeTab === 'customers') loadCustomers();
    if (activeTab === 'promotions') loadPromotions();
  }, [activeTab]);

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      loadStaff();
    } else {
      setActiveTab('customers');
    }
    loadCustomers();
    loadPromotions();
  }, []);

  const selectStaffRow = (u) => {
    setSelectedUser(u);
    setStaffForm({
      code: u.code || `NV00${u.id}`,
      username: u.username,
      password: '',
      full_name: u.full_name,
      birthday: u.birthday ? u.birthday.split('T')[0] : '1995-01-01',
      gender: u.gender || 'Nam',
      phone: u.phone || '',
      email: u.email || '',
      role_id: u.role_id,
      is_active: u.is_active,
    });
  };

  const handleSaveStaff = async (isNew = false) => {
    if (!staffForm.username || !staffForm.full_name) {
      return toast.error('Vui lòng nhập tài khoản và họ tên!');
    }
    if (isNew && !staffForm.password) {
      return toast.error('Vui lòng nhập mật khẩu cho nhân viên mới!');
    }
    try {
      if (isNew) {
        await api.post('/staff', staffForm);
        toast.success('Thêm nhân viên thành công!');
      } else {
        await api.put(`/staff/${selectedUser.id}`, staffForm);
        toast.success('Cập nhật nhân viên thành công!');
      }
      loadStaff();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.phone) return toast.error('Vui lòng nhập số điện thoại');
    try {
      if (customerForm.id) {
        await api.put(`/customers/${customerForm.id}`, customerForm);
        toast.success('Cập nhật khách hàng thành công!');
      } else {
        await api.post('/customers', customerForm);
        toast.success('Thêm khách hàng thành công!');
      }
      setCustomerModal(false);
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu khách hàng');
    }
  };

  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!promoForm.code) return toast.error('Vui lòng nhập mã khuyến mãi');
    try {
      await api.post('/promotions', promoForm);
      toast.success('Tạo mã voucher thành công!');
      setPromoModal(false);
      loadPromotions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi tạo voucher');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TOP TABS CONTROLLER */}
      <div
        className="mockup-panel"
        style={{
          padding: '6px',
          display: 'flex',
          gap: '8px',
          borderRadius: '12px',
          background: 'rgba(28, 17, 10, 0.95)',
        }}
      >
        {isAdmin && (
          <button
            type="button"
            className="btn"
            style={{
              flex: 1,
              background: activeTab === 'staff' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
              color: activeTab === 'staff' ? '#ffffff' : '#c4a482',
              fontWeight: 800,
              fontSize: '0.86rem',
              padding: '10px 14px',
              border: activeTab === 'staff' ? '1.5px solid #fbbf24' : 'none',
              boxShadow: activeTab === 'staff' ? '0 4px 12px rgba(217, 119, 6, 0.35)' : 'none',
            }}
            onClick={() => setActiveTab('staff')}
          >
            👥 TÀI KHOẢN NHÂN VIÊN
          </button>
        )}

        <button
          type="button"
          className="btn"
          style={{
            flex: 1,
            background: activeTab === 'customers' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
            color: activeTab === 'customers' ? '#ffffff' : '#c4a482',
            fontWeight: 800,
            fontSize: '0.86rem',
            padding: '10px 14px',
            border: activeTab === 'customers' ? '1.5px solid #fbbf24' : 'none',
            boxShadow: activeTab === 'customers' ? '0 4px 12px rgba(217, 119, 6, 0.35)' : 'none',
          }}
          onClick={() => setActiveTab('customers')}
        >
          👤 HỘI VIÊN &amp; TÍCH ĐIỂM THỰC TẾ
        </button>

        <button
          type="button"
          className="btn"
          style={{
            flex: 1,
            background: activeTab === 'promotions' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
            color: activeTab === 'promotions' ? '#ffffff' : '#c4a482',
            fontWeight: 800,
            fontSize: '0.86rem',
            padding: '10px 14px',
            border: activeTab === 'promotions' ? '1.5px solid #fbbf24' : 'none',
            boxShadow: activeTab === 'promotions' ? '0 4px 12px rgba(217, 119, 6, 0.35)' : 'none',
          }}
          onClick={() => setActiveTab('promotions')}
        >
          🎁 MÃ GIẢM GIÁ &amp; VOUCHER
        </button>
      </div>

      {/* 2. TAB CONTENT: TÀI KHOẢN NHÂN VIÊN */}
      {activeTab === 'staff' && isAdmin && (
        <div className="mockup-split-grid">
          {/* Staff List */}
          <div className="mockup-panel">
            <div className="mockup-panel-header">
              <div className="mockup-panel-title">
                <span>👥</span>
                <span>DANH SÁCH NHÂN VIÊN ({users.length} NHÂN VIÊN)</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
              <table className="mockup-table">
                <thead>
                  <tr>
                    <th>Mã NV</th>
                    <th>Họ và Tên</th>
                    <th>Tài khoản</th>
                    <th>Vai trò</th>
                    <th style={{ textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelected = selectedUser?.id === u.id;
                    return (
                      <tr
                        key={u.id}
                        onClick={() => selectStaffRow(u)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(217, 119, 6, 0.22)' : undefined,
                          borderLeft: isSelected ? '3px solid #fbbf24' : '3px solid transparent',
                        }}
                      >
                        <td style={{ fontWeight: 700, color: '#fbbf24' }}>{u.code || `NV00${u.id}`}</td>
                        <td style={{ fontWeight: 600, color: '#fef3c7' }}>{u.full_name}</td>
                        <td style={{ color: '#d5bba2' }}>{u.username}</td>
                        <td>
                          <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {u.role_name || u.role}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: u.is_active ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '0.78rem' }}>
                            {u.is_active ? '● Hoạt động' : '○ Tạm khóa'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Staff Form */}
          <div className="mockup-panel">
            <div className="mockup-panel-header">
              <div className="mockup-panel-title">
                <span>📝</span>
                <span>{selectedUser ? `SỬA NHÂN VIÊN: ${selectedUser.full_name}` : 'THÊM NHÂN VIÊN MỚI'}</span>
              </div>
            </div>

            <div className="mockup-panel-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label">MÃ NHÂN VIÊN:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={staffForm.code}
                    onChange={(e) => setStaffForm({ ...staffForm, code: e.target.value })}
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
                <div>
                  <label className="form-label">VAI TRÒ (ROLE):</label>
                  <select
                    className="form-select"
                    value={staffForm.role_id}
                    onChange={(e) => setStaffForm({ ...staffForm, role_id: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.label || r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">HỌ VÀ TÊN:</label>
                <input
                  type="text"
                  className="form-input"
                  value={staffForm.full_name}
                  onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label">TÊN ĐĂNG NHẬP:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={staffForm.username}
                    onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
                <div>
                  <label className="form-label">MẬT KHẨU {selectedUser ? '(Để trống nếu không đổi)' : ''}:</label>
                  <input
                    type="password"
                    className="form-input"
                    value={staffForm.password}
                    onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                    placeholder={selectedUser ? '••••••••' : 'Nhập mật khẩu'}
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label">SỐ ĐIỆN THOẠI:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
                <div>
                  <label className="form-label">TRẠNG THÁI HOẠT ĐỘNG:</label>
                  <select
                    className="form-select"
                    value={staffForm.is_active}
                    onChange={(e) => setStaffForm({ ...staffForm, is_active: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    <option value={1}>Đang hoạt động</option>
                    <option value={0}>Đã tạm khóa / Nghỉ việc</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}
                  onClick={() => {
                    setSelectedUser(null);
                    setStaffForm({
                      code: `NV00${users.length + 1}`,
                      username: '',
                      password: '',
                      full_name: '',
                      birthday: '1995-01-01',
                      gender: 'Nam',
                      phone: '',
                      email: '',
                      role_id: 2,
                      is_active: 1,
                    });
                  }}
                >
                  ➕ LÀM MỚI FORM
                </button>

                {selectedUser ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1, background: 'linear-gradient(135deg, #d97706, #b45309)', borderColor: '#d97706', fontWeight: 800 }}
                    onClick={() => handleSaveStaff(false)}
                  >
                    💾 LƯU THAY ĐỔI
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1, background: 'linear-gradient(135deg, #15803d, #166534)', borderColor: '#15803d', fontWeight: 800 }}
                    onClick={() => handleSaveStaff(true)}
                  >
                    + THÊM NHÂN VIÊN
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB CONTENT: HỘI VIÊN & TÍCH ĐIỂM THỰC TẾ */}
      {activeTab === 'customers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 4 Membership Tiers Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <div className="mockup-panel" style={{ padding: '14px 18px', borderLeft: '4px solid #d97706' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.8rem' }}>🥉</span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(217, 119, 6, 0.2)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>TÍCH 10K = 1 ĐIỂM</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fef3c7', marginTop: '6px' }}>HẠNG ĐỒNG</div>
              <div style={{ fontSize: '0.78rem', color: '#c4a482' }}>Chi tiêu: Dưới 500.000 đ • Tiêu chuẩn</div>
            </div>

            <div className="mockup-panel" style={{ padding: '14px 18px', borderLeft: '4px solid #94a3b8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.8rem' }}>🥈</span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(148, 163, 184, 0.2)', color: '#cbd5e1', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>GIẢM 5% MỌI ĐƠN</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fef3c7', marginTop: '6px' }}>HẠNG BẠC</div>
              <div style={{ fontSize: '0.78rem', color: '#c4a482' }}>Chi tiêu: Từ 500.000 đ ➔ 2.000.000 đ</div>
            </div>

            <div className="mockup-panel" style={{ padding: '14px 18px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.8rem' }}>👑</span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>GIẢM 10% MỌI ĐƠN</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fef3c7', marginTop: '6px' }}>HẠNG VÀNG</div>
              <div style={{ fontSize: '0.78rem', color: '#c4a482' }}>Chi tiêu: Từ 2.000.000 đ ➔ 5.000.000 đ</div>
            </div>

            <div className="mockup-panel" style={{ padding: '14px 18px', borderLeft: '4px solid #38bdf8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.8rem' }}>💎</span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>GIẢM 15% VIP</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fef3c7', marginTop: '6px' }}>KIM CƯƠNG</div>
              <div style={{ fontSize: '0.78rem', color: '#c4a482' }}>Chi tiêu: Từ 5.000.000 đ trở lên</div>
            </div>
          </div>

          {/* Customers Table */}
          <div className="mockup-panel">
            <div className="mockup-panel-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
              <div className="mockup-panel-title">
                <span>👤</span>
                <span>DANH SÁCH KHÁCH HÀNG &amp; THÀNH VIÊN ({customers.length} HỘI VIÊN)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="🔍 Tìm theo Tên / SĐT..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  style={{ width: '200px', padding: '6px 10px', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', borderColor: '#d97706', fontWeight: 800 }}
                  onClick={() => {
                    setCustomerForm({ id: null, phone: '', name: '', birthday: '', tier_id: 1 });
                    setCustomerModal(true);
                  }}
                >
                  ➕ THÊM KHÁCH HÀNG
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
              <table className="mockup-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Số điện thoại</th>
                    <th>Tên khách hàng</th>
                    <th>Hạng thành viên</th>
                    <th style={{ textAlign: 'right' }}>Điểm tích lũy</th>
                    <th style={{ textAlign: 'right' }}>Tổng chi tiêu</th>
                    <th style={{ textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .filter((c) => !customerSearch || c.phone?.includes(customerSearch) || c.name?.toLowerCase().includes(customerSearch.toLowerCase()))
                    .map((c, idx) => (
                      <tr key={c.id}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 800, color: '#fbbf24' }}>{c.phone}</td>
                        <td style={{ fontWeight: 700, color: '#fef3c7' }}>{c.name || 'Khách vãng lai'}</td>
                        <td>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              background: c.tier_id === 4 ? 'rgba(56, 189, 248, 0.2)' : c.tier_id === 3 ? 'rgba(245, 158, 11, 0.2)' : c.tier_id === 2 ? 'rgba(148, 163, 184, 0.2)' : 'rgba(217, 119, 6, 0.2)',
                              color: c.tier_id === 4 ? '#38bdf8' : c.tier_id === 3 ? '#fbbf24' : c.tier_id === 2 ? '#cbd5e1' : '#d97706',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}
                          >
                            {c.tier_id === 4 ? '💎 Kim Cương (-15%)' : c.tier_id === 3 ? '👑 Vàng (-10%)' : c.tier_id === 2 ? '🥈 Bạc (-5%)' : '🥉 Đồng (Chuẩn)'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#34d399' }}>
                          {c.points_balance || 0} điểm ({fmt((c.points_balance || 0) * 1000)})
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#fef3c7' }}>
                          {fmt(c.total_spent)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            style={{ borderColor: '#4a2c18', color: '#fbbf24', padding: '3px 8px', fontSize: '0.76rem' }}
                            onClick={() => {
                              setCustomerForm({
                                id: c.id,
                                phone: c.phone,
                                name: c.name || '',
                                birthday: c.birthday ? c.birthday.split('T')[0] : '',
                                tier_id: c.tier_id || 1,
                              });
                              setCustomerModal(true);
                            }}
                          >
                            ✏️ Sửa
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT: MÃ GIẢM GIÁ & VOUCHER */}
      {activeTab === 'promotions' && (
        <div className="mockup-panel">
          <div className="mockup-panel-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div className="mockup-panel-title">
              <span>🎁</span>
              <span>DANH SÁCH MÃ GIẢM GIÁ &amp; VOUCHER ({promotions.length} MÃ)</span>
            </div>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', borderColor: '#d97706', fontWeight: 800 }}
                onClick={() => setPromoModal(true)}
              >
                ➕ TẠO VOUCHER MỚI
              </button>
            )}
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
            <table className="mockup-table">
              <thead>
                <tr>
                  <th>Mã Voucher</th>
                  <th>Tên chương trình</th>
                  <th>Mức giảm giá</th>
                  <th>Đơn tối thiểu</th>
                  <th>Thời hạn</th>
                  <th style={{ textAlign: 'center' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => {
                  const isPct = p.type === 'percent_order' || p.type === 'happy_hour';
                  return (
                    <tr key={p.id}>
                      <td>
                        <span
                          style={{
                            background: 'rgba(217, 119, 6, 0.25)',
                            color: '#fbbf24',
                            border: '1px dashed #d97706',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontWeight: 800,
                            letterSpacing: '0.5px',
                          }}
                        >
                          🏷️ {p.code}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: '#fef3c7' }}>{p.name}</td>
                      <td style={{ color: '#4ade80', fontWeight: 800 }}>
                        {isPct ? `Giảm ${p.value}%` : `Giảm ${fmt(p.value)}`}
                      </td>
                      <td style={{ color: '#d5bba2' }}>{fmt(p.min_order_value)}</td>
                      <td style={{ color: '#d5bba2', fontSize: '0.78rem' }}>
                        {p.start_date?.slice(0, 10)} ➔ {p.end_date?.slice(0, 10)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: p.is_active ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '0.78rem' }}>
                          {p.is_active ? '● Đang áp dụng' : '○ Tạm dừng'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: THÊM / SỬA KHÁCH HÀNG */}
      {customerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
          <div className="animate-fade-in" style={{ background: '#1c120b', borderRadius: '14px', maxWidth: '440px', width: '100%', border: '2px solid rgba(245, 158, 11, 0.4)', padding: '20px', color: '#fdf8f0' }}>
            <h3 style={{ margin: '0 0 14px', color: '#fbbf24', fontSize: '1.15rem', fontWeight: 800 }}>
              {customerForm.id ? 'SỬA THÔNG TIN KHÁCH HÀNG' : 'THÊM KHÁCH HÀNG MỚI'}
            </h3>
            <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label">SỐ ĐIỆN THOẠI:</label>
                <input
                  type="text"
                  className="form-input"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  placeholder="0901234567"
                  style={{ width: '100%', padding: '8px' }}
                  required
                />
              </div>
              <div>
                <label className="form-label">HỌ VÀ TÊN:</label>
                <input
                  type="text"
                  className="form-input"
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  placeholder="Nguyễn Văn A"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              <div>
                <label className="form-label">HẠNG THÀNH VIÊN:</label>
                <select
                  className="form-select"
                  value={customerForm.tier_id}
                  onChange={(e) => setCustomerForm({ ...customerForm, tier_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value={1}>🥉 Đồng (Tiêu chuẩn)</option>
                  <option value={2}>🥈 Bạc (Giảm 5%)</option>
                  <option value={3}>👑 Vàng (Giảm 10%)</option>
                  <option value={4}>💎 Kim Cương (Giảm 15%)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn btn-outline" style={{ borderColor: '#4a2c18', color: '#d5bba2' }} onClick={() => setCustomerModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', borderColor: '#d97706', fontWeight: 800 }}>
                  LƯU THÔNG TIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO VOUCHER */}
      {promoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
          <div className="animate-fade-in" style={{ background: '#1c120b', borderRadius: '14px', maxWidth: '440px', width: '100%', border: '2px solid rgba(245, 158, 11, 0.4)', padding: '20px', color: '#fdf8f0' }}>
            <h3 style={{ margin: '0 0 14px', color: '#fbbf24', fontSize: '1.15rem', fontWeight: 800 }}>
              TẠO MÃ GIẢM GIÁ / VOUCHER MỚI
            </h3>
            <form onSubmit={handleSavePromo} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label">MÃ VOUCHER:</label>
                <input
                  type="text"
                  className="form-input"
                  value={promoForm.code}
                  onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                  placeholder="COFFEE15"
                  style={{ width: '100%', padding: '8px', textTransform: 'uppercase', fontWeight: 800 }}
                  required
                />
              </div>
              <div>
                <label className="form-label">TÊN CHƯƠNG TRÌNH:</label>
                <input
                  type="text"
                  className="form-input"
                  value={promoForm.name}
                  onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })}
                  placeholder="Giảm 15% tri ân khách hàng"
                  style={{ width: '100%', padding: '8px' }}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label">LOẠI GIẢM GIÁ:</label>
                  <select
                    className="form-select"
                    value={promoForm.type}
                    onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    <option value="percent_order">Giảm theo %</option>
                    <option value="amount_order">Giảm số tiền cố định</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">GIÁ TRỊ GIẢM:</label>
                  <input
                    type="number"
                    className="form-input"
                    value={promoForm.value}
                    onChange={(e) => setPromoForm({ ...promoForm, value: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', fontWeight: 800, color: '#4ade80' }}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="form-label">ĐƠN HÀNG TỐI THIỂU (VNĐ):</label>
                <input
                  type="number"
                  className="form-input"
                  value={promoForm.min_order_value}
                  onChange={(e) => setPromoForm({ ...promoForm, min_order_value: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn btn-outline" style={{ borderColor: '#4a2c18', color: '#d5bba2' }} onClick={() => setPromoModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #15803d, #166534)', borderColor: '#15803d', fontWeight: 800 }}>
                  LƯU MÃ VOUCHER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

