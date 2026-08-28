-- 补插资料内容（050 因 resource_url 列当时不存在而失败被跳过）
INSERT IGNORE INTO contents (id, school_id, category, sub_category, title, summary, cover_url, resource_url, resource_name, body, body_type, sort_order, status, view_count, created_by) VALUES
(24, 1, 'newcomer', 'exam', '新生资料库', '开学考试资料/班委竞选模板/课表下载', NULL, '/campus/uploads/resources/开学考试资料.pdf', '开学考试资料.pdf', '<h2>资料目录</h2><p>这里汇总新生常用资料，直接点击下载，不用加好友私信领取。</p><ul><li>开学考试资料（摸底测试参考）</li><li>班委竞选步骤与模板</li><li>班级课表（PDF）</li></ul><p>资料持续补充中，也欢迎在圈子分享你手上的学习资料。</p>', 'html', 11, 'published', 0, 0);
