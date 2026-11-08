require('dotenv').config();
const pool = require('./db');

async function seed() {
  // Suppliers
  const suppliers = [
    ['Công ty Cà Phê Cầu Đất Farm', '0903112233', 'Đà Lạt, Lâm Đồng', 0],
    ['Vinamilk Chi Nhánh HCM', '0918223344', 'Quận 7, TP.HCM', 0],
    ['Nhà Cung Cấp Nguyên Liệu Pha Chế Tân Phú', '0937556677', 'Tân Phú, TP.HCM', 0],
  ];
  for (const s of suppliers) {
    await pool.query(
      `INSERT INTO suppliers (name, phone, address, debt) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      s
    );
  }

  // Ingredients
  const ingredients = [
    ['Cà phê hạt Robusta Buôn Ma Thuột', 'kg', 5, 24.5, 120000],
    ['Cà phê hạt Arabica Cầu Đất', 'kg', 5, 18.0, 220000],
    ['Sữa đặc Ông Thọ lon', 'lon', 20, 65, 24000],
    ['Sữa tươi thanh trùng Barista 1L', 'hộp', 15, 42, 38000],
    ['Đường cát trắng', 'kg', 10, 35, 25000],
    ['Trà đen Phúc Long', 'kg', 2, 8.5, 160000],
    ['Bột Matcha Uji Nhật Bản', 'g', 500, 2500, 450],
    ['Đào ngâm đóng hộp Kronos', 'hộp', 10, 28, 55000],
    ['Trân châu đen Đài Loan', 'kg', 5, 15.0, 45000],
    ['Bột Cacao nguyên chất', 'kg', 2, 6.0, 180000],
  ];
  for (const item of ingredients) {
    await pool.query(
      `INSERT INTO ingredients (name, unit, min_stock, current_stock, avg_cost) VALUES (?, ?, ?, ?, ?)`,
      item
    );
  }

  // Customers
  const customers = [
    ['0909123456', 'Nguyễn Văn Minh', '1995-04-12', 2, 350, 3500000],
    ['0912345678', 'Trần Thị Thu Thảo', '1998-08-25', 3, 1150, 11500000],
    ['0987654321', 'Lê Hoàng Nam', '2001-01-15', 1, 80, 800000],
    ['0933445566', 'Phạm Quỳnh Anh', '1992-11-30', 4, 3200, 32000000],
  ];
  for (const c of customers) {
    await pool.query(
      `INSERT INTO customers (phone, name, birthday, tier_id, points_balance, total_spent) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), points_balance=VALUES(points_balance)`,
      c
    );
  }

  // Promotions
  const promotions = [
    ['Khai trương rộn ràng - Giảm 10%', 'percent_order', 10, '2025-01-01', '2026-12-31', 1],
    ['Happy Hour chiều mát - Giảm 20%', 'happy_hour', 20, '2025-01-01', '2026-12-31', 1],
  ];
  for (const p of promotions) {
    await pool.query(
      `INSERT INTO promotions (name, type, value, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      p
    );
  }

  console.log('✅ Seeded extra suppliers, ingredients, customers, and promotions successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
