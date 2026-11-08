const db = require('../config/db');

async function reorganizeMenu() {
  console.log('🍵 Starting menu reorganization and image updates...');

  // 1. Delete redundant duplicates (IDs 31, 32, 33, 34)
  const dupIds = [31, 32, 33, 34];
  for (const id of dupIds) {
    await db.query('DELETE FROM recipes WHERE product_size_id IN (SELECT id FROM product_sizes WHERE product_id = ?)', [id]);
    await db.query('DELETE FROM product_sizes WHERE product_id = ?', [id]);
    await db.query('DELETE FROM products WHERE id = ?', [id]);
  }
  console.log(`✅ Đã xóa ${dupIds.length} sản phẩm trùng lặp (IDs 31, 32, 33, 34)`);

  // 2. Chuẩn hóa tên và thứ tự danh mục (Categories)
  const categoryUpdates = [
    { id: 1, name: '☕ Cà phê', sort_order: 1 },
    { id: 2, name: '🍵 Trà & Trà sữa', sort_order: 2 },
    { id: 3, name: '🍧 Sinh tố & Đá xay', sort_order: 3 },
    { id: 4, name: '🍰 Bánh & Điểm tâm', sort_order: 4 },
    { id: 5, name: '🍹 Nước ép & Soda', sort_order: 5 },
    { id: 9, name: '🥜 Đồ ăn vặt & Hạt', sort_order: 6 },
  ];
  for (const cat of categoryUpdates) {
    await db.query('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?', [cat.name, cat.sort_order, cat.id]);
  }
  console.log('✅ Đã chuẩn hóa danh mục và thứ tự hiển thị');

  // 3. Cập nhật mã món (Code), mô tả và hình ảnh chuẩn xác cho từng món
  const productUpdates = [
    // Category 1: Cà phê (CF01 - CF12)
    { id: 1, code: 'CF01', name: 'Cà phê đen đá', image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80' },
    { id: 2, code: 'CF02', name: 'Cà phê sữa đá', image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=80' },
    { id: 3, code: 'CF03', name: 'Bạc xỉu ba tầng', image_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&auto=format&fit=crop&q=80' },
    { id: 4, code: 'CF04', name: 'Cà phê muối xứ Huế', image_url: 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=500&auto=format&fit=crop&q=80' },
    { id: 5, code: 'CF05', name: 'Cà phê trứng Hà Nội', image_url: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=80' },
    { id: 6, code: 'CF06', name: 'Americano đá', image_url: 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=500&auto=format&fit=crop&q=80' },
    { id: 7, code: 'CF07', name: 'Cappuccino bọt sữa', image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=500&auto=format&fit=crop&q=80' },
    { id: 8, code: 'CF08', name: 'Latte vani hạnh nhân', image_url: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=500&auto=format&fit=crop&q=80' },
    { id: 46, code: 'CF09', name: 'Cà phê kem béo hạt dẻ', image_url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=80' },
    { id: 47, code: 'CF10', name: 'Cold Brew cam vàng mật ong', image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=80' },
    { id: 48, code: 'CF11', name: 'Caramel Macchiato béo ngọt', image_url: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=500&auto=format&fit=crop&q=80' },
    { id: 49, code: 'CF12', name: 'Affogato kem vani sốt espresso', image_url: 'https://images.unsplash.com/photo-1595928642581-f50f4f3453a5?w=500&auto=format&fit=crop&q=80' },

    // Category 2: Trà & Trà sữa (TR01 - TR11)
    { id: 9, code: 'TR01', name: 'Trà đào cam sả', image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=80' },
    { id: 10, code: 'TR02', name: 'Trà vải hoa hồng', image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80' },
    { id: 11, code: 'TR03', name: 'Trà dâu tây dưa hấu', image_url: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=500&auto=format&fit=crop&q=80' },
    { id: 12, code: 'TR04', name: 'Trà xanh gạo rang Genmai', image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80' },
    { id: 13, code: 'TR05', name: 'Matcha Latte Uji', image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500&auto=format&fit=crop&q=80' },
    { id: 14, code: 'TR06', name: 'Trà sữa trân châu đường đen', image_url: 'https://images.unsplash.com/photo-1558857563-b37fe8402db0?w=500&auto=format&fit=crop&q=80' },
    { id: 15, code: 'TR07', name: 'Trà sen vàng kem cheese', image_url: '/images/drinks/tra_sen_vang_kem_cheese.jpg' },
    { id: 50, code: 'TR08', name: 'Trà nhài đác thơm hạt chia', image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=80' },
    { id: 51, code: 'TR09', name: 'Trà ô long dâu tằm kem cheese', image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80' },
    { id: 52, code: 'TR10', name: 'Trà bưởi hồng mật ong thanh nhiệt', image_url: 'https://images.unsplash.com/photo-1558160074-4d7d8bdf4256?w=500&auto=format&fit=crop&q=80' },
    { id: 53, code: 'TR11', name: 'Hồng trà sữa nướng trân châu hoàng kim', image_url: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=500&auto=format&fit=crop&q=80' },

    // Category 3: Sinh tố & Đá xay (ST01 - ST04, DX01 - DX05)
    { id: 16, code: 'ST01', name: 'Sinh tố bơ sáp Đắk Lắk', image_url: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500&auto=format&fit=crop&q=80' },
    { id: 17, code: 'ST02', name: 'Sinh tố dâu tây sữa chua', image_url: '/images/drinks/sinh_to_dau_tay.jpg' },
    { id: 18, code: 'ST03', name: 'Sinh tố xoài cát chu', image_url: 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=500&auto=format&fit=crop&q=80' },
    { id: 55, code: 'ST04', name: 'Sinh tố xoài chanh leo sữa chua', image_url: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=500&auto=format&fit=crop&q=80' },
    { id: 19, code: 'DX01', name: 'Cà phê cốt dừa đá xay', image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop&q=80' },
    { id: 20, code: 'DX02', name: 'Cookie kem béo đá xay', image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop&q=80' },
    { id: 21, code: 'DX03', name: 'Matcha đá xay kem cheese', image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500&auto=format&fit=crop&q=80' },
    { id: 54, code: 'DX04', name: 'Cookie Cacao tuyết đá xay', image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop&q=80' },
    { id: 56, code: 'DX05', name: 'Chanh tuyết bạc hà mát lạnh', image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80' },

    // Category 4: Bánh & Điểm tâm (BM01 - BM08)
    { id: 22, code: 'BM01', name: 'Bánh Croissant bơ Pháp', image_url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=80' },
    { id: 57, code: 'BM02', name: 'Bánh Croissant bơ tỏi phô mai', image_url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=80' },
    { id: 23, code: 'BM03', name: 'Tiramisu ca cao Ý', image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500&auto=format&fit=crop&q=80' },
    { id: 24, code: 'BM04', name: 'Bánh phô mai nướng Burnt', image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500&auto=format&fit=crop&q=80' },
    { id: 25, code: 'BM05', name: 'Bánh mousse chanh dây', image_url: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=500&auto=format&fit=crop&q=80' },
    { id: 58, code: 'BM06', name: 'Bánh Red Velvet kem phô mai', image_url: 'https://images.unsplash.com/photo-1586788680434-30d324b2d46f?w=500&auto=format&fit=crop&q=80' },
    { id: 59, code: 'BM07', name: 'Bánh Muffin việt quất nướng', image_url: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=500&auto=format&fit=crop&q=80' },
    { id: 26, code: 'BM08', name: 'Bánh mì que pate bơ cay', image_url: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=500&auto=format&fit=crop&q=80' },

    // Category 5: Nước ép & Soda (NE01 - NE03, SD01 - SD03)
    { id: 27, code: 'NE01', name: 'Nước cam tươi nguyên chất', image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop&q=80' },
    { id: 28, code: 'NE02', name: 'Nước ép dưa hấu mát lạnh', image_url: 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=500&auto=format&fit=crop&q=80' },
    { id: 60, code: 'NE03', name: 'Nước ép táo ổi hồng nguyên chất', image_url: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&auto=format&fit=crop&q=80' },
    { id: 29, code: 'SD01', name: 'Soda việt quất bạc hà', image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80' },
    { id: 30, code: 'SD02', name: 'Soda chanh leo thảo mộc', image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=80' },
    { id: 61, code: 'SD03', name: 'Soda dâu tây bạc hà sủi bọt', image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80' },

    // Category 9: Đồ ăn vặt & Hạt (AV01 - AV11)
    { id: 38, code: 'AV01', name: 'Hạt hướng dương rang mộc', image_url: '/images/snacks/hat_huong_duong_rang_moc.jpg' },
    { id: 39, code: 'AV02', name: 'Hạt hướng dương vị nước cốt dừa', image_url: '/images/snacks/hat_huong_duong_vi_dua.jpg' },
    { id: 40, code: 'AV03', name: 'Hạt bí ta rang muối giòn bùi', image_url: '/images/snacks/hat_bi_ta_rang_muoi.jpg' },
    { id: 62, code: 'AV04', name: 'Hạt dẻ cười rang muối Mỹ', image_url: 'https://images.unsplash.com/photo-1509912760195-4f6cfd900695?w=500&auto=format&fit=crop&q=80' },
    { id: 63, code: 'AV05', name: 'Hạt điều rang củi vỏ lụa Bình Phước', image_url: 'https://images.unsplash.com/photo-1543168256-418811576931?w=500&auto=format&fit=crop&q=80' },
    { id: 65, code: 'AV06', name: 'Rong biển kẹp hạt dinh dưỡng sấy giòn', image_url: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=500&auto=format&fit=crop&q=80' },
    { id: 41, code: 'AV07', name: 'Khô gà lá chanh xé cay hảo hạng', image_url: '/images/snacks/kho_ga_la_chanh.jpg' },
    { id: 42, code: 'AV08', name: 'Khô bò miếng mềm sốt cay Tây Bắc', image_url: '/images/snacks/kho_bo_mieng_cay.jpg' },
    { id: 64, code: 'AV09', name: 'Bắp bò sấy giòn cay ngũ vị', image_url: '/images/snacks/kho_bo_mieng_cay.jpg' },
    { id: 43, code: 'AV10', name: 'Đậu phộng tỏi ớt giòn rụm', image_url: '/images/snacks/dau_phong_toi_ot.jpg' },
    { id: 44, code: 'AV11', name: 'Bánh tráng nướng phô mai giòn tan', image_url: '/images/snacks/banh_trang_nuong.jpg' },
  ];

  for (const p of productUpdates) {
    await db.query(
      'UPDATE products SET code = ?, name = ?, image_url = ? WHERE id = ?',
      [p.code, p.name, p.image_url, p.id]
    );
  }
  console.log(`✅ Đã cập nhật mã và hình ảnh cho ${productUpdates.length} sản phẩm thành công!`);

  process.exit(0);
}

reorganizeMenu().catch((err) => {
  console.error('❌ Lỗi cập nhật thực đơn:', err);
  process.exit(1);
});

