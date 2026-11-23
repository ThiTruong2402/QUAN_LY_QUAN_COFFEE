/**
 * bankConfig.js
 * Cấu hình thông tin thanh toán chuyển khoản ngân hàng VietQR Techcombank dùng chung toàn hệ thống
 */

export const BANK_CONFIG = {
  bankName: 'Techcombank',
  bankFullName: 'Ngân hàng TMCP Kỹ Thương Việt Nam',
  accountNumber: '2402 2005 6666',
  accountNumberRaw: '240220056666',
  accountHolder: 'BUI VAN TRUONG',
  bin: '970407', // Techcombank BIN
  template: 'compact2',
};

/**
 * Sinh URL mã QR VietQR động theo chuẩn Napas 247
 */
export const generateVietQRUrl = ({ amount = 0, memo = '' }) => {
  const cleanAmount = Math.max(0, Math.round(Number(amount || 0)));
  const encodedMemo = encodeURIComponent(memo || 'CF DH');
  const encodedName = encodeURIComponent(BANK_CONFIG.accountHolder);
  return `https://img.vietqr.io/image/${BANK_CONFIG.bin}-${BANK_CONFIG.accountNumberRaw}-${BANK_CONFIG.template}.png?amount=${cleanAmount}&addInfo=${encodedMemo}&accountName=${encodedName}`;
};

export default BANK_CONFIG;
