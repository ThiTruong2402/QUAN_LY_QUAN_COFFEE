const db = require('../config/db');

/**
 * Ghi nhật ký kiểm toán hệ thống (Audit Logs)
 * @param {Object} entry
 * @param {number|null} entry.userId - ID người dùng thực hiện
 * @param {string} entry.action - Tên hành động (LOGIN, LOGOUT, CREATE_ORDER, UPDATE_ORDER_STATUS, CANCEL_ORDER, PAY_ORDER, ADJUST_STOCK, CREATE_STAFF, UPDATE_STAFF, DELETE_STAFF, CRUD_PRODUCT, CRUD_CATEGORY, CRUD_RECIPE)
 * @param {string|null} entry.entityType - Loại thực thể (USER, ORDER, INGREDIENT, PRODUCT, CATEGORY, RECIPE, SETTING)
 * @param {number|null} entry.entityId - ID của thực thể
 * @param {any} entry.oldValue - Dữ liệu trước thay đổi
 * @param {any} entry.newValue - Dữ liệu sau thay đổi
 * @param {string|null} entry.reason - Mô tả chi tiết hành động
 * @param {string|null} entry.ipAddress - Địa chỉ IP của client
 */
const logAudit = async ({
  userId = null,
  approvedBy = null,
  action,
  entityType = null,
  entityId = null,
  oldValue = null,
  newValue = null,
  reason = null,
  ipAddress = null,
}) => {
  if (!action) return;
  try {
    const oldJson = oldValue !== null ? JSON.stringify(oldValue) : null;
    const newJson = newValue !== null ? JSON.stringify(newValue) : null;
    const cleanIp = String(ipAddress || '').replace('::ffff:', '') || '127.0.0.1';

    await db.query(
      `INSERT INTO audit_logs (user_id, approved_by, action, entity_type, entity_id, old_value, new_value, reason, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, approvedBy, action, entityType, entityId, oldJson, newJson, reason, cleanIp]
    );
  } catch (err) {
    // Không làm sập flow chính nếu lỗi ghi log
    console.warn('⚠️ Lỗi ghi audit log:', err.message);
  }
};

module.exports = { logAudit };
