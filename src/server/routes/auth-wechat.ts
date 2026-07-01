/**
 * 企业微信扫码登录 — 通过 Playwright 代理 CAS 认证
 * 
 * 流程（异步，避免 Nginx 504）：
 * 1. POST /api/v1/auth/wechat-qr → 后台启动 Playwright，立即返回 sessionId
 * 2. POST /api/v1/auth/wechat-poll → 轮询：返回二维码 / 扫码结果 / 登录成功
 * 
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { chromium, Browser, Page } from 'playwright';
import { signAccessToken, signRefreshToken } from '../jwt';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail } from '../response';

// ── 会话管理 ──
interface ScanSession {
  browser: Browser;
  context: any; // BrowserContext — 每个 session 独立，隔离 Cookie
  page: Page;
  status: 'starting' | 'scanning' | 'scanned' | 'done' | 'timeout';
  qrImage: string | null;
  userInfo: { studentId: string; name: string; department: string } | null;
  scheduleData: any | null;  // 课表 API 原始响应，复用于课程同步
  error: string | null;
  createdAt: number;
  scannedAt: number;
  lastProbeTime: number;
}

const sessions = new Map<string, ScanSession>();

/** 安全关闭会话：先关 context 再关 browser，从 Map 移除 */
function closeSession(sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.context.close().catch(() => {});
  s.browser.close().catch(() => {});
  sessions.delete(sessionId);
}

// 每分钟清理过期会话（超过5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > 5 * 60 * 1000) {
      closeSession(id);
      logger.business('扫码会话已清理', { sessionId: id });
    }
  }
}, 60_000);

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 异步获取二维码 */
async function doCaptureQr(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const { page } = session;

  try {
    await page.goto('http://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    const qrIframe = await page.waitForSelector('iframe#qrcodeIframe', { timeout: 15000 });
    if (qrIframe) {
      await page.waitForTimeout(3000);
      const buf = await qrIframe.screenshot();
      session.qrImage = `data:image/png;base64,${buf.toString('base64')}`;
      
      // 扫码后状态检测由 poll handler 中的 fetch probe 完成
    } else {
      const buf = await page.screenshot({ type: 'png' });
      session.qrImage = `data:image/png;base64,${buf.toString('base64')}`;
    }
    session.status = 'scanning';
  } catch (err: any) {
    try {
      const buf = await page.screenshot({ type: 'png' });
      session.qrImage = `data:image/png;base64,${buf.toString('base64')}`;
      session.status = 'scanning';
    } catch {}
    logger.error('获取二维码失败', { error: err.message, sessionId });
  }
}

/** 检查扫码是否成功 — 用新页面探测教务主页，不干扰原登录页 */
async function checkLogin(session: ScanSession): Promise<boolean> {
  try {
    const url = session.page.url();
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    // 已离开 CAS 登录页且到达教务系统主页
    if (hostname === 'jw.scpcfe.cn' && !pathname.includes('login_slogin') && !pathname.includes('/login')) {
      logger.info('checkLogin: 已到达教务系统', { hostname, pathname });
      return true;
    }
    
    // 路径包含教务主页特征
    if (pathname.includes('index_initMenu') || pathname.includes('xgxt')) {
      logger.info('checkLogin: 匹配教务主页路径', { hostname, pathname });
      return true;
    }

    // Cookie 检测
    const cookies = await session.page.context().cookies();
    const hasJwSession = cookies.some(c => 
      (c.name === 'JSESSIONID' || c.name === 'SESSION') && 
      c.domain?.includes('jw.scpcfe.cn')
    );
    if (hasJwSession) return true;

    // 主动探测：用新页面访问教务主页，检查是否真的登录了
    let probePage: Page | null = null;
    try {
      probePage = await session.page.context().newPage();
      await probePage.goto('http://jw.scpcfe.cn/jwglxt/xtgl/index_initMenu.html', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
      const newUrl = probePage.url();
      const newHostname = new URL(newUrl).hostname;
      const newPathname = new URL(newUrl).pathname;
      // 还在教务域名下 = 没被踢到 CAS
      if (newHostname === 'jw.scpcfe.cn' && !newPathname.includes('login_slogin') && !newPathname.includes('/login')) {
        // 二次确认：页面内容不能有登录提示
        const bodyText = await probePage.evaluate(() => document.body.innerText?.slice(0, 500) || '');
        if (!bodyText.includes('统一身份认证') && !bodyText.includes('请登录') && !bodyText.includes('账号登录')) {
          // 真正登录成功，切换到探测页
          await session.page.close().catch(() => {});
          session.page = probePage;
          probePage = null;
          return true;
        }
      }
    } catch {
      // 导航超时 — 检查是否还在教务域名（可能网络慢但登录成功）
      if (probePage) {
        const currentUrl = probePage.url();
        const currentHostname = new URL(currentUrl).hostname;
        const currentPathname = new URL(currentUrl).pathname;
        if (currentHostname === 'jw.scpcfe.cn' && !currentPathname.includes('login_slogin') && !currentPathname.includes('/login')) {
          try {
            const bodyText = await probePage.evaluate(() => document.body.innerText?.slice(0, 500) || '');
            if (!bodyText.includes('统一身份认证') && !bodyText.includes('请登录')) {
              await session.page.close().catch(() => {});
              session.page = probePage;
              probePage = null;
              return true;
            }
          } catch { /* 假阳性 */ }
        }
      }
    } finally {
      if (probePage) probePage.close().catch(() => {});
    }

    return false;
  } catch(err: any) {
    logger.warn('checkLogin异常', { error: err.message });
    return false;
  }
}

/** 按当前日期推算学年学期 */
function getSemestersToTry(): { xnm: string; xqm: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 学年从 9 月开始：上学期 xqm=1 (9-1月)，下学期 xqm=2 (2-6月)，夏季 xqm=3 (7-8月)
  if (month >= 9) return [{ xnm: String(year), xqm: '1' }, { xnm: String(year - 1), xqm: '2' }];
  if (month <= 1) return [{ xnm: String(year - 1), xqm: '1' }, { xnm: String(year - 2), xqm: '2' }];
  if (month <= 6) return [{ xnm: String(year - 1), xqm: '2' }, { xnm: String(year - 1), xqm: '1' }];
  // 7-8 月暑假：优先最近春季学期，兜底上学期
  return [{ xnm: String(year - 1), xqm: '2' }, { xnm: String(year - 1), xqm: '1' }];
}

/** 从课表 API 获取学号（权威来源，xh 字段），多学期试探 */
async function fetchStudentIdAndSchedule(page: Page): Promise<{ studentId: string; scheduleData: any }> {
  const semesters = getSemestersToTry();
  for (const { xnm, xqm } of semesters) {
    try {
      const result = await page.evaluate(async ({ xnm, xqm }) => {
        try {
          const r = await fetch('/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `xnm=${xnm}&xqm=${xqm}`,
          });
          return JSON.stringify(await r.json());
        } catch { return '{}'; }
      }, { xnm, xqm });
      const data = JSON.parse(result);
      const items = data?.xskbList || [];
      if (items.length > 0 && items[0].xh) {
        return { studentId: items[0].xh, scheduleData: data };
      }
    } catch { /* 试下一个学期 */ }
  }
  return { studentId: '', scheduleData: null };
}

/** 从页面文本提取姓名、院系（仅展示用途），以及兜底提取学号 */
async function extractUserInfoFallback(page: Page): Promise<{ name: string; department: string; studentId: string }> {
  let name = '', department = '', studentId = '';
  try {
    const pageText = await page.evaluate(() => document.body?.innerText || '');
    if (!pageText) return { name, department, studentId };

    const nameMatch = pageText.match(/欢迎[你，]\s*([\u4e00-\u9fa5]{2,4})/);
    if (nameMatch) name = nameMatch[1];

    const deptMatch = pageText.match(/(?:学院|系)[：:]\s*([\u4e00-\u9fa5]{2,10})/);
    if (deptMatch) department = deptMatch[1];

    // xh 取不到时，用页面正则兜底（仅限课表 API 失败场景）
    const idMatch = pageText.match(/(\d{10,12})/);
    if (idMatch) studentId = idMatch[1];
  } catch {}
  return { name, department, studentId };
}

export function registerWechatAuthRoutes(app: any, pool: Pool) {
  // ── 1. 发起扫码登录（异步，立即返回 sessionId）──
  app.post('/api/v1/auth/wechat-qr', limiter(1, 5), async (req: Request, res: Response) => {
    const sessionId = genId();
    logger.info('发起扫码登录', { sessionId, trace_id: req._traceId });

    try {
      // 每个会话独立浏览器进程，用完即关，避免并发泄漏
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        locale: 'zh-CN',
      });
      const page = await context.newPage();

      const session: ScanSession = {
        browser, context, page,
        status: 'starting',
        qrImage: null,
        userInfo: null,
        scheduleData: null,
        error: null,
        createdAt: Date.now(),
        scannedAt: 0,
        lastProbeTime: 0,
      };
      sessions.set(sessionId, session);

      // 立即返回 sessionId，后台异步执行
      ok(res, { sessionId });

      // 后台获取二维码
      await doCaptureQr(sessionId);

    } catch (err: any) {
      closeSession(sessionId);
      logger.error('启动浏览器失败', { error: err.message, stack: err.stack, trace_id: req._traceId });
      if (!res.headersSent) {
        const hint = err.message?.includes('Executable doesn\'t exist') ? '服务器未安装浏览器，请运行 npx playwright install chromium' : '';
        return fail(res, 500, hint || `启动浏览器失败：${err.message?.slice(0, 80) || '请重试'}`);
      }
    }
  });

  // ── 2. 轮询登录状态 ──
  app.post('/api/v1/auth/wechat-poll', limiter(5, 30), async (req: Request, res: Response) => {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return fail(res, 400, '缺少 sessionId');
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return fail(res, 404, '会话已过期或不存在，请重新扫码');
    }

    try {
      // 如果二维码还没准备好
      if (session.status === 'starting') {
        return ok(res, { status: 'starting' });
      }

      // 如果出错
      if (session.status === 'timeout') {
        return ok(res, { status: 'error', message: session.error || '获取二维码超时，请重试' });
      }

      // 如果还没扫码，返回二维码
      if (session.status === 'scanning' && !session.qrImage) {
        return ok(res, { status: 'starting' });
      }

      // ── scanning 状态：每 3 秒检测页面是否跳离了 CAS 登录页 ──
      if (session.status === 'scanning' && session.qrImage) {
        // 给 15 秒缓冲，避免初始加载时的误触
        if (Date.now() - session.createdAt < 15000) {
          return ok(res, { status: 'scanning', qrCode: session.qrImage });
        }

        if (Date.now() - session.lastProbeTime >= 3000) {
          session.lastProbeTime = Date.now();

          try {
            const url = session.page.url();
            // 主页面离开了 CAS 登录页 = CAS 认证完成
            if (!url.includes('login_slogin') && !url.includes('cas/login')) {
              session.status = 'scanned';
              session.scannedAt = Date.now();
              logger.info('页面已离开 CAS 登录页 — 扫码成功', { sessionId, url: url.slice(0, 200) });
              return ok(res, { status: 'scanned' });
            }
          } catch (e) { logger.warn('page url error', { error: String(e), sessionId }); }
        }
        return ok(res, { status: 'scanning', qrCode: session.qrImage });
      }

      // 已扫码，等待 CAS 完成 ticket 验证后导航到教务系统提取用户信息
      if (session.status === 'scanned') {
        // 给 CAS 2 秒完成 ticket 验证和 Session Cookie 设置
        if (session.scannedAt === 0 || Date.now() - session.scannedAt < 2000) {
          return ok(res, { status: 'scanned' });
        }

        try {
          await session.page.goto('http://jw.scpcfe.cn/jwglxt/xtgl/index_initMenu.html', {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          const url = session.page.url();
          const hostname = new URL(url).hostname;
          if (hostname === 'jw.scpcfe.cn') {
            // 从课表 API 取学号（xh 字段，权威来源） + 缓存课表数据供后续同步
            const { studentId: scheduleId, scheduleData } = await fetchStudentIdAndSchedule(session.page);
            // 从页面文本取姓名和院系（仅展示用途），xh 取不到时用正则兜底
            const fb = await extractUserInfoFallback(session.page);
            const studentId = scheduleId || fb.studentId;
            const name = fb.name;
            const department = fb.department;
            if (studentId) {
              session.userInfo = { studentId, name, department };
              session.scheduleData = scheduleData;
              session.status = 'done';
              logger.info('用户信息提取成功', { sessionId, studentId, source: scheduleId ? 'schedule' : 'fallback' });
            }
          }
        } catch {}
        if (session.status !== 'done') {
          return ok(res, { status: 'scanned' });
        }
      }

      // ── 登录成功！使用已提取的用户信息 ──
      if (session.status !== 'done' || !session.userInfo) {
        // 不应该到这里，防御性处理
        closeSession(sessionId);
        return fail(res, 500, '登录状态异常，请重试');
      }

      logger.info('扫码登录成功', { sessionId, url: session.page.url().slice(0, 120) });

      const { studentId, name, department } = session.userInfo;

      if (!studentId) {
        closeSession(sessionId);
        return fail(res, 500, '未能获取学号，请确认已登录成功');
      }

      // ── 自动注册/登录 ──
      const [rows]: any = await pool.query('SELECT * FROM users WHERE student_id = ?', [studentId]);
      let user: any;
      let isNew = false;

      if (rows.length > 0) {
        user = rows[0];
        if (name && user.nickname !== name) {
          await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [name, user.id]);
        }
        logger.business('企业微信登录（已有账号）', { user_id: user.id, student_id: studentId, trace_id: req._traceId });
      } else {
        isNew = true;
        const [result]: any = await pool.query(
          "INSERT INTO users (student_id, nickname, auth_status, department) VALUES (?, ?, 'verified', ?)",
          [studentId, name || '用户', department || null],
        );
        user = {
          id: result.insertId,
          student_id: studentId,
          nickname: name || '用户',
          auth_status: 'verified',
          is_admin: false,
          department: department || null,
        };
        logger.business('企业微信新用户自动注册', { user_id: user.id, student_id: studentId, trace_id: req._traceId });
      }

      // ── 同步课表（复用扫码阶段已缓存的课表数据）──
      let courseCount = 0;
      try {
        const scheduleData = session.scheduleData;
        if (scheduleData?.xskbList?.length) {
          const courses = scheduleData.xskbList.map((item: any) => {
            const wkMap: Record<string, number> = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '日':7 };
            const weekday = wkMap[item.xqjmc?.replace(/^星期/, '')] || 1;
            const start = parseInt(item.ksxz) || 1;
            const end = parseInt(item.jsz) || start;
            const weekTypeMap: Record<string, string> = { '0': 'all', '1': 'odd', '2': 'even' };
            return {
              user_id: user.id,
              name: item.kcmc || '未知课程',
              teacher: item.xm || '',
              classroom: item.jxdd || '',
              weekday,
              start_period: start,
              period_span: Math.max(end - start + 1, 1),
              week_start: parseInt(item.qsz) || 1,
              week_end: parseInt(item.zz) || 18,
              week_type: weekTypeMap[item.sjkjbz] || 'all',
              course_type: 'theory',
            };
          });

          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM courses WHERE user_id = ?', [user.id]);
            for (const c of courses) {
              await conn.query(
                `INSERT INTO courses (user_id, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, course_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [c.user_id, c.name, c.teacher, c.classroom, c.weekday, c.start_period, c.period_span, c.week_start, c.week_end, c.week_type, c.course_type]
              );
            }
            await conn.commit();
            courseCount = courses.length;
            logger.business('课表自动同步', { user_id: user.id, count: courseCount, trace_id: req._traceId });
          } catch (e: any) {
            await conn.rollback();
            logger.error('课表同步失败', { error: e.message, user_id: user.id, trace_id: req._traceId });
          } finally { conn.release(); }
        }
      } catch (e: any) {
        logger.warn('课表自动同步失败（可忽略）', { error: e.message, user_id: user.id, trace_id: req._traceId });
      }

      // ── 关闭会话 ──
      closeSession(sessionId);

      // ── 下发 JWT ──
      const isAdmin = !!user.is_admin;
      const accessToken = signAccessToken(user.id, isAdmin);
      const refreshToken = signRefreshToken(user.id);
      const deviceInfo = ((req.headers['user-agent'] as string) || '').slice(0, 180) || null;

      try {
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]);
        await pool.query(
          'INSERT INTO refresh_tokens (user_id, token, expires_at, device_info, ip_address) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?)',
          [user.id, refreshToken, Math.floor(Date.now() / 1000) + 2592000, deviceInfo, req.ip || ''],
        );
      } catch { /* noop */ }

      pool.query('UPDATE users SET last_login = NOW(), ip_address = ? WHERE id = ?', [req.ip || '', user.id])
        .catch(() => {});

      return ok(res, {
        status: 'done',
        token: accessToken,
        refresh_token: refreshToken,
        user: { isAdmin, authStatus: 'verified', department: user.department || '' },
        sync: {
          coursesImported: courseCount,
          message: courseCount > 0 ? `已同步 ${courseCount} 门课程` : '未同步课表',
        },
      });

    } catch (err: any) {
      logger.error('轮询扫码结果失败', { error: err.message, sessionId, trace_id: req._traceId });
      closeSession(sessionId);
      return fail(res, 500, '登录处理失败，请重试');
    }
  });
}
