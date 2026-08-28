-- 校内寻伴：users 加专业字段（R12 Phase 3）
-- 说明：
--   1. major 专业：教务扫码同步时可从班名解析（如"2025级大数据与会计3班"→"大数据与会计"），
--      也可用户自填/后台维护；为空时匹配自动降级到院系级
--   2. department（院系）已有，扫码登录自动写入
ALTER TABLE users ADD COLUMN IF NOT EXISTS major VARCHAR(128) DEFAULT '' AFTER department;
