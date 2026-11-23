import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Shifts() {
  const { user } = useAuth();

  // Khách hàng tuyệt đối không có quyền vào xem hoặc sửa ca trực
  if (user?.role === 'customer') {
    return <Navigate to="/customer" replace />;
  }

  const isManagerOrAdmin = user && ['admin', 'manager'].includes(user.role);

  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [myOnly, setMyOnly] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState('weekly'); // 'weekly' or 'list'

  // Weekly timetable navigation (offset in weeks from current week)
  const [weekOffset, setWeekOffset] = useState(0);

  // Modals
  const [quickScheduleModal, setQuickScheduleModal] = useState(null); // { user, dateStr, dayName, displayDate }
  const [shiftDetailModal, setShiftDetailModal] = useState(null); // shift object
  const [reassignUserId, setReassignUserId] = useState('');
  const [swapTargetShiftId, setSwapTargetShiftId] = useState('');
  const [showSwapSection, setShowSwapSection] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Quick Schedule Form
  const [quickForm, setQuickForm] = useState({
    shift_type: '☀️ Ca Sáng (06:30 - 14:30)',
    note: '',
    status: 'Chưa bắt đầu',
  });

  // Manual List Form
  const [form, setForm] = useState({
    shift_code: '',
    user_id: '',
    shift_type: '☀️ Ca Sáng (06:30 - 14:30)',
    shift_date: new Date().toISOString().split('T')[0],
    status: 'Chưa bắt đầu',
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
      const allUsers = staffRes.data?.data?.users || [];
      // Chỉ lấy tài khoản nhân viên nội bộ, loại bỏ hoàn toàn tài khoản khách hàng
      const staffOnly = allUsers.filter((u) => {
        const rName = String(u.role_name || u.role || '').toLowerCase();
        const rLabel = String(u.role_label || '').toLowerCase();
        return (
          rName !== 'customer' &&
          !rLabel.includes('khách') &&
          (['admin', 'manager', 'cashier', 'barista', 'waiter', 'warehouse'].includes(rName) ||
            (u.role_id && u.role_id < 6))
        );
      });
      setUsers(staffOnly);
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
      shift_date: s.shift_date ? s.shift_date.split('T')[0] : new Date().toISOString().split('T')[0],
      status: s.status,
      note: s.note || '',
    });
  };

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

  // Lọc nhân sự theo vai trò
  const displayUsers = useMemo(() => {
    let list = users && users.length > 0 ? users : [];
    if (!list.length && shifts && shifts.length > 0) {
      const map = new Map();
      shifts.forEach((s) => {
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
      list = Array.from(map.values());
    }

    return list.filter((u) => {
      const rName = String(u.role_name || u.role || '').toLowerCase();
      if (myOnly && u.id !== user?.id) return false;
      if (roleFilter === 'all') return true;
      if (roleFilter === 'barista') return rName === 'barista';
      if (roleFilter === 'cashier') return rName === 'cashier';
      if (roleFilter === 'waiter') return rName === 'waiter';
      if (roleFilter === 'warehouse') return rName === 'warehouse';
      if (roleFilter === 'manager') return rName === 'manager' || rName === 'admin';
      return true;
    });
  }, [users, shifts, myOnly, user, roleFilter]);

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

  // Pagination for list
  const totalPages = Math.ceil(filteredShifts.length / pageSize) || 1;
  const pagedShifts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredShifts.slice(start, start + pageSize);
  }, [filteredShifts, page, pageSize]);

  const goToPage = (p) => {
    setPage(Math.max(1, Math.min(totalPages, p)));
  };

  // Helper badge style (Chuẩn hóa màu Pastel SaaS F&B)
  const getShiftBadge = (type) => {
    if (!type) return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', label: 'Nghỉ', icon: '' };
    if (type.includes('Sáng')) return { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: 'Ca Sáng', icon: '', time: '06:30 - 14:30' };
    if (type.includes('Chiều') || type.includes('Tối')) return { bg: '#EEF2FF', color: '#4338CA', border: '#C7D2FE', label: 'Ca Chiều/Tối', icon: '', time: '14:30 - 22:30' };
    return { bg: '#ECFDF5', color: '#15803D', border: '#BBF7D0', label: 'Hành Chính', icon: '', time: '08:00 - 17:00' };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Đang làm việc': return '#10b981'; // Xanh lá
      case 'Đã hoàn thành': return '#38bdf8'; // Xanh dương
      case 'Vắng có lý do': return '#ef4444'; // Đỏ
      default: return '#f59e0b'; // Vàng cam (Chưa bắt đầu)
    }
  };

  // ====================== CÁC HÀNH ĐỘNG NGHIỆP VỤ ======================

  // 1. Tự động xếp lịch cả tuần cho nhân sự
  const handleGenerateWeek = async () => {
    if (!isManagerOrAdmin) {
      return toast.error('Chỉ Quản lý hoặc Admin mới có quyền tự động xếp lịch tuần!');
    }
    const mondayStr = currentWeekDays[0]?.dateStr;
    if (!window.confirm(`Xác nhận tự động xếp ca trực mẫu cho toàn bộ nhân viên trong tuần từ ${mondayStr}?`)) return;

    try {
      setIsGenerating(true);
      const res = await api.post('/work-shifts/generate-week', { start_date: mondayStr });
      toast.success(res.data?.message || 'Đã tạo lịch trực cả tuần thành công! 📅');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi tự động xếp lịch');
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Xóa lịch của cả tuần
  const handleClearWeek = async () => {
    if (!isManagerOrAdmin) return toast.error('Bạn không có quyền thao tác!');
    const startStr = currentWeekDays[0]?.dateStr;
    const endStr = currentWeekDays[6]?.dateStr;
    if (!window.confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ ca trực trong tuần từ ${startStr} đến ${endStr} để xếp lại từ đầu?`)) return;

    try {
      const res = await api.delete('/work-shifts/week', {
        params: { start_date: startStr, end_date: endStr },
      });
      toast.success(res.data?.message || 'Đã xóa lịch ca tuần này!');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  // 3. Mở Modal Xếp ca nhanh khi bấm vào ô trống
  const handleOpenQuickSchedule = (u, d) => {
    if (!isManagerOrAdmin) {
      return toast('Chỉ Quản lý mới có quyền xếp ca trực!', { icon: 'ℹ️' });
    }
    setQuickScheduleModal({
      user: u,
      dateStr: d.dateStr,
      dayName: d.dayName,
      displayDate: d.displayDate,
    });
    setQuickForm({
      shift_type: '☀️ Ca Sáng (06:30 - 14:30)',
      note: (u.role_name === 'barista' || u.role === 'barista') ? 'Pha chế quầy Bar' : 'Thu ngân / Phục vụ',
      status: d.isToday ? 'Đang làm việc' : 'Chưa bắt đầu',
    });
  };

  // 4. Lưu Xếp ca nhanh
  const handleSaveQuickSchedule = async () => {
    if (!quickScheduleModal) return;
    try {
      await api.post('/work-shifts', {
        user_id: quickScheduleModal.user.id,
        shift_date: quickScheduleModal.dateStr,
        shift_type: quickForm.shift_type,
        status: quickForm.status,
        note: quickForm.note,
      });
      toast.success(`Đã xếp ca cho ${quickScheduleModal.user.full_name} ngày ${quickScheduleModal.displayDate}! 🎯`);
      setQuickScheduleModal(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xếp ca');
    }
  };

  // 5. Mở Modal Chi tiết ca & Đổi người trực
  const handleOpenShiftDetail = (shift) => {
    setShiftDetailModal(shift);
    setReassignUserId('');
    setSwapTargetShiftId('');
    setShowSwapSection(false);
  };

  // 6. Đổi nhân viên trực (Reassign Staff)
  const handleReassignStaff = async () => {
    if (!shiftDetailModal || !reassignUserId) {
      return toast.error('Vui lòng chọn nhân viên mới cần thay thế vào ca!');
    }
    try {
      const res = await api.put(`/work-shifts/${shiftDetailModal.id}/assign-staff`, {
        new_user_id: parseInt(reassignUserId, 10),
      });
      toast.success(res.data?.message || 'Đã đổi người trực thành công! 🔄');
      setShiftDetailModal(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi đổi nhân viên');
    }
  };

  // 7. Hoán đổi ca trực giữa 2 nhân viên (Swap Shifts)
  const handleSwapShifts = async () => {
    if (!shiftDetailModal || !swapTargetShiftId) {
      return toast.error('Vui lòng chọn ca trực của nhân viên khác để hoán đổi!');
    }
    try {
      const res = await api.post('/work-shifts/swap', {
        shift_id_1: shiftDetailModal.id,
        shift_id_2: parseInt(swapTargetShiftId, 10),
      });
      toast.success(res.data?.message || 'Đã hoán đổi ca trực thành công! 🔀');
      setShiftDetailModal(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi hoán đổi ca');
    }
  };

  // 8. Đổi trạng thái nhanh trong modal
  const handleQuickChangeStatus = async (newStatus) => {
    if (!shiftDetailModal) return;
    try {
      await api.put(`/work-shifts/${shiftDetailModal.id}`, {
        ...shiftDetailModal,
        status: newStatus,
      });
      toast.success(`Đã cập nhật trạng thái: ${newStatus}`);
      setShiftDetailModal((prev) => (prev ? { ...prev, status: newStatus } : null));
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật');
    }
  };

  // 9. Xóa ca trực trong modal
  const handleDeleteShiftFromModal = async () => {
    if (!shiftDetailModal) return;
    if (!window.confirm(`Xác nhận xóa ca trực #${shiftDetailModal.shift_code} của ${shiftDetailModal.user_name}?`)) return;
    try {
      await api.delete(`/work-shifts/${shiftDetailModal.id}`);
      toast.success('Đã xóa ca trực thành công!');
      setShiftDetailModal(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa ca');
    }
  };

  // 10. CRUD thủ công ở List View
  const handleCreate = async () => {
    if (!form.user_id) return toast.error('Vui lòng chọn nhân viên cho ca trực!');
    try {
      await api.post('/work-shifts', form);
      toast.success('Thêm ca trực thành công! 📅');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleUpdate = async () => {
    if (!selectedShift) return toast.error('Vui lòng chọn ca trực cần sửa!');
    try {
      await api.put(`/work-shifts/${selectedShift.id}`, form);
      toast.success('Cập nhật ca trực thành công!');
      await loadData();
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
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa ca trực');
    }
  };

  // Danh sách các ca khác trong tuần này để hoán đổi
  const otherShiftsInWeek = useMemo(() => {
    if (!shiftDetailModal) return [];
    return shifts.filter(
      (s) =>
        s.id !== shiftDetailModal.id &&
        s.user_id !== shiftDetailModal.user_id &&
        currentWeekDays.some((d) => (s.shift_date ? s.shift_date.split('T')[0] : '') === d.dateStr)
    );
  }, [shiftDetailModal, shifts, currentWeekDays]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TOP HEADER & NAVIGATION */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(32, 20, 13, 0.75)',
          backdropFilter: 'blur(16px)',
          padding: '14px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(245, 158, 11, 0.18)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.6rem' }}>📅</span>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: '1.2rem',
                color: '#1E1815',
                fontFamily: "'Be Vietnam Pro', sans-serif",
              }}
            >
              Lịch phân ca &amp; điều phối nhân sự
            </div>
            <div style={{ fontSize: '0.8rem', color: '#73675E', marginTop: '2px' }}>
              Xếp ca làm việc, điều chuyển và hoán đổi ca giữa các nhân viên linh hoạt
            </div>
          </div>
        </div>

        {/* View Toggle Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            background: '#F1ECE4',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid #EAE3DA',
          }}
        >
          <button
            type="button"
            className="ui-btn"
            style={{
              background: viewMode === 'weekly' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'weekly' ? '#1E1815' : '#73675E',
              fontWeight: 700,
              padding: '6px 14px',
              borderRadius: '8px',
              border: viewMode === 'weekly' ? '1px solid #EAE3DA' : 'none',
              boxShadow: viewMode === 'weekly' ? '0 1px 3px rgba(28, 20, 14, 0.05)' : 'none',
              fontSize: '0.82rem'
            }}
            onClick={() => setViewMode('weekly')}
          >
            Thời khóa biểu tuần
          </button>
          <button
            type="button"
            className="ui-btn"
            style={{
              background: viewMode === 'list' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'list' ? '#1E1815' : '#73675E',
              fontWeight: 700,
              padding: '6px 14px',
              borderRadius: '8px',
              border: viewMode === 'list' ? '1px solid #EAE3DA' : 'none',
              boxShadow: viewMode === 'list' ? '0 1px 3px rgba(28, 20, 14, 0.05)' : 'none',
              fontSize: '0.82rem'
            }}
            onClick={() => setViewMode('list')}
          >
            Danh sách phân ca &amp; Chỉnh sửa
          </button>
        </div>
      </div>

      {/* 2. VIEW 1: THỜI KHÓA BIỂU CẢ TUẦN (WEEKLY TIMETABLE MATRIX) */}
      {viewMode === 'weekly' && (
        <div className="mockup-panel">
          <div
            className="mockup-panel-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '12px 18px',
            }}
          >
            {/* Week navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                style={{
                  background: weekOffset === 0 ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '6px 14px',
                }}
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
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fbbf24', marginLeft: '6px' }}>
                Tuần từ {currentWeekDays[0]?.displayDate} đến {currentWeekDays[6]?.displayDate}
              </span>
            </div>

            {/* Quick Actions for Managers */}
            {isManagerOrAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: 'linear-gradient(135deg, #15803d, #166534)',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(21, 128, 61, 0.3)',
                  }}
                  disabled={isGenerating}
                  onClick={handleGenerateWeek}
                  title="Tự động xếp ca mẫu cho toàn bộ nhân sự chưa có ca trong tuần này"
                >
                  <span>⚡</span>
                  <span>{isGenerating ? 'ĐANG XẾP CA...' : 'XẾP LỊCH TỰ ĐỘNG TUẦN NÀY'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{
                    borderColor: '#ef4444',
                    color: '#fca5a5',
                    fontWeight: 600,
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                  }}
                  onClick={handleClearWeek}
                  title="Xóa nhanh toàn bộ ca trong tuần này để làm lại"
                >
                  <span>🗑️ Xóa tuần này</span>
                </button>
              </div>
            )}
          </div>

          {/* Subheader: Bộ lọc theo vai trò & Gợi ý hướng dẫn */}
          <div
            style={{
              padding: '10px 18px',
              background: 'rgba(24, 15, 10, 0.85)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.12)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {/* Role Filter Chips */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#c4a482', fontWeight: 600, marginRight: '4px' }}>
                Bộ lọc:
              </span>
              {[
                { id: 'all', label: 'Tất cả nhân sự' },
                { id: 'barista', label: '☕ Pha chế' },
                { id: 'cashier', label: '💵 Thu ngân' },
                { id: 'waiter', label: '🍽️ Phục vụ' },
                { id: 'warehouse', label: '📦 Thủ kho' },
                { id: 'manager', label: '👔 Quản lý' },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: roleFilter === r.id ? '#d97706' : 'rgba(255, 255, 255, 0.05)',
                    color: roleFilter === r.id ? '#ffffff' : '#fef3c7',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    padding: '3px 8px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                  }}
                  onClick={() => setRoleFilter(r.id)}
                >
                  {r.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: myOnly ? '#78350f' : 'rgba(255, 255, 255, 0.05)',
                  color: myOnly ? '#fef3c7' : '#c4a482',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  padding: '3px 8px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                }}
                onClick={() => setMyOnly(!myOnly)}
              >
                👤 Ca của tôi
              </button>
            </div>

            {/* Instruction tooltip */}
            <div style={{ fontSize: '0.75rem', color: '#a8a29e' }}>
              💡 <span style={{ color: '#fbbf24' }}>Mẹo:</span> Bấm vào ô ca trực để <strong style={{ color: '#fef3c7' }}>đổi người / đổi ca</strong>, bấm vào ô trống để <strong style={{ color: '#fef3c7' }}>phân ca nhanh</strong>.
            </div>
          </div>

          {/* Weekly Timetable Grid Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="mockup-table" style={{ width: '100%', minWidth: '980px' }}>
              <thead>
                <tr>
                  <th style={{ width: '180px', background: 'rgba(45, 27, 18, 0.95)', color: '#fef3c7' }}>
                    Nhân viên
                  </th>
                  {currentWeekDays.map((d) => (
                    <th
                      key={d.dateStr}
                      style={{
                        textAlign: 'center',
                        background: d.isToday ? 'rgba(217, 119, 6, 0.35)' : 'rgba(45, 27, 18, 0.95)',
                        color: '#fef3c7',
                        fontWeight: 700,
                        borderRight: '1px solid rgba(245, 158, 11, 0.15)',
                        width: '11.5%',
                      }}
                    >
                      <div>{d.dayName}</div>
                      <div style={{ fontSize: '0.75rem', opacity: d.isToday ? 1 : 0.8 }}>{d.displayDate}</div>
                      {d.isToday && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            background: '#f59e0b',
                            color: '#1a0f08',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontWeight: 800,
                          }}
                        >
                          Hôm nay
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#a8a29e' }}>
                      Không có nhân viên nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  displayUsers.map((u) => {
                    return (
                      <tr key={u.id}>
                        <td
                          style={{
                            background: 'rgba(28, 18, 11, 0.85)',
                            borderRight: '1px solid rgba(245, 158, 11, 0.15)',
                            padding: '10px',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#fef3c7', fontSize: '0.88rem' }}>{u.full_name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#c4a482', marginTop: '2px' }}>
                            <span style={{ fontWeight: 600 }}>{u.code || `NV00${u.id}`}</span> • {u.role_label || u.role_name}
                          </div>
                        </td>

                        {currentWeekDays.map((d) => {
                          const shift = shifts.find(
                            (s) =>
                              s.user_id === u.id &&
                              (s.shift_date ? s.shift_date.split('T')[0] : '') === d.dateStr
                          );
                          const badge = getShiftBadge(shift?.shift_type);

                          return (
                            <td
                              key={d.dateStr}
                              style={{
                                padding: '6px',
                                textAlign: 'center',
                                background: d.isToday ? 'rgba(245, 158, 11, 0.08)' : undefined,
                                borderRight: '1px solid rgba(245, 158, 11, 0.12)',
                                verticalAlign: 'middle',
                              }}
                            >
                              {shift ? (
                                <div
                                  onClick={() => handleOpenShiftDetail(shift)}
                                  style={{
                                    background: badge.bg,
                                    color: badge.color,
                                    border: `1px solid ${badge.border}`,
                                    borderRadius: '8px',
                                    padding: '7px 5px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                                    position: 'relative',
                                  }}
                                  title={`Ca: ${shift.shift_type}\nTrạng thái: ${shift.status}\nGhi chú: ${shift.note || 'Không có'}\n(Bấm để đổi người hoặc đổi ca)`}
                                >
                                  {/* Status indicator dot */}
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      width: '7px',
                                      height: '7px',
                                      borderRadius: '50%',
                                      background: getStatusColor(shift.status),
                                    }}
                                  />

                                  <div style={{ fontWeight: 800, fontSize: '0.76rem' }}>
                                    {badge.icon} {badge.label}
                                  </div>
                                  <div style={{ fontSize: '0.68rem', opacity: 0.9, marginTop: '1px' }}>
                                    {badge.time}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '0.64rem',
                                      fontWeight: 600,
                                      marginTop: '3px',
                                      color: getStatusColor(shift.status),
                                      background: 'rgba(0,0,0,0.06)',
                                      padding: '1px 3px',
                                      borderRadius: '3px',
                                    }}
                                  >
                                    {shift.status}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleOpenQuickSchedule(u, d)}
                                  style={{
                                    border: '1px dashed rgba(245, 158, 11, 0.25)',
                                    borderRadius: '8px',
                                    padding: '12px 4px',
                                    color: '#78716c',
                                    cursor: isManagerOrAdmin ? 'pointer' : 'default',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '2px',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (isManagerOrAdmin) {
                                      e.currentTarget.style.borderColor = '#d97706';
                                      e.currentTarget.style.background = 'rgba(217, 119, 6, 0.1)';
                                      e.currentTarget.style.color = '#fbbf24';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (isManagerOrAdmin) {
                                      e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.25)';
                                      e.currentTarget.style.background = 'transparent';
                                      e.currentTarget.style.color = '#78716c';
                                    }
                                  }}
                                  title={isManagerOrAdmin ? `Bấm để xếp ca cho ${u.full_name} ngày ${d.displayDate}` : 'Nghỉ'}
                                >
                                  {isManagerOrAdmin ? (
                                    <>
                                      <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>+</span>
                                      <span style={{ fontSize: '0.65rem' }}>Xếp ca</span>
                                    </>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem' }}>—</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: '12px 18px',
              background: 'rgba(32, 20, 13, 0.75)',
              borderTop: '1px solid rgba(245, 158, 11, 0.18)',
              fontSize: '0.82rem',
              color: '#c4a482',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '0.76rem' }}>
              <span>Chú thích trạng thái:</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span> Đang làm việc
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8' }}></span> Đã hoàn thành
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></span> Chưa bắt đầu
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span> Vắng có lý do
              </span>
            </div>

            <button
              className="btn btn-sm btn-outline"
              style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fef3c7', fontWeight: 700, background: 'transparent' }}
              onClick={() => setViewMode('list')}
            >
              Chuyển sang Bảng danh sách chi tiết ➡
            </button>
          </div>
        </div>
      )}

      {/* 3. VIEW 2: DANH SÁCH CHI TIẾT & CHỈNH SỬA THỦ CÔNG */}
      {viewMode === 'list' && (
        <div className="mockup-split-grid">
          {/* LEFT: DANH SÁCH CA TRỰC */}
          <div className="mockup-panel">
            <div className="mockup-panel-header">
              <div className="mockup-panel-title">
                <span>📅</span>
                <span>DANH SÁCH CA TRỰC TOÀN HỆ THỐNG</span>
              </div>
              <div style={{ width: '220px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="🔍 Tìm kiếm mã ca, tên NV..."
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
                    <th style={{ width: '95px' }}>Mã NV</th>
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
                          <td>{s.shift_date ? s.shift_date.split('T')[0] : '2026-11-23'}</td>
                          <td>
                            <span style={{ color: getStatusColor(s.status), fontWeight: 700 }}>
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

            {/* Pagination */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: 'rgba(32, 20, 13, 0.75)',
                borderTop: '1px solid rgba(245, 158, 11, 0.18)',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{
                    padding: '4px 10px',
                    fontWeight: 700,
                    borderColor: 'rgba(245, 158, 11, 0.25)',
                    color: '#fef3c7',
                    background: 'transparent',
                  }}
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
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
                  style={{
                    padding: '4px 10px',
                    fontWeight: 700,
                    borderColor: 'rgba(245, 158, 11, 0.25)',
                    color: '#fef3c7',
                    background: 'transparent',
                  }}
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                >
                  &gt;
                </button>
              </div>

              <span style={{ fontSize: '0.82rem', color: '#c4a482', fontWeight: 600 }}>
                Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filteredShifts.length)} trong số {filteredShifts.length} ca trực
              </span>
            </div>
          </div>

          {/* RIGHT: THÔNG TIN CHI TIẾT VÀ NÚT ĐIỀU CHỈNH */}
          <div className="mockup-panel">
            <div className="mockup-panel-header">
              <div className="mockup-panel-title">
                <span>📝</span>
                <span>THÔNG TIN CA TRỰC</span>
              </div>
            </div>

            <div className="mockup-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  ID Lịch trực :
                </label>
                <input
                  className="form-input"
                  value={form.shift_code}
                  onChange={(e) => setForm({ ...form, shift_code: e.target.value })}
                  placeholder="Tự sinh nếu để trống (VD: CA1123-1)"
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  Nhân viên trực ca :
                </label>
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
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  Ngày trực :
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={form.shift_date}
                  onChange={(e) => setForm({ ...form, shift_date: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  Ca trực :
                </label>
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
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  Ghi chú công việc :
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Ghi chú phân công ca..."
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  Trạng thái :
                </label>
                <select
                  className="form-select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="Chưa bắt đầu">Chưa bắt đầu</option>
                  <option value="Đang làm việc">Đang làm việc</option>
                  <option value="Đã hoàn thành">Đã hoàn thành</option>
                  <option value="Vắng có lý do">Vắng có lý do</option>
                </select>
              </div>

              {/* 3 Circular Action Buttons */}
              {isManagerOrAdmin && (
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
              )}

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

      {/* ====================== MODAL 1: XẾP CA NHANH TRỰC TIẾP TỪ Ô LỊCH TUẦN ====================== */}
      {quickScheduleModal &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '16px',
            }}
          >
            <div
              className="mockup-panel animate-fade-in"
              style={{
                width: '100%',
                maxWidth: '480px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
              }}
            >
              <div
                className="mockup-panel-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fef3c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📅</span>
                  <span>XẾP CA TRỰC NHANH</span>
                </div>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#a8a29e', fontSize: '1.2rem', cursor: 'pointer' }}
                  onClick={() => setQuickScheduleModal(null)}
                >
                  ✕
                </button>
              </div>

              <div className="mockup-panel-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(245, 158, 11, 0.15)',
                  }}
                >
                  <div style={{ fontSize: '0.82rem', color: '#c4a482' }}>Phân công nhân viên:</div>
                  <div style={{ fontWeight: 800, color: '#fef3c7', fontSize: '1rem', marginTop: '2px' }}>
                    {quickScheduleModal.user.full_name} ({quickScheduleModal.user.code || `NV00${quickScheduleModal.user.id}`})
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#fbbf24', marginTop: '2px' }}>
                    Vai trò: {quickScheduleModal.user.role_label || quickScheduleModal.user.role_name} • Ngày: {quickScheduleModal.dayName}, {quickScheduleModal.displayDate}
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>
                    Chọn Ca làm việc :
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    {[
                      { id: '☀️ Ca Sáng (06:30 - 14:30)', label: '☀️ Ca Sáng', time: '06:30 - 14:30' },
                      { id: '🌙 Ca Chiều / Tối (14:30 - 22:30)', label: '🌙 Ca Tối', time: '14:30 - 22:30' },
                      { id: '💼 Ca Hành Chính (08:00 - 17:00)', label: '💼 Ca Hành Chính', time: '08:00 - 17:00' },
                    ].map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setQuickForm({ ...quickForm, shift_type: c.id })}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: quickForm.shift_type === c.id ? '2px solid #d97706' : '1px solid rgba(245, 158, 11, 0.2)',
                          background: quickForm.shift_type === c.id ? 'rgba(217, 119, 6, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#fef3c7' }}>{c.label}</span>
                        <span style={{ fontSize: '0.8rem', color: '#c4a482' }}>{c.time}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>
                    Ghi chú phân công :
                  </label>
                  <input
                    className="form-input"
                    value={quickForm.note}
                    onChange={(e) => setQuickForm({ ...quickForm, note: e.target.value })}
                    placeholder="VD: Phụ trách máy pha Espresso 1..."
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flex: 1, borderColor: '#523423', color: '#c4a482' }}
                    onClick={() => setQuickScheduleModal(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      flex: 2,
                      background: 'linear-gradient(135deg, #15803d, #166534)',
                      fontWeight: 800,
                      border: 'none',
                    }}
                    onClick={handleSaveQuickSchedule}
                  >
                    ✅ XÁC NHẬN PHÂN CA
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ====================== MODAL 2: CHI TIẾT CA & ĐỔI NGƯỜI / HOÁN ĐỔI CA ====================== */}
      {shiftDetailModal &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '16px',
            }}
          >
            <div
              className="mockup-panel animate-fade-in"
              style={{
                width: '100%',
                maxWidth: '520px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
              }}
            >
              <div
                className="mockup-panel-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fef3c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔄</span>
                  <span>ĐIỀU CHỈNH CA TRỰC #{shiftDetailModal.shift_code}</span>
                </div>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#a8a29e', fontSize: '1.2rem', cursor: 'pointer' }}
                  onClick={() => setShiftDetailModal(null)}
                >
                  ✕
                </button>
              </div>

              <div className="mockup-panel-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Thông tin ca hiện tại */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(245, 158, 11, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: '#c4a482' }}>Nhân viên hiện tại:</span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: getStatusColor(shiftDetailModal.status),
                        background: 'rgba(0,0,0,0.2)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      • {shiftDetailModal.status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, color: '#fef3c7', fontSize: '1.05rem' }}>
                    {shiftDetailModal.user_name} ({shiftDetailModal.user_code || `NV00${shiftDetailModal.user_id}`})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#fbbf24' }}>
                    {shiftDetailModal.shift_type} • Ngày: {shiftDetailModal.shift_date ? shiftDetailModal.shift_date.split('T')[0] : ''}
                  </div>
                  {shiftDetailModal.note && (
                    <div style={{ fontSize: '0.74rem', color: '#a8a29e', fontStyle: 'italic', marginTop: '2px' }}>
                      Ghi chú: {shiftDetailModal.note}
                    </div>
                  )}
                </div>

                {/* KHỐI 1: ĐỔI NHÂN VIÊN TRỰC (THAY NGƯỜI) */}
                {isManagerOrAdmin && (
                  <div
                    style={{
                      background: 'rgba(217, 119, 6, 0.08)',
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>👤</span>
                      <span>ĐỔI NHÂN VIÊN VÀO CA TRỰC NÀY:</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        className="form-select"
                        value={reassignUserId}
                        onChange={(e) => setReassignUserId(e.target.value)}
                        style={{ flex: 1, fontSize: '0.84rem' }}
                      >
                        <option value="">-- Chọn nhân viên thay thế --</option>
                        {users
                          .filter((u) => u.id !== shiftDetailModal.user_id)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.code || `NV00${u.id}`} - {u.full_name} ({u.role_label || u.role_name})
                            </option>
                          ))}
                      </select>

                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: 'linear-gradient(135deg, #d97706, #b45309)',
                          color: '#ffffff',
                          fontWeight: 700,
                          padding: '6px 12px',
                          whiteSpace: 'nowrap',
                        }}
                        disabled={!reassignUserId}
                        onClick={handleReassignStaff}
                      >
                        🔄 Xác nhận đổi
                      </button>
                    </div>
                  </div>
                )}

                {/* KHỐI 2: HOÁN ĐỔI CA TRỰC GIỮA 2 NHÂN VIÊN (SWAP SHIFTS) */}
                {isManagerOrAdmin && (
                  <div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{
                        width: '100%',
                        borderColor: 'rgba(245, 158, 11, 0.35)',
                        color: '#fef3c7',
                        fontWeight: 700,
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onClick={() => setShowSwapSection(!showSwapSection)}
                    >
                      <span>🔀</span>
                      <span>{showSwapSection ? 'Thu gọn hoán đổi ca' : 'Hoán đổi ca với nhân viên khác'}</span>
                    </button>

                    {showSwapSection && (
                      <div
                        style={{
                          marginTop: '8px',
                          background: 'rgba(56, 189, 248, 0.08)',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', color: '#bae6fd', fontWeight: 600, marginBottom: '6px' }}>
                          Chọn ca trực trong tuần để hoán đổi vị trí:
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select
                            className="form-select"
                            value={swapTargetShiftId}
                            onChange={(e) => setSwapTargetShiftId(e.target.value)}
                            style={{ flex: 1, fontSize: '0.82rem' }}
                          >
                            <option value="">-- Chọn ca trực muốn đổi --</option>
                            {otherShiftsInWeek.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.user_name} ({s.shift_type} • {s.shift_date ? s.shift_date.split('T')[0] : ''})
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{
                              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                              color: '#ffffff',
                              fontWeight: 700,
                              padding: '6px 12px',
                              whiteSpace: 'nowrap',
                            }}
                            disabled={!swapTargetShiftId}
                            onClick={handleSwapShifts}
                          >
                            🔀 Đổi ca
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* KHỐI 3: CẬP NHẬT TRẠNG THÁI CA */}
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#c4a482', fontWeight: 600, marginBottom: '6px' }}>
                    Cập nhật trạng thái ca trực:
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { status: 'Chưa bắt đầu', color: '#f59e0b' },
                      { status: 'Đang làm việc', color: '#10b981' },
                      { status: 'Đã hoàn thành', color: '#38bdf8' },
                      { status: 'Vắng có lý do', color: '#ef4444' },
                    ].map((st) => (
                      <button
                        key={st.status}
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: shiftDetailModal.status === st.status ? st.color : 'rgba(255, 255, 255, 0.05)',
                          color: shiftDetailModal.status === st.status ? '#ffffff' : '#fef3c7',
                          border: `1px solid ${shiftDetailModal.status === st.status ? st.color : 'rgba(245, 158, 11, 0.2)'}`,
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          padding: '4px 10px',
                        }}
                        onClick={() => handleQuickChangeStatus(st.status)}
                      >
                        {st.status}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid rgba(245, 158, 11, 0.15)' }}>
                  {isManagerOrAdmin ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ borderColor: '#ef4444', color: '#fca5a5', fontWeight: 700 }}
                      onClick={handleDeleteShiftFromModal}
                    >
                      🗑️ Xóa ca trực này
                    </button>
                  ) : <div />}

                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ background: '#78350f', borderColor: '#78350f', fontWeight: 700 }}
                    onClick={() => setShiftDetailModal(null)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
