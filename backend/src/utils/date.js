/**
 * Helper chuẩn hóa ngày giờ múi giờ Việt Nam (Asia/Ho_Chi_Minh - GMT+7)
 * Khắc phục triệt để lỗi lệch ngày do new Date().toISOString() chạy theo giờ UTC (0h - 7h sáng bị lùi 1 ngày)
 */

// Lấy chuỗi YYYY-MM-DD theo múi giờ Việt Nam
const getVietnamDateString = (d = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

// Lấy chuỗi YYYYMMDD để đánh số mã hóa đơn / tài liệu
const getVietnamDateNumber = (d = new Date()) => {
  return getVietnamDateString(d).replace(/-/g, '');
};

// Lấy ngày giờ đầy đủ YYYY-MM-DD HH:mm:ss theo múi giờ Việt Nam
const getVietnamDateTimeString = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);

  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
};

module.exports = {
  getVietnamDateString,
  getVietnamDateNumber,
  getVietnamDateTimeString
};
