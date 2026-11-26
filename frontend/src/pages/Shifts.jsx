import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const MANUAL_STATUSES = ['Vắng có lý do', 'Nghỉ phép', 'Đã hủy'];
const ABSENCE_STATUSES = ['Vắng có lý do', 'Nghỉ phép'];
const GENERIC_SHIFT_NOTES = [
  'trực theo lịch tự động',
  'đã kiểm kê, ca sáng trực đầy đủ',
  'ca hành chính bình thường',
  'ca chiều theo phân công',
];
const ABSENCE_REASON_PRESETS = [
  'Nghỉ ốm / Khám bệnh',
  'Việc gia đình đột xuất',
  'Nghỉ phép năm đã duyệt',
  'Trùng lịch học / thi',
  'Sự cố phương tiện đi lại',
];

const validateClientAbsenceReason = (status, note) => {
  if (!ABSENCE_STATUSES.includes(status)) return null;
  const trimmed = String(note || '').trim();
  if (trimmed.length < 3) {
    return 'Vui lòng nhập lý do vắng cụ thể (tối thiểu 3 ký tự)!';
  }
  const lower = trimmed.toLowerCase();
  if (
    lower === '---' ||
    lower === 'không có' ||
    lower === 'khong co' ||
    lower === 'none' ||
    !/[\p{L}\p{N}]/u.test(trimmed) ||
    GENERIC_SHIFT_NOTES.some((g) => lower.includes(g))
  ) {
    return 'Ghi chú hiện tại không phải lý do vắng hợp lệ. Vui lòng nhập lý do cụ thể (VD: Nghỉ ốm, Việc gia đình...).';
  }
  return null;
};

const resolveShiftStatusClient = (shiftDate, shiftType, currentStatus, nowMs = Date.now()) => {
  if (MANUAL_STATUSES.includes(currentStatus)) return currentStatus;
  const dateStr = String(shiftDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return currentStatus || 'Chưa bắt đầu';

  let startStr = '06:30';
  let endStr = '14:30';
  const match = String(shiftType || '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (match) {
    startStr = match[1].padStart(5, '0');
    endStr = match[2].padStart(5, '0');
  } else {
    const lower = String(shiftType || '').toLowerCase();
    if (lower.includes('chiều') || lower.includes('tối')) {
      startStr = '14:30';
      endStr = '22:30';
    } else if (lower.includes('hành chính')) {
      startStr = '08:00';
      endStr = '17:00';
    } else if (lower.includes('đêm')) {
      startStr = '22:30';
      endStr = '06:30';
    }
  }

  const startMs = new Date(`${dateStr}T${startStr}:00+07:00`).getTime();
  let endMs = new Date(`${dateStr}T${endStr}:00+07:00`).getTime();
  if (endMs <= startMs) endMs += 86400000;

  if (nowMs < startMs) return 'Chưa bắt đầu';
  if (nowMs <= endMs) return 'Đang làm việc';
  return 'Đã hoàn thành';
};

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
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [showAbsenceBox, setShowAbsenceBox] = useState(false);
  const [absenceStatusType, setAbsenceStatusType] = useState('Vắng có lý do');
  const [absenceReason, setAbsenceReason] = useState('');

  // Quick Schedule Form
  const [quickForm, setQuickForm] = useState({
    shift_type: 'Ca Sáng (06:30 - 14:30)',
    note: '',
    status: 'Chưa bắt đầu',
  });

  // Manual List Form
  const [form, setForm] = useState({
    shift_code: '',
    user_id: '',
    shift_type: 'Ca Sáng (06:30 - 14:30)',
    shift_date: todayVN(),
    status: '',
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

    if (!isManagerOrAdmin) return;

    try {
      const staffRes = await api.get('/staff');
      const allUsers = staffRes.data?.data?.users || [];
      // Chỉ lấy tài khoản nhân viên nội bộ đang hoạt động (loại khách hàng & tài khoản đã khóa/trùng)
      const staffOnly = allUsers.filter((u) => {
        if (u.is_active === 0 || u.is_active === false) return false;
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
    const timer = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const normalizedShifts = useMemo(
    () =>
      shifts.map((s) => ({
        ...s,
        status: resolveShiftStatusClient(s.shift_date, s.shift_type, s.status, nowTick),
      })),
    [shifts, nowTick]
  );

  const selectRow = (s) => {
    setSelectedShift(s);
    setForm({
      shift_code: s.shift_code,
      user_id: s.user_id,
      shift_type: s.shift_type,
      shift_date: s.shift_date ? s.shift_date.split('T')[0] : todayVN(),
      status: ABSENCE_STATUSES.includes(s.status) ? s.status : '',
      note: s.note || '',
    });
  };

  // Compute 7 days of the selected week (Mon - Sun) theo chuẩn GMT+7
  const currentWeekDays = useMemo(() => {
    const todayStr = todayVN();
    const today = new Date(`${todayStr}T12:00:00+07:00`);
    const day = today.getUTCDay(); // 0 is Sun, 1 is Mon (UTC at 12:00+07:00 = 05:00Z cùng ngày)
    const diffToMonday = (day === 0 ? -6 : 1 - day) + weekOffset * 7;
    const mondayMs = today.getTime() + diffToMonday * 86400000;

    const days = [];
    const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
    for (let i = 0; i < 7; i++) {
      const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
        new Date(mondayMs + i * 86400000)
      );
      const [, m, dt] = iso.split('-');
      const displayDate = `${Number(dt)}/${Number(m)}`;
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
    if (!list.length && normalizedShifts && normalizedShifts.length > 0) {
      const map = new Map();
      normalizedShifts.forEach((s) => {
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
  }, [users, normalizedShifts, myOnly, user, roleFilter]);

  // Filtered shifts for table list
  const filteredShifts = useMemo(() => {
    return normalizedShifts.filter((s) => {
      if (myOnly && s.user_id !== user?.id) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.shift_code.toLowerCase().includes(q) ||
        (s.user_name || '').toLowerCase().includes(q) ||
        (s.user_code || '').toLowerCase().includes(q)
      );
    });
  }, [normalizedShifts, myOnly, user, search]);

  // Pagination for list
  const totalPages = Math.ceil(filteredShifts.length / pageSize) || 1;
  const pagedShifts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredShifts.slice(start, start + pageSize);
  }, [filteredShifts, page, pageSize]);

  const goToPage = (p) => {
    setPage(Math.max(1, Math.min(totalPages, p)));
  };

  // Helper badge style (Tối dịu Matte Dark cho tuần lịch phân ca)
  const getShiftBadge = (type) => {
    if (!type) return { bg: '#202024', color: '#A1A1AA', border: '#2A2A30', label: 'Nghỉ', icon: '' };
    if (type.includes('Sáng')) return { bg: 'rgba(245, 158, 11, 0.14)', color: '#FBBF24', border: 'rgba(245, 158, 11, 0.35)', label: 'Ca Sáng', icon: '', time: '06:30 - 14:30' };
    if (type.includes('Chiều') || type.includes('Tối')) return { bg: 'rgba(99, 102, 241, 0.16)', color: '#A5B4FC', border: 'rgba(99, 102, 241, 0.35)', label: 'Ca Chiều/Tối', icon: '', time: '14:30 - 22:30' };
    return { bg: 'rgba(16, 185, 129, 0.14)', color: '#34D399', border: 'rgba(52, 211, 153, 0.35)', label: 'Hành Chính', icon: '', time: '08:00 - 17:00' };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Đang làm việc': return '#34D399';
      case 'Đã hoàn thành': return '#38BDF8';
      case 'Vắng có lý do':
      case 'Nghỉ phép': return '#F87171';
      default: return '#FBBF24';
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
      shift_type: 'Ca Sáng (06:30 - 14:30)',
      note: (u.role_name === 'barista' || u.role === 'barista') ? 'Pha chế quầy Bar' : 'Thu ngân / Phục vụ',
      status: '',
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
    const currentStatus = resolveShiftStatusClient(shift.shift_date, shift.shift_type, shift.status, nowTick);
    const isAbsent = ABSENCE_STATUSES.includes(currentStatus);
    setShiftDetailModal({ ...shift, status: currentStatus });
    setReassignUserId('');
    setSwapTargetShiftId('');
    setShowSwapSection(false);
    setShowAbsenceBox(isAbsent);
    setAbsenceStatusType(isAbsent ? currentStatus : 'Vắng có lý do');
    const currentNote = String(shift.note || '').trim();
    const isGenericNote = GENERIC_SHIFT_NOTES.some((g) => currentNote.toLowerCase().includes(g));
    setAbsenceReason(isAbsent && !isGenericNote ? currentNote : '');
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

  // 8a. Xác nhận báo vắng kèm lý do cụ thể
  const handleMarkAbsent = async () => {
    if (!shiftDetailModal) return;
    const trimmedReason = absenceReason.trim();
    const errMsg = validateClientAbsenceReason(absenceStatusType, trimmedReason);
    if (errMsg) return toast.error(errMsg);

    try {
      const res = await api.put(`/work-shifts/${shiftDetailModal.id}`, {
        ...shiftDetailModal,
        status: absenceStatusType,
        note: trimmedReason,
      });
      const resolvedStatus = res.data?.data?.status || absenceStatusType;
      const resolvedNote = res.data?.data?.note ?? trimmedReason;
      toast.success(`Đã cập nhật "${resolvedStatus}" với lý do cụ thể`);
      setShiftDetailModal((prev) => (prev ? { ...prev, status: resolvedStatus, note: resolvedNote } : null));
      setShowAbsenceBox(true);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật trạng thái vắng');
    }
  };

  // 8b. Khôi phục về trạng thái tự động theo giờ thực tế (Backend GMT+7)
  const handleRestoreAutoStatus = async () => {
    if (!shiftDetailModal) return;
    const isCurrentlyAbsent = ABSENCE_STATUSES.includes(shiftDetailModal.status);
    const nextNote = isCurrentlyAbsent ? '' : (shiftDetailModal.note || '');
    try {
      const res = await api.put(`/work-shifts/${shiftDetailModal.id}`, {
        ...shiftDetailModal,
        status: '',
        note: nextNote,
      });
      const resolvedStatus =
        res.data?.data?.status ||
        resolveShiftStatusClient(shiftDetailModal.shift_date, shiftDetailModal.shift_type, '', Date.now());
      toast.success(`Đã khôi phục trạng thái tự động: ${resolvedStatus}`);
      setShowAbsenceBox(false);
      setAbsenceReason('');
      setShiftDetailModal((prev) => (prev ? { ...prev, status: resolvedStatus, note: nextNote || null } : null));
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khôi phục trạng thái ca');
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
    const absenceErr = validateClientAbsenceReason(form.status, form.note);
    if (absenceErr) return toast.error(absenceErr);
    try {
      await api.post('/work-shifts', {
        ...form,
        note: String(form.note || '').trim(),
      });
      toast.success('Thêm ca trực thành công! 📅');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleUpdate = async () => {
    if (!selectedShift) return toast.error('Vui lòng chọn ca trực cần sửa!');
    const absenceErr = validateClientAbsenceReason(form.status, form.note);
    if (absenceErr) return toast.error(absenceErr);
    try {
      await api.put(`/work-shifts/${selectedShift.id}`, {
        ...form,
        note: String(form.note || '').trim(),
      });
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
    return normalizedShifts.filter(
      (s) =>
        s.id !== shiftDetailModal.id &&
        s.user_id !== shiftDetailModal.user_id &&
        currentWeekDays.some((d) => (s.shift_date ? s.shift_date.split('T')[0] : '') === d.dateStr)
    );
  }, [shiftDetailModal, normalizedShifts, currentWeekDays]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. TOP BAR CHUYỂN CHẾ ĐỘ GỌN GÀNG (Bỏ tiêu đề lớn lặp TopBar) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#18181B',
          padding: '12px 18px',
          borderRadius: '14px',
          border: '1px solid #2A2A30',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '0.84rem', color: '#A1A1AA' }}>
          Xếp ca làm việc, điều chuyển và hoán đổi ca giữa các nhân sự
        </div>

        {/* View Toggle Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            background: '#121214',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid #2A2A30',
          }}
        >
          <button
            type="button"
            className="ui-btn"
            style={{
              height: '32px',
              background: viewMode === 'weekly' ? '#D97706' : 'transparent',
              color: viewMode === 'weekly' ? '#FFFFFF' : '#A1A1AA',
              fontWeight: 700,
              padding: '0 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.8rem'
            }}
            onClick={() => setViewMode('weekly')}
          >
            Thời khóa biểu tuần
          </button>
          <button
            type="button"
            className="ui-btn"
            style={{
              height: '32px',
              background: viewMode === 'list' ? '#D97706' : 'transparent',
              color: viewMode === 'list' ? '#FFFFFF' : '#A1A1AA',
              fontWeight: 700,
              padding: '0 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.8rem'
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
                className="ui-btn ui-btn-outline"
                style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem', fontWeight: 600 }}
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                ◀ Tuần trước
              </button>
              <button
                type="button"
                className="ui-btn"
                style={{
                  height: '32px',
                  background: weekOffset === 0 ? '#D97706' : '#202024',
                  color: weekOffset === 0 ? '#FFFFFF' : '#F4F1EC',
                  border: weekOffset === 0 ? '1px solid #D97706' : '1px solid #32323A',
                  fontWeight: 700,
                  padding: '0 14px',
                  fontSize: '0.8rem',
                }}
                onClick={() => setWeekOffset(0)}
              >
                Tuần này
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-outline"
                style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem', fontWeight: 600 }}
                onClick={() => setWeekOffset((w) => w + 1)}
              >
                Tuần sau ▶
              </button>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FBBF24', marginLeft: '6px' }}>
                Tuần từ {currentWeekDays[0]?.displayDate} đến {currentWeekDays[6]?.displayDate}
              </span>
            </div>

            {/* Quick Actions for Managers */}
            {isManagerOrAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="ui-btn"
                  style={{
                    height: '34px',
                    background: '#15803D',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    padding: '0 14px',
                    fontSize: '0.78rem',
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
                  className="ui-btn ui-btn-danger"
                  style={{ height: '34px', padding: '0 12px', fontSize: '0.78rem' }}
                  onClick={handleClearWeek}
                  title="Xóa nhanh toàn bộ ca trong tuần này để làm lại"
                >
                  <span>🗑️ Xóa tuần này</span>
                </button>
              </div>
            )}
          </div>

          {/* Subheader: Bộ lọc theo vai trò */}
          <div
            style={{
              padding: '10px 18px',
              background: '#141417',
              borderBottom: '1px solid #2A2A30',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {/* Role Filter Chips */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#A1A1AA', fontWeight: 600, marginRight: '4px' }}>
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
                  className="ui-btn"
                  style={{
                    height: '28px',
                    background: roleFilter === r.id ? '#D97706' : '#202024',
                    color: roleFilter === r.id ? '#FFFFFF' : '#D4D4D8',
                    border: roleFilter === r.id ? '1px solid #D97706' : '1px solid #2A2A30',
                    padding: '0 10px',
                    borderRadius: '8px',
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
                className="ui-btn"
                style={{
                  height: '28px',
                  background: myOnly ? '#D97706' : '#202024',
                  color: myOnly ? '#FFFFFF' : '#A1A1AA',
                  border: '1px solid #2A2A30',
                  padding: '0 10px',
                  borderRadius: '8px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                }}
                onClick={() => setMyOnly(!myOnly)}
              >
                👤 Ca của tôi
              </button>
            </div>
          </div>

          {/* Weekly Timetable Grid Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="mockup-table" style={{ width: '100%', minWidth: '980px' }}>
              <thead>
                <tr>
                  <th style={{ width: '190px' }}>
                    Nhân viên
                  </th>
                  {currentWeekDays.map((d) => (
                    <th
                      key={d.dateStr}
                      style={{
                        textAlign: 'center',
                        background: d.isToday ? 'rgba(217, 119, 6, 0.16)' : undefined,
                        color: d.isToday ? '#FBBF24' : undefined,
                        fontWeight: 700,
                        borderRight: '1px solid #2A2A30',
                        width: '11.5%',
                      }}
                    >
                      <div>{d.dayName}</div>
                      <div style={{ fontSize: '0.75rem', opacity: d.isToday ? 1 : 0.85 }}>{d.displayDate}</div>
                      {d.isToday && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: '2px',
                            fontSize: '0.65rem',
                            background: '#D97706',
                            color: '#FFFFFF',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
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
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#A1A1AA' }}>
                      Không có nhân viên nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  displayUsers.map((u) => {
                    return (
                      <tr key={u.id}>
                        <td
                          style={{
                            borderRight: '1px solid #2A2A30',
                            padding: '10px 14px',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#F4F1EC', fontSize: '0.88rem' }}>{u.full_name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#A1A1AA', marginTop: '2px' }}>
                            <span style={{ fontWeight: 700, color: '#F59E0B' }}>{u.code || `NV00${u.id}`}</span> • {u.role_label || u.role_name}
                          </div>
                        </td>

                        {currentWeekDays.map((d) => {
                          const shift = normalizedShifts.find(
                            (s) =>
                              s.user_id === u.id &&
                              (s.shift_date ? s.shift_date.split('T')[0] : '') === d.dateStr
                          );
                          const badge = getShiftBadge(shift?.shift_type);
                          const isAbsent = shift && ABSENCE_STATUSES.includes(shift.status);

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
                                  title={`Ca: ${shift.shift_type}\nTrạng thái: ${shift.status}\n${isAbsent ? 'Lý do vắng' : 'Ghi chú'}: ${shift.note || 'Chưa ghi chú'}\n(Bấm để đổi người, đổi ca hoặc báo vắng)`}
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
                                  {isAbsent && (
                                    <div
                                      style={{
                                        fontSize: '0.62rem',
                                        color: '#FCA5A5',
                                        marginTop: '3px',
                                        lineHeight: 1.25,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        wordBreak: 'break-word',
                                        background: 'rgba(239, 68, 68, 0.14)',
                                        padding: '2px 4px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(239, 68, 68, 0.25)',
                                      }}
                                      title={shift.note || 'Chưa ghi rõ lý do'}
                                    >
                                      Lý do: {shift.note || 'Chưa ghi rõ'}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleOpenQuickSchedule(u, d)}
                                  style={{
                                    border: '1px dashed rgba(245, 158, 11, 0.25)',
                                    borderRadius: '8px',
                                    padding: '12px 4px',
                                    color: '#71717A',
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
              background: '#141417',
              borderTop: '1px solid #2A2A30',
              fontSize: '0.82rem',
              color: '#A1A1AA',
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
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34D399' }}></span> Đang làm việc
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38BDF8' }}></span> Đã hoàn thành
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FBBF24' }}></span> Chưa bắt đầu
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F87171' }}></span> Vắng có lý do
              </span>
            </div>

            <button
              className="ui-btn ui-btn-outline"
              style={{ height: '32px', padding: '0 12px', fontSize: '0.78rem', fontWeight: 700 }}
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
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#A1A1AA' }}>
                        Không tìm thấy ca trực nào phù hợp.
                      </td>
                    </tr>
                  ) : (
                    pagedShifts.map((s) => {
                      const isSelected = selectedShift?.id === s.id;
                      const isAbsent = ABSENCE_STATUSES.includes(s.status);
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
                            {isAbsent && (
                              <div style={{ fontSize: '0.72rem', color: '#FCA5A5', marginTop: '2px', lineHeight: 1.3 }}>
                                Lý do: {s.note || 'Chưa ghi rõ'}
                              </div>
                            )}
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
                background: '#141417',
                borderTop: '1px solid #2A2A30',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="ui-btn ui-btn-outline"
                  style={{ height: '30px', padding: '0 10px', fontWeight: 700 }}
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                >
                  &lt;
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    className="ui-btn"
                    style={{
                      height: '30px',
                      padding: '0 12px',
                      fontWeight: 700,
                      background: page === pageNum ? '#D97706' : '#202024',
                      color: page === pageNum ? '#FFFFFF' : '#D4D4D8',
                      border: page === pageNum ? '1px solid #D97706' : '1px solid #2A2A30',
                    }}
                    onClick={() => goToPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  className="ui-btn ui-btn-outline"
                  style={{ height: '30px', padding: '0 10px', fontWeight: 700 }}
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                >
                  &gt;
                </button>
              </div>

              <span style={{ fontSize: '0.82rem', color: '#A1A1AA', fontWeight: 600 }}>
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
                  <option value="Ca Sáng (06:30 - 14:30)">☀️ Ca Sáng (06:30 - 14:30)</option>
                  <option value="Ca Tối (14:30 - 22:30)">🌙 Ca Tối (14:30 - 22:30)</option>
                  <option value="Ca Hành Chính (08:00 - 17:00)">💼 Ca Hành Chính (08:00 - 17:00)</option>
                </select>
              </div>

              <div>
                <label
                  className="form-label"
                  style={{
                    fontSize: '0.82rem',
                    color: ABSENCE_STATUSES.includes(form.status) ? '#FCA5A5' : undefined,
                  }}
                >
                  {ABSENCE_STATUSES.includes(form.status) ? 'Lý do vắng / nghỉ (bắt buộc) :' : 'Ghi chú công việc :'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder={
                    ABSENCE_STATUSES.includes(form.status)
                      ? 'VD: Nghỉ ốm, Việc gia đình (tối thiểu 3 ký tự)...'
                      : 'Ghi chú phân công ca...'
                  }
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>
                  Trạng thái :
                </label>
                <select
                  className="form-select"
                  value={form.status}
                  disabled={!isManagerOrAdmin}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="">⏱ Tự động theo giờ thực tế (GMT+7)</option>
                  <option value="Vắng có lý do">Vắng có lý do</option>
                  <option value="Nghỉ phép">Nghỉ phép</option>
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
                  background: myOnly ? '#D97706' : '#202024',
                  borderColor: myOnly ? '#D97706' : '#2A2A30',
                  color: myOnly ? '#FFFFFF' : '#F4F1EC',
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
              backgroundColor: 'rgba(0, 0, 0, 0.78)',
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
                background: '#18181B',
                boxShadow: '0 20px 44px rgba(0,0,0,0.65)',
                border: '1px solid #2A2A30',
              }}
            >
              <div
                className="mockup-panel-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                  borderBottom: '1px solid #2A2A30',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#F4F1EC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📅</span>
                  <span>Xếp ca trực nhanh</span>
                </div>
                <button
                  type="button"
                  style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '6px', width: '28px', height: '28px', color: '#A1A1AA', fontSize: '0.95rem', cursor: 'pointer' }}
                  onClick={() => setQuickScheduleModal(null)}
                >
                  ✕
                </button>
              </div>

              <div className="mockup-panel-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: '#202024',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #2A2A30',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#A1A1AA' }}>Phân công nhân viên:</div>
                  <div style={{ fontWeight: 700, color: '#F4F1EC', fontSize: '1rem', marginTop: '2px' }}>
                    {quickScheduleModal.user.full_name} ({quickScheduleModal.user.code || `NV00${quickScheduleModal.user.id}`})
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#FBBF24', marginTop: '2px' }}>
                    Vai trò: {quickScheduleModal.user.role_label || quickScheduleModal.user.role_name} • Ngày: {quickScheduleModal.dayName}, {quickScheduleModal.displayDate}
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>
                    Chọn Ca làm việc:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    {[
                      { id: 'Ca Sáng (06:30 - 14:30)', label: '☀️ Ca Sáng', time: '06:30 - 14:30' },
                      { id: 'Ca Tối (14:30 - 22:30)', label: '🌙 Ca Tối', time: '14:30 - 22:30' },
                      { id: 'Ca Hành Chính (08:00 - 17:00)', label: '💼 Ca Hành Chính', time: '08:00 - 17:00' },
                    ].map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setQuickForm({ ...quickForm, shift_type: c.id })}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: quickForm.shift_type === c.id ? '2px solid #D97706' : '1px solid #2A2A30',
                          background: quickForm.shift_type === c.id ? 'rgba(217, 119, 6, 0.16)' : '#202024',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#F4F1EC' }}>{c.label}</span>
                        <span style={{ fontSize: '0.8rem', color: '#A1A1AA' }}>{c.time}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>
                    Ghi chú phân công:
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
                    style={{ flex: 1, background: '#202024', borderColor: '#2A2A30', color: '#A1A1AA' }}
                    onClick={() => setQuickScheduleModal(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      flex: 2,
                      background: '#D97706',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      border: 'none',
                    }}
                    onClick={handleSaveQuickSchedule}
                  >
                    ✓ Xác nhận phân ca
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
              backgroundColor: 'rgba(0, 0, 0, 0.78)',
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
                background: '#18181B',
                boxShadow: '0 20px 44px rgba(0,0,0,0.65)',
                border: '1px solid #2A2A30',
              }}
            >
              <div
                className="mockup-panel-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                  borderBottom: '1px solid #2A2A30',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#F4F1EC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔄</span>
                  <span>Điều chỉnh ca trực #{shiftDetailModal.shift_code}</span>
                </div>
                <button
                  type="button"
                  style={{ background: '#202024', border: '1px solid #2A2A30', borderRadius: '6px', width: '28px', height: '28px', color: '#A1A1AA', fontSize: '0.95rem', cursor: 'pointer' }}
                  onClick={() => setShiftDetailModal(null)}
                >
                  ✕
                </button>
              </div>

              <div className="mockup-panel-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Thông tin ca hiện tại */}
                <div
                  style={{
                    background: '#202024',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #2A2A30',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>Nhân viên hiện tại:</span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: getStatusColor(shiftDetailModal.status),
                        background: '#141417',
                        border: '1px solid #2A2A30',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      • {shiftDetailModal.status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, color: '#F4F1EC', fontSize: '1.05rem' }}>
                    {shiftDetailModal.user_name} ({shiftDetailModal.user_code || `NV00${shiftDetailModal.user_id}`})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#FBBF24' }}>
                    {shiftDetailModal.shift_type} • Ngày: {shiftDetailModal.shift_date ? shiftDetailModal.shift_date.split('T')[0] : ''}
                  </div>
                  {shiftDetailModal.note && (
                    <div
                      style={{
                        fontSize: '0.74rem',
                        color: ABSENCE_STATUSES.includes(shiftDetailModal.status) ? '#FCA5A5' : '#A1A1AA',
                        fontStyle: 'italic',
                        marginTop: '2px',
                      }}
                    >
                      {ABSENCE_STATUSES.includes(shiftDetailModal.status) ? 'Lý do vắng' : 'Ghi chú'}: {shiftDetailModal.note}
                    </div>
                  )}
                </div>

                {/* KHỐI 1: ĐỔI NHÂN VIÊN TRỰC (THAY NGƯỜI) */}
                {isManagerOrAdmin && (
                  <div
                    style={{
                      background: 'rgba(217, 119, 6, 0.08)',
                      padding: '14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(217, 119, 6, 0.28)',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#FBBF24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>👤</span>
                      <span>Đổi nhân viên vào ca trực này:</span>
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
                          background: '#D97706',
                          color: '#FFFFFF',
                          fontWeight: 700,
                          padding: '6px 12px',
                          whiteSpace: 'nowrap',
                          border: 'none',
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
                        background: '#202024',
                        borderColor: '#2A2A30',
                        color: '#F4F1EC',
                        fontWeight: 600,
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
                          borderRadius: '10px',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', color: '#7DD3FC', fontWeight: 600, marginBottom: '6px' }}>
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
                              background: '#0284C7',
                              color: '#FFFFFF',
                              fontWeight: 700,
                              padding: '6px 12px',
                              whiteSpace: 'nowrap',
                              border: 'none',
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

                {/* KHỐI 3: CẬP NHẬT TRẠNG THÁI & LÝ DO VẮNG (CHỈ QUẢN LÝ / ADMIN) */}
                {isManagerOrAdmin && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#A1A1AA', fontWeight: 600 }}>
                      Cập nhật trạng thái ca trực:
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: !ABSENCE_STATUSES.includes(shiftDetailModal.status) && !showAbsenceBox ? '#D97706' : '#202024',
                          color: !ABSENCE_STATUSES.includes(shiftDetailModal.status) && !showAbsenceBox ? '#FFFFFF' : '#D4D4D8',
                          border: `1px solid ${!ABSENCE_STATUSES.includes(shiftDetailModal.status) && !showAbsenceBox ? '#D97706' : '#2A2A30'}`,
                          fontWeight: 600,
                          fontSize: '0.76rem',
                          padding: '6px 12px',
                        }}
                        onClick={handleRestoreAutoStatus}
                      >
                        ⏱ Tự động theo giờ thực tế
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: showAbsenceBox || ABSENCE_STATUSES.includes(shiftDetailModal.status) ? '#EF4444' : '#202024',
                          color: showAbsenceBox || ABSENCE_STATUSES.includes(shiftDetailModal.status) ? '#FFFFFF' : '#FCA5A5',
                          border: `1px solid ${showAbsenceBox || ABSENCE_STATUSES.includes(shiftDetailModal.status) ? '#EF4444' : 'rgba(239,68,68,0.4)'}`,
                          fontWeight: 600,
                          fontSize: '0.76rem',
                          padding: '6px 12px',
                        }}
                        onClick={() => {
                          setShowAbsenceBox(true);
                          if (!ABSENCE_STATUSES.includes(absenceStatusType)) {
                            setAbsenceStatusType('Vắng có lý do');
                          }
                        }}
                      >
                        📝 Báo vắng có lý do
                      </button>
                    </div>

                    {showAbsenceBox && (
                      <div
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '10px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {ABSENCE_STATUSES.map((st) => (
                            <button
                              key={st}
                              type="button"
                              className="btn btn-sm"
                              style={{
                                flex: 1,
                                background: absenceStatusType === st ? '#EF4444' : '#18181B',
                                color: absenceStatusType === st ? '#FFFFFF' : '#D4D4D8',
                                border: `1px solid ${absenceStatusType === st ? '#EF4444' : '#2A2A30'}`,
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                padding: '6px 10px',
                              }}
                              onClick={() => setAbsenceStatusType(st)}
                            >
                              {st}
                            </button>
                          ))}
                        </div>

                        <div>
                          <div style={{ fontSize: '0.74rem', color: '#FCA5A5', fontWeight: 600, marginBottom: '6px' }}>
                            Chọn nhanh lý do vắng:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {ABSENCE_REASON_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setAbsenceReason(preset)}
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  background: absenceReason === preset ? 'rgba(239,68,68,0.28)' : '#18181B',
                                  color: absenceReason === preset ? '#FFFFFF' : '#D4D4D8',
                                  border: `1px solid ${absenceReason === preset ? '#EF4444' : '#2A2A30'}`,
                                  cursor: 'pointer',
                                }}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.76rem', color: '#F4F1EC', fontWeight: 600, marginBottom: '5px' }}>
                            Lý do vắng cụ thể <span style={{ color: '#EF4444' }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="VD: Nghỉ ốm có giấy bác sĩ, việc gia đình..."
                            value={absenceReason}
                            onChange={(e) => setAbsenceReason(e.target.value)}
                            maxLength={255}
                          />
                          <div style={{ fontSize: '0.7rem', color: '#A1A1AA', marginTop: '4px' }}>
                            Bắt buộc ghi rõ lý do vắng để phục vụ đối soát bảng công.
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            width: '100%',
                            background: absenceReason.trim().length >= 3 ? '#EF4444' : '#27272A',
                            color: absenceReason.trim().length >= 3 ? '#FFFFFF' : '#71717A',
                            border: 'none',
                            fontWeight: 700,
                            padding: '8px 12px',
                            cursor: absenceReason.trim().length >= 3 ? 'pointer' : 'not-allowed',
                          }}
                          disabled={absenceReason.trim().length < 3}
                          onClick={handleMarkAbsent}
                        >
                          ✓ Xác nhận vắng &amp; lưu lý do
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid #2A2A30' }}>
                  {isManagerOrAdmin ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.35)', color: '#FCA5A5', fontWeight: 700 }}
                      onClick={handleDeleteShiftFromModal}
                    >
                      🗑️ Xóa ca trực này
                    </button>
                  ) : <div />}

                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ background: '#202024', borderColor: '#2A2A30', color: '#F4F1EC', fontWeight: 600, padding: '6px 16px' }}
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
