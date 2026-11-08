const pool = require('../config/db');

async function seedMoreMenuItems() {
  try {
    console.log('🍵 Expanding menu with delicious, authentic coffee shop items...');

    // 1. Clean duplicates of M001 & M003 if any
    await pool.query('UPDATE products SET is_active = 0 WHERE id IN (31, 32, 33, 34)');

    const newItems = [
      // === Category 1: Cà phê ===
      {
        category_id: 1,
        code: 'M031',
        name: 'Cà phê kem béo hạt dẻ',
        description: 'Cà phê Robusta kết hợp kem sữa béo ngậy và siro hạt dẻ thơm lừng ấm áp.',
        image_url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=80',
        price: 39000,
        isDrink: true,
      },
      {
        category_id: 1,
        code: 'M032',
        name: 'Cold Brew cam vàng mật ong',
        description: 'Cà phê ủ lạnh 18 tiếng hòa quyện lát cam vàng tươi và mật ong hoa rừng thanh mát.',
        image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=80',
        price: 45000,
        isDrink: true,
      },
      {
        category_id: 1,
        code: 'M033',
        name: 'Caramel Macchiato béo ngọt',
        description: 'Espresso đậm đà kết hợp sữa tươi đánh nóng mịn màng và vân sốt caramel ngọt ngào.',
        image_url: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=500&auto=format&fit=crop&q=80',
        price: 42000,
        isDrink: true,
      },
      {
        category_id: 1,
        code: 'M034',
        name: 'Affogato kem vani sốt espresso',
        description: 'Viên kem vani béo mịn kiểu Ý tan chảy dưới dòng espresso nóng hổi đậm đà.',
        image_url: 'https://images.unsplash.com/photo-1595928642581-f50f4f3453a5?w=500&auto=format&fit=crop&q=80',
        price: 48000,
        isDrink: true,
      },

      // === Category 2: Trà & Matcha ===
      {
        category_id: 2,
        code: 'M035',
        name: 'Trà nhài đác thơm hạt chia',
        description: 'Trà hoa nhài thanh khiết, hạt đác dẻo dai rim thơm cùng hạt chia bổ dưỡng.',
        image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=80',
        price: 42000,
        isDrink: true,
      },
      {
        category_id: 2,
        code: 'M036',
        name: 'Trà ô long dâu tằm kem cheese',
        description: 'Trà ô long thanh đượm hương dâu tằm mọng nước, phủ lớp kem phô mai mặn béo ngậy.',
        image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80',
        price: 48000,
        isDrink: true,
      },
      {
        category_id: 2,
        code: 'M037',
        name: 'Trà bưởi hồng mật ong thanh nhiệt',
        description: 'Nước cốt bưởi hồng thơm nồng nàn quyện mật ong rừng ngọt dịu giải nhiệt ngày hè.',
        image_url: 'https://images.unsplash.com/photo-1558160074-4d7d8bdf4256?w=500&auto=format&fit=crop&q=80',
        price: 45000,
        isDrink: true,
      },
      {
        category_id: 2,
        code: 'M038',
        name: 'Hồng trà sữa nướng trân châu hoàng kim',
        description: 'Hồng trà sữa nướng vị caramen quyến rũ, kèm trân châu hoàng kim dai giòn óng ả.',
        image_url: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=500&auto=format&fit=crop&q=80',
        price: 42000,
        isDrink: true,
      },

      // === Category 3: Sinh tố & Đá xay ===
      {
        category_id: 3,
        code: 'M039',
        name: 'Cookie Cacao tuyết đá xay',
        description: 'Bột cacao nguyên chất xay mịn cùng bánh quy socola giòn rụm và kem tươi bồng bềnh.',
        image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop&q=80',
        price: 48000,
        isDrink: true,
      },
      {
        category_id: 3,
        code: 'M040',
        name: 'Sinh tố xoài chanh leo sữa chua',
        description: 'Xoài cát chín mọng kết hợp cốt chanh leo chua thanh và sữa chua men sống bổ dưỡng.',
        image_url: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=500&auto=format&fit=crop&q=80',
        price: 45000,
        isDrink: true,
      },
      {
        category_id: 3,
        code: 'M041',
        name: 'Chanh tuyết bạc hà mát lạnh',
        description: 'Cốt chanh tươi đá tuyết kết hợp lá bạc hà mát rượi bừng tỉnh mọi giác quan.',
        image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80',
        price: 35000,
        isDrink: true,
      },

      // === Category 4: Đồ ăn nhẹ ===
      {
        category_id: 4,
        code: 'M042',
        name: 'Bánh Croissant bơ tỏi phô mai',
        description: 'Bánh sừng bò ngàn lớp nướng giòn rụm đẫm bơ tỏi thơm lừng và phô mai kéo sợi.',
        image_url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=80',
        price: 35000,
        isDrink: false,
      },
      {
        category_id: 4,
        code: 'M043',
        name: 'Bánh Red Velvet kem phô mai',
        description: 'Cốt bánh đỏ nhung mềm mịn đặc trưng xen kẽ các lớp kem cheese béo thơm tinh tế.',
        image_url: 'https://images.unsplash.com/photo-1586788680434-30d324b2d46f?w=500&auto=format&fit=crop&q=80',
        price: 42000,
        isDrink: false,
      },
      {
        category_id: 4,
        code: 'M044',
        name: 'Bánh Muffin việt quất nướng',
        description: 'Bánh nướng bơ sữa truyền thống với những quả việt quất tươi mọng thơm lừng.',
        image_url: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=500&auto=format&fit=crop&q=80',
        price: 32000,
        isDrink: false,
      },

      // === Category 5: Nước giải khát ===
      {
        category_id: 5,
        code: 'M045',
        name: 'Nước ép táo ổi hồng nguyên chất',
        description: 'Nước ép nguyên chất từ táo New Zealand giòn ngọt và ổi hồng ruột đào giàu vitamin C.',
        image_url: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&auto=format&fit=crop&q=80',
        price: 42000,
        isDrink: true,
      },
      {
        category_id: 5,
        code: 'M046',
        name: 'Soda dâu tây bạc hà sủi bọt',
        description: 'Soda bốc ga sảng khoái quyện siro dâu tây chín mọng và lá bạc hà tươi mát rượi.',
        image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80',
        price: 38000,
        isDrink: true,
      },

      // === Category 9: Đồ ăn vặt & Hạt (ĐÚNG 1 SIZE DUY NHẤT: "Tiêu chuẩn") ===
      {
        category_id: 9,
        code: 'AV08',
        name: 'Hạt dẻ cười rang muối Mỹ',
        description: 'Hạt dẻ cười nhập khẩu loại 1 hạt to mẩy nở đều, rang muối thơm giòn béo bùi.',
        image_url: 'https://images.unsplash.com/photo-1509912760195-4f6cfd900695?w=500&auto=format&fit=crop&q=80',
        price: 35000,
        isDrink: false,
        isSnack: true,
      },
      {
        category_id: 9,
        code: 'AV09',
        name: 'Hạt điều rang củi vỏ lụa Bình Phước',
        description: 'Hạt điều tuyển chọn size A cồ nướng củi giòn rụm giữ trọn vị ngọt bùi nguyên bản.',
        image_url: 'https://images.unsplash.com/photo-1543168256-418811576931?w=500&auto=format&fit=crop&q=80',
        price: 35000,
        isDrink: false,
        isSnack: true,
      },
      {
        category_id: 9,
        code: 'AV10',
        name: 'Bắp bò sấy giòn cay ngũ vị',
        description: 'Bắp bò xắt lát mỏng tẩm ướp ngũ vị hương sấy khô giòn tan thơm cay nồng nàn.',
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80',
        price: 35000,
        isDrink: false,
        isSnack: true,
      },
      {
        category_id: 9,
        code: 'AV11',
        name: 'Rong biển kẹp hạt dinh dưỡng sấy giòn',
        description: 'Rong biển Hàn Quốc nướng giòn kẹp nhân hạt hạnh nhân, hạt điều, mè rang béo bùi.',
        image_url: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=500&auto=format&fit=crop&q=80',
        price: 28000,
        isDrink: false,
        isSnack: true,
      },
    ];

    for (const item of newItems) {
      // Check if product code already exists
      const [existing] = await pool.query('SELECT id FROM products WHERE code = ?', [item.code]);
      let productId;

      if (existing.length > 0) {
        productId = existing[0].id;
        await pool.query(
          'UPDATE products SET category_id = ?, name = ?, description = ?, image_url = ?, is_available = 1, is_active = 1 WHERE id = ?',
          [item.category_id, item.name, item.description, item.image_url, productId]
        );
        console.log(`Updated existing product ${item.code} - ${item.name}`);
      } else {
        const [res] = await pool.query(
          'INSERT INTO products (category_id, code, name, description, image_url, is_available, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)',
          [item.category_id, item.code, item.name, item.description, item.image_url]
        );
        productId = res.insertId;
        console.log(`Created new product ID ${productId}: ${item.code} - ${item.name}`);
      }

      // SIZES:
      // Snacks strictly have ONLY 1 SIZE ('Tiêu chuẩn')
      if (item.isSnack || item.category_id === 9) {
        // Delete all old sizes
        await pool.query('DELETE FROM product_sizes WHERE product_id = ?', [productId]);
        await pool.query(
          'INSERT INTO product_sizes (product_id, name, price, is_default, is_active) VALUES (?, ?, ?, 1, 1)',
          [productId, 'Tiêu chuẩn', item.price]
        );
      } else if (item.isDrink) {
        // Drinks get S (-4k), M (default), L (+4k)
        await pool.query('DELETE FROM product_sizes WHERE product_id = ?', [productId]);
        await pool.query(
          `INSERT INTO product_sizes (product_id, name, price, is_default, is_active) VALUES
           (?, 'S', ?, 0, 1),
           (?, 'M', ?, 1, 1),
           (?, 'L', ?, 0, 1)`,
          [
            productId, Math.max(15000, item.price - 4000),
            productId, item.price,
            productId, item.price + 4000,
          ]
        );
      } else {
        // Bakery / Non-drinks get 1 standard size
        await pool.query('DELETE FROM product_sizes WHERE product_id = ?', [productId]);
        await pool.query(
          'INSERT INTO product_sizes (product_id, name, price, is_default, is_active) VALUES (?, ?, ?, 1, 1)',
          [productId, 'Tiêu chuẩn', item.price]
        );
      }
    }

    console.log('✅ Successfully seeded all new menu items with sizes!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding menu items:', err);
    process.exit(1);
  }
}

seedMoreMenuItems();

