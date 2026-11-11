const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const storeService = require('../services/storeSettingsService');

// GET /api/settings/store-hours (Công khai cho cả khách hàng và nhân viên)
router.get('/store-hours', async (req, res) => {
  try {
    const config = await storeService.getStoreSettings();
    const vnNow = storeService.getVietnamNow();
    const isOpen = storeService.isStoreOpen(config, vnNow);
    const availableSlots = storeService.getAvailableSlots(config, vnNow);
    const currentVietnamTime = storeService.getVietnamTime(vnNow);

    res.json({
      success: true,
      data: {
        ...config,
        isOpen,
        currentVietnamTime,
        availableSlots
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải cấu hình giờ hoạt động: ' + err.message });
  }
});

// PUT /api/settings/store-hours (Chỉ Quản trị viên Admin mới có quyền cấu hình hệ thống)
router.put('/store-hours', authenticate, authorize('admin'), async (req, res) => {
  try {
    const updated = await storeService.updateStoreSettings(req.body);
    const vnNow = storeService.getVietnamNow();
    const isOpen = storeService.isStoreOpen(updated, vnNow);

    // Phát socket cho các máy khách cập nhật ngay lập tức nếu giờ đóng mở thay đổi
    const io = req.app?.get('io');
    if (io) {
      io.emit('store:hours_updated', {
        ...updated,
        isOpen
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật cấu hình giờ mở/đóng cửa và thông số nhận đơn thành công',
      data: {
        ...updated,
        isOpen
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình: ' + err.message });
  }
});

module.exports = router;

