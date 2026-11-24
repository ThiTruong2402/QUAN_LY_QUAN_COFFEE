import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const getRoleBadge = (roleName) => {
  switch (roleName) {
    case 'admin':
      return { label: 'Quản trị viên', cls: 'ui-badge-red' };
    case 'manager':
      return { label: 'Quản lý', cls: 'ui-badge-purple' };
    case 'cashier':
      return { label: 'Thu ngân', cls: 'ui-badge-green' };
    case 'barista':
      return { label: 'Pha chế', cls: 'ui-badge-blue' };
    case 'waiter':
      return { label: 'Phục vụ', cls: 'ui-badge-purple' };
    case 'warehouse':
      return { label: 'Thủ kho', cls: 'ui-badge-amber' };
    case 'customer':
      return { label: 'Khách hàng', cls: 'ui-badge-green' };
    default:
      return { label: roleName || 'Khác', cls: 'ui-badge-gray' };
  }
};

export default function Accounts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManageStaff = ['admin', 'manager'].includes(user?.role);
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' | 'customers' | 'promotions'

  // STAFF & USER ACCOUNTS STATE
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [accountRoleFilter, setAccountRoleFilter] = useState('all'); // 'all' | 'customer' | 'staff'
  const [accountSearch, setAccountSearch] = useState('');
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
    points_balance: 0,
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
    if (!canManageStaff) return;
    try {
      const res = await api.get('/staff');
      let userList = res.data.data.users || [];
      let roleList = res.data.data.roles || [];
      if (!isAdmin) {
        userList = userList.filter((u) => u.role !== 'admin');
        roleList = roleList.filter((r) => !['admin', 'manager'].includes(r.name));
      }
      setUsers(userList);
      setRoles(roleList);
      if (userList.length > 0 && !selectedUser) {
        selectStaffRow(userList[0]);
      }
    } catch {
      toast.error('Lỗi tải dữ liệu nhân viên');
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await api.get('/customers');
      const payload = res.data?.data || res.data || {};
      setCustomers(payload.customers || (Array.isArray(payload) ? payload : []));
      setTiers(payload.tiers || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi tải dữ liệu khách hàng');
    }
  };

  const loadPromotions = async () => {
    try {
      const res = await api.get('/promotions');
      const raw = res.data?.data;
      // FE-06: API /promotions trả về mảng trực tiếp trong data
      setPromotions(Array.isArray(raw) ? raw : (raw?.promotions || []));
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
    if (canManageStaff) {
      loadStaff();
    } else {
      setActiveTab('customers');
    }
    loadCustomers();
    loadPromotions();
  }, [user]);

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
    if (!isAdmin) {
      if (selectedUser?.role === 'admin') {
        return toast.error('Quản lý không có quyền sửa tài khoản Admin!');
      }
      const targetRole = roles.find((r) => r.id === staffForm.role_id);
      if (targetRole && ['admin', 'manager'].includes(targetRole.name)) {
        return toast.error('Quản lý chỉ có quyền quản lý nhân viên (Thu ngân, Pha chế, Phục vụ, Kho)!');
      }
    }
    try {
      if (isNew) {
        await api.post('/staff', staffForm);
        toast.success('Thêm tài khoản thành công!');
      } else {
        await api.put(`/staff/${selectedUser.id}`, staffForm);
        toast.success('Cập nhật tài khoản thành công!');
      }
      loadStaff();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleToggleActive = async (targetUser) => {
    const u = targetUser || selectedUser;
    if (!u) return;
    if (u.id === user?.id) return toast.error('Không thể tự khóa tài khoản của chính bạn!');
    if (!isAdmin && (u.role === 'admin' || u.role_name === 'admin')) {
      return toast.error('Quản lý không có quyền khóa tài khoản Quản trị viên (Admin)!');
    }
    const nextState = u.is_active ? 0 : 1;
    try {
      await api.put(`/staff/${u.id}`, { ...u, is_active: nextState });
      toast.success(nextState ? `Đã kích hoạt tài khoản ${u.full_name}` : `Đã tạm khóa tài khoản ${u.full_name}`);
      loadStaff();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi cập nhật trạng thái');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    const u = targetUser || selectedUser;
    if (!u) return toast.error('Vui lòng chọn tài khoản cần xóa!');
    if (u.id === user?.id) return toast.error('Không thể xóa tài khoản của chính bạn!');
    if (!window.confirm(`Bạn có chắc muốn xóa tài khoản "${u.full_name}" (${u.username})?`)) return;
    try {
      const res = await api.delete(`/staff/${u.id}`);
      toast.success(res.data?.message || 'Đã xóa tài khoản thành công!');
      if (selectedUser?.id === u.id) setSelectedUser(null);
      loadStaff();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi xóa tài khoản');
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
      {/* 1. TOP TABS CONTROLLER (Underline Tabs chuẩn SaaS F&B) */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #EAE3DA',
          borderRadius: '14px',
          padding: '6px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div className="ui-underline-tabs" style={{ marginBottom: 0 }}>
          {canManageStaff && (
            <button
              type="button"
              className={`ui-underline-tab ${activeTab === 'staff' ? 'active' : ''}`}
              onClick={() => setActiveTab('staff')}
            >
              Tài khoản &amp; Phân quyền
            </button>
          )}

          <button
            type="button"
            className={`ui-underline-tab ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            Hội viên &amp; Tích điểm
          </button>

          <button
            type="button"
            className={`ui-underline-tab ${activeTab === 'promotions' ? 'active' : ''}`}
            onClick={() => setActiveTab('promotions')}
          >
            Voucher &amp; Khuyến mãi
          </button>
        </div>

        {canManageStaff && activeTab === 'staff' && (
          <button
            type="button"
            className="ui-btn ui-btn-brand"
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            onClick={() => {
              setSelectedUser(null);
              setStaffForm({
                code: '',
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
            + Tạo tài khoản
          </button>
        )}
      </div>

      {/* 2. TAB CONTENT: TÀI KHOẢN HỆ THỐNG & KHÁCH HÀNG ĐĂNG KÝ */}
      {activeTab === 'staff' && canManageStaff && (() => {
        const customerUsers = users.filter((u) => u.role_name === 'customer' || (u.code && u.code.startsWith('KH')));
        const staffUsers = users.filter((u) => u.role_name !== 'customer' && (!u.code || !u.code.startsWith('KH')));
        
        const filteredUsers = users.filter((u) => {
          if (accountRoleFilter === 'customer') {
            if (u.role_name !== 'customer' && (!u.code || !u.code.startsWith('KH'))) return false;
          } else if (accountRoleFilter === 'staff') {
            if (u.role_name === 'customer' || (u.code && u.code.startsWith('KH'))) return false;
          }
          if (accountSearch.trim()) {
            const q = accountSearch.toLowerCase().trim();
            const name = String(u.full_name || '').toLowerCase();
            const phone = String(u.phone || '').toLowerCase();
            const username = String(u.username || '').toLowerCase();
            const code = String(u.code || '').toLowerCase();
            return name.includes(q) || phone.includes(q) || username.includes(q) || code.includes(q);
          }
          return true;
        });

        return (
          <div className="mockup-split-grid">
            {/* Account List */}
            <div className="mockup-panel">
              <div className="mockup-panel-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div className="mockup-panel-title">
                  <span>Danh sách tài khoản ({filteredUsers.length} / {users.length})</span>
                </div>
                {/* Search input */}
                <input
                  type="text"
                  className="form-input"
                  placeholder="🔍 Tìm theo Tên, SĐT, Mã..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  style={{ width: '210px', padding: '6px 10px', fontSize: '0.82rem' }}
                />
              </div>

              {/* Filter Pills */}
              <div style={{ padding: '10px 16px 4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setAccountRoleFilter('all')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: accountRoleFilter === 'all' ? '#d97706' : 'rgba(255,255,255,0.06)',
                    color: accountRoleFilter === 'all' ? '#ffffff' : '#c4a482',
                    border: accountRoleFilter === 'all' ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  Tất cả ({users.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAccountRoleFilter('customer')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: accountRoleFilter === 'customer' ? '#0d9488' : 'rgba(255,255,255,0.06)',
                    color: accountRoleFilter === 'customer' ? '#ffffff' : '#c4a482',
                    border: accountRoleFilter === 'customer' ? '1px solid #2dd4bf' : '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  🌟 Khách hàng đăng ký mới ({customerUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAccountRoleFilter('staff')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: accountRoleFilter === 'staff' ? '#2563eb' : 'rgba(255,255,255,0.06)',
                    color: accountRoleFilter === 'staff' ? '#ffffff' : '#c4a482',
                    border: accountRoleFilter === 'staff' ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  👔 Nhân sự nội bộ ({staffUsers.length})
                </button>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
                <table className="mockup-table">
                  <thead>
                    <tr>
                      <th>Mã TK</th>
                      <th>Họ và Tên</th>
                      <th>Tài khoản / SĐT</th>
                      <th>Vai trò</th>
                      <th>Ngày tạo</th>
                      <th style={{ textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const isSelected = selectedUser?.id === u.id;
                      const badge = getRoleBadge(u.role_name || u.role);
                      const isCust = u.role_name === 'customer' || (u.code && u.code.startsWith('KH'));
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
                          <td style={{ fontWeight: 700, color: isCust ? '#2dd4bf' : '#fbbf24' }}>
                            {u.code || (isCust ? `KH00${u.id}` : `NV00${u.id}`)}
                          </td>
                          <td style={{ fontWeight: 600, color: '#fef3c7' }}>{u.full_name}</td>
                          <td style={{ color: '#d5bba2' }}>{u.username}</td>
                          <td>
                            <span className={`ui-badge ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: '#c4a482' }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '---'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ color: u.is_active ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '0.78rem' }}>
                              {u.is_active ? '● Hoạt động' : '○ Tạm khóa'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {(() => {
                              const isSelf = u.id === user?.id;
                              const isTargetAdmin = u.role === 'admin' || u.role_name === 'admin';
                              const canLock = !isSelf && (isAdmin || !isTargetAdmin);
                              if (!canLock) {
                                return (
                                  <span
                                    title={isSelf ? 'Không thể tự khóa tài khoản của chính mình' : 'Chỉ Admin mới có quyền thao tác tài khoản Admin'}
                                    style={{ opacity: 0.35, cursor: 'not-allowed', fontSize: '1rem', padding: '2px 5px', display: 'inline-block' }}
                                  >
                                    🔒
                                  </span>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  title={u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                                  onClick={(e) => { e.stopPropagation(); handleToggleActive(u); }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    padding: '2px 5px',
                                    opacity: 0.85
                                  }}
                                >
                                  {u.is_active ? '🔒' : '🔓'}
                                </button>
                              );
                            })()}
                            {isAdmin && u.id !== user?.id && (
                              <button
                                type="button"
                                title="Xóa tài khoản"
                                onClick={(e) => { e.stopPropagation(); handleDeleteUser(u); }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '1rem',
                                  padding: '2px 5px',
                                  opacity: 0.85
                                }}
                              >
                                🗑️
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#c4a482' }}>
                          Không tìm thấy tài khoản nào phù hợp
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Account Form */}
            <div className="mockup-panel">
              <div className="mockup-panel-header">
                <div className="mockup-panel-title">
                  <span>📝</span>
                  <span>
                    {selectedUser
                      ? (selectedUser.role_name === 'customer'
                          ? `QUẢN LÝ TÀI KHOẢN KHÁCH: ${selectedUser.full_name}`
                          : `QUẢN LÝ NHÂN SỰ: ${selectedUser.full_name}`)
                      : 'THÊM TÀI KHOẢN MỚI'}
                  </span>
                </div>
              </div>

              <div className="mockup-panel-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="form-label">MÃ TÀI KHOẢN:</label>
                    <input
                      type="text"
                      className="form-input"
                      value={staffForm.code}
                      onChange={(e) => setStaffForm({ ...staffForm, code: e.target.value })}
                      style={{ width: '100%', padding: '8px' }}
                    />
                  </div>
                  <div>
                    <label className="form-label">Vai trò</label>
                    <select
                      className="form-select"
                      value={staffForm.role_id}
                      onChange={(e) => setStaffForm({ ...staffForm, role_id: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '8px' }}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id === 6 ? '🌟 Khách hàng (Đăng ký)' : r.label || r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Họ và tên</label>
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
                    <label className="form-label">Tên đăng nhập / Số điện thoại</label>
                    <input
                      type="text"
                      className="form-input"
                      value={staffForm.username}
                      onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                      style={{ width: '100%', padding: '8px' }}
                    />
                  </div>
                  <div>
                    <label className="form-label">Mật khẩu mới {selectedUser ? '(Để trống nếu không đổi)' : ''}</label>
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
                    <label className="form-label">Số điện thoại</label>
                    <input
                      type="text"
                      className="form-input"
                      value={staffForm.phone}
                      onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                      style={{ width: '100%', padding: '8px' }}
                    />
                  </div>
                  <div>
                    <label className="form-label">Trạng thái hoạt động</label>
                    <select
                      className="form-select"
                      value={staffForm.is_active}
                      onChange={(e) => setStaffForm({ ...staffForm, is_active: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '8px' }}
                    >
                      <option value={1}>Đang hoạt động</option>
                      <option value={0}>Đã tạm khóa / Vô hiệu hóa</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
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
                    <>
                      {(!isAdmin && (selectedUser.role === 'admin' || selectedUser.role_name === 'admin')) ? (
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled
                          style={{ flex: 1, opacity: 0.5, cursor: 'not-allowed', color: '#c4a482', fontWeight: 700 }}
                          title="Chỉ Admin mới có quyền sửa thông tin tài khoản Admin"
                        >
                          🔒 CHỈ ADMIN ĐƯỢC SỬA
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ flex: 1, background: 'linear-gradient(135deg, #d97706, #b45309)', borderColor: '#d97706', fontWeight: 800 }}
                          onClick={() => handleSaveStaff(false)}
                        >
                          💾 LƯU THAY ĐỔI
                        </button>
                      )}
                      {isAdmin && selectedUser.id !== user?.id && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', fontWeight: 700 }}
                          onClick={() => handleDeleteUser(selectedUser)}
                        >
                          🗑️ XÓA
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1, background: 'linear-gradient(135deg, #D97706, #B45309)', borderColor: '#D97706', fontWeight: 800, boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)' }}
                      onClick={() => handleSaveStaff(true)}
                    >
                      + THÊM TÀI KHOẢN
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                    setCustomerForm({ id: null, phone: '', name: '', birthday: '', tier_id: 1, points_balance: 0 });
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
                        <td style={{ fontWeight: 700, color: '#fef3c7' }}>{c.name || 'Khách'}</td>
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
                                points_balance: c.points_balance || 0,
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
        <div className="ui-modal-backdrop" onClick={() => setCustomerModal(false)}>
          <div className="ui-modal-box animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="ui-modal-header">
              <h3 className="ui-modal-title">
                {customerForm.id ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng mới'}
              </h3>
              <button type="button" className="ui-btn-icon" onClick={() => setCustomerModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveCustomer}>
              <div className="ui-modal-body">
                <div>
                  <label className="ui-modal-label">Số điện thoại *</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="0901234567"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="ui-modal-label">Họ và tên *</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="ui-modal-label">Hạng thành viên</label>
                    <select
                      className="ui-select"
                      value={customerForm.tier_id}
                      onChange={(e) => setCustomerForm({ ...customerForm, tier_id: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    >
                      <option value={1}>Đồng (Tiêu chuẩn)</option>
                      <option value={2}>Bạc (Giảm 5%)</option>
                      <option value={3}>Vàng (Giảm 10%)</option>
                      <option value={4}>Kim Cương (Giảm 15%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="ui-modal-label">Điểm tích lũy (1đ = 1.000đ)</label>
                    <input
                      type="number"
                      min={0}
                      className="ui-input"
                      value={customerForm.points_balance || 0}
                      onChange={(e) => setCustomerForm({ ...customerForm, points_balance: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      placeholder="0"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>
              <div className="ui-modal-footer">
                <button type="button" className="ui-btn ui-btn-outline" onClick={() => setCustomerModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="ui-btn ui-btn-brand">
                  Lưu thông tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO VOUCHER */}
      {promoModal && (
        <div className="ui-modal-backdrop" onClick={() => setPromoModal(false)}>
          <div className="ui-modal-box animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="ui-modal-header">
              <h3 className="ui-modal-title">Tạo mã giảm giá / Voucher mới</h3>
              <button type="button" className="ui-btn-icon" onClick={() => setPromoModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSavePromo}>
              <div className="ui-modal-body">
                <div>
                  <label className="ui-modal-label">Mã voucher *</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={promoForm.code}
                    onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                    placeholder="COFFEE15"
                    style={{ width: '100%', textTransform: 'uppercase', fontWeight: 800 }}
                    required
                  />
                </div>
                <div>
                  <label className="ui-modal-label">Tên chương trình *</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={promoForm.name}
                    onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })}
                    placeholder="Giảm 15% tri ân khách hàng"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="ui-modal-label">Loại giảm giá</label>
                    <select
                      className="ui-select"
                      value={promoForm.type}
                      onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="percent_order">Giảm theo %</option>
                      <option value="amount_order">Giảm số tiền cố định</option>
                    </select>
                  </div>
                  <div>
                    <label className="ui-modal-label">Giá trị giảm *</label>
                    <input
                      type="number"
                      className="ui-input"
                      value={promoForm.value}
                      onChange={(e) => setPromoForm({ ...promoForm, value: Number(e.target.value) })}
                      style={{ width: '100%', fontWeight: 800, color: '#34D399' }}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="ui-modal-label">Đơn hàng tối thiểu (VNĐ)</label>
                  <input
                    type="number"
                    className="ui-input"
                    value={promoForm.min_order_value}
                    onChange={(e) => setPromoForm({ ...promoForm, min_order_value: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div className="ui-modal-footer">
                <button type="button" className="ui-btn ui-btn-outline" onClick={() => setPromoModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="ui-btn ui-btn-brand">
                  Lưu mã voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

