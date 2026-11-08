const db = require('../config/db');

async function updateIngredientsAndRecipes() {
  console.log('--- 1. Bổ sung nguyên liệu còn thiếu vào kho ---');

  const newIngredients = [
    { code: 'NL_ICE', name: 'Đá viên tinh khiết', unit: 'kg', min_stock: 50, current_stock: 500, avg_cost: 2000 },
    { code: 'NL_WATER', name: 'Nước lọc tinh khiết', unit: 'L', min_stock: 100, current_stock: 1000, avg_cost: 500 },
    { code: 'NL_SALT', name: 'Muối hồng tinh khiết', unit: 'g', min_stock: 500, current_stock: 5000, avg_cost: 50 },
    { code: 'NL_EGG', name: 'Trứng gà tươi sạch', unit: 'quả', min_stock: 20, current_stock: 120, avg_cost: 3500 },
    { code: 'NL_LEMONGRASS', name: 'Sả cây tươi thơm', unit: 'kg', min_stock: 2, current_stock: 10, avg_cost: 25000 },
  ];

  for (const item of newIngredients) {
    const [exists] = await db.query('SELECT id FROM ingredients WHERE code = ? OR name = ?', [item.code, item.name]);
    if (exists.length === 0) {
      await db.query(
        'INSERT INTO ingredients (code, name, unit, min_stock, current_stock, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [item.code, item.name, item.unit, item.min_stock, item.current_stock, item.avg_cost]
      );
      console.log(`  + Đã thêm nguyên liệu: ${item.name} (${item.unit})`);
    } else {
      console.log(`  = Nguyên liệu đã có: ${item.name}`);
    }
  }

  // Lấy ID các nguyên liệu cốt lõi
  const [allIngs] = await db.query('SELECT id, name, unit, code FROM ingredients');
  const findIng = (predicate) => allIngs.find(predicate);

  const ingRobusta = findIng(i => i.name.includes('Robusta'))?.id;
  const ingArabica = findIng(i => i.name.includes('Arabica'))?.id;
  const ingSugar = findIng(i => i.name.includes('Đường'))?.id;
  const ingMilk = findIng(i => i.name.includes('Sữa đặc'))?.id;
  const ingFreshMilk = findIng(i => i.name.includes('Sữa tươi'))?.id;
  const ingIce = findIng(i => i.name.includes('Đá viên'))?.id;
  const ingWater = findIng(i => i.name.includes('Nước lọc'))?.id;
  const ingSalt = findIng(i => i.name.includes('Muối'))?.id;
  const ingEgg = findIng(i => i.name.includes('Trứng'))?.id;
  const ingPeach = findIng(i => i.name.includes('Đào ngâm'))?.id;
  const ingLychee = findIng(i => i.name.includes('Vải thiều'))?.id;
  const ingTea = findIng(i => i.name.includes('Trà đen'))?.id;
  const ingMatcha = findIng(i => i.name.includes('Matcha'))?.id;
  const ingAvocado = findIng(i => i.name.includes('Bơ sáp'))?.id;
  const ingRich = findIng(i => i.name.includes('Rich'))?.id;

  console.log('\n--- 2. Cập nhật công thức chuẩn chi tiết cho từng Món và từng Size ---');

  // Hàm thêm công thức
  async function setRecipe(productCode, sizeName, ingredientsList) {
    // Lấy product_size_id
    const [sizeRows] = await db.query(
      `SELECT ps.id AS size_id, p.name AS prod_name 
       FROM product_sizes ps 
       JOIN products p ON p.id = ps.product_id 
       WHERE p.code = ? AND ps.name = ?`,
      [productCode, sizeName]
    );

    if (sizeRows.length === 0) return;
    const sizeId = sizeRows[0].size_id;

    // Xóa công thức cũ của size này để cập nhật mới chuẩn xác
    await db.query('DELETE FROM recipes WHERE product_size_id = ?', [sizeId]);

    // Thêm các nguyên liệu mới
    for (const ing of ingredientsList) {
      if (ing.id && ing.qty) {
        await db.query(
          'INSERT INTO recipes (product_size_id, ingredient_id, quantity) VALUES (?, ?, ?)',
          [sizeId, ing.id, ing.qty]
        );
      }
    }
  }

  // 1. CF01: Cà phê đen đá (cà phê + đường + đá + nước)
  await setRecipe('CF01', 'S', [
    { id: ingRobusta, qty: 0.020 }, // 20g cà phê
    { id: ingSugar, qty: 0.010 },   // 10g đường
    { id: ingIce, qty: 0.120 },     // 120g đá
    { id: ingWater, qty: 0.040 },   // 40ml nước cốt
  ]);
  await setRecipe('CF01', 'M', [
    { id: ingRobusta, qty: 0.025 }, // 25g cà phê
    { id: ingSugar, qty: 0.015 },   // 15g đường
    { id: ingIce, qty: 0.150 },     // 150g đá
    { id: ingWater, qty: 0.050 },   // 50ml nước cốt
  ]);
  await setRecipe('CF01', 'L', [
    { id: ingRobusta, qty: 0.030 }, // 30g cà phê
    { id: ingSugar, qty: 0.020 },   // 20g đường
    { id: ingIce, qty: 0.180 },     // 180g đá
    { id: ingWater, qty: 0.065 },   // 65ml nước cốt
  ]);
  console.log('  ✅ CF01: Cà phê đen đá (Đầy đủ Cà phê, Đường, Đá, Nước cho các Size S, M, L)');

  // 2. CF02: Cà phê sữa đá (cà phê + sữa đặc + đá)
  await setRecipe('CF02', 'S', [
    { id: ingRobusta, qty: 0.020 }, // 20g cà phê
    { id: ingMilk, qty: 0.030 },    // 25ml sữa đặc
    { id: ingIce, qty: 0.120 },     // 120g đá
  ]);
  await setRecipe('CF02', 'M', [
    { id: ingRobusta, qty: 0.025 }, // 25g cà phê
    { id: ingMilk, qty: 0.040 },    // 35ml sữa đặc
    { id: ingIce, qty: 0.150 },     // 150g đá
  ]);
  await setRecipe('CF02', 'L', [
    { id: ingRobusta, qty: 0.030 }, // 30g cà phê
    { id: ingMilk, qty: 0.050 },    // 45ml sữa đặc
    { id: ingIce, qty: 0.180 },     // 180g đá
  ]);
  console.log('  ✅ CF02: Cà phê sữa đá (Đầy đủ Cà phê, Sữa đặc, Đá)');

  // 3. CF03: Bạc xỉu ba tầng (sữa đặc + sữa tươi + cà phê bọt + đá)
  await setRecipe('CF03', 'S', [
    { id: ingMilk, qty: 0.030 },      // 25ml sữa đặc
    { id: ingFreshMilk, qty: 0.060 }, // 60ml sữa tươi
    { id: ingRobusta, qty: 0.015 },   // 15g cà phê
    { id: ingIce, qty: 0.120 },       // 120g đá
  ]);
  await setRecipe('CF03', 'M', [
    { id: ingMilk, qty: 0.040 },      // 35ml sữa đặc
    { id: ingFreshMilk, qty: 0.080 }, // 80ml sữa tươi
    { id: ingRobusta, qty: 0.020 },   // 20g cà phê
    { id: ingIce, qty: 0.150 },       // 150g đá
  ]);
  await setRecipe('CF03', 'L', [
    { id: ingMilk, qty: 0.050 },      // 45ml sữa đặc
    { id: ingFreshMilk, qty: 0.100 }, // 100ml sữa tươi
    { id: ingRobusta, qty: 0.025 },   // 25g cà phê
    { id: ingIce, qty: 0.180 },       // 180g đá
  ]);
  console.log('  ✅ CF03: Bạc xỉu ba tầng (Sữa đặc, Sữa tươi, Cà phê, Đá)');

  // 4. CF04: Cà phê muối xứ Huế
  await setRecipe('CF04', 'M', [
    { id: ingRobusta, qty: 0.025 },
    { id: ingMilk, qty: 0.030 },
    { id: ingRich, qty: 0.030 },
    { id: ingSalt, qty: 2.000 }, // 2g muối hồng
    { id: ingIce, qty: 0.150 },
  ]);
  await setRecipe('CF04', 'L', [
    { id: ingRobusta, qty: 0.030 },
    { id: ingMilk, qty: 0.040 },
    { id: ingRich, qty: 0.040 },
    { id: ingSalt, qty: 3.000 },
    { id: ingIce, qty: 0.180 },
  ]);
  console.log('  ✅ CF04: Cà phê muối xứ Huế (Cà phê, Sữa đặc, Kem béo, Muối hồng, Đá)');

  // 5. CF05: Cà phê trứng Hà Nội
  await setRecipe('CF05', 'M', [
    { id: ingRobusta, qty: 0.025 },
    { id: ingEgg, qty: 1.000 }, // 1 lòng đỏ trứng
    { id: ingMilk, qty: 0.025 },
    { id: ingSugar, qty: 0.010 },
  ]);
  await setRecipe('CF05', 'L', [
    { id: ingRobusta, qty: 0.030 },
    { id: ingEgg, qty: 2.000 }, // 2 lòng đỏ trứng
    { id: ingMilk, qty: 0.035 },
    { id: ingSugar, qty: 0.015 },
  ]);
  console.log('  ✅ CF05: Cà phê trứng Hà Nội (Cà phê, Trứng gà tươi, Sữa đặc, Đường)');

  // 6. CF06: Americano đá
  await setRecipe('CF06', 'M', [
    { id: ingArabica, qty: 0.020 },
    { id: ingWater, qty: 0.100 },
    { id: ingIce, qty: 0.150 },
  ]);
  await setRecipe('CF06', 'L', [
    { id: ingArabica, qty: 0.025 },
    { id: ingWater, qty: 0.140 },
    { id: ingIce, qty: 0.180 },
  ]);
  console.log('  ✅ CF06: Americano đá (Cà phê Arabica, Nước lọc, Đá)');

  // 7. TR01: Trà đào cam sả
  await setRecipe('TR01', 'M', [
    { id: ingTea, qty: 0.010 },     // 10g trà đen
    { id: ingPeach, qty: 0.050 },   // 3 lát đào ngâm
    { id: ingSugar, qty: 0.020 },   // 20g đường
    { id: ingIce, qty: 0.150 },     // 150g đá
  ]);
  await setRecipe('TR01', 'L', [
    { id: ingTea, qty: 0.015 },
    { id: ingPeach, qty: 0.070 },
    { id: ingSugar, qty: 0.025 },
    { id: ingIce, qty: 0.180 },
  ]);
  console.log('  ✅ TR01: Trà đào cam sả');

  // Thêm đá viên cho các món đồ uống đá còn lại chưa có đá viên
  const [drinkSizes] = await db.query(`
    SELECT ps.id AS size_id, p.name AS prod_name, ps.name AS size_name 
    FROM product_sizes ps 
    JOIN products p ON p.id = ps.product_id 
    JOIN categories c ON c.id = p.category_id 
    WHERE c.name IN ('☕ Cà phê', '🍵 Trà & Trà sữa', '🍧 Sinh tố & Đá xay', '🍹 Nước ép & Soda')
      AND p.name LIKE '%đá%'
  `);

  let addedIceCount = 0;
  for (const s of drinkSizes) {
    const [hasIce] = await db.query('SELECT id FROM recipes WHERE product_size_id = ? AND ingredient_id = ?', [s.size_id, ingIce]);
    if (hasIce.length === 0) {
      const iceQty = s.size_name === 'S' ? 0.120 : (s.size_name === 'L' ? 0.180 : 0.150);
      await db.query('INSERT INTO recipes (product_size_id, ingredient_id, quantity) VALUES (?, ?, ?)', [s.size_id, ingIce, iceQty]);
      addedIceCount++;
    }
  }
  console.log(`  ✅ Đã tự động bổ sung Đá viên tinh khiết cho ${addedIceCount} size đồ uống đá!`);

  console.log('\n🎉 HOÀN TẤT BỔ SUNG NGUYÊN LIỆU VÀ CÔNG THỨC CHI TIẾT!');
  process.exit(0);
}

updateIngredientsAndRecipes().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});

