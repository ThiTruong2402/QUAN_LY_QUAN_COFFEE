USE my_coffee_house;

-- 1. Xóa bản ghi công thức trùng lặp (giữ ID nhỏ nhất) và tạo ràng buộc UNIQUE
DELETE r1 FROM recipes r1
INNER JOIN recipes r2 ON r1.product_size_id = r2.product_size_id 
  AND r1.ingredient_id = r2.ingredient_id 
  AND r1.id > r2.id;

-- Tạo UNIQUE KEY uq_recipe_size_ingredient nếu chưa có
SET @exist := (SELECT COUNT(*) FROM information_schema.statistics 
  WHERE table_schema = DATABASE() AND table_name = 'recipes' AND index_name = 'uq_recipe_size_ingredient');
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE recipes ADD UNIQUE KEY uq_recipe_size_ingredient (product_size_id, ingredient_id)', 'SELECT "Index already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Đồng bộ CHECK constraint trạng thái đơn hàng (Orders) và chi tiết món (Order Items)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_chk_2;
ALTER TABLE orders ADD CONSTRAINT orders_chk_2 
  CHECK (status IN ('open', 'awaiting_payment', 'pending', 'scheduled', 'preparing', 'done', 'served', 'paid', 'cancelled', 'merged'));

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_chk_2;
ALTER TABLE order_items ADD CONSTRAINT order_items_chk_2 
  CHECK (status IN ('unsent', 'pending', 'scheduled', 'preparing', 'ready', 'done', 'served', 'cancelled'));

-- 3. Xóa size 'Phần' dư thừa trên ID 11 và 12 (kèm công thức phụ thuộc nếu có)
DELETE FROM recipes WHERE product_size_id IN (24, 25);
DELETE FROM product_sizes WHERE id IN (24, 25) AND name = 'Phần';
