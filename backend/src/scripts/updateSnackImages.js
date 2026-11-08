const db = require('../config/db');

(async () => {
  try {
    const updates = [
      { id: 38, url: '/images/snacks/hat_huong_duong_rang_moc.jpg' },
      { id: 39, url: '/images/snacks/hat_huong_duong_vi_dua.jpg' },
      { id: 40, url: '/images/snacks/hat_bi_rang_muoi.jpg' },
      { id: 41, url: '/images/snacks/kho_ga_la_chanh.jpg' },
      { id: 42, url: '/images/snacks/kho_bo_mieng_cay.jpg' },
      { id: 43, url: '/images/snacks/dau_phong_toi_ot.jpg' },
      { id: 44, url: '/images/snacks/banh_trang_nuong.jpg' },
    ];

    for (const u of updates) {
      await db.query('UPDATE products SET image_url = ? WHERE id = ?', [u.url, u.id]);
    }

    const [rows] = await db.query(
      'SELECT id, code, name, image_url FROM products WHERE id BETWEEN 38 AND 44'
    );
    console.log('✓ Successfully updated local snack image paths:');
    console.table(rows);

    process.exit(0);
  } catch (err) {
    console.error('Error updating images:', err);
    process.exit(1);
  }
})();

