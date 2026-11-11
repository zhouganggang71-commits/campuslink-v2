# CampusLink scripts/ 文件分类清单

> 整理日期：2026-09（清理乱文件 + 分类脚本）
> 用途：说明每个脚本是干什么的，避免"一堆莫名其妙文件"无从下手

## 一、内容运营配套（R12 新增，保留）

| 文件 | 用途 |
|------|------|
| `make-content-pdfs.py` | 内容 → PDF 资料（读生产导出 /tmp/content-export.txt，输出 dev-pdfs/） |
| `make-content-covers.py` | 批量生成内容品牌封面（读 /tmp/titles.txt，输出 dev-covers/，已改用真实图后不再常用） |
| `dev-covers/` | 封面图素材副本（24 张真实图 + 生成图；已上传生产 /uploads/resources/covers/，git 已跟踪） |
| `dev-pdfs/` | 内容 PDF（6 份，已上传生产 /uploads/resources/，git 已跟踪） |
| `dev-images/` | 本地 dev mock 预览封面（**vite.config 引用，别删**） |
| `dev-mock-contents.ts` | 本地 dev mock 内容数据（**vite.config 引用，别删**） |

## 二、成绩单 OCR / 教务工具（保留，扫码登录功能用）

| 文件 | 用途 |
|------|------|
| `extract_courses.py` | 课表 PDF 解析工具 |
| `ocr_schedule.py` | 课表 OCR（扫码登录教务） |
| `ocr_text_only.py` | 纯文字 OCR（Vision） |
| `eval_ocr.py` | OCR 准确率评估脚本 |
| `gt_template.json` | OCR ground-truth 模板 |

## 三、运维/隧道（保留）

| 文件 | 用途 |
|------|------|
| `admin-tunnel.sh` | SSH 隧道（本地连服务器管理） |
| `tunnel.sh` | 通用 SSH 隧道 |

## 四、种子数据 SQL（保留，本地演示/测试用）

| 文件 | 用途 |
|------|------|
| `seed_circles.sql` / `seed_circle_images.sql` / `seed_posts.sql` | 圈子/帖子演示种子 |

## 五、历史测试/压测脚本（可删，git 历史可找回）

| 文件 | 用途 | 建议 |
|------|------|------|
| `stress_test.ts` / `stress_bench.ts` / `stress_http.ts` | 压测（并发/HTTP） | 已完成使命，可删 |
| `sec_test.ts` / `security_test.ts` | 安全测试 | 已完成使命，可删 |

> 注：安全/压测主要是开发期验证用，生产部署不依赖。删掉可减小仓库噪音（git log 里还在）。

## 六、日志说明（原 logs/ 已清理）

- `logs/`（app-*/security-*/slow-*.log）是**本地运行日志**，已在 .gitignore，本次清理删除。
- 生产日志在 N100 服务器（`pm2 logs campuslink` + 服务器端 logs/），与本地无关。
- 排障优先看服务器日志；本地日志不保留。

## 根目录清理记录（2026-09）

已删（垃圾/副本/过期文档）：
- `.DS_Store`、`CLAUDE_副本.md`（重复副本）、`AGENTS.md`（与 CLAUDE.md 完全相同，去重保留后者）
- `lianxiao-proxy.py`（竞品抓包临时脚本，使命完成）
- `campuslink_diag.sh`（历史诊断脚本）
- `metadata.json`（Gemini 旧部署元数据）
- `updated_project_campus_platform.md`、`updated_记忆库精简版.md`（过期文档，权威记忆在 memory_backup/）
- `surveys/`（历史调研文档）
- `logs/`（本地运行日志，见上文）

保留的必要文件：`src/` `migrations/` `public/` `server.ts` `docs/` `scripts/`（上面分类）`dist/` `node_modules/` 配置与部署文件（package*.json vite/ts/vitest/eslint 配置 .env deploy.sh ecosystem nginx CLAUDE.md README 等）
