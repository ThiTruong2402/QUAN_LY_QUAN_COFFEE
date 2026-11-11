const db = require('../config/db');
const { getVietnamDateString, getVietnamDateTimeString } = require('../utils/date');

const DEFAULT_SETTINGS = {
  open_time: '06:30',
  close_time: '23:00',
  slot_step_minutes: 15,
  min_lead_time_minutes: 30,
  auto_dispatch_before_minutes: 15,
  max_advance_days: 2,
};

// Chuyển "HH:mm" thành số phút trong ngày
const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Chuyển số phút thành "HH:mm"
const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Lấy giờ hiện tại của Việt Nam (HH:mm)
const getVietnamTime = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  return `${map.hour}:${map.minute}`;
};

// Lấy Date object chuẩn theo múi giờ Việt Nam
const getVietnamNow = () => {
  const now = new Date();
  const vnString = getVietnamDateTimeString(now);
  return new Date(vnString.replace(' ', 'T') + '+07:00');
};

// Đọc cấu hình từ database (nếu lỗi trả về default)
const getStoreSettings = async () => {
  try {
    const [rows] = await db.query('SELECT `key`, `value` FROM store_settings');
    const config = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key === 'open_time') config.open_time = r.value;
      else if (r.key === 'close_time') config.close_time = r.value;
      else if (r.key === 'slot_step_minutes') config.slot_step_minutes = parseInt(r.value, 10) || 15;
      else if (r.key === 'min_lead_time_minutes') config.min_lead_time_minutes = parseInt(r.value, 10) || 30;
      else if (r.key === 'auto_dispatch_before_minutes') config.auto_dispatch_before_minutes = parseInt(r.value, 10) || 15;
      else if (r.key === 'max_advance_days') config.max_advance_days = parseInt(r.value, 10) || 2;
    }
    // Aliases for camelCase
    config.openTime = config.open_time;
    config.closeTime = config.close_time;
    return config;
  } catch (err) {
    console.warn('Could not read store_settings from DB, using defaults:', err.message);
    return { ...DEFAULT_SETTINGS };
  }
};

// Cập nhật cấu hình
const updateStoreSettings = async (settingsObj) => {
  const normalized = { ...settingsObj };
  if (normalized.openTime !== undefined && normalized.open_time === undefined) {
    normalized.open_time = normalized.openTime;
  }
  if (normalized.closeTime !== undefined && normalized.close_time === undefined) {
    normalized.close_time = normalized.closeTime;
  }
  if (normalized.minLeadTimeMinutes !== undefined && normalized.min_lead_time_minutes === undefined) {
    normalized.min_lead_time_minutes = normalized.minLeadTimeMinutes;
  }
  if (normalized.slotStepMinutes !== undefined && normalized.slot_step_minutes === undefined) {
    normalized.slot_step_minutes = normalized.slotStepMinutes;
  }

  const allowed = ['open_time', 'close_time', 'slot_step_minutes', 'min_lead_time_minutes', 'auto_dispatch_before_minutes', 'max_advance_days'];
  for (const key of allowed) {
    if (normalized[key] !== undefined) {
      await db.query('INSERT INTO store_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)', [key, String(normalized[key])]);
    }
  }
  return await getStoreSettings();
};

// Kiểm tra xem quán hiện tại có đang mở cửa hay không
const isStoreOpen = (config, vnNow = getVietnamNow()) => {
  const currentMinutes = timeToMinutes(getVietnamTime(vnNow));
  const openMinutes = timeToMinutes(config.open_time || DEFAULT_SETTINGS.open_time);
  const closeMinutes = timeToMinutes(config.close_time || DEFAULT_SETTINGS.close_time);

  if (openMinutes <= closeMinutes) {
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }
  // Trường hợp mở xuyên đêm qua 0h
  return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
};

// Sinh danh sách các khung giờ nhận hợp lệ cho khách hàng chọn
const getAvailableSlots = (config, vnNow = getVietnamNow()) => {
  const result = [];
  const maxDays = config.max_advance_days || 2;
  const step = config.slot_step_minutes || 15;
  const minLead = config.min_lead_time_minutes || 30;

  const openMins = timeToMinutes(config.open_time);
  const closeMins = timeToMinutes(config.close_time);

  for (let d = 0; d <= maxDays; d++) {
    const targetDate = new Date(vnNow.getTime() + d * 86400000);
    const dateStr = getVietnamDateString(targetDate);
    const dayLabel = d === 0 ? 'Hôm nay' : (d === 1 ? 'Ngày mai' : `Ngày ${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`);

    const slots = [];
    for (let m = openMins; m <= closeMins; m += step) {
      const timeStr = minutesToTime(m);
      const slotDateTime = new Date(`${dateStr}T${timeStr}:00+07:00`);

      // Khung giờ phải cách hiện tại ít nhất minLead phút
      const diffMinutes = Math.floor((slotDateTime.getTime() - vnNow.getTime()) / 60000);
      if (diffMinutes >= minLead) {
        slots.push({
          time: timeStr,
          datetime: `${dateStr} ${timeStr}:00`,
          label: `${timeStr} (${dayLabel})`
        });
      }
    }

    if (slots.length > 0) {
      result.push({
        date: dateStr,
        dayLabel,
        slots
      });
    }
  }
  return result;
};

// Validate giờ nhận do khách gửi lên
const validatePickupTime = (pickupTimeStr, config, vnNow = getVietnamNow()) => {
  if (!pickupTimeStr) {
    return { valid: false, message: 'Vui lòng chọn thời gian nhận hàng' };
  }

  // Chấp nhận định dạng "YYYY-MM-DD HH:mm:ss" hoặc "YYYY-MM-DDTHH:mm"
  const normalized = pickupTimeStr.replace('T', ' ').slice(0, 19);
  const pickupDate = new Date(normalized.replace(' ', 'T') + '+07:00');

  if (isNaN(pickupDate.getTime())) {
    return { valid: false, message: 'Thời gian nhận hàng không đúng định dạng hợp lệ' };
  }

  const diffMinutes = Math.floor((pickupDate.getTime() - vnNow.getTime()) / 60000);
  const minLead = config.min_lead_time_minutes || 30;
  if (diffMinutes < minLead) {
    return {
      valid: false,
      message: `Giờ nhận phải cách thời điểm hiện tại tối thiểu ${minLead} phút để quán kịp chuẩn bị`
    };
  }

  const maxAdvanceMinutes = (config.max_advance_days || 2) * 24 * 60;
  if (diffMinutes > maxAdvanceMinutes + 120) {
    return {
      valid: false,
      message: `Quán chỉ nhận đặt trước tối đa trong vòng ${config.max_advance_days || 2} ngày`
    };
  }

  // Giờ nhận phải nằm trong giờ mở cửa quán
  const targetTimeStr = getVietnamTime(pickupDate);
  const targetMinutes = timeToMinutes(targetTimeStr);
  const openMins = timeToMinutes(config.open_time);
  const closeMins = timeToMinutes(config.close_time);

  if (targetMinutes < openMins || targetMinutes > closeMins) {
    return {
      valid: false,
      message: `Giờ nhận hàng (${targetTimeStr}) nằm ngoài giờ mở cửa của quán (${config.open_time} – ${config.close_time})`
    };
  }

  return {
    valid: true,
    pickupDate: normalized,
    displayTime: `${targetTimeStr}, ${getVietnamDateString(pickupDate)}`
  };
};

module.exports = {
  getStoreSettings,
  updateStoreSettings,
  isStoreOpen,
  getAvailableSlots,
  validatePickupTime,
  getVietnamNow,
  getVietnamTime,
  timeToMinutes,
  minutesToTime,
};

