DELETE FROM categories;
INSERT INTO categories (id, name, parent_id, sort_order) VALUES
  (1, '数码电器', NULL, 1),
  (2, '图书教材', NULL, 2),
  (3, '失物招领', NULL, 3),
  (4, '拼车出行', NULL, 4),
  (5, '社团活动', NULL, 5),
  (6, '兼职实习', NULL, 6),
  (7, '学习互助', NULL, 7);
UPDATE posts p JOIN categories c ON p.category = c.name
SET p.category_id = c.id
WHERE p.category_id IS NULL AND p.category IS NOT NULL;
