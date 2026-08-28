/**
 * 企业微信扫码登录 — 通过 Playwright 代理 CAS 认证
 *
 * 流程（异步，避免 Nginx 504）：
 * 1. POST /api/v1/auth/wechat-qr → 后台启动 Playwright，立即返回 sessionId
 * 2. POST /api/v1/auth/wechat-poll → 轮询：返回二维码 / 扫码结果 / 登录成功
 *
 * 架构边界（2026-07-04 重构）：浏览器只负责"人扫码 + CAS 认证"这一件事——扫码成功、
 * 拿到用户信息后立即 context.cookies() 取走全部 Cookie、releaseSession()，
 * 课表/成绩/考试全部改成带 Cookie 的直接 HTTP 请求（并发池限流），不再用 Playwright
 * page.evaluate 在浏览器里发请求。
 * 收益：浏览器占用时间从 ~60s 缩到扫码这一段（~15s），MAX_CONCURRENT_BROWSERS 的
 * 实际吞吐同步提升；慢的主因从来不是 CDP 序列化开销（那是毫秒级），而是①每个模块
 * 一次 page.goto 等页面加载(十几秒)②8 个学期组合串行请求③浏览器全程占着——去掉页面
 * 导航、改并发、提前放浏览器，这三条才是提速的真实来源。
 * 已否决方案：纯 HTTP 逆向整个 CAS+企业微信扫码流程——企业微信 OAuth 那段带反自动化
 * 参数，学校随时可能升级导致全废，维护成本远超省下的 200MB 浏览器内存。浏览器只用来
 * 完成"人扫码"这一步，是最稳的边界。
 *
 * 2026-07-05 优化：用预热浏览器（warmBrowser）替代每次 chromium.launch()。
 * 第一个请求仍需等 10-15s 启动浏览器，后续请求复用同一个浏览器实例，
 * 每个会话创建独立 context/page 做隔离，扫码完成后只关 context/page，浏览器常驻。
 */
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { Pool } from 'mysql2/promise';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { signAccessToken, signRefreshToken } from '../jwt';
import { auth, clearAuthCache } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail } from '../response';
import { encrypt, decrypt } from '../crypto';
import { hashToken } from '../jwt';
import { COURSE_COLORS } from '../../types';

/** 扫码同步课表按"课程名"分配颜色——同一门课固定同一个颜色，不会每次刷新都变；
 * 之前这里完全没设 color_class，MySQL 用列默认值兜底，导致所有课程清一色蓝 */
function assignCourseColors<T extends { name: string }>(courses: T[]): (T & { color_class: string })[] {
  const colorMap = new Map<string, string>();
  let idx = 0;
  return courses.map((c) => {
    if (!colorMap.has(c.name)) {
      colorMap.set(c.name, COURSE_COLORS[idx % COURSE_COLORS.length]);
      idx++;
    }
    return { ...c, color_class: colorMap.get(c.name)! };
  });
}

// ── 预热浏览器（复用 chromium 实例，省掉每次 ~15s 的 launch） ──
let warmBrowser: Browser | null = null;
let warmBrowserLaunching: Promise<Browser> | null = null;

async function getWarmBrowser(): Promise<Browser> {
  if (warmBrowser?.isConnected()) return warmBrowser;
  if (warmBrowserLaunching) return warmBrowserLaunching;
  logger.info('预热浏览器不存在或已断开，重新创建', {
    hadBrowser: !!warmBrowser,
    hadLaunching: !!warmBrowserLaunching,
  });
  warmBrowserLaunching = chromium
    .launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    .then((browser) => {
      warmBrowser = browser;
      warmBrowserLaunching = null;
      logger.info('预热浏览器已就绪');
      // 浏览器意外断开（崩溃/被系统OOM杀掉）时主动立即重新拉起，而不是被动等下一个
      // 倒霉的用户请求触发 lazy 重建——那样这个用户就要平白多等 ~10-15s 的启动时间
      browser.once('disconnected', () => {
        logger.security('预热浏览器意外断开，主动重新拉起', {});
        if (warmBrowser === browser) warmBrowser = null;
        getWarmBrowser().catch((err) => logger.error('主动重建预热浏览器失败', { error: err.message }));
      });
      return browser;
    })
    .catch((err) => {
      warmBrowserLaunching = null;
      logger.error('预热浏览器创建失败', { error: err.message });
      throw err;
    });
  return warmBrowserLaunching;
}

// 进程启动时立即预热，而不是等第一个真实用户请求来触发——避免"每次发版重启后，
// 第一个来扫码的倒霉用户平白多等 ~10-15s 浏览器启动时间"这种间歇性变慢
getWarmBrowser().catch((err) =>
  logger.error('启动时预热浏览器失败（不阻塞服务启动，首个请求会重试）', { error: err.message }),
);

// 进程退出时关闭预热浏览器
process.on('exit', () => {
  warmBrowser?.close().catch(() => {});
});
process.on('SIGTERM', () => {
  warmBrowser?.close().catch(() => {});
});
process.on('SIGINT', () => {
  warmBrowser?.close().catch(() => {});
});

// ── 会话管理 ──
interface ScanSession {
  context: BrowserContext; // 每个 session 独立 BrowserContext，隔离 Cookie
  page: Page;
  status: 'starting' | 'scanning' | 'scanned' | 'done' | 'timeout';
  qrImage: string | null;
  userInfo: { studentId: string; name: string; department: string } | null;
  scheduleData: any | null; // 课表多学期数组 [{xnm,xqm,courses}]，登录时全量抓取近3年+下一学年，复用于课程同步
  gradesData: any[] | null; // 成绩数据，登录时顺带抓取
  examsData: any[] | null; // 考试安排数据，登录时顺带抓取
  result: any | null; // done 后的最终响应缓存：幂等返回，防止唯一一次响应被 429/网络丢失后永久卡死
  extracting: boolean; // 信息提取锁：防止并发 poll 同时对同一 page 调 goto 互相打断
  landingUrl: string | null; // CAS 登录后着陆页 URL，课表页提取失败时兜底；也作为 HTTP 直取阶段的 Referer
  browserReleased: boolean; // 浏览器资源（context/page）是否已释放
  ip: string; // 发起者 IP，用于 per-IP 并发软上限（区分"你自己排队"和"全站排队"）
  error: string | null;
  createdAt: number;
  scannedAt: number;
  lastProbeTime: number;
}

const sessions = new Map<string, ScanSession>();

// 全局浏览器并发上限：每个 chromium 页面导航耗 CPU（N100 只有 4 核），
// 设 6 个确保 CPU 不被抢满，同时够开学高峰期使用。
// 内存方面每个 chromium ~150-250MB，6 个约为 1-1.5GB，在 7.5G 内存范围内。
const MAX_CONCURRENT_BROWSERS = 6;

// 单 IP 并发软上限：一台手机不可能同时扫两个码
const MAX_CONCURRENT_PER_IP = 2;

// 全局并发上限已满时的等待队列：FIFO，最多等 30 秒，超时返回 503
// 避免并发顶满时硬拒绝——正常用户有点耐心就能排进去，攻击者多 IP 轰炸也排不上
interface WaitEntry {
  resolve: (slot: boolean) => void;
  timer: NodeJS.Timeout;
  ip: string;
}
const WAIT_TIMEOUT_MS = 30_000;
const waitQueue: WaitEntry[] = [];

function notifyNextWaiter() {
  while (waitQueue.length > 0) {
    const entry = waitQueue.shift()!;
    if (runningBrowserCount() < MAX_CONCURRENT_BROWSERS) {
      clearTimeout(entry.timer);
      entry.resolve(true);
      return;
    }
    // 还没空位，继续往下找——但实际不会发生，因为调用方刚释放了一个槽
  }
}

async function waitForSlot(ip: string): Promise<boolean> {
  if (runningBrowserCount() < MAX_CONCURRENT_BROWSERS) return true;

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      // 超时：把自己从队列删掉，返回 false
      const idx = waitQueue.findIndex((e) => e.resolve === resolve);
      if (idx >= 0) waitQueue.splice(idx, 1);
      resolve(false);
    }, WAIT_TIMEOUT_MS);

    waitQueue.push({ resolve, timer, ip });
    logger.info('扫码登录进入等待队列', { queueLength: waitQueue.length, ip });
  });
}

// 会话最长存活时间：从 5 分钟放宽到 7 分钟，给二维码扫描留更多余量
// （前端轮询超时同步放宽到 6 分钟，这里多留 1 分钟缓冲，避免服务端先于前端判定过期）
const SESSION_TTL_MS = 7 * 60 * 1000;

/** 与 Playwright context 创建时使用的 UA 保持一致——HTTP 直取阶段的请求头要跟"浏览器发出的"一致，
 * 正方对这类头有校验的先例，UA 前后不一致容易被判定成异常请求 */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const JWGLXT_ORIGIN = 'https://jw-scpcfe-cn.scvcfe.edu.cn';

function runningBrowserCount(): number {
  let n = 0;
  for (const s of sessions.values()) if (!s.browserReleased) n++;
  return n;
}

function runningBrowserCountForIp(ip: string): number {
  let n = 0;
  for (const s of sessions.values()) if (!s.browserReleased && s.ip === ip) n++;
  return n;
}

/** 只释放会话的浏览器资源（context + page），预热浏览器保持存活 */
function releaseSession(s: ScanSession) {
  if (s.browserReleased) return;
  s.browserReleased = true;
  s.page.close().catch(() => {});
  s.context.close().catch(() => {});
  // 唤醒等待队列中的下一个请求
  notifyNextWaiter();
}

/** 安全关闭会话并清理资源 */
function closeSession(sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s) return;
  releaseSession(s);
  sessions.delete(sessionId);
  // releaseSession 已通知等待队列，这里不需要重复通知
}

// 每分钟清理过期会话
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      closeSession(id);
      logger.business('扫码会话已清理', { sessionId: id });
    }
  }
}, 60_000);

/** sessionId 即扫码登录会话的裸凭证——谁持有它就能轮询取走 JWT，必须用 CSPRNG，不能用 Math.random() */
function genId(): string {
  return randomBytes(24).toString('hex'); // 192bit 熵
}

/**
 * 异步获取二维码。traceId 为发起 /wechat-qr 请求的 trace_id，用于串联该请求的全链路日志
 *
 * 2026-07-06 修复"二维码经常加载出莫名其妙的图片"：根因是①截图前只盲等固定 1500ms，
 * 二维码图片实际渲染耗时受网络/school服务器状况影响，经常等不够就截到空白/加载中的占位内容；
 * ②任何异常（包括"根本没等到二维码 iframe"这种情况）都会掉进兜底分支，把当前整个页面
 * （可能是登录表单、错误页、任何东西）截图冒充二维码显示给用户——这才是"莫名其妙的图片"
 * 的真正来源，不是"没截到图"而是"截到了不该展示的图还当成二维码展示了"。
 * 修复思路：①改用 iframe 内部 networkidle 等待真实渲染完成，而不是猜一个固定时间；
 * ②截图后用文件体积做一个粗糙但有效的"空白检测"（真二维码是黑白密集像素图，体积不会
 * 小到几百字节，加载中占位图/纯色块 PNG 压缩后体积很小）；③按尝试次数重试（每次都重新
 * page.goto 刷新页面状态，而不是在同一个可能已经卡住的页面上反复截图）；④重试耗尽后
 * 明确把 session 标记成失败状态，让前端展示"获取二维码失败，请重试"，而不是继续展示
 * 一张误导用户的假二维码——这样用户不用再靠手动反复点"重新扫码"来赌运气，也就不会
 * 再动不动就撞上同 IP 限流。
 */
async function doCaptureQr(sessionId: string, traceId?: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    logger.warn('doCaptureQr: session不存在', { sessionId, trace_id: traceId });
    return;
  }
  const { page } = session;

  const MAX_ATTEMPTS = 3;
  const MIN_VALID_QR_BYTES = 1000; // 经验阈值：加载中占位图/空白截图 PNG 体积通常远小于此

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.info(`doCaptureQr: 第${attempt}次尝试，导航 CAS 登录页`, { sessionId, trace_id: traceId });
      await page.goto('http://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      logger.info('doCaptureQr: CAS 页加载完成，找二维码 iframe', {
        sessionId,
        trace_id: traceId,
        attempt,
        url: page.url().slice(0, 150),
      });

      const qrIframe = await page.waitForSelector('iframe#qrcodeIframe', { timeout: 15000 });

      // 等二维码图片真正渲染完
      const frame = await qrIframe.contentFrame();
      if (frame) {
        await frame.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
          logger.warn('doCaptureQr: iframe networkidle 等待超时，改等 img 元素', {
            sessionId,
            trace_id: traceId,
            attempt,
          });
          // networkidle 超时通常是 iframe 内有长连接轮询，不影响二维码图加载；
          // 改为等 img 元素出现+稳定，比固定等待更可靠
          frame.waitForSelector('img', { timeout: 8000 }).catch(() => {
            logger.warn('doCaptureQr: iframe 内 img 也超时，继续截图碰运气', { sessionId, trace_id: traceId, attempt });
          });
        });
      } else {
        await page.waitForTimeout(2000);
      }

      const buf = await qrIframe.screenshot();

      if (buf.length < MIN_VALID_QR_BYTES) {
        logger.warn(`doCaptureQr: 第${attempt}次截图疑似空白/占位图（体积${buf.length}字节过小）`, {
          sessionId,
          trace_id: traceId,
        });
        if (attempt < MAX_ATTEMPTS) {
          await page.waitForTimeout(1000);
          continue;
        }
        // 重试耗尽仍然疑似空白：不展示这张可疑的图，走下面统一的失败分支
        throw new Error(`二维码截图体积异常（${buf.length}字节），可能未渲染完成`);
      }

      session.qrImage = `data:image/png;base64,${buf.toString('base64')}`;
      session.status = 'scanning';
      logger.info('doCaptureQr: 二维码截图完成', { sessionId, trace_id: traceId, size: buf.length, attempt });
      return;
    } catch (err: any) {
      logger.warn(`doCaptureQr: 第${attempt}次尝试异常`, { sessionId, trace_id: traceId, error: err.message });
      if (attempt < MAX_ATTEMPTS) {
        await page.waitForTimeout(1000);
        continue;
      }
      // 重试耗尽：不再用整页截图冒充二维码（那正是历史 bug 的根因），
      // 明确标记失败让前端提示"获取二维码失败，请重试"
      logger.error('doCaptureQr: 重试耗尽，放弃并标记失败', { sessionId, trace_id: traceId, error: err.message });
      session.status = 'timeout';
      session.error = '获取二维码失败，请重试';
    }
  }
}

/**
 * 学期编号：正方系统这个部署用的是"秋=3，春=12"的经典编码（已用真实数据多轮交叉验证过，
 * 不是直觉以为的 1/2）。手动猜学期用这个顺序：当前学期优先，上一个学期次之。
 */
function getSemestersToTry(): { xnm: string; xqm: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // xnm = 该学年起始自然年（秋春统一），与 currentTerm.ts 约定一致。例如 2025-2026 学年：秋=(2025,3)，春=(2025,12)。
  if (month >= 9)
    return [
      { xnm: String(year), xqm: '3' },
      { xnm: String(year), xqm: '12' },
    ];
  if (month === 1)
    return [
      { xnm: String(year - 1), xqm: '3' },
      { xnm: String(year - 1), xqm: '12' },
    ];
  // 2-8月：当前=春季(xnm=year-1)，上一个=去年秋季(xnm=year-1，同一学年)
  return [
    { xnm: String(year - 1), xqm: '12' },
    { xnm: String(year - 1), xqm: '3' },
  ];
}

/**
 * 解析教务系统"周次"文本(zcd)成具体的活动周次数组。实测格式比想象中复杂：逗号分隔多段范围
 * (如"3-4周,6-11周,13-19周")、每段可能带"(单)"/"(双)"只限定这一段内的单/双周有课、单周不带
 * 括弧(如"17周")——之前只取第一段的起止数字当 week_start/week_end，把其余范围和单双周信息全丢了，
 * 导致"哪几周有课"基本全错。现在按段解析，每段独立展开成具体周次再合并去重。
 */
function parseWeekPattern(text: string): number[] {
  if (!text) return [];
  const weeks = new Set<number>();
  for (const seg of text.split(/[,，]/)) {
    const m = seg.match(/(\d+)(?:[-~](\d+))?/);
    if (!m) continue;
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : start;
    const isOdd = /单/.test(seg);
    const isEven = /双/.test(seg);
    for (let w = start; w <= end; w++) {
      if (isOdd && w % 2 === 0) continue;
      if (isEven && w % 2 === 1) continue;
      weeks.add(w);
    }
  }
  return Array.from(weeks).sort((a, b) => a - b);
}

/**
 * 课表要抓的学年范围：近3年 + 下一学年。之所以要包含"下一学年"，是实测发现学校会提前发布
 * 下学年课表（2026年7月就已经能查到2026-2027学年第1学期的课），只往回猜3年会漏掉这个。
 */
function getSchoolYearsToTry(yearsBack = 1): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currentAcademicStartYear = month >= 9 ? year : year - 1;
  // 先查当前学年（最可能有数据），再往前回溯；下一学年也查（学校会提前发布下学期课表）
  const years = [currentAcademicStartYear + 1];
  for (let i = 0; i < yearsBack; i++) years.push(currentAcademicStartYear - i);
  return years.map(String);
}

// ── HTTP 直取：并发限流池 ──

type LimiterFn = <T>(fn: () => Promise<T>) => Promise<T>;

/** 简单的并发限流器：同时最多 concurrency 个任务在跑，其余排队。
 * 学校教务后端很弱，8+ 个请求同时砸过去轻则慢重则触发风控/封 IP（全校学生共用出口 IP 的
 * NAT 场景，封了是集体事故）——限并发 3，总耗时比"全部打满并发"差不了两秒，稳得多。 */
function createLimiter(concurrency: number): LimiterFn {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };
}

/** 响应体是不是登录页 HTML——会话失效/Cookie 没带对的信号，不能当成"结构合法但空"悄悄吞掉，
 * 那样会跟"这学期真没数据"表现得一模一样，又是一个"结构合法但空"陷阱。 */
function isLoginPageHtml(text: string): boolean {
  const head = text.slice(0, 300);
  return /<!DOCTYPE html/i.test(head) || /login_slogin/i.test(head) || /<html[\s>]/i.test(head);
}

interface JwFetchResult {
  json: any | null;
  invalidSession: boolean;
  error: string | null;
}

/** 带 Cookie 直取教务系统接口，头部照抄浏览器请求（正方对这些头有校验的先例）。
 * Cookie 用完即弃、不持久化——session cookie 也是凭据，这里只是转发不做存储。 */
async function jwFetchJson(
  url: string,
  body: string,
  cookieHeader: string,
  refererUrl: string,
): Promise<JwFetchResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': BROWSER_USER_AGENT,
        Referer: refererUrl,
        Cookie: cookieHeader,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await resp.text();
    if (isLoginPageHtml(text)) return { json: null, invalidSession: true, error: null };
    try {
      return { json: JSON.parse(text), invalidSession: false, error: null };
    } catch {
      return {
        json: null,
        invalidSession: false,
        error: `http=${resp.status} 非JSON响应(前80字符)=${text.replace(/\s+/g, ' ').slice(0, 80)}`,
      };
    }
  } catch (e: any) {
    return { json: null, invalidSession: false, error: e.message };
  }
}

/**
 * 课表页面：不再"猜一个当前学期就够了"，而是把近3年+下一学年、秋(xqm=3)/春(xqm=12)两个合法
 * 编码的全部组合都查一遍并发（经共享限流池）——前端做成跟官网一样的"选学年+学期查看"体验，
 * 选择器筛的是本地已存数据，不是每次都实时连教务系统查，所以得在登录这一次性机会里把能拿到
 * 的都拿到。字段映射已用官网真实课程(职业礼仪/会计信息系统应用等，含跨星期样本)完整交叉
 * 验证过，全部确认无误：xqj=真实星期几(1=周一...跟本项目惯例一致)、jc/jcor/jcs=节次范围文本、
 * zcd=真实周次文本、cdmc=上课地点、jxbmc=教学班、xm=教师姓名、xqmc=校区、khfsmc=考核方式、
 * kcxszc=课程学时组成、zhxs=周学时、zxs=总学时、xf=学分。
 */
async function fetchAllSchedulesHttp(
  cookieHeader: string,
  refererUrl: string,
  limit: LimiterFn,
  logCb?: (msg: string) => void,
): Promise<{
  studentId: string;
  studentName: string;
  className: string;
  terms: { xnm: string; xqm: string; courses: any[] }[];
}> {
  let studentId = '';
  let studentName = '';
  let className = '';
  const terms: { xnm: string; xqm: string; courses: any[] }[] = [];

  const years = getSchoolYearsToTry();
  const candidates: { xnm: string; xqm: string }[] = [];
  for (const xnm of years) {
    for (const xqm of ['3', '12']) candidates.push({ xnm, xqm });
  }

  const url = `${JWGLXT_ORIGIN}/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151`;
  const results = await Promise.all(
    candidates.map(({ xnm, xqm }) =>
      limit(async () => {
        const body = `xnm=${xnm}&xqm=${xqm}&_search=false&queryModel.showCount=200&queryModel.currentPage=1&queryModel.sortName=&queryModel.sortOrder=asc&time=0`;
        const r = await jwFetchJson(url, body, cookieHeader, refererUrl);
        return { xnm, xqm, r };
      }),
    ),
  );

  for (const { xnm, xqm, r } of results) {
    if (r.invalidSession) {
      logCb?.(`课表 学期${xnm}-${xqm}: 会话已失效(返回登录页而非JSON)`);
      continue;
    }
    if (r.error) {
      logCb?.(`课表 学期${xnm}-${xqm}: ${r.error}`);
      continue;
    }
    const data = r.json;
    const rawItems: any[] = Array.isArray(data?.kbList) ? data.kbList : [];
    // kbList 接口本身会返回重复行(同一门课同一时段最多重复5条，果果查库验证过)——不是我们
    // 扫描了两次；入库前按"课程+星期+节次+周次+地点+教学班"组合去重，同组合只留第一条。
    // 去重键用 xqj(真实星期几)+zcd(真实周次文本)。
    const seen = new Set<string>();
    const items = rawItems.filter((it) => {
      const key = [it.kcmc, it.xqj, it.jcs || it.jcor || it.jc, it.zcd, it.cdmc, it.jxbmc].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    logCb?.(`课表 学期${xnm}-${xqm}: 原始${rawItems.length}条去重后${items.length}条`);

    // 学号/姓名/班级只需要拿一次，第一个查到的非空结果就够了
    if (!studentId) {
      const info = data?.xsxx || {};
      studentId = items[0]?.xh || info.XH || '';
      studentName = info.XM || '';
      className = info.BJMC || '';
    }

    if (items.length) terms.push({ xnm, xqm, courses: items });
  }

  return { studentId, studentName, className, terms };
}

/**
 * 成绩：新接口 xsxyqk_cxJxzxjhxfyqKcxx.html(分页结构) 优先，老接口 cjcx_cxDgXscj.html 兜底；
 * 按候选学期顺序试，第一个非空就返回，不跨学期合并。每次请求仍经共享限流池，与课表/考试的
 * 并发请求共用同一个并发上限，不会额外把总并发数顶高。
 */
async function fetchGradesHttp(
  cookieHeader: string,
  refererUrl: string,
  limit: LimiterFn,
  logCb?: (msg: string) => void,
): Promise<any[]> {
  const semesters = getSemestersToTry();
  const endpoints = [
    {
      label: '新接口xsxyqk',
      url: `${JWGLXT_ORIGIN}/jwglxt/xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515&sf_request_type=ajax`,
    },
    { label: '旧接口cjcx', url: `${JWGLXT_ORIGIN}/jwglxt/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005` },
  ];
  // key = 学期-课程名，去重用；旧接口（后遍历）优先——它有完整 cj 字段
  const gradeMap = new Map<string, any>();

  for (const ep of endpoints) {
    for (const { xnm, xqm } of semesters) {
      const body = `xnm=${xnm}&xqm=${xqm}&_search=false&queryModel.showCount=200&queryModel.currentPage=1&queryModel.sortName=&queryModel.sortOrder=asc&time=0`;
      const r = await limit(() => jwFetchJson(ep.url, body, cookieHeader, refererUrl));
      if (r.invalidSession) {
        logCb?.(`成绩[${ep.label}] 学期${xnm}-${xqm}: 会话已失效(返回登录页而非JSON)`);
        continue;
      }
      if (r.error) {
        logCb?.(`成绩[${ep.label}] 学期${xnm}-${xqm}: ${r.error}`);
        continue;
      }
      const data = r.json;
      const items = data?.items || data?.currentResult;
      if (Array.isArray(items) && items.length) {
        logCb?.(`成绩[${ep.label}] 学期${xnm}-${xqm}: 命中${items.length}条`);
        for (const i of items) {
          const key = `${xnm}-${xqm}-${i.kcmc || ''}`;
          // 后遍历的端点覆盖前一个（旧接口有完整 cj 成绩字段）
          gradeMap.set(key, {
            schoolYear: xnm,
            schoolTerm: xqm,
            courseName: i.kcmc || '未知课程',
            teacher: i.jsxm || '',
            credit: i.xf ?? '',
            grade: i.cj ?? '',
            gradePoint: i.jd ?? '',
            examNature: i.ksxz ?? '',
            courseNature: i.kcxzmc ?? '',
            courseCategory: i.kclbmc ?? '',
            courseAttribution: i.kcgsmc ?? '',
            openCollege: i.kkbmmc ?? '',
          });
        }
      }
    }
  }
  return Array.from(gradeMap.values());
}

/**
 * 考试安排：gnmkdm=N358105 已手动核对菜单链接确认无误。按候选学期顺序试，收集所有学期数据。
 */
async function fetchExamsHttp(
  cookieHeader: string,
  refererUrl: string,
  limit: LimiterFn,
  logCb?: (msg: string) => void,
): Promise<any[]> {
  const semesters = getSemestersToTry();
  const url = `${JWGLXT_ORIGIN}/jwglxt/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105`;
  const allExams: any[] = [];

  for (const { xnm, xqm } of semesters) {
    const body = `xnm=${xnm}&xqm=${xqm}&_search=false&queryModel.showCount=200&queryModel.currentPage=1&queryModel.sortName=&queryModel.sortOrder=asc&time=0`;
    const r = await limit(() => jwFetchJson(url, body, cookieHeader, refererUrl));
    if (r.invalidSession) {
      logCb?.(`考试 学期${xnm}-${xqm}: 会话已失效(返回登录页而非JSON)`);
      continue;
    }
    if (r.error) {
      logCb?.(`考试 学期${xnm}-${xqm}: ${r.error}`);
      continue;
    }
    const items = r.json?.items;
    if (Array.isArray(items) && items.length) {
      logCb?.(`考试 学期${xnm}-${xqm}: 命中${items.length}条`);
      // 收集所有学期的数据，不提前返回（与 fetchGradesHttp 一致）
      for (const i of items) {
        allExams.push({
          schoolYear: xnm,
          schoolTerm: xqm,
          courseName: i.kcmc || '未知课程',
          teacher: i.jsxx || '',
          examName: i.ksmc ?? '',
          examTime: i.kssj ?? '',
          examLocation: i.cdmc ?? '',
          campus: i.xqmc ?? '',
          seatNumber: i.zwh ?? '',
        });
      }
    }
  }
  return allExams;
}

/** 我们代码里硬编码的 gnmkdm，跟真实菜单交叉校验用（模块名关键词 → 期望的 gnmkdm） */
const EXPECTED_GNMKDM: { keyword: string; label: string; expected: string }[] = [
  { keyword: '课表', label: '课表', expected: 'N2151' },
  { keyword: '学业情况', label: '学业情况(成绩)', expected: 'N105515' },
  { keyword: '考试', label: '考试安排', expected: 'N358105' },
];

function extractGnmkdm(text: string): string | null {
  const m = text.match(/gnmkdm=([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

/**
 * gnmkdm 交叉校验 —— 永久保留的安全网（不是本次清理的"侦察/诊断代码"范畴）。
 * 背景：课表/成绩/考试的 gnmkdm 是硬编码值，只在一个测试账号上验证过；如果学校对不同学生
 * 路由到不同的模块码（多校区/特殊身份等），代码不会报错，只会安静地拿到"合法但空"的结果，
 * 表现跟"这学期确实没数据"完全一样，没法区分。
 * 做法：登录时拉一次这个学生的真实菜单，按名字关键词（不是编码）找到对应菜单项，取出真实
 * gnmkdm 跟硬编码值对比。一致就什么都不打，不一致才打 security 告警。
 * 依然用 Playwright page 做 DOM 解析（而不是跟着课表/成绩/考试一起改成纯 HTTP+正则扫描
 * HTML）——菜单是页面 JS 渲染出来的，原始响应大概率是给前端 JS 用的 JSON 而不是现成的
 * `<a>` 标签，正则扫描可能永远 0 命中、让这张安全网悄悄失效而不自知。这一次额外的 page.goto
 * 只发生在扫码成功之后、释放浏览器之前，用可靠性换几秒钟延迟，值得。
 */
async function checkMenuGnmkdmDrift(page: Page, sessionId: string, traceId?: string) {
  try {
    const ajaxUrls: string[] = [];
    page.on('request', function onReq(req) {
      const u = req.url();
      if (u.indexOf('menu') !== -1 || u.indexOf('gnmkdm') !== -1 || u.indexOf('initMenu') !== -1) {
        ajaxUrls.push(u);
      }
    });

    await page.goto('https://jw-scpcfe-cn.scvcfe.edu.cn/jwglxt/xtgl/index_initMenu.html?jsdm=xs', {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
    await page.waitForTimeout(5000);

    // 注意：正方系统 jquery.extends.contact-min.js 会修改 Array/String 原型，避免用 includes()/find()
    const result = await page.evaluate(function () {
      const menuItems: any[] = [];
      const container = document.querySelector('#navbar-tabs');
      const allA = container ? container.querySelectorAll('a') : document.querySelectorAll('a');
      for (let i = 0; i < allA.length; i++) {
        const a = allA[i];
        const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
        const onclick = a.getAttribute('onclick') || '';
        const dataAttrs: any = {};
        if (a.attributes) {
          for (let j = 0; j < a.attributes.length; j++) {
            const name = a.attributes[j].name;
            if (name && name.indexOf('data-') === 0) dataAttrs[name] = a.attributes[j].value;
          }
        }
        if (text) menuItems.push({ text: text, onclick: onclick.slice(0, 300), dataAttrs: dataAttrs });
      }
      return { menuItems: menuItems.slice(0, 100) };
    });

    const menuItems: { text: string; onclick: string; dataAttrs: Record<string, string> }[] = result.menuItems;
    const ajaxJoined = ajaxUrls.join(' ');

    for (const { keyword, label, expected } of EXPECTED_GNMKDM) {
      const hit = menuItems.find((m) => m.text.indexOf(keyword) !== -1 || m.onclick.indexOf(keyword) !== -1);
      const hitHaystack = hit ? `${hit.onclick} ${JSON.stringify(hit.dataAttrs)}` : '';
      const found =
        extractGnmkdm(hitHaystack) || (ajaxJoined.indexOf(keyword) !== -1 ? extractGnmkdm(ajaxJoined) : null);

      if (!hit && !found) {
        logger.info('gnmkdm交叉校验：菜单中未找到该模块关键词，可能是权限或菜单结构变化', {
          sessionId,
          trace_id: traceId,
          label,
          keyword,
        });
        continue;
      }
      if (found && found !== expected) {
        logger.security('gnmkdm交叉校验：与硬编码不一致，疑似该账号路由到不同模块码', {
          sessionId,
          trace_id: traceId,
          label,
          expected,
          found,
        });
      }
      // found === expected，或者找到菜单项但没提取到码：都不打日志，避免每次登录刷屏
    }
  } catch (e: any) {
    logger.warn('gnmkdm交叉校验异常', { sessionId, trace_id: traceId, error: e?.message });
  }
}

export function registerWechatAuthRoutes(app: any, pool: Pool) {
  // ── 1. 发起扫码登录（异步，立即返回 sessionId）──
  app.post('/api/v1/auth/wechat-qr', limiter(3, 30), async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';

    // per-IP 软上限先判：报错信息明确指向"你自己有会话没结束"，不会被误读成"全站排队"
    const runningForIp = runningBrowserCountForIp(ip);
    if (runningForIp >= MAX_CONCURRENT_PER_IP) {
      logger.info('单IP扫码并发达上限，拒绝新会话（大概率是重复点击/上次会话未正常关闭）', {
        runningForIp,
        ip,
        trace_id: req._traceId,
      });
      return fail(res, 429, '你还有一个扫码登录未完成，请关闭后重试，或稍等片刻自动释放');
    }

    // 全局并发上限：进入 FIFO 等待队列，最多等 30 秒，超时才 503
    const gotSlot = await waitForSlot(ip);
    if (!gotSlot) {
      logger.security('扫码登录等待超时，拒绝新会话', { ip, queueLength: waitQueue.length, trace_id: req._traceId });
      return fail(res, 503, '当前扫码登录人数较多，请稍后再试');
    }

    const sessionId = genId();
    const running = runningBrowserCount();
    logger.info('发起扫码登录', { sessionId, running, trace_id: req._traceId });

    try {
      // 从预热浏览器创建独立 context/page（隔离 Cookie，共享浏览器进程）
      const browser = await getWarmBrowser();
      const context = await browser.newContext({
        userAgent: BROWSER_USER_AGENT,
        locale: 'zh-CN',
      });
      const page = await context.newPage();

      const session: ScanSession = {
        context,
        page,
        status: 'starting',
        qrImage: null,
        userInfo: null,
        scheduleData: null,
        gradesData: null,
        examsData: null,
        result: null,
        extracting: false,
        landingUrl: null,
        browserReleased: false,
        ip,
        error: null,
        createdAt: Date.now(),
        scannedAt: 0,
        lastProbeTime: 0,
      };
      sessions.set(sessionId, session);

      // 立即返回 sessionId，后台异步执行
      ok(res, { sessionId });

      // 后台获取二维码
      await doCaptureQr(sessionId, req._traceId);
    } catch (err: any) {
      closeSession(sessionId);
      logger.error('启动浏览器失败', { error: err.message, stack: err.stack, trace_id: req._traceId });
      if (!res.headersSent) {
        const hint = err.message?.includes("Executable doesn't exist")
          ? '服务器未安装浏览器，请运行 npx playwright install chromium'
          : '';
        return fail(res, 500, hint || `启动浏览器失败：${err.message?.slice(0, 80) || '请重试'}`);
      }
    }
  });

  // ── 2. 轮询登录状态 ──
  // 限流说明：前端轮询 2s/次 = 30/分，上限留一倍余量；限流桶已按接口隔离，不再被背景请求挤占
  app.post('/api/v1/auth/wechat-poll', limiter(5, 60), async (req: Request, res: Response) => {
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
        // 给 5 秒缓冲，等页面加载稳定后再检测
        if (Date.now() - session.createdAt < 5000) {
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
              session.landingUrl = url;
              logger.info('页面已离开 CAS 登录页 — 扫码成功', {
                sessionId,
                trace_id: req._traceId,
                url: url.slice(0, 200),
              });
              return ok(res, { status: 'scanned' });
            }
          } catch (e) {
            logger.warn('page url error', { error: String(e), sessionId, trace_id: req._traceId });
          }
        }
        return ok(res, { status: 'scanning', qrCode: session.qrImage });
      }

      // 已扫码，等待 CAS 完成 ticket 验证后导航到教务系统提取用户信息
      if (session.status === 'scanned') {
        // 给 CAS 2 秒完成 ticket 验证和 Session Cookie 设置
        if (session.scannedAt === 0 || Date.now() - session.scannedAt < 2000) {
          return ok(res, { status: 'scanned' });
        }

        // 提取锁：goto 最长 15s，轮询 2s 一发，无锁会并发打断同一 page 的导航
        if (session.extracting) {
          return ok(res, { status: 'scanned' });
        }
        session.extracting = true;

        try {
          // ── 1. 等 SPA 渲染 + 调 onlineInfo API 拿用户信息 ──
          await session.page.waitForTimeout(3000);
          let apiStudentId = '',
            apiName = '',
            apiDept = '';
          try {
            const resp = await session.page.evaluate(async () => {
              const r = await fetch(
                'https://cas2.scpcfe.cn/passport/v1/user/onlineInfo?clientType=SDPBrowserClient&platform=Linux&lang=zh-CN',
                {
                  credentials: 'include',
                },
              );
              return JSON.stringify(await r.json());
            });
            const parsed = JSON.parse(resp);
            const user = parsed?.data || parsed || {};
            apiStudentId = user.username || user.userId || user.studentId || user.account || '';
            apiName = user.name || user.displayName || user.nickname || user.realName || '';
            apiDept = user.department || user.deptName || user.orgName || user.departmentName || '';
            // 只记字段结构，不落原始响应（含姓名/学号等 PII）
            logger.info('onlineInfo API 响应', {
              sessionId,
              trace_id: req._traceId,
              hasData: !!parsed?.data,
              fields: Object.keys(user).slice(0, 20).join(','),
              gotId: !!apiStudentId,
              gotName: !!apiName,
              gotDept: !!apiDept,
            });
          } catch (err: any) {
            logger.warn('onlineInfo API 失败', { sessionId, trace_id: req._traceId, error: err.message });
          }

          // ── 2. 兜底提取 ──
          const landingUrl = session.landingUrl || session.page.url();
          const urlStudentId = new URL(landingUrl).searchParams.get('username') || '';
          if (!apiStudentId && !urlStudentId) {
            const pageText = await session.page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
            // 优先找"学号"关键字紧邻的数字，避免误抓电话号/公告编号等无关数字；
            // 裸数字兜底加词边界，防止从更长数字串里截出错误片段
            const labeled = pageText.match(/学号[:：\s]{0,4}(\d{8,14})(?!\d)/);
            const bare = pageText.match(/(?<!\d)(\d{10,14})(?!\d)/);
            apiStudentId = labeled?.[1] || bare?.[1] || '';
            if (apiStudentId) {
              logger.warn('学号来自兜底正则提取（非权威接口），存在误判风险', {
                sessionId,
                trace_id: req._traceId,
                source: labeled ? 'labeled' : 'bare',
              });
            }
          }

          // ── 3. 立即判定结果（不阻塞 poll，课表同步延后到 done 阶段）──
          const studentId = apiStudentId || urlStudentId;
          if (studentId) {
            session.userInfo = { studentId, name: apiName, department: apiDept };
            session.status = 'done';
            // student_id 是全站业务日志的统一标识可记录，姓名/院系值不落日志
            logger.info('用户信息提取成功', {
              sessionId,
              trace_id: req._traceId,
              studentId,
              hasName: !!apiName,
              hasDept: !!apiDept,
              source: apiStudentId ? 'onlineInfo' : 'url',
            });
          } else {
            session.status = 'timeout';
            session.error = '未能获取学号，请确认已扫码成功';
            logger.warn('未提取到学号', { sessionId, trace_id: req._traceId, apiStudentId, urlStudentId });
          }
        } catch (err: any) {
          session.status = 'timeout';
          session.error = '信息提取异常，请重试';
          logger.error('信息提取异常', { sessionId, trace_id: req._traceId, error: err.message, stack: err.stack });
        } finally {
          session.extracting = false;
        }
        // 提取完成但失败 → 返回错误（status 已设为 timeout，不会死循环重试）
        if (session.status !== 'done') {
          return ok(res, { status: 'error', message: session.error || '登录失败，请重试' });
        }
      }

      // ── done 结果幂等返回 / 防重入占位 ──
      // 占位必须是合法轮询响应（带 status），并发 poll 拿到「scanned=处理中」继续等待；
      // 构建失败走 catch → closeSession 删除会话 → 下次 poll 404 → 前端提示重新扫码，不会死循环
      if (session.result) {
        return ok(res, session.result);
      }
      session.result = { status: 'scanned' }; // 占位，阻止并发进入结果构建

      // ── 登录成功！使用已提取的用户信息 ──
      if (session.status !== 'done' || !session.userInfo) {
        closeSession(sessionId);
        return fail(res, 500, '登录状态异常，请重试');
      }

      logger.info('扫码登录成功', { sessionId, trace_id: req._traceId, url: session.page.url().slice(0, 120) });

      const { studentId, name, department } = session.userInfo;

      if (!studentId) {
        closeSession(sessionId);
        return fail(res, 500, '未能获取学号，请确认已登录成功');
      }

      // ── 自动注册/登录 ──
      const [rows]: any = await pool.query('SELECT * FROM users WHERE student_id = ?', [studentId]);
      let user: any;

      if (rows.length > 0) {
        user = rows[0];
        if (name && user.nickname !== name) {
          await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [name, user.id]);
        }
        // ── 扫码是权威身份源：pending（密码注册/手动注册待审核）账号扫码成功后自动升级 verified ──
        // 用户先用密码注册卡在 pending，再用教务扫码登录时应直接放行（教务系统已验证学号+姓名），
        // 否则账号永远卡在待审核，课表/发布等功能全被 403 拦截。
        // rejected 不自动升级：管理员已人工打回，保持人工裁决优先。
        if (user.auth_status === 'pending') {
          await pool.query('UPDATE users SET auth_status = ? WHERE id = ?', ['verified', user.id]);
          user.auth_status = 'verified';
          clearAuthCache(user.id);
          logger.business('扫码登录自动审核通过（pending→verified）', {
            user_id: user.id,
            student_id: studentId,
            trace_id: req._traceId,
          });
        }
        logger.business('企业微信登录（已有账号）', {
          user_id: user.id,
          student_id: studentId,
          trace_id: req._traceId,
        });
      } else {
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

      // ── gnmkdm 交叉校验（永久保留的安全网）── 必须在释放浏览器之前做，靠 Playwright DOM 解析
      try {
        await checkMenuGnmkdmDrift(session.page, sessionId, req._traceId);
      } catch (err: any) {
        logger.warn('gnmkdm交叉校验调用失败', { sessionId, trace_id: req._traceId, error: err.message });
      }

      // ── 浏览器的使命到此为止：取走全部 Cookie、立即释放 ──
      // Cookie 全量带走（不只 JSESSIONID）——正方常见还有 route/SERVERID 等负载均衡粘滞 Cookie，
      // 少带一个就可能变成"看着登录了，业务查询却认不出会话"。用完即弃，不落库、不持久化。
      const refererUrl = session.landingUrl || session.page.url();
      const rawCookies = await session.context.cookies();
      const cookieHeader = rawCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
      releaseSession(session);

      // ── 加密存储教务 Cookie，供后续一键刷新使用 ──
      const encryptedCookie = encrypt(cookieHeader);
      if (encryptedCookie && user?.id) {
        pool
          .query('UPDATE users SET school_cookie = ? WHERE id = ?', [encryptedCookie, user.id])
          .catch((err: any) =>
            logger.warn('存储教务 Cookie 失败', { sessionId, trace_id: req._traceId, error: err.message }),
          );
      }

      // ── 后台静默拉取课表/成绩/考试并写入 DB，不阻塞登录响应 ──
      // 历史做法是同步等待 fetchAllSchedulesHttp + DB 写入全部完成才返回 JWT，
      // 但教务系统 API 响应慢（6学期 ×2 学期 ×~2s = ~12s），用户扫码后要等很久才能看到首页。
      // 成绩和考试之前已经改为后台拉取，这里把课表也一并后移：先发 JWT 让用户进首页，
      // 后台慢慢同步，前端下次刷新自然能拿到。
      let courseCount = 0,
        gradeCount = 0,
        examCount = 0;
      (async () => {
        try {
          const limit = createLimiter(3);
          const httpLogCb = (label: string) => (msg: string) =>
            logger.info(`${label}API详情`, { sessionId, trace_id: req._traceId, detail: msg });

          const [scheduleResult, grades, exams] = await Promise.all([
            fetchAllSchedulesHttp(cookieHeader, refererUrl, limit, httpLogCb('课表')).catch((err: any) => {
              logger.warn('后台课表获取失败', { sessionId, trace_id: req._traceId, error: err.message });
              return null;
            }),
            fetchGradesHttp(cookieHeader, refererUrl, limit, httpLogCb('成绩')).catch((err: any) => {
              logger.warn('后台成绩获取失败', { sessionId, trace_id: req._traceId, error: err.message });
              return [];
            }),
            fetchExamsHttp(cookieHeader, refererUrl, limit, httpLogCb('考试')).catch((err: any) => {
              logger.warn('后台考试获取失败', { sessionId, trace_id: req._traceId, error: err.message });
              return [];
            }),
          ]);

          if (scheduleResult) {
            const { studentId: schId, studentName: schName, className, terms } = scheduleResult;
            logger.info('课表API', {
              sessionId,
              trace_id: req._traceId,
              gotId: !!schId,
              gotName: !!schName,
              gotClass: !!className,
              termCount: terms.length,
              totalCourses: terms.reduce((s, t) => s + t.courses.length, 0),
            });
            if (schId && schId !== studentId) {
              logger.security('学号交叉校验不一致，疑似兜底正则误判', {
                sessionId,
                trace_id: req._traceId,
                user_id: user.id,
                loginStudentId: studentId,
                scheduleStudentId: schId,
              });
            }
            if (schName && !name) {
              await pool
                .query('UPDATE users SET nickname = ? WHERE student_id = ?', [schName, studentId])
                .catch(() => {});
            }
            if (className && !department) {
              await pool
                .query('UPDATE users SET department = ? WHERE student_id = ?', [className, studentId])
                .catch(() => {});
            }
            session.scheduleData = terms;

            // 同步课表
            try {
              const allCourses = assignCourseColors(
                terms.flatMap(({ xnm, xqm, courses }) =>
                  courses.map((item: any) => {
                    const rawXqj = Number(item.xqj);
                    const weekday = rawXqj === 0 ? 7 : rawXqj || 1;
                    const periodText = String(item.jcs || item.jcor || item.jc || '');
                    const periodMatch = periodText.match(/(\d+)(?:[-~](\d+))?/);
                    const start = periodMatch ? parseInt(periodMatch[1], 10) : 1;
                    const end = periodMatch && periodMatch[2] ? parseInt(periodMatch[2], 10) : start;
                    const zcText = String(item.zcd || '');
                    const activeWeeks = parseWeekPattern(zcText);
                    const weekStart = activeWeeks.length ? activeWeeks[0] : 1;
                    const weekEnd = activeWeeks.length ? activeWeeks[activeWeeks.length - 1] : 18;
                    return {
                      user_id: user.id,
                      school_year: xnm,
                      school_term: xqm,
                      source: 'scan_sync',
                      name: item.kcmc || '未知课程',
                      teacher: item.xm || '',
                      classroom: item.cdmc || '',
                      weekday,
                      start_period: start,
                      period_span: Math.max(end - start + 1, 1),
                      week_start: weekStart,
                      week_end: weekEnd,
                      week_type: 'all',
                      week_pattern: zcText || null,
                      active_weeks: activeWeeks.length ? JSON.stringify(activeWeeks) : null,
                      course_type: 'theory',
                      campus: item.xqmc || null,
                      class_group: item.jxbmc || null,
                      class_composition: null,
                      exam_method: item.khfsmc || null,
                      elective_note: null,
                      hours_breakdown: item.kcxszc || null,
                      weekly_hours: item.zhxs != null ? String(item.zhxs) : null,
                      total_hours: item.zxs != null ? String(item.zxs) : null,
                      credit: item.xf != null ? String(item.xf) : null,
                    };
                  }),
                ),
              );
              const conn = await pool.getConnection();
              try {
                await conn.beginTransaction();
                await conn.query("DELETE FROM courses WHERE user_id = ? AND source = 'scan_sync'", [user.id]);
                for (const c of allCourses) {
                  await conn.query(
                    `INSERT INTO courses (user_id, school_year, school_term, source, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, week_pattern, active_weeks, course_type, color_class, campus, class_group, class_composition, exam_method, elective_note, hours_breakdown, weekly_hours, total_hours, credit)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      c.user_id,
                      c.school_year,
                      c.school_term,
                      c.source,
                      c.name,
                      c.teacher,
                      c.classroom,
                      c.weekday,
                      c.start_period,
                      c.period_span,
                      c.week_start,
                      c.week_end,
                      c.week_type,
                      c.week_pattern,
                      c.active_weeks,
                      c.course_type,
                      c.color_class,
                      c.campus,
                      c.class_group,
                      c.class_composition,
                      c.exam_method,
                      c.elective_note,
                      c.hours_breakdown,
                      c.weekly_hours,
                      c.total_hours,
                      c.credit,
                    ],
                  );
                }
                await conn.commit();
                courseCount = allCourses.length;
                logger.business('课表自动同步', {
                  user_id: user.id,
                  count: courseCount,
                  termCount: terms.length,
                  trace_id: req._traceId,
                });
              } catch (e: any) {
                await conn.rollback();
                logger.error('课表同步失败', { error: e.message, user_id: user.id, trace_id: req._traceId });
              } finally {
                conn.release();
              }
            } catch (e: any) {
              logger.warn('课表自动同步失败（可忽略）', { error: e.message, user_id: user.id, trace_id: req._traceId });
            }
          }

          // 同步成绩
          if (grades.length) {
            try {
              const conn = await pool.getConnection();
              try {
                await conn.beginTransaction();
                // 只删除本次刷新涉及到的学期，不 nuke 全部——防止当前学期"待评价"冲掉旧学期真实分数
                const terms = [...new Set(grades.map((g: any) => `${g.schoolYear}-${g.schoolTerm}`))];
                for (const t of terms) {
                  const [y, s] = t.split('-');
                  await conn.query('DELETE FROM grades WHERE user_id = ? AND school_year = ? AND school_term = ?', [
                    user.id,
                    y,
                    s,
                  ]);
                }
                for (const g of grades) {
                  await conn.query(
                    `INSERT INTO grades (user_id, school_year, school_term, course_name, teacher, credit, grade, grade_point, exam_nature, course_nature, course_category, course_attribution, open_college)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      user.id,
                      g.schoolYear,
                      g.schoolTerm,
                      g.courseName,
                      g.teacher,
                      g.credit,
                      g.grade,
                      g.gradePoint,
                      g.examNature,
                      g.courseNature,
                      g.courseCategory,
                      g.courseAttribution,
                      g.openCollege,
                    ],
                  );
                }
                await conn.commit();
                gradeCount = grades.length;
                logger.business('成绩自动同步', { user_id: user.id, count: gradeCount, trace_id: req._traceId });
              } catch (e: any) {
                await conn.rollback();
                logger.error('成绩同步失败', { error: e.message, user_id: user.id, trace_id: req._traceId });
              } finally {
                conn.release();
              }
            } catch (e: any) {
              logger.warn('成绩自动同步失败（可忽略）', { error: e.message, user_id: user.id, trace_id: req._traceId });
            }
          }

          // 同步考试安排
          if (exams.length) {
            try {
              const conn = await pool.getConnection();
              try {
                await conn.beginTransaction();
                // 只删除本次刷新涉及到的学期
                const examTerms = [...new Set(exams.map((ex: any) => `${ex.schoolYear}-${ex.schoolTerm}`))];
                for (const t of examTerms) {
                  const [y, s] = t.split('-');
                  await conn.query('DELETE FROM exams WHERE user_id = ? AND school_year = ? AND school_term = ?', [
                    user.id,
                    y,
                    s,
                  ]);
                }
                for (const ex of exams) {
                  await conn.query(
                    `INSERT INTO exams (user_id, school_year, school_term, course_name, teacher, exam_name, exam_time, exam_location, campus, seat_number)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      user.id,
                      ex.schoolYear,
                      ex.schoolTerm,
                      ex.courseName,
                      ex.teacher,
                      ex.examName,
                      ex.examTime,
                      ex.examLocation,
                      ex.campus,
                      ex.seatNumber,
                    ],
                  );
                }
                await conn.commit();
                examCount = exams.length;
                logger.business('考试安排自动同步', { user_id: user.id, count: examCount, trace_id: req._traceId });
              } catch (e: any) {
                await conn.rollback();
                logger.error('考试安排同步失败', { error: e.message, user_id: user.id, trace_id: req._traceId });
              } finally {
                conn.release();
              }
            } catch (e: any) {
              logger.warn('考试安排自动同步失败（可忽略）', {
                error: e.message,
                user_id: user.id,
                trace_id: req._traceId,
              });
            }
          }
        } catch (err: any) {
          logger.warn('后台数据同步异常（可忽略，不影响登录）', {
            sessionId,
            trace_id: req._traceId,
            error: err.message,
          });
        }
      })().catch((err) => logger.error('后台数据同步失败', { sessionId, trace_id: req._traceId, error: err.message }));

      // ── 下发 JWT（amr=scan：教务扫码为权威身份源，1 小时内可免旧密码重设密码） ──
      const isAdmin = !!user.is_admin;
      const accessToken = signAccessToken(user.id, isAdmin, 'scan');
      const refreshToken = signRefreshToken(user.id);
      const deviceInfo = ((req.headers['user-agent'] as string) || '').slice(0, 180) || null;

      try {
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]);
        await pool.query(
          'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_info, ip_address) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?)',
          [user.id, hashToken(refreshToken), Math.floor(Date.now() / 1000) + 2592000, deviceInfo, req.ip || ''],
        );
      } catch {
        /* noop */
      }

      pool
        .query('UPDATE users SET last_login = NOW(), ip_address = ? WHERE id = ?', [req.ip || '', user.id])
        .catch(() => {});

      session.result = {
        status: 'done',
        token: accessToken,
        refresh_token: refreshToken,
        user: { isAdmin, authStatus: user.auth_status, department: user.department || '' },
        sync: {
          coursesImported: courseCount,
          gradesImported: gradeCount,
          examsImported: examCount,
          message: '个人信息同步中...',
        },
      };
      return ok(res, session.result);
    } catch (err: any) {
      logger.error('轮询扫码结果失败', { error: err.message, sessionId, trace_id: req._traceId });
      closeSession(sessionId);
      return fail(res, 500, '登录处理失败，请重试');
    }
  });

  // ── 3. 主动取消（关闭弹窗/重新扫码时调用）──
  // 根治"只有我一个人扫码却提示人数过多"：旧行为是前端关闭弹窗/点重试就不管了，
  // 服务端那支浏览器要等 SESSION_TTL_MS(7分钟) 才被清理器回收，几次重试就把
  // MAX_CONCURRENT_PER_IP/MAX_CONCURRENT_BROWSERS 顶满。这里让前端在放弃一个会话时
  // 立即释放，不用等超时。sessionId 不存在/已释放都当成功处理（幂等，前端不用关心时序）
  app.post('/api/v1/auth/wechat-cancel', limiter(10, 30), async (req: Request, res: Response) => {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return fail(res, 400, '缺少 sessionId');
    }
    closeSession(sessionId);
    logger.info('扫码会话主动取消', { sessionId, trace_id: req._traceId });
    return ok(res, { cancelled: true });
  });

  // ── 4. 一键刷新教务数据（课表/成绩/考试），复用存储的 Cookie，不需要重新扫码 ──
  app.post('/api/v1/academic/refresh', auth, limiter(1, 5), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const [rows]: any = await pool.query('SELECT school_cookie FROM users WHERE id = ?', [userId]);
      if (!rows.length || !rows[0].school_cookie) {
        return fail(res, 400, '未找到教务会话，请重新扫码登录');
      }
      const cookieHeader = decrypt(rows[0].school_cookie);
      if (!cookieHeader) {
        return fail(res, 400, '教务会话已过期，请重新扫码登录');
      }

      const limit = createLimiter(3);
      const httpLogCb = (label: string) => (msg: string) =>
        logger.info(`${label}API详情`, { user_id: userId, trace_id: req._traceId, detail: msg });

      // 从 sessions 取 refererUrl（无活跃会话时用兜底）
      let refererUrl = 'https://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html';
      for (const s of sessions.values()) {
        if (s.landingUrl) {
          refererUrl = s.landingUrl;
          break;
        }
      }

      let courseCount = 0,
        gradeCount = 0,
        examCount = 0;
      let sessionInvalid = false;

      try {
        const scheduleResult = await fetchAllSchedulesHttp(cookieHeader, refererUrl, limit, httpLogCb('课表'));
        // 全部学期都返回会话失效 → cookie 已过期
        if (scheduleResult && !scheduleResult.terms.length) {
          // 快速验证：用单学期请求确认会话是否有效
          const testBody = `xnm=2025&xqm=12&_search=false&queryModel.showCount=1&time=0`;
          const testResp = await jwFetchJson(
            `${JWGLXT_ORIGIN}/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151`,
            testBody,
            cookieHeader,
            refererUrl,
          );
          if (testResp.invalidSession) sessionInvalid = true;
        }
        if (scheduleResult && scheduleResult.terms.length) {
          const { studentId: schId, studentName: schName, terms } = scheduleResult;
          logger.info('课表API', { user_id: userId, gotId: !!schId, gotName: !!schName, termCount: terms.length });

          // 同步课表
          const allCourses = assignCourseColors(
            terms.flatMap(({ xnm, xqm, courses }) =>
              courses.map((item: any) => {
                const rawXqj = Number(item.xqj);
                const weekday = rawXqj === 0 ? 7 : rawXqj || 1;
                const periodText = String(item.jcs || item.jcor || item.jc || '');
                const periodMatch = periodText.match(/(\d+)(?:[-~](\d+))?/);
                const start = periodMatch ? parseInt(periodMatch[1], 10) : 1;
                const end = periodMatch && periodMatch[2] ? parseInt(periodMatch[2], 10) : start;
                const zcText = String(item.zcd || '');
                const activeWeeks = parseWeekPattern(zcText);
                return {
                  user_id: userId,
                  school_year: xnm,
                  school_term: xqm,
                  source: 'scan_sync',
                  name: item.kcmc || '未知课程',
                  teacher: item.xm || '',
                  classroom: item.cdmc || '',
                  weekday,
                  start_period: start,
                  period_span: Math.max(end - start + 1, 1),
                  week_start: activeWeeks.length ? activeWeeks[0] : 1,
                  week_end: activeWeeks.length ? activeWeeks[activeWeeks.length - 1] : 18,
                  week_type: 'all',
                  week_pattern: zcText || null,
                  active_weeks: activeWeeks.length ? JSON.stringify(activeWeeks) : null,
                  course_type: 'theory',
                  campus: item.xqmc || null,
                  class_group: item.jxbmc || null,
                  class_composition: null,
                  exam_method: item.khfsmc || null,
                  elective_note: null,
                  hours_breakdown: item.kcxszc || null,
                  weekly_hours: item.zhxs != null ? String(item.zhxs) : null,
                  total_hours: item.zxs != null ? String(item.zxs) : null,
                  credit: item.xf != null ? String(item.xf) : null,
                };
              }),
            ),
          );

          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            await conn.query("DELETE FROM courses WHERE user_id = ? AND source = 'scan_sync'", [userId]);
            for (const c of allCourses) {
              await conn.query(
                `INSERT INTO courses (user_id, school_year, school_term, source, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, week_pattern, active_weeks, course_type, color_class, campus, class_group, class_composition, exam_method, elective_note, hours_breakdown, weekly_hours, total_hours, credit)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  c.user_id,
                  c.school_year,
                  c.school_term,
                  c.source,
                  c.name,
                  c.teacher,
                  c.classroom,
                  c.weekday,
                  c.start_period,
                  c.period_span,
                  c.week_start,
                  c.week_end,
                  c.week_type,
                  c.week_pattern,
                  c.active_weeks,
                  c.course_type,
                  c.color_class,
                  c.campus,
                  c.class_group,
                  c.class_composition,
                  c.exam_method,
                  c.elective_note,
                  c.hours_breakdown,
                  c.weekly_hours,
                  c.total_hours,
                  c.credit,
                ],
              );
            }
            await conn.commit();
            courseCount = allCourses.length;
          } catch (e: any) {
            await conn.rollback();
            throw e;
          } finally {
            conn.release();
          }
          logger.business('课表自动刷新', { user_id: userId, count: courseCount, trace_id: req._traceId });
        }
      } catch (err: any) {
        logger.warn('课表刷新失败', { user_id: userId, trace_id: req._traceId, error: err.message });
      }

      // ── 成绩刷新（POST /academic/refresh） ──
      try {
        const grades = await fetchGradesHttp(cookieHeader, refererUrl, limit, httpLogCb('成绩'));
        if (grades.length) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            // 只删除本次刷新涉及到的学期
            const terms = [...new Set(grades.map((g: any) => `${g.schoolYear}-${g.schoolTerm}`))];
            for (const t of terms) {
              const [y, s] = t.split('-');
              await conn.query('DELETE FROM grades WHERE user_id = ? AND school_year = ? AND school_term = ?', [
                userId,
                y,
                s,
              ]);
            }
            for (const g of grades) {
              await conn.query(
                `INSERT INTO grades (user_id, school_year, school_term, course_name, teacher, credit, grade, grade_point, exam_nature, course_nature, course_category, course_attribution, open_college)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  userId,
                  g.schoolYear,
                  g.schoolTerm,
                  g.courseName,
                  g.teacher,
                  g.credit,
                  g.grade,
                  g.gradePoint,
                  g.examNature,
                  g.courseNature,
                  g.courseCategory,
                  g.courseAttribution,
                  g.openCollege,
                ],
              );
            }
            await conn.commit();
            gradeCount = grades.length;
          } catch (e: any) {
            await conn.rollback();
            throw e;
          } finally {
            conn.release();
          }
          logger.business('成绩自动刷新', { user_id: userId, count: gradeCount, trace_id: req._traceId });
        }
      } catch (err: any) {
        logger.warn('成绩刷新失败', { user_id: userId, trace_id: req._traceId, error: err.message });
      }

      try {
        const exams = await fetchExamsHttp(cookieHeader, refererUrl, limit, httpLogCb('考试'));
        if (exams.length) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            // 只删除本次刷新涉及到的学期
            const examTerms = [...new Set(exams.map((ex: any) => `${ex.schoolYear}-${ex.schoolTerm}`))];
            for (const t of examTerms) {
              const [y, s] = t.split('-');
              await conn.query('DELETE FROM exams WHERE user_id = ? AND school_year = ? AND school_term = ?', [
                userId,
                y,
                s,
              ]);
            }
            for (const ex of exams) {
              await conn.query(
                `INSERT INTO exams (user_id, school_year, school_term, course_name, teacher, exam_name, exam_time, exam_location, campus, seat_number)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  userId,
                  ex.schoolYear,
                  ex.schoolTerm,
                  ex.courseName,
                  ex.teacher,
                  ex.examName,
                  ex.examTime,
                  ex.examLocation,
                  ex.campus,
                  ex.seatNumber,
                ],
              );
            }
            await conn.commit();
            examCount = exams.length;
          } catch (e: any) {
            await conn.rollback();
            throw e;
          } finally {
            conn.release();
          }
          logger.business('考试安排自动刷新', { user_id: userId, count: examCount, trace_id: req._traceId });
        }
      } catch (err: any) {
        logger.warn('考试安排刷新失败', { user_id: userId, trace_id: req._traceId, error: err.message });
      }

      if (sessionInvalid) {
        // 会话已失效，清除存储的 cookie 并提示用户重新扫码
        pool.query('UPDATE users SET school_cookie = NULL WHERE id = ?', [userId]).catch(() => {});
        return fail(res, 400, '教务登录已过期，请重新扫码');
      }

      ok(res, {
        coursesImported: courseCount,
        gradesImported: gradeCount,
        examsImported: examCount,
        message: `已同步 ${courseCount} 门课程、${gradeCount} 条成绩、${examCount} 场考试`,
      });
    } catch (err: any) {
      logger.error('教务数据刷新失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '刷新失败，请重试');
    }
  });

  // ── 5. 轻量刷新——只同步成绩+考试（跳过课表），适合高频轮询 ──
  app.post('/api/v1/grades/refresh', auth, limiter(2, 10), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const [rows]: any = await pool.query('SELECT school_cookie FROM users WHERE id = ?', [userId]);
      if (!rows.length || !rows[0].school_cookie) {
        return fail(res, 400, '未找到教务会话，请重新扫码登录');
      }
      const cookieHeader = decrypt(rows[0].school_cookie);
      if (!cookieHeader) {
        return fail(res, 400, '教务会话已过期，请重新扫码登录');
      }

      const limit = createLimiter(3);
      const httpLogCb = (label: string) => (msg: string) =>
        logger.info(`${label}API详情`, { user_id: userId, trace_id: req._traceId, detail: msg });

      // 从 sessions 取 refererUrl（无活跃会话时用兜底）
      let refererUrl = 'https://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html';
      for (const s of sessions.values()) {
        if (s.landingUrl) {
          refererUrl = s.landingUrl;
          break;
        }
      }

      let gradeCount = 0,
        examCount = 0;
      let sessionInvalid = false;

      // ── 成绩刷新（POST /grades/refresh） ──
      try {
        const grades = await fetchGradesHttp(cookieHeader, refererUrl, limit, httpLogCb('成绩'));
        if (grades.length) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            // 只删除本次刷新涉及到的学期
            const terms = [...new Set(grades.map((g: any) => `${g.schoolYear}-${g.schoolTerm}`))];
            for (const t of terms) {
              const [y, s] = t.split('-');
              await conn.query('DELETE FROM grades WHERE user_id = ? AND school_year = ? AND school_term = ?', [
                userId,
                y,
                s,
              ]);
            }
            for (const g of grades) {
              await conn.query(
                `INSERT INTO grades (user_id, school_year, school_term, course_name, teacher, credit, grade, grade_point, exam_nature, course_nature, course_category, course_attribution, open_college)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  userId,
                  g.schoolYear,
                  g.schoolTerm,
                  g.courseName,
                  g.teacher,
                  g.credit,
                  g.grade,
                  g.gradePoint,
                  g.examNature,
                  g.courseNature,
                  g.courseCategory,
                  g.courseAttribution,
                  g.openCollege,
                ],
              );
            }
            await conn.commit();
            gradeCount = grades.length;
          } catch (e: any) {
            await conn.rollback();
            throw e;
          } finally {
            conn.release();
          }
          logger.business('成绩轻量刷新', { user_id: userId, count: gradeCount, trace_id: req._traceId });
        } else {
          // 所有学期/端点都没数据 → 可能教务会话已过期，发快速探测确认
          const testBody = `xnm=2025&xqm=12&_search=false&queryModel.showCount=1&time=0`;
          const testResp = await jwFetchJson(
            `${JWGLXT_ORIGIN}/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151`,
            testBody,
            cookieHeader,
            refererUrl,
          );
          if (testResp.invalidSession) sessionInvalid = true;
        }
      } catch (err: any) {
        logger.warn('成绩轻量刷新失败', { user_id: userId, trace_id: req._traceId, error: err.message });
      }

      // ── 考试安排 ──
      try {
        const exams = await fetchExamsHttp(cookieHeader, refererUrl, limit, httpLogCb('考试'));
        if (exams.length) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            // 只删除本次刷新涉及到的学期
            const examTerms = [...new Set(exams.map((ex: any) => `${ex.schoolYear}-${ex.schoolTerm}`))];
            for (const t of examTerms) {
              const [y, s] = t.split('-');
              await conn.query('DELETE FROM exams WHERE user_id = ? AND school_year = ? AND school_term = ?', [
                userId,
                y,
                s,
              ]);
            }
            for (const ex of exams) {
              await conn.query(
                `INSERT INTO exams (user_id, school_year, school_term, course_name, teacher, exam_name, exam_time, exam_location, campus, seat_number)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  userId,
                  ex.schoolYear,
                  ex.schoolTerm,
                  ex.courseName,
                  ex.teacher,
                  ex.examName,
                  ex.examTime,
                  ex.examLocation,
                  ex.campus,
                  ex.seatNumber,
                ],
              );
            }
            await conn.commit();
            examCount = exams.length;
          } catch (e: any) {
            await conn.rollback();
            throw e;
          } finally {
            conn.release();
          }
          logger.business('考试安排轻量刷新', { user_id: userId, count: examCount, trace_id: req._traceId });
        }
      } catch (err: any) {
        logger.warn('考试安排轻量刷新失败', { user_id: userId, trace_id: req._traceId, error: err.message });
      }

      if (sessionInvalid) {
        pool.query('UPDATE users SET school_cookie = NULL WHERE id = ?', [userId]).catch(() => {});
        return fail(res, 400, '教务登录已过期，请重新扫码');
      }

      ok(res, {
        gradesImported: gradeCount,
        examsImported: examCount,
        message: `已同步 ${gradeCount} 条成绩、${examCount} 场考试`,
      });
    } catch (err: any) {
      logger.error('成绩轻量刷新失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '刷新失败，请重试');
    }
  });
}
