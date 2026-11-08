import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function Staff() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form
  const [form, setForm] = useState({
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

  // Search
  const [searchField, setSearchField] = useState('full_name');
  const [searchValue, setSearchValue] = useState('');

  const loadData = async () => {
    try {
      const res = await api.get('/staff');
      setUsers(res.data.data.users);
      setRoles(res.data.data.roles);
      if (res.data.data.users.length > 0 && !selectedUser) {
        selectRow(res.data.data.users[0]);
      }
    } catch {
      toast.error('Lỗi tải dữ liệu nhân viên');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectRow = (u) => {
    setSelectedUser(u);
    setForm({
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

  const handleReset = () => {
    setSelectedUser(null);
    setForm({
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
    setSearchValue('');
  };

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.full_name) {
      return toast.error('Vui lòng nhập tài khoản, mật khẩu và họ tên!');
    }
    try {
      await api.post('/staff', form);
      toast.success('Thêm nhân viên thành công!');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi thêm nhân viên');
    }
  };

  const handleUpdate = async () => {
    if (!selectedUser) return toast.error('Vui lòng chọn nhân viên cần cập nhật!');
    try {
      await api.put(`/staff/${selectedUser.id}`, form);
      toast.success('Cập nhật nhân viên thành công!');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật');
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return toast.error('Vui lòng chọn nhân viên cần xóa!');
    if (!window.confirm(`Bạn có chắc muốn xóa nhân viên ${selectedUser.full_name}?`)) return;
    try {
      await api.delete(`/staff/${selectedUser.id}`);
      toast.success('Đã xóa nhân viên!');
      handleReset();
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa nhân viên');
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchValue) return true;
    const val = String(u[searchField] || '').toLowerCase();
    return val.includes(searchValue.toLowerCase());
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TOP FORM & SEARCH BOX (matching image5.png) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
        {/* Left: THÔNG TIN NHÂN VIÊN */}
        <div className="mockup-panel">
          <div className="mockup-panel-header">
            <div className="mockup-panel-title">
              <span>👤</span>
              <span>THÔNG TIN NHÂN VIÊN</span>
            </div>
          </div>
          <div className="mockup-panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Mã :</label>
              <input
                className="form-input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="NV001"
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Trạng thái :</label>
              <select
                className="form-select"
                value={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: parseInt(e.target.value) })}
              >
                <option value={1}>Hoạt động</option>
                <option value={0}>Nghỉ việc</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Tên :</label>
              <input
                className="form-input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Họ và tên"
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Chức vụ :</label>
              <select
                className="form-select"
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: parseInt(e.target.value) })}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Ngày sinh :</label>
              <input
                type="date"
                className="form-input"
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Điện thoại :</label>
              <input
                className="form-input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="090..."
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Giới tính :</label>
              <select
                className="form-select"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Email :</label>
              <input
                className="form-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@..."
              />
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Tên đăng nhập (username) :</label>
                <input
                  className="form-input"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="username"
                  disabled={!!selectedUser}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Mật khẩu :</label>
                <input
                  type="password"
                  className="form-input"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={selectedUser ? 'Nhập để đổi' : 'Mật khẩu'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: TÌM KIẾM */}
        <div className="mockup-panel">
          <div className="mockup-panel-header">
            <div className="mockup-panel-title">
              <span>🔍</span>
              <span>TÌM KIẾM</span>
            </div>
          </div>
          <div className="mockup-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>Thuộc tính tìm kiếm</label>
              <select
                className="form-select"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
              >
                <option value="full_name">Tên nhân viên</option>
                <option value="code">Mã nhân viên</option>
                <option value="phone">Số điện thoại</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>Giá trị tìm kiếm</label>
              <input
                className="form-input"
                placeholder="Nhập từ khóa cần tìm..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </div>

            <button
              className="btn btn-outline"
              style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fef3c7', fontWeight: 700, padding: '10px', marginTop: '10px', background: 'transparent' }}
              onClick={handleReset}
            >
              <span>🔄</span>
              <span>LÀM MỚI</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. ACTION BUTTONS BAR */}
      <div style={{ display: 'flex', gap: '12px', background: 'rgba(32, 20, 13, 0.75)', padding: '12px 18px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.18)', flexWrap: 'wrap' }}>
        <button
          className="btn"
          style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)', fontWeight: 700 }}
          onClick={handleCreate}
        >
          <span>➕</span>
          <span>THÊM MỚI</span>
        </button>

        <button
          className="btn"
          style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 700 }}
          onClick={handleUpdate}
        >
          <span>✏️</span>
          <span>CẬP NHẬT</span>
        </button>

        <button
          className="btn"
          style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.35)', fontWeight: 700 }}
          onClick={handleDelete}
        >
          <span>🗑️</span>
          <span>XÓA</span>
        </button>

        <button
          className="btn btn-outline"
          style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fef3c7', fontWeight: 700, background: 'transparent' }}
          onClick={() => window.print()}
        >
          <span>🖨️</span>
          <span>IN DANH SÁCH</span>
        </button>
      </div>

      {/* 3. DATA TABLE (matching image5.png) */}
      <div className="mockup-panel">
        <div style={{ overflowX: 'auto' }}>
          <table className="mockup-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>STT</th>
                <th style={{ width: '100px' }}>Mã nhân viên</th>
                <th>Tên nhân viên</th>
                <th style={{ width: '110px' }}>Ngày sinh</th>
                <th style={{ width: '80px' }}>Giới tính</th>
                <th>Email</th>
                <th>Chức vụ</th>
                <th>Điện thoại</th>
                <th>Trạng thái</th>
                <th style={{ width: '70px' }}>Pass</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u, idx) => {
                const isSelected = selectedUser?.id === u.id;
                return (
                  <tr
                    key={u.id}
                    onClick={() => selectRow(u)}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>{u.code || `NV00${u.id}`}</td>
                    <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                    <td>{u.birthday ? u.birthday.split('T')[0] : '1995-01-01'}</td>
                    <td>{u.gender || 'Nam'}</td>
                    <td>{u.email || `${u.username}@gmail.com`}</td>
                    <td><strong>{u.role_label || u.role_name}</strong></td>
                    <td>{u.phone || '0900000000'}</td>
                    <td>{u.is_active ? 'Hoạt động' : 'Nghỉ việc'}</td>
                    <td style={{ fontFamily: 'monospace' }}>***</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
