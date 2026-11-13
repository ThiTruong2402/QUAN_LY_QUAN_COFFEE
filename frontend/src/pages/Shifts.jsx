import { useEffect, useState, useMemo } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Shifts() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [myOnly, setMyOnly] = useState(false);
  const [viewMode, setViewMode] = useState('weekly'); // 'weekly' or 'list'

  // Weekly timetable navigation (offset in weeks from current week)
  const [weekOffset, setWeekOffset] = useState(0);

  // Form
  const [form, setForm] = useState({
    shift_code: 'LT001',
    user_id: '',
    shift_type: '☀️ Ca Sáng (06:30 - 14:30)',
    shift_date: new Date().toISOString().split('T')[0],
    status: 'Đang làm việc',
    note: '',
  });

  const loadData = async () => {
    try {
      const shiftRes = await api.get('/work-shifts');
      const shiftList = shiftRes.data?.data || [];
      setShifts(shiftList);
      if (shiftList.length > 0 && !selectedShift) {
        selectRow(shiftList[0]);
      }
    } catch {
      toast.error('Lỗi tải danh sách ca trực');
    }

    try {
      const staffRes = await api.get('/staff');
      const userList = staffRes.data?.data?.users || [];
      setUsers(userList);
    } catch {
      // Non-blocking fallback
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectRow = (s) => {
    setSelectedShift(s);
    setForm({
      shift_code: s.shift_code,
      user_id: s.user_id,
      shift_type: s.shift_type,
      shift_date: s.shift_date ? s.shift_date.split('T')[0] : '2026-10-21',
      status: s.status,
      note: s.note || '',
    });
  };

  const handleCreate = async () => {
    if (!form.user_id) return toast.error('Vui lòng chọn nhân viên cho ca trực!');
    try {
      await api.post('/work-shifts', form);
      toast.success('Thêm ca trực thành công! 📅');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleUpdate = async () => {
    if (!selectedShift) return toast.error('Vui lòng chọn ca trực cần sửa!');
    try {
      await api.put(`/work-shifts/${selectedShift.id}`, form);
      toast.success('Cập nhật ca trực thành công!');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật');
    }
  };

  const handleDelete = async () => {
    if (!selectedShift) return toast.error('Vui lòng chọn ca trực cần xóa!');
    if (!window.confirm('Bạn có chắc muốn xóa ca trực này?')) return;
    try {
      await api.delete(`/work-shifts/${selectedShift.id}`);
      toast.success('Đã xóa ca trực!');
      setSelectedShift(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa ca trực');
    }
  };

  // Lấy danh sách nhân sự cần hiển thị trên thời khóa biểu (kết hợp từ danh sách nhân viên hoặc ca trực hiện có)
  const displayUsers = useMemo(() => {
    if (users && users.length > 0) return users;
    if (shifts && shifts.length > 0) {
      const map = new Map();
      shifts.forEach(s => {
        if (!map.has(s.user_id)) {
          map.set(s.user_id, {
            id: s.user_id,
            full_name: s.user_name,
            code: s.user_code,
            role_name: s.role_name,
            role_label: s.role_label,
          });
        }
      });
      return Array.from(map.values());
    }
    return [];
  }, [users, shifts]);

  // Compute 7 days of the selected week (Mon - Sun)
  const currentWeekDays = useMemo(() => {
    const today = new Date();
    const day = today.getDay(); // 0 is Sun, 1 is Mon
    const diffToMonday = (day === 0 ? -6 : 1 - day) + weekOffset * 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);

    const formatLocalDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    const todayStr = formatLocalDate(today);

    const days = [];
    const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = formatLocalDate(d);
      const displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
      days.push({
        dateStr: iso,
        label: `${dayNames[i]} (${displayDate})`,
        dayName: dayNames[i],
        displayDate,
        isToday: iso === todayStr,
      });
    }
    return days;
  }, [weekOffset]);

  // Filtered shifts for table list
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (myOnly && s.user_id !== user?.id) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.shift_code.toLowerCase().includes(q) ||
        (s.user_name || '').toLowerCase().includes(q) ||
        (s.user_code || '').toLowerCase().includes(q)
      );
    });
  }, [shifts, myOnly, user, search]);

  // Stateful pagination
  const totalPages = Math.ceil(filteredShifts.length / pageSize) || 1;
  const pagedShifts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredShifts.slice(start, start + pageSize);
  }, [filteredShifts, page, pageSize]);

  // Change page with safety clamp
  const goToPage = (p) => {
    const valid = Math.max(1, Math.min(totalPages, p));
    setPage(valid);
  };

  // Helper to get shift styling
  const getShiftBadge = (type) => {
    if (!type) return { bg: '#f1f5f9', color: '#64748b', label: 'Nghỉ', icon: '🛌' };
    if (type.includes('Sáng')) return { bg: '#fef3c7', color: '#92400e', border: '#fde68a', label: 'Ca Sáng', icon: '🌅', time: '06:30 - 14:30' };
    if (type.includes('Chiều') || type.includes('Tối')) return { bg: '#ffedd5', color: '#9a3412', border: '#fed7aa', label: 'Ca Tối', icon: '🌙', time: '14:30 - 22:30' };
    return { bg: '#dcfce7', color: '#166534', border: '#bbf7d0', label: 'Hành Chính', icon: '💼', time: '08:00 - 17:00' };
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TOP HEADER & VIEW MODE SELECTOR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(32, 20, 13, 0.75)', backdropFilter: 'blur(16px)', padding: '14px 20px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.18)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>📅</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fef3c7', fontFamily: "'Playfair Display', Georgia, serif" }}>
              QUẢN LÝ LỊCH TRỰC NHÂN VIÊN
            </div>
          </div>
        </div>

        {/* View Toggle Buttons */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.05)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: viewMode === 'weekly' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
              color: viewMode === 'weekly' ? '#ffffff' : '#d5bba2',
              fontWeight: 700,
              padding: '8px 14px',
              borderRadius: '6px',
            }}
            onClick={() => setViewMode('weekly')}
          >
            🗓️ THỜI KHÓA BIỂU CẢ TUẦN
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: viewMode === 'list' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
              color: viewMode === 'list' ? '#ffffff' : '#d5bba2',
              fontWeight: 700,
              padding: '8px 14px',
              borderRadius: '6px',
            }}
            onClick={() => setViewMode('list')}
          >
            📋 BẢNG PHÂN CA & CHỈNH SỬA
          </button>
        </div>
      </div>

      {/* 2. VIEW 1: THỜI KHÓA BIỂU CẢ TUẦN (WEEKLY TIMETABLE MATRIX) */}
      {viewMode === 'weekly' && (
        <div className="mockup-panel">
          <div className="mockup-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div className="mockup-panel-title">
              <span>🗓️</span>
              <span>THỜI KHÓA BIỂU CA TRỰC CẢ TUẦN (TẤT CẢ NHÂN VIÊN)</span>
            </div>

            {/* Week navigation buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ borderColor: 'rgba(245, 158, 11, 0.35)', color: '#fef3c7', fontWeight: 600, padding: '6px 12px' }}
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                ◀ Tuần trước
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#fff', fontWeight: 700, padding: '6px 14px' }}
                onClick={() => setWeekOffset(0)}
              >
                Tuần này
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ borderColor: 'rgba(245, 158, 11, 0.35)', color: '#fef3c7', fontWeight: 600, padding: '6px 12px' }}
                onClick={() => setWeekOffset((w) => w + 1)}
              >
                Tuần sau ▶
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24', marginLeft: '8px' }}>
                Từ {currentWeekDays[0]?.displayDate} đến {currentWeekDays[6]?.displayDate}
              </span>
            </div>
          </div>

          {/* Quick Legend Bar */}
          <div style={{ display: 'flex', gap: '16px', padding: '10px 18px', background: 'rgba(32, 20, 13, 0.75)', borderBottom: '1px solid rgba(245, 158, 11, 0.18)', fontSize: '0.82rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: '#fef3c7' }}>Chú thích ca:</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              🌅 <strong>Ca Sáng:</strong> 06:30 - 14:30
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(234, 88, 12, 0.2)', color: '#fb923c', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(234, 88, 12, 0.3)' }}>
              🌙 <strong>Ca Tối:</strong> 14:30 - 22:30
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              💼 <strong>Hành Chính:</strong> 08:00 - 17:00
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8', padding: '2px 8px', borderRadius: '4px' }}>
              🛌 <strong>Nghỉ</strong>
            </span>
          </div>

          {/* Weekly Timetable Grid Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="mockup-table" style={{ width: '100%', minWidth: '950px' }}>
              <thead>
                <tr>
                  <th style={{ width: '170px', background: 'rgba(45, 27, 18, 0.95)', color: '#fef3c7' }}>Nhân viên</th>
                  {currentWeekDays.map((d) => (
                    <th
                      key={d.dateStr}
                      style={{
                        textAlign: 'center',
                        background: d.isToday ? 'rgba(217, 119, 6, 0.35)' : 'rgba(45, 27, 18, 0.95)',
                        color: '#fef3c7',
                        fontWeight: 700,
                        borderRight: '1px solid rgba(245, 158, 11, 0.15)',
                      }}
                    >
                      <div>{d.dayName}</div>
                      <div style={{ fontSize: '0.75rem', opacity: d.isToday ? 1 : 0.8 }}>{d.displayDate}</div>
                      {d.isToday && <span style={{ fontSize: '0.65rem', background: '#f59e0b', color: '#1a0f08', padding: '1px 4px', borderRadius: '3px', fontWeight: 800 }}>Hôm nay</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayUsers.map((u) => {
                  return (
                    <tr key={u.id}>
                      <td style={{ background: 'rgba(28, 18, 11, 0.85)', borderRight: '1px solid rgba(245, 158, 11, 0.15)' }}>
                        <div style={{ fontWeight: 700, color: '#fef3c7', fontSize: '0.88rem' }}>{u.full_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#c4a482' }}>
                          <span style={{ fontWeight: 600 }}>{u.code || `NV00${u.id}`}</span> • {u.role_label || u.role_name}
                        </div>
                      </td>

                      {currentWeekDays.map((d) => {
                        // Find shift for this user and this day
                        const shift = shifts.find(
                          (s) => s.user_id === u.id && (s.shift_date ? s.shift_date.split('T')[0] : '') === d.dateStr
                        );
                        const badge = getShiftBadge(shift?.shift_type);

                        return (
                          <td
                            key={d.dateStr}
                            style={{
                              padding: '8px',
                              textAlign: 'center',
                              background: d.isToday ? 'rgba(245, 158, 11, 0.08)' : undefined,
                              borderRight: '1px solid rgba(245, 158, 11, 0.12)',
                            }}
                          >
                            {shift ? (
                              <div
                                onClick={() => {
                                  selectRow(shift);
                                  setViewMode('list');
                                }}
                                style={{
                                  background: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                  borderRadius: '6px',
                                  padding: '6px 4px',
                                  cursor: 'pointer',
                                  transition: 'transform 0.15s ease',
                                }}
                                title={`Mã: ${shift.shift_code} - ${shift.note || ''} (Bấm để xem/sửa)`}
                              >
                                <div style={{ fontWeight: 800, fontSize: '0.78rem' }}>
                                  {badge.icon} {badge.label}
                                </div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>
                                  {badge.time}
                                </div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 600, marginTop: '2px', opacity: 0.75 }}>
                                  {shift.shift_code}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: '0.75rem' }}>-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '12px 18px', background: 'rgba(32, 20, 13, 0.75)', borderTop: '1px solid rgba(245, 158, 11, 0.18)', fontSize: '0.82rem', color: '#c4a482', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              className="btn btn-sm btn-outline"
              style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fef3c7', fontWeight: 700, background: 'transparent' }}
              onClick={() => setViewMode('list')}
            >
              Chuyển sang Bảng chi tiết ➡
            </button>
          </div>
        </div>
      )}

      {/* 3. VIEW 2: DANH SÁCH CHI TIẾT & CHỈNH SỬA (MATCHING IMAGE6.PNG WITH FULL WORKING PAGINATION) */}
      {viewMode === 'list' && (
        <div className="mockup-split-grid">
          {/* LEFT: DANH SÁCH CA TRỰC */}
          <div className="mockup-panel">
            <div className="mockup-panel-header">
              <div className="mockup-panel-title">
                <span>📅</span>
                <span>DANH SÁCH CA TRỰC</span>
              </div>
              <div style={{ width: '220px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="🔍 Tìm kiếm ca..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ overflowX: 'auto', minHeight: '380px' }}>
              <table className="mockup-table">
                <thead>
                  <tr>
                    <th style={{ width: '95px' }}>Mã Ca</th>
                    <th>Ca Làm</th>
                    <th style={{ width: '100px' }}>Mã NV</th>
                    <th>Tên Nhân Viên</th>
                    <th style={{ width: '100px' }}>Ngày Trực</th>
                    <th style={{ width: '120px' }}>Trạng Thái</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedShifts.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#8c674b' }}>
                        Không tìm thấy ca trực nào phù hợp.
                      </td>
                    </tr>
                  ) : (
                    pagedShifts.map((s) => {
                      const isSelected = selectedShift?.id === s.id;
                      const isAbsent = s.status?.includes('Vắng');
                      return (
                        <tr
                          key={s.id}
                          onClick={() => selectRow(s)}
                          className={isSelected ? 'selected' : ''}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ fontWeight: 700 }}>{s.shift_code}</td>
                          <td>{s.shift_type}</td>
                          <td style={{ fontWeight: 600 }}>{s.user_code || `NV00${s.user_id}`}</td>
                          <td style={{ fontWeight: 600 }}>{s.user_name}</td>
                          <td>{s.shift_date ? s.shift_date.split('T')[0] : '2026-10-21'}</td>
                          <td>
                            <span style={{ color: isAbsent ? '#dc2626' : '#0284c7', fontWeight: 600 }}>
                              • {s.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* FULLY FUNCTIONAL PAGINATION AT BOTTOM */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: 'rgba(32, 20, 13, 0.75)', borderTop: '1px solid rgba(245, 158, 11, 0.18)', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{ padding: '4px 10px', fontWeight: 700, borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fef3c7', background: 'transparent' }}
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  title="Trang trước"
                >
                  &lt;
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    className="btn btn-sm"
                    style={{
                      padding: '4px 12px',
                      fontWeight: 700,
                      background: page === pageNum ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(255, 255, 255, 0.05)',
                      color: page === pageNum ? '#ffffff' : '#fef3c7',
                      border: page === pageNum ? '1px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.2)',
                    }}
                    onClick={() => goToPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{ padding: '4px 10px', fontWeight: 700, borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fef3c7', background: 'transparent' }}
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  title="Trang sau"
                >
                  &gt;
                </button>
              </div>

              <span style={{ fontSize: '0.82rem', color: '#c4a482', fontWeight: 600 }}>
                Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filteredShifts.length)} trong số {filteredShifts.length} ca trực
              </span>
            </div>
          </div>

          {/* RIGHT: THÔNG TIN CA TRỰC (MATCHING IMAGE6.PNG) */}
          <div className="mockup-panel">
            <div className="mockup-panel-header">
              <div className="mockup-panel-title">
                <span>📝</span>
                <span>THÔNG TIN CA TRỰC</span>
              </div>
            </div>

            <div className="mockup-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>ID Lịch trực :</label>
                <input
                  className="form-input"
                  value={form.shift_code}
                  onChange={(e) => setForm({ ...form, shift_code: e.target.value })}
                  placeholder="CA1021-001"
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>Mã / Tên Nhân viên :</label>
                <select
                  className="form-select"
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: parseInt(e.target.value) })}
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code || `NV00${u.id}`} - {u.full_name} ({u.role_label || u.role_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>Ngày trực :</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.shift_date}
                  onChange={(e) => setForm({ ...form, shift_date: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>Ca trực :</label>
                <select
                  className="form-select"
                  value={form.shift_type}
                  onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
                >
                  <option value="☀️ Ca Sáng (06:30 - 14:30)">☀️ Ca Sáng (06:30 - 14:30)</option>
                  <option value="🌙 Ca Chiều / Tối (14:30 - 22:30)">🌙 Ca Chiều / Tối (14:30 - 22:30)</option>
                  <option value="💼 Ca Hành Chính (08:00 - 17:00)">💼 Ca Hành Chính (08:00 - 17:00)</option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>Ghi chú công việc :</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Ghi chú phân công ca..."
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>Trạng thái :</label>
                <select
                  className="form-select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="Đang làm việc">Đang làm việc</option>
                  <option value="Đã hoàn thành">Đã hoàn thành</option>
                  <option value="Chưa bắt đầu">Chưa bắt đầu</option>
                  <option value="Vắng có lý do">Vắng có lý do</option>
                </select>
              </div>

              {/* 3 Circular Action Buttons (matching image6.png) */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '14px 0' }}>
                <button
                  type="button"
                  className="circle-btn circle-btn-green"
                  title="Thêm mới"
                  onClick={handleCreate}
                >
                  +
                </button>
                <button
                  type="button"
                  className="circle-btn circle-btn-blue"
                  title="Cập nhật"
                  onClick={handleUpdate}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="circle-btn circle-btn-red"
                  title="Xóa"
                  onClick={handleDelete}
                >
                  🗑️
                </button>
              </div>

              {/* Button: XEM LỊCH TRỰC CỦA MÌNH */}
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  background: '#78350f',
                  borderColor: '#78350f',
                  padding: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                onClick={() => setMyOnly(!myOnly)}
              >
                <span>📅</span>
                <span>{myOnly ? 'XEM TẤT CẢ LỊCH TRỰC' : 'XEM LỊCH TRỰC CỦA MÌNH'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
