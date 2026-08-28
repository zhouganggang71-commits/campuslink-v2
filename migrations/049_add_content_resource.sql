-- 内容资料库：contents 加资料文件字段（R12 Phase 3）
-- 说明：新生资料（考试资料/课表/模板）作为内容钩子，对标链千校"私信领资料"
--       但我们正规化：资料直接挂 URL 可下载，不引流私域
-- resource_url 指向可下载文件（uploads/ 或外链），resource_name 为展示文件名
ALTER TABLE contents ADD COLUMN IF NOT EXISTS resource_url VARCHAR(500) DEFAULT NULL AFTER cover_url;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS resource_name VARCHAR(200) DEFAULT '' AFTER resource_url;
