const db = require('../config/db');

async function updateProductImages() {
  console.log('🔄 Đang cập nhật hình ảnh chuẩn xác và xóa bỏ hoàn toàn ảnh trùng lặp...');

  const updates = [
    { code: 'CF01', image_url: '/images/drinks/ca_phe_den_da.jpg' },
    { code: 'CF05', image_url: '/images/drinks/ca_phe_trung.jpg' },
    { code: 'CF10', image_url: '/images/drinks/cold_brew_cam.jpg' },
    { code: 'CF12', image_url: '/images/drinks/affogato.jpg' },
    { code: 'BM02', image_url: '/images/cakes/croissant_pho_mai.jpg' },
    { code: 'BM05', image_url: '/images/cakes/mousse_chanh_day.jpg' },
    { code: 'NE03', image_url: '/images/drinks/nuoc_ep_oi_hong.jpg' },
    { code: 'AV09', image_url: '/images/snacks/bap_bo_say_gion.jpg' },
    { code: 'AV11', image_url: '/images/snacks/banh_trang_nuong.jpg' },
  ];

  for (const item of updates) {
    const [res] = await db.query('UPDATE products SET image_url = ? WHERE code = ?', [item.image_url, item.code]);
    console.log(`✅ Cập nhật ${item.code} -> ${item.image_url} (affectedRows: ${res.affectedRows})`);
  }

  // Kiểm tra trùng lặp ảnh trong toàn bộ bảng products
  const [allProducts] = await db.query('SELECT code, name, image_url FROM products WHERE image_url IS NOT NULL');
  const urlMap = {};
  const duplicates = [];
  for (const p of allProducts) {
    if (urlMap[p.image_url]) {
      duplicates.push({ url: p.image_url, first: urlMap[p.image_url], second: p.code });
    } else {
      urlMap[p.image_url] = p.code;
    }
  }

  if (duplicates.length === 0) {
    console.log('🎉 XÁC NHẬN: Không còn bất kỳ món nào bị trùng lặp ảnh trong cơ sở dữ liệu!');
  } else {
    console.warn('⚠️ Vẫn còn trùng lặp ảnh:', duplicates);
  }

  process.exit(0);
}

updateProductImages().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
