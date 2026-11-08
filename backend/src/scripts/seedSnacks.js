const db = require('../config/db');

async function seedSnacks() {
  console.log('🚀 Seeding snack items (Đồ ăn vặt & Hạt hướng dương)...');

  try {
    // 1. Ensure category "Đồ ăn vặt & Hạt" exists
    const [existingCat] = await db.query(
      "SELECT id FROM categories WHERE name LIKE '%ăn vặt%' OR name LIKE '%hạt%'"
    );

    let categoryId;
    if (existingCat.length > 0) {
      categoryId = existingCat[0].id;
      console.log(`✓ Found existing snack category id: ${categoryId}`);
    } else {
      const [catResult] = await db.query(
        `INSERT INTO categories (name, description, sort_order, is_active)
         VALUES ('Đồ ăn vặt & Hạt', 'Hạt hướng dương, hạt bí, khô gà, khô bò nhâm nhi kèm cà phê trà chanh', 6, 1)`
      );
      categoryId = catResult.insertId;
      console.log(`✓ Created new category 'Đồ ăn vặt & Hạt' id: ${categoryId}`);
    }

    // 2. Define Snacks with Pricing & Ingredients
    const snacks = [
      {
        code: 'AV01',
        name: 'Hạt hướng dương rang mộc',
        description: 'Hạt hướng dương loại 1 mẩy hạt, thơm bùi giòn rụm, nhâm nhi cùng trà và cà phê.',
        image_url: 'https://images.unsplash.com/photo-1598965675045-45c5e72c7d05?w=500&auto=format&fit=crop&q=80',
        price_S: 11000,
        price_M: 15000,
        price_L: 19000,
        ingredient_name: 'Hạt hướng dương rang mộc',
        unit: 'gói',
        min_stock: 10,
        current_stock: 60,
        avg_cost: 8000,
      },
      {
        code: 'AV02',
        name: 'Hạt hướng dương vị nước cốt dừa',
        description: 'Hạt hướng dương tuyển chọn tẩm ướp nước cốt dừa béo ngậy, ngọt thanh thơm lừng.',
        image_url: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=500&auto=format&fit=crop&q=80',
        price_S: 14000,
        price_M: 18000,
        price_L: 22000,
        ingredient_name: 'Hạt hướng dương vị dừa',
        unit: 'gói',
        min_stock: 10,
        current_stock: 50,
        avg_cost: 10000,
      },
      {
        code: 'AV03',
        name: 'Hạt bí ta rang muối giòn bùi',
        description: 'Hạt bí ta hạt mẩy rang muối thơm lừng, giòn tan béo ngậy giàu dưỡng chất.',
        image_url: 'https://images.unsplash.com/photo-1574570068036-e889a74a441e?w=500&auto=format&fit=crop&q=80',
        price_S: 20000,
        price_M: 25000,
        price_L: 30000,
        ingredient_name: 'Hạt bí rang muối',
        unit: 'gói',
        min_stock: 8,
        current_stock: 35,
        avg_cost: 14000,
      },
      {
        code: 'AV04',
        name: 'Khô gà lá chanh xé cay hảo hạng',
        description: 'Thịt gà tươi xé sợi dai ngọt đậm đà, thơm nồng mùi lá chanh tươi và ớt hiểm cay cay.',
        image_url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=80',
        price_S: 25000,
        price_M: 30000,
        price_L: 36000,
        ingredient_name: 'Khô gà lá chanh',
        unit: 'hũ',
        min_stock: 6,
        current_stock: 30,
        avg_cost: 18000,
      },
      {
        code: 'AV05',
        name: 'Khô bò miếng mềm sốt cay Tây Bắc',
        description: 'Bò sấy miếng mềm ngấm đượm gia vị ngũ vị hương và ớt khô cay nồng đặc sản.',
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80',
        price_S: 39000,
        price_M: 45000,
        price_L: 52000,
        ingredient_name: 'Khô bò miếng cay',
        unit: 'hũ',
        min_stock: 5,
        current_stock: 25,
        avg_cost: 29000,
      },
      {
        code: 'AV06',
        name: 'Đậu phộng tỏi ớt giòn rụm',
        description: 'Đậu phộng rang vàng giòn rụm áo lớp tỏi phi thơm nức và ớt cay tê ngon khó cưỡng.',
        image_url: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=500&auto=format&fit=crop&q=80',
        price_S: 12000,
        price_M: 15000,
        price_L: 19000,
        ingredient_name: 'Đậu phộng rang tỏi ớt',
        unit: 'gói',
        min_stock: 10,
        current_stock: 45,
        avg_cost: 8500,
      },
      {
        code: 'AV07',
        name: 'Bánh tráng nướng phô mai giòn tan',
        description: 'Bánh tráng phơi sương nướng giòn tan phủ sốt phô mai béo ngậy thơm ngon chuẩn vị.',
        image_url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&auto=format&fit=crop&q=80',
        price_S: 16000,
        price_M: 20000,
        price_L: 25000,
        ingredient_name: 'Bánh tráng nướng phô mai',
        unit: 'bịch',
        min_stock: 8,
        current_stock: 35,
        avg_cost: 11000,
      },
    ];

    for (const snack of snacks) {
      // A. Check if product already exists
      const [existingProd] = await db.query(
        'SELECT id FROM products WHERE name = ? OR code = ?',
        [snack.name, snack.code]
      );

      let productId;
      if (existingProd.length > 0) {
        productId = existingProd[0].id;
        console.log(`  - Product '${snack.name}' exists (id: ${productId}). Updating...`);
        await db.query(
          `UPDATE products SET category_id = ?, description = ?, image_url = ?, is_available = 1, is_active = 1 WHERE id = ?`,
          [categoryId, snack.description, snack.image_url, productId]
        );
      } else {
        const [insertProd] = await db.query(
          `INSERT INTO products (code, category_id, name, description, image_url, is_available, is_active)
           VALUES (?, ?, ?, ?, ?, 1, 1)`,
          [snack.code, categoryId, snack.name, snack.description, snack.image_url]
        );
        productId = insertProd.insertId;
        console.log(`  + Created product '${snack.name}' (id: ${productId})`);
      }

      // B. Create / Update 3 sizes: S, M, L
      const sizesData = [
        { name: 'S', price: snack.price_S, is_default: 0, factor: 0.7 },
        { name: 'M', price: snack.price_M, is_default: 1, factor: 1.0 },
        { name: 'L', price: snack.price_L, is_default: 0, factor: 1.4 },
      ];

      const sizeIds = {};
      for (const sz of sizesData) {
        const [existingSz] = await db.query(
          'SELECT id FROM product_sizes WHERE product_id = ? AND name = ?',
          [productId, sz.name]
        );
        if (existingSz.length > 0) {
          sizeIds[sz.name] = existingSz[0].id;
          await db.query(
            'UPDATE product_sizes SET price = ?, is_default = ?, is_active = 1 WHERE id = ?',
            [sz.price, sz.is_default, existingSz[0].id]
          );
        } else {
          const [insSz] = await db.query(
            `INSERT INTO product_sizes (product_id, name, price, is_default, is_active)
             VALUES (?, ?, ?, ?, 1)`,
            [productId, sz.name, sz.price, sz.is_default]
          );
          sizeIds[sz.name] = insSz.insertId;
        }
      }

      // C. Ensure ingredient exists in inventory
      const [existingIng] = await db.query(
        'SELECT id FROM ingredients WHERE name = ?',
        [snack.ingredient_name]
      );

      let ingredientId;
      if (existingIng.length > 0) {
        ingredientId = existingIng[0].id;
      } else {
        const [insIng] = await db.query(
          `INSERT INTO ingredients (code, name, unit, min_stock, current_stock, avg_cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            `NL_${snack.code}`,
            snack.ingredient_name,
            snack.unit,
            snack.min_stock,
            snack.current_stock,
            snack.avg_cost,
          ]
        );
        ingredientId = insIng.insertId;
        console.log(`    + Created ingredient '${snack.ingredient_name}' (id: ${ingredientId})`);
      }

      // D. Link recipes for sizes
      for (const sz of sizesData) {
        const productSizeId = sizeIds[sz.name];
        if (productSizeId && ingredientId) {
          const [existRecipe] = await db.query(
            'SELECT id FROM recipes WHERE product_size_id = ? AND ingredient_id = ?',
            [productSizeId, ingredientId]
          );
          if (existRecipe.length === 0) {
            await db.query(
              `INSERT INTO recipes (product_size_id, ingredient_id, quantity)
               VALUES (?, ?, ?)`,
              [productSizeId, ingredientId, sz.factor]
            );
          }
        }
      }
    }

    console.log('✅ Successfully seeded all snack items & sunflower seeds!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding snacks:', err);
    process.exit(1);
  }
}

seedSnacks();

