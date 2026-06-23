/**
 * CampusLink 后端 — Express + MySQL + JWT
 * 部署: npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs
 *
 * 模块化架构：每个路由模块独立注册，互不影响。
 * 一个模块初始化失败不会导致整站崩溃。
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { logger, installGlobalHandlers, setLogDir } from "./src/utils/logger";
import { pool } from "./src/server/db";
import { ok, fail } from "./src/server/response";
import { apiSpec } from "./src/server/api-spec";
import { registerAuthRoutes } from "./src/server/routes/auth";
import { registerPostRoutes } from "./src/server/routes/posts";
import { registerCourseRoutes } from "./src/server/routes/courses";
import { registerUploadRoutes } from "./src/server/routes/upload";
import { registerScheduleRoutes } from "./src/server/routes/schedule";
import { registerAdminRoutes } from "./src/server/routes/admin";
import { registerRegistrationRoutes } from "./src/server/routes/registrations";
import { registerFeedbackRoutes } from "./src/server/routes/feedback";
import { registerCircleRoutes } from "./src/server/routes/circles";
import { registerNoticeRoutes } from "./src/server/routes/notices";

// ── 全局错误处理 ──
installGlobalHandlers();
setLogDir(path.join(process.cwd(), "logs"));

const app = express();
app.set('trust proxy', 1); // 信任 nginx 反代一跳，使 req.ip 获取真实客户端 IP
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// ── 安全头 ──
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: https://images.unsplash.com; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  next();
});

// ── CORS（允许前端域名跨域调用 API） ──
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://jhcaishui.cn:8443',
  credentials: true,
}));

// ── 进行中请求计数（用于优雅关闭） ──
let shuttingDown = false;
let inFlightRequests = 0;
app.use((req: any, res: any, next: any) => {
  if (shuttingDown) return res.status(503).json({ code: -1, message: '服务维护中' });
  inFlightRequests++;
  res.on('finish', () => inFlightRequests--);
  next();
});

// ── 请求日志 ──
app.use(logger.middleware());

// ── 阿里云 nginx 前缀剥离：/campus/xxx → /xxx ──
app.use((req, res, next) => {
  if (req.url.startsWith('/campus')) {
    req.url = req.url.replace('/campus', '') || '/';
  }
  next();
});

// ── 非版本化端点的 v1 转发 /api/v1/{health,log,ads} → /api/{health,log,ads} ──
app.use('/api/v1', (_req: any, _res: any, next: any) => { next(); });

app.use('/api', (req: any, res: any, next: any) => {
  // 非版本化端点（health、ads、log）跳过版本转发
  if (
    req.url === '/health' ||
    req.url.startsWith('/log/') ||
    req.url.startsWith('/ads')
  ) {
    return next();
  }
  if (!req.url.startsWith('/v1/') && !req.url.startsWith('/v')) {
    req.url = `/v1${req.url}`;
  }
  next();
});

// ── API 响应禁止缓存 ──
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});

// ── 静态文件 ──
const distDir = path.join(process.cwd(), "dist");
console.log(`[CampusLink] cwd=${process.cwd()} distDir=${distDir} exists=${fs.existsSync(distDir)}`);
app.use("/assets", express.static(path.join(distDir, "assets"), { maxAge: 31536000000, immutable: true }));
app.get("/", (req, res, next) => {
  const fp = path.join(distDir, "index.html");
  if (fs.existsSync(fp)) return res.sendFile(fp);
  next();
});

// ── 上传目录 ──
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// ── Multer 实例（磁盘存储：图片 / 内存存储：PDF） ──
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => {
      const uid = _req.userId || "anonymous";
      const dir = path.join(uploadDir, String(uid));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req: any, _file: any, cb: any) => cb(null, `img-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── 健康检查（含连接池+内存） ──
const startTime = Date.now();
const HEALTH_KEY = process.env.HEALTH_KEY || process.env.ADMIN_KEY || '';

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    const key = (req.query.key as string) || '';
    // 详细状态仅响应持有健康检查密钥的请求
    if (HEALTH_KEY && key === HEALTH_KEY) {
      const mem = process.memoryUsage();
      let poolStats = { total: 0, free: 0, waiting: 0 };
      try {
        const internal: any = (pool as any).pool;
        if (internal) {
          poolStats.total = internal._allConnections?.length || 0;
          poolStats.free = internal._freeConnections?.length || 0;
          poolStats.waiting = internal._connectionQueue?.length || 0;
        }
      } catch { /* 内省失败不影响响应 */ }
      return res.json({
        code: 0,
        message: "ok",
        db: "connected",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        pool: { active: poolStats.total - poolStats.free, total: poolStats.total, waiting: poolStats.waiting },
        memory: { heap: Math.round(mem.heapUsed / 1024 / 1024) + "MB", rss: Math.round(mem.rss / 1024 / 1024) + "MB" },
      });
    }
    // 公开端点仅返回基本状态
    res.json({ code: 0, message: "ok", db: "connected" });
  } catch (err: any) {
    logger.error('健康检查失败', { error: err.message, trace_id: (req as any)._traceId });
    res.status(500).json({ code: -1, error: "db error" });
  }
});

// ── 前端错误上报 ──
app.post("/api/log/client-error", (req: any, res: any) => {
  const { message, stack, component, url } = req.body || {};
  // 脱敏：移除 URL 中的 token、key 等敏感参数
  const safeUrl = (url || '').replace(/([?&](token|key|password|secret|auth)=)[^&]*/gi, '$1***');
  logger.client("前端异常", {
    message: message?.slice(0, 500),
    stack: stack?.slice(0, 1000),
    component,
    url: safeUrl,
    trace_id: req._traceId,
    session_id: req._sessionId,
  });
  res.json({ code: 0 });
});

// ── 公开广告接口 ──
app.get("/api/v1/ads", async (req: any, res: any) => {
  try {
    const [rows]: any = await pool.query(
      "SELECT id, title, image_url, link_url FROM ads WHERE is_active = TRUE AND (start_date IS NULL OR start_date <= CURDATE()) AND (end_date IS NULL OR end_date >= CURDATE()) ORDER BY priority DESC, id DESC LIMIT 5"
    );
    return ok(res, rows);
  } catch (err: any) {
    if (err.errno === 1146) {
      try {
        await pool.query("CREATE TABLE IF NOT EXISTS ads (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, image_url VARCHAR(500), link_url VARCHAR(500), position VARCHAR(20) DEFAULT 'banner', is_active BOOLEAN DEFAULT TRUE, priority INT DEFAULT 0, start_date DATE, end_date DATE, views INT DEFAULT 0, clicks INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
      } catch { /* 建表失败静默处理 */ }
      return ok(res, []);
    }
    logger.error('获取广告失败', { error: err.message, trace_id: req._traceId });
    return ok(res, []);
  }
});

app.post("/api/ads/:id/click", async (req: any, res: any) => {
  try {
    await pool.query("UPDATE ads SET clicks = clicks + 1 WHERE id = ?", [req.params.id]);
    ok(res, null);
  } catch (err: any) {
    logger.warn('广告点击记录失败', { error: err.message, trace_id: req._traceId });
    ok(res, null);
  }
});

// ── API 文档 ──
app.get('/api/v1/openapi.json', (req, res) => {
  res.json(apiSpec);
});

app.get('/api-docs', (req, res) => {
  const html = `<!DOCTYPE html>
<html><head><title>CampusLink API 文档</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/css/style.css">
</head><body>
<div id="api-docs"></div>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest"></script>
<script>
  Scalar.create('#api-docs', { url: '/api/v1/openapi.json' });
</script>
</body></html>`;
  res.type('html').send(html);
});

// ── 路由模块注册前：批量导入接口允许更大请求体 ──
app.use('/api/v1/courses/batch', express.json({ limit: '2mb' }));

// ── 注册路由模块（每个模块独立 try，互不影响） ──
const moduleStatus: string[] = [];

function safeRegister(name: string, fn: () => void) {
  try {
    fn();
    moduleStatus.push(`${name}: ok`);
  } catch (err: any) {
    logger.error(`模块 ${name} 加载失败: ${err.message}`, { stack: err.stack });
    moduleStatus.push(`${name}: FAILED - ${err.message}`);
  }
}

safeRegister("auth",       () => registerAuthRoutes(app, pool));
safeRegister("posts",      () => registerPostRoutes(app, pool));
safeRegister("courses",    () => registerCourseRoutes(app, pool));
safeRegister("upload",     () => registerUploadRoutes(app, imageUpload));
safeRegister("schedule",   () => registerScheduleRoutes(app, pdfUpload, imageUpload));
safeRegister("admin",      () => registerAdminRoutes(app, pool));
safeRegister("registrations", () => registerRegistrationRoutes(app, pool));
safeRegister("feedback",      () => registerFeedbackRoutes(app, pool));
safeRegister("circles",       () => registerCircleRoutes(app, pool));
safeRegister("notices",       () => registerNoticeRoutes(app, pool));

// ── 全局错误处理 ──
app.use((err: any, req: any, res: any, next: any) => {
  logger.error(`未捕获异常: ${err.message}`, { stack: err.stack, trace_id: req._traceId, session_id: req._sessionId, path: req.originalUrl });
  fail(res, 500, "服务器内部错误");
});

// ── 管理后台独立页面 ──
app.get("/admin", (req, res) => {
  const fp = path.join(distDir, "admin.html");
  if (fs.existsSync(fp)) return res.sendFile(fp);
  fail(res, 404, "管理后台页面不存在");
});

// ── 免责声明 ──
app.get("/disclaimer", (req, res) => {
  const fp = path.join(distDir, "disclaimer.html");
  if (fs.existsSync(fp)) return res.sendFile(fp);
  fail(res, 404, "页面不存在");
});

// ── SPA fallback ──
app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
  const filePath = path.join(distDir, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    // HTML 文件禁止缓存，确保浏览器每次拉取最新入口
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    return res.sendFile(filePath);
  }
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(indexPath);
  }
  fail(res, 404, "Not found");
});

// ── 数据库迁移 Runner ──
async function runMigrations() {
  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    logger.info("migrations 目录不存在，跳过");
    return;
  }

  // 确保迁移记录表存在（含 batch 支持）
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name VARCHAR(255) PRIMARY KEY,
    batch INT NOT NULL DEFAULT 1,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 兼容旧表：没有 batch 列的补上
  try {
    await pool.query("ALTER TABLE _migrations ADD COLUMN batch INT NOT NULL DEFAULT 1");
  } catch { /* 列已存在，忽略 */ }

  // 获取当前批次号
  const [batchRows]: any = await pool.query("SELECT COALESCE(MAX(batch), 0) AS max_batch FROM _migrations");
  let currentBatch = batchRows[0].max_batch;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();

  const [applied]: any = await pool.query("SELECT name FROM _migrations");
  const appliedSet = new Set(applied.map((r: any) => r.name));

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    logger.info(`执行迁移: ${file}`);
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (stmtErr: any) {
        logger.warn(`迁移语句失败（跳过继续）: ${file}`, { error: stmtErr.message, sql: stmt.slice(0, 80) });
      }
    }
    currentBatch++;
    await pool.query("INSERT INTO _migrations (name, batch) VALUES (?, ?)", [file, currentBatch]);
    ran++;
  }
  if (ran > 0) logger.info(`迁移完成: ${ran} 条`, { batch: currentBatch });
  else logger.info("数据库已是最新");
}

/**
 * 回滚最后一个批次的所有迁移
 */
async function runRollback() {
  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    logger.info("migrations 目录不存在，跳过");
    return;
  }

  // 获取最后一批次的迁移
  const [batchRows]: any = await pool.query(
    "SELECT name FROM _migrations WHERE batch = (SELECT MAX(batch) FROM _migrations) ORDER BY name DESC",
  );
  if (batchRows.length === 0) {
    logger.info("没有可回滚的迁移");
    return;
  }

  for (const row of batchRows) {
    const upName = row.name;
    const downName = upName.replace('.sql', '.down.sql');
    const downPath = path.join(migrationsDir, downName);

    if (!fs.existsSync(downPath)) {
      logger.warn(`跳过回滚（无 down.sql）: ${upName}`);
      continue;
    }

    const sql = fs.readFileSync(downPath, 'utf8');
    logger.info(`回滚迁移: ${upName} → ${downName}`);
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    await pool.query("DELETE FROM _migrations WHERE name = ?", [upName]);
  }
  logger.info(`回滚完成: ${batchRows.length} 条`);
}

// ── 启动 ──
const PORT = parseInt(process.env.CAMPUSLINK_PORT || "3002");
const HOST = process.env.CAMPUSLINK_HOST || "127.0.0.1";

// ── CLI 命令：迁移回滚 ──
if (process.argv[2] === 'rollback') {
  const runCLI = async () => {
    try {
      await pool.query("SELECT 1");
      await runRollback();
    } catch (err: any) {
      console.error('回滚失败:', err.message);
      process.exit(1);
    }
    process.exit(0);
  };
  runCLI();
} else {

async function start() {
  // ── 必需环境变量检查 ──
  const requiredEnvVars = ['JWT_SECRET', 'CAMPUSLINK_DB_PW', 'ENCRYPTION_KEY'] as const;
  const missing = requiredEnvVars.filter(k => !process.env[k]);
  if (missing.length > 0) {
    logger.error(`缺少必需环境变量: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    await pool.query("SELECT 1");
    logger.info("数据库连接成功");
    await runMigrations();
    logger.info("模块状态", { modules: moduleStatus });

    const server = app.listen(PORT, HOST, () => {
      logger.info(`CampusLink 启动成功 http://${HOST}:${PORT}`, {
        pid: process.pid,
        env: process.env.NODE_ENV || "development",
        node: process.version,
      });
    });

    function shutdown(signal: string) {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`收到 ${signal}，开始优雅关闭...`, { pid: process.pid });

      // 停止接收新请求
      server.close(() => {
        logger.info('HTTP 服务已关闭');
      });

      // 等待进行中请求完成（最多 10 秒）
      const waitStart = Date.now();
      const tryClose = () => {
        if (inFlightRequests <= 0 || Date.now() - waitStart > 10000) {
          logger.info('关闭数据库连接...', { remainingRequests: inFlightRequests });
          pool.end().catch(() => {});
          process.exit(0);
        }
        setTimeout(tryClose, 200);
      };
      setTimeout(tryClose, 500);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // ── 定期健康快照（每 5 分钟） ──
    setInterval(async () => {
      const mem = process.memoryUsage();
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
      const rssMB = Math.round(mem.rss / 1024 / 1024);

      // 连接池状态
      let poolWaiting = 0;
      try {
        const internal: any = (pool as any).pool;
        if (internal) {
          poolWaiting = internal._connectionQueue?.length || 0;
        }
      } catch { /* noop */ }

      // 连接池排队告警
      if (poolWaiting > 0) {
        logger.error('连接池排队', { waiting: poolWaiting });
      }

      // 内存告警（超过 200MB 时发出警告）
      if (rssMB > 200) {
        logger.warn('内存使用过高', { rss: `${rssMB}MB`, heap: `${heapMB}MB` });
      }

      logger.health("健康快照", {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        memory: { heap: `${heapMB}MB`, rss: `${rssMB}MB` },
        poolWaiting,
        node_version: process.version,
      });
    }, 5 * 60 * 1000);
  } catch (err: any) {
    logger.error(`启动失败: ${err.message}`, { stack: err.stack });
    process.exit(1);
  }
}

start();
}
