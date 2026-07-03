/**
 * 企业微信扫码登录 — 通过 Playwright 代理 CAS 认证
 * 
 * 流程（异步，避免 Nginx 504）：
 * 1. POST /api/v1/auth/wechat-qr → 后台启动 Playwright，立即返回 sessionId
 * 2. POST /api/v1/auth/wechat-poll → 轮询：返回二维码 / 扫码结果 / 登录成功
 * 
 */
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
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
  scheduleData: any | null;  // 课表多学期数组 [{xnm,xqm,courses}]，登录时全量抓取近3年+下一学年，复用于课程同步
  gradesData: any[] | null;  // 成绩数据，登录时顺带抓取
  examsData: any[] | null;   // 考试安排数据，登录时顺带抓取
  result: any | null;        // done 后的最终响应缓存：幂等返回，防止唯一一次响应被 429/网络丢失后永久卡死
  extracting: boolean;       // 信息提取锁：防止并发 poll 同时对同一 page 调 goto 互相打断
  landingUrl: string | null;  // CAS 登录后着陆页 URL，课表页提取失败时兜底
  browserReleased: boolean;  // 浏览器是否已释放（全局并发上限只统计未释放的会话）
  error: string | null;
  createdAt: number;
  scannedAt: number;
  lastProbeTime: number;
}

const sessions = new Map<string, ScanSession>();

// 全局浏览器并发上限：每个 chromium ~150-250MB，超限拒绝新会话而不是拖垮服务器
const MAX_CONCURRENT_BROWSERS = 5;

function runningBrowserCount(): number {
  let n = 0;
  for (const s of sessions.values()) if (!s.browserReleased) n++;
  return n;
}

/** 只释放浏览器资源，session 留在 Map（供 done 结果幂等重取，由清理器回收） */
function releaseBrowser(s: ScanSession) {
  if (s.browserReleased) return;
  s.browserReleased = true;
  s.context.close().catch(() => {});
  s.browser.close().catch(() => {});
}

/** 安全关闭会话：先关 context 再关 browser，从 Map 移除 */
function closeSession(sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s) return;
  releaseBrowser(s);
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

/** sessionId 即扫码登录会话的裸凭证——谁持有它就能轮询取走 JWT，必须用 CSPRNG，不能用 Math.random() */
function genId(): string {
  return randomBytes(24).toString('hex'); // 192bit 熵
}

/** 异步获取二维码。traceId 为发起 /wechat-qr 请求的 trace_id，用于串联该请求的全链路日志 */
async function doCaptureQr(sessionId: string, traceId?: string) {
  const session = sessions.get(sessionId);
  if (!session) { logger.warn('doCaptureQr: session不存在', { sessionId, trace_id: traceId }); return; }
  const { page } = session;

  try {
    logger.info('doCaptureQr: 开始导航 CAS 登录页', { sessionId, trace_id: traceId });
    await page.goto('http://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    logger.info('doCaptureQr: CAS 页加载完成，找二维码 iframe', { sessionId, trace_id: traceId, url: page.url().slice(0, 150) });

    const qrIframe = await page.waitForSelector('iframe#qrcodeIframe', { timeout: 15000 });
    if (qrIframe) {
      await page.waitForTimeout(1500);
      const buf = await qrIframe.screenshot();
      session.qrImage = `data:image/png;base64,${buf.toString('base64')}`;
      logger.info('doCaptureQr: 二维码截图完成', { sessionId, trace_id: traceId, size: buf.length });
    } else {
      const buf = await page.screenshot({ type: 'png' });
      session.qrImage = `data:image/png;base64,${buf.toString('base64')}`;
      logger.info('doCaptureQr: 无 iframe，全屏截图', { sessionId, trace_id: traceId, size: buf.length });
    }
    session.status = 'scanning';
  } catch (err: any) {
    logger.error('doCaptureQr: 异常', { sessionId, trace_id: traceId, error: err.message });
    try {
      const buf = await page.screenshot({ type: 'png' });
      session.qrImage = `data:image/png;base64,${buf.toString('base64')}`;
      session.status = 'scanning';
      logger.info('doCaptureQr: 异常后全屏截图兜底', { sessionId, trace_id: traceId, size: buf.length });
    } catch (e2: any) {
      logger.error('doCaptureQr: 兜底截图也失败', { sessionId, trace_id: traceId, error: e2.message });
    }
  }
}

/**
 * 通用"偷看真实默认查询"机制：导航到某个正方模块的首页，页面自己的 JS 会按当前默认学期
 * 自动发起一次查询——我们在旁边拦截这次请求的参数（真实的 xnm/xqm）和响应内容直接拿来用。
 * 这类"以学期为单位查询、类似条件筛选"的接口，猜多少种学期组合都不如页面自己查一次准。
 * @param page Playwright page
 * @param indexUrl 模块首页 URL（带 gnmkdm）
 * @param matchPath 用于识别"这就是默认查询请求"的 URL 关键字（比如 'xskbcx_cxXsKb.html'）
 */
/**
 * 学期编号合法值——正方系统这个部署用的是"秋=3，春=12"的经典编码，不是直觉以为的 1/2。
 * 证据链：考试模块侦察到页面自己默认查询用的是 xqm=12，查到 2 条当前考试；早先手动猜的
 * xqm=3（当时以为是"暑假学期"）意外查到 5 条数据，事后证实是上学期(秋季)的考试——反过来验证
 * 3 就是秋季的合法编号，不是巧合。之前用 1/2 试出来的"合法但空"结构，是因为后端对不认识的
 * xqm 值很宽容、不报错，容易被误判成"这学期没数据"。
 */
const VALID_XQM = new Set(['3', '12']);

/**
 * 偷看页面自己发出的默认查询，拿真实的 xnm/xqm + 响应体，比自己猜学期准。
 * 加固点：同一个 matchPath 可能被多个请求命中（比如页面上还有个不相关的小部件也打了同名接口），
 * 只取第一个命中的话可能抓到错的——所以等完整的等待窗口、收集所有命中，优先选 xqm 落在
 * VALID_XQM 里的那个，都不合法再退而求其次选第一个。
 * 诊断加固：课表模块(kbcx)这个侦察机制一直没命中过，跟考试模块(kscx)行为不一样——猜测是
 * kbcx 页面根本不会自动发起查询（可能要等用户选完学期下拉再点查询），也可能是真实查询用了
 * 跟假设不同的文件名。没命中时把这段等待窗口里见到的所有 POST 请求 URL 打出来，下次测试就能
 * 直接看到真相，不用再靠猜。
 */
async function captureDefaultModuleQuery(
  page: Page,
  indexUrl: string,
  matchPath: string,
  logCb?: (msg: string) => void,
  label?: string,
): Promise<{ xnm: string; xqm: string; body: string } | null> {
  const candidates: { xnm: string; xqm: string; body: string }[] = [];
  const allPostUrls: string[] = [];

  const onResp = (resp: any) => {
    (async () => {
      try {
        const req = resp.request();
        if (req.method() !== 'POST') return;
        const url: string = req.url();
        allPostUrls.push(url);
        if (url.indexOf(matchPath) === -1) return;
        const postData: string = req.postData() || '';
        const xnmMatch = postData.match(/xnm=([^&]*)/);
        const xqmMatch = postData.match(/xqm=([^&]*)/);
        const body = await resp.text();
        candidates.push({
          xnm: xnmMatch ? decodeURIComponent(xnmMatch[1]) : '',
          xqm: xqmMatch ? decodeURIComponent(xqmMatch[1]) : '',
          body,
        });
      } catch { /* 这次拦截没拿到有效数据，等下一个匹配的请求，不抛出去打断导航 */ }
    })();
  };
  page.on('response', onResp);

  await page.goto(indexUrl, { waitUntil: 'networkidle', timeout: 10000 })
    .catch(() => { /* 导航异常也继续等，可能默认查询已经在报错前发生过了 */ });
  // networkidle 之后再等一下，防止查询请求刚好还没返回就被判定"没捕获到"
  await page.waitForTimeout(3000);
  page.off('response', onResp);

  if (!candidates.length) {
    if (allPostUrls.length) {
      logCb?.(`${label || ''}默认查询未命中matchPath=${matchPath}，窗口内见到的POST请求(去重前10个): ${Array.from(new Set(allPostUrls)).slice(0, 10).join(' | ')}`);
    } else {
      logCb?.(`${label || ''}默认查询未命中，窗口内没见到任何POST请求——页面可能根本没自动发起查询`);
    }
    return null;
  }
  if (candidates.length === 1) return candidates[0];
  const valid = candidates.find((c) => VALID_XQM.has(c.xqm));
  return valid || candidates[0];
}

/**
 * 手动猜学期的兜底列表，用经典的 3(秋)/12(春) 编码。只在 captureDefaultModuleQuery 偷看失败时
 * 才会用到——真正的"当前学期"优先靠侦察拿到的真实值，这里只是猜测顺序兜底。
 */
function getSemestersToTry(): { xnm: string; xqm: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 9月-次年1月：秋季学期(xqm=3)是当前，去年同期的春季(xqm=12)是上一个
  if (month >= 9) return [{ xnm: String(year), xqm: '3' }, { xnm: String(year - 1), xqm: '12' }];
  if (month === 1) return [{ xnm: String(year - 1), xqm: '3' }, { xnm: String(year - 2), xqm: '12' }];
  // 2月-8月：春季学期(xqm=12)是当前，去年秋季(xqm=3)是上一个
  return [{ xnm: String(year - 1), xqm: '12' }, { xnm: String(year - 1), xqm: '3' }];
}

/** 数据对象里随便哪个数组字段都列出来（key=长度+第一项字段名），用来在还不确定真实字段名时看清真相，不用再靠猜 */
function describeArrayFields(data: any): string {
  if (!data || typeof data !== 'object') return '';
  return Object.entries(data)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => {
      const arr = v as any[];
      // 之前截到25个key，导致kbList真实存在的xm(教师)字段被截没了、误判成"接口不返回教师"——
      // 放宽到45个，避免同样的坑再犯一次
      const itemKeys = arr[0] && typeof arr[0] === 'object' ? Object.keys(arr[0]).slice(0, 45).join('/') : '';
      return `${k}=${arr.length}${itemKeys ? `(${itemKeys})` : ''}`;
    })
    .join(' | ');
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
function getSchoolYearsToTry(yearsBack = 3): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currentAcademicStartYear = month >= 9 ? year : year - 1;
  // 先查当前学年（最可能有数据），再往前回溯；下一学年也查（学校会提前发布下学期课表）
  const years = [currentAcademicStartYear + 1];
  for (let i = 0; i < yearsBack; i++) years.push(currentAcademicStartYear - i);
  return years.map(String);
}

/**
 * 课表页面重新设计：不再"猜一个当前学期就够了"，而是把近3年+下一学年、秋(xqm=3)/春(xqm=12)
 * 两个合法编码的全部组合都查一遍，每个学期查到的课都存下来——前端要做成跟官网一样的
 * "选学年+学期查看"体验，选择器筛的是本地已存数据，不是每次都实时连教务系统查，所以得在
 * 登录这一次性会话里把能拿到的都拿到。
 * 之前用 captureDefaultModuleQuery 侦察"当前默认学期"的做法不再适用——那是为了"只要当前学期"
 * 设计的优化，现在目标是全量，直接按组合列表挨个查更直接。
 */
async function fetchAllSchedules(page: Page, logCb?: (msg: string) => void): Promise<{
  studentId: string; studentName: string; className: string;
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

  for (const { xnm, xqm } of candidates) {
    try {
      const result = await page.evaluate(async ({ xnm, xqm }) => {
        try {
          const r = await fetch('/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `xnm=${xnm}&xqm=${xqm}&_search=false&queryModel.showCount=200&queryModel.currentPage=1&queryModel.sortName=&queryModel.sortOrder=asc&time=0`,
          });
          return JSON.stringify({ ok: r.ok, status: r.status, body: await r.text() });
        } catch (e: any) { return JSON.stringify({ error: e.message }); }
      }, { xnm, xqm });
      const parsed = JSON.parse(result);
      if (parsed.error) { logCb?.(`课表 学期${xnm}-${xqm}: 请求失败 ${parsed.error}`); continue; }
      let data: any;
      try {
        data = JSON.parse(parsed.body);
      } catch {
        logCb?.(`课表 学期${xnm}-${xqm}: http=${parsed.status} 返回不是JSON，跳过`);
        continue;
      }
      const rawItems: any[] = Array.isArray(data?.kbList) ? data.kbList : [];
      // 实测确认：kbList 本身会返回重复行，同一门课同一时段(星期/节次/周次完全相同)最多重复出现
      // 过5次(果果查库验证过，"演讲与口才"在2025-12学期原样重复5条)——不是我们扫描了两次，是
      // 接口自己就这样返回的，猜测跟重修/多教学班登记机制有关。入库前按"课程+星期+节次+周次+
      // 地点+教学班"这个组合去重，同组合只留第一条。
      // 去重键用 xqj(真实星期几)+zcd(真实周次文本)——day/jxbzc 都已确认不是这两个含义，
      // 用错字段当去重键之前能凑巧生效是因为它们对同一批真重复行也恰好保持一致，不是本质正确
      const seen = new Set<string>();
      const items = rawItems.filter((it) => {
        const key = [it.kcmc, it.xqj, it.jcs || it.jcor || it.jc, it.zcd, it.cdmc, it.jxbmc].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // 只记结构元信息，不落响应体（含学号/姓名等 PII）
      logCb?.(`课表 学期${xnm}-${xqm}: http=${parsed.status} arrayFields=${describeArrayFields(data)} 原始${rawItems.length}条去重后${items.length}条`);

      // 每个有数据的学期抽 8 门不同课的关键字段，用于多学期交叉验证 xqj/zcd 映射
      if (items.length) {
        const sn = new Set<string>();
        const sp: any[] = [];
        for (const it of items) {
          if (!sn.has(it.kcmc) && sp.length < 8) { sn.add(it.kcmc); sp.push({ kcmc: it.kcmc, xqj: it.xqj, xqjmc: it.xqjmc, jc: it.jc, zcd: it.zcd, xm: it.xm, cdmc: it.cdmc }); }
        }
        logCb?.(`课表 学期${xnm}-${xqm} 样本: ${JSON.stringify(sp)}`);
      }

      // 学号/姓名/班级只需要拿一次，第一个查到的非空结果就够了，不用每个学期都重复取
      if (!studentId) {
        const info = data?.xsxx || {};
        studentId = items[0]?.xh || info.XH || '';
        studentName = info.XM || '';
        className = info.BJMC || '';
      }

      if (items.length) {
        terms.push({ xnm, xqm, courses: items });
      }
    } catch (e: any) { logCb?.(`课表 学期${xnm}-${xqm}: 解析异常 ${e?.message || e}`); /* 试下一个组合 */ }
  }

  return { studentId, studentName, className, terms };
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
 * gnmkdm 交叉校验 —— 从一次性调试函数（拉菜单树确认真实模块码）演化成永久保留的安全网。
 * 背景：课表/成绩/考试的 gnmkdm 目前是硬编码值，只在一个测试账号上验证过；如果学校对不同学生
 * 路由到不同的模块码（多校区/特殊身份等），代码不会报错，只会安静地拿到"合法但空"的结果，
 * 表现跟"这学期确实没数据"完全一样，没法区分。
 * 做法：登录时拉一次这个学生的真实菜单，按名字关键词（不是编码）找到对应菜单项，取出真实
 * gnmkdm 跟硬编码值对比。一致就什么都不打（避免每次登录刷屏），不一致才打 security 告警——
 * 这次不自动切换查询用的编码（硬编码值是唯一验证过真的能拿到数据的配置，贸然自动切换比保持
 * 现状风险更大），只是让我们第一时间知道"有人的编码跟别人不一样"，而不是永远被蒙在鼓里。
 */
async function checkMenuGnmkdmDrift(page: Page, sessionId: string, traceId?: string) {
  try {
    var ajaxUrls: string[] = [];
    page.on('request', function onReq(req) {
      var u = req.url();
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
    const result = await page.evaluate(function() {
      var menuItems: any[] = [];
      var container = document.querySelector('#navbar-tabs');
      var allA = container ? container.querySelectorAll('a') : document.querySelectorAll('a');
      for (var i = 0; i < allA.length; i++) {
        var a = allA[i];
        var text = (a.innerText || '').replace(/\s+/g, ' ').trim();
        var onclick = a.getAttribute('onclick') || '';
        var dataAttrs: any = {};
        if (a.attributes) {
          for (var j = 0; j < a.attributes.length; j++) {
            var name = a.attributes[j].name;
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
      const found = extractGnmkdm(hitHaystack) || (ajaxJoined.indexOf(keyword) !== -1 ? extractGnmkdm(ajaxJoined) : null);

      if (!hit && !found) {
        logger.info('gnmkdm交叉校验：菜单中未找到该模块关键词，可能是权限或菜单结构变化', { sessionId, trace_id: traceId, label, keyword });
        continue;
      }
      if (found && found !== expected) {
        logger.security('gnmkdm交叉校验：与硬编码不一致，疑似该账号路由到不同模块码', {
          sessionId, trace_id: traceId, label, expected, found,
        });
      }
      // found === expected，或者找到菜单项但没提取到码：都不打日志，避免每次登录刷屏
    }
  } catch (e: any) {
    logger.warn('gnmkdm交叉校验异常', { sessionId, trace_id: traceId, error: e?.message });
  }
}

/**
 * 从成绩查询接口获取成绩，多学期试探、多接口试探。
 * 之前 xsxy/xsxyqk_cxXsxyqkIndex.html?gnmkdm=N105515 用 doType=query 会拿到整页 HTML，
 * 靠一次性侦察在同一个 xsxyqk 页面上抓到了它真实用的查询接口：
 * xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515&sf_request_type=ajax（分页结构，
 * topKeys=currentPage,currentResult,...,totalResult 已验证），优先试这个；
 * 老的 cjcx_cxDgXscj.html?gnmkdm=N305005（社区通用值，实测能返回合法 JSON）留作兜底，
 * 万一新接口哪天参数对不上还有得退。
 * 新接口的列表字段名还没见过真实非空数据，字段映射沿用旧接口那一套（kcmc/jsxm/xf/cj/jd...）
 * 是猜测——多打一行 itemKeys 日志，等真的查到数据了照日志核对字段名对不对。
 */
async function fetchGrades(page: Page, logCb?: (msg: string) => void): Promise<any[]> {
  const semesters = getSemestersToTry();
  const endpoints = [
    { label: '新接口xsxyqk', url: '/jwglxt/xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515&sf_request_type=ajax' },
    { label: '旧接口cjcx', url: '/jwglxt/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005' },
  ];

  for (const ep of endpoints) {
    for (const { xnm, xqm } of semesters) {
      try {
        const result = await page.evaluate(async ({ url, xnm, xqm }) => {
          try {
            const r = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `xnm=${xnm}&xqm=${xqm}&_search=false&queryModel.showCount=200&queryModel.currentPage=1&queryModel.sortName=&queryModel.sortOrder=asc&time=0`,
            });
            return JSON.stringify({ ok: r.ok, status: r.status, body: await r.text() });
          } catch (e: any) { return JSON.stringify({ error: e.message }); }
        }, { url: ep.url, xnm, xqm });
        const parsed = JSON.parse(result);
        if (parsed.error) { logCb?.(`成绩[${ep.label}] 学期${xnm}-${xqm}: 请求失败 ${parsed.error}`); continue; }
        let data: any;
        try {
          data = JSON.parse(parsed.body);
        } catch {
          logCb?.(`成绩[${ep.label}] 学期${xnm}-${xqm}: http=${parsed.status} 返回不是JSON，前80字符=${(parsed.body || '').replace(/\s+/g, ' ').slice(0, 80)}`);
          continue;
        }
        // 记一下顶层字段名，方便判断真实的列表字段叫什么（不打字段值，只打 key，防止 PII 落日志）
        const topKeys = data && typeof data === 'object' ? Object.keys(data).slice(0, 20).join(',') : typeof data;
        // 两种接口的列表字段名不一样：老接口是 items，新接口是分页结构 currentResult
        const items = data?.items || data?.currentResult;
        const itemKeys = Array.isArray(items) && items[0] ? Object.keys(items[0]).slice(0, 25).join(',') : '';
        logCb?.(`成绩[${ep.label}] 学期${xnm}-${xqm}: http=${parsed.status} topKeys=${topKeys} items=${Array.isArray(items) ? items.length : 'N/A'} itemKeys=${itemKeys}`);
        if (Array.isArray(items) && items.length) {
          return items.map((i: any) => ({
            schoolYear: xnm, schoolTerm: xqm,
            courseName: i.kcmc || '未知课程', teacher: i.jsxm || '',
            credit: i.xf ?? '', grade: i.cj ?? '', gradePoint: i.jd ?? '',
            examNature: i.ksxz ?? '', courseNature: i.kcxzmc ?? '',
            courseCategory: i.kclbmc ?? '', courseAttribution: i.kcgsmc ?? '',
            openCollege: i.kkbmmc ?? '',
          }));
        }
      } catch (e: any) { logCb?.(`成绩[${ep.label}] 学期${xnm}-${xqm}: 解析异常 ${e?.message || e}`); }
    }
  }
  return [];
}

/**
 * 从考试安排接口获取考试信息，多学期试探。
 * gnmkdm=N358105 已经手动核对过菜单链接确认无误。侦察机制抓到过页面真实默认查询用 xqm=12——
 * 曾怀疑这是不是拦截错了请求，后来确认 12 就是这个学校"春季学期"的合法编码（见 VALID_XQM
 * 上面的说明），不是 bug。现在偷看一次页面自己默认查询用的真实 xnm/xqm，插到候选列表最前面
 * 优先试，比自己瞎猜准；captureDefaultModuleQuery 内部已加固，能应对同一 matchPath 命中多个
 * 请求的情况。
 */
async function fetchExams(page: Page, logCb?: (msg: string) => void): Promise<any[]> {
  const examIndexUrl = 'https://jw-scpcfe-cn.scvcfe.edu.cn/jwglxt/kwgl/kscx_cxXsksxxIndex.html?gnmkdm=N358105&layout=default';
  const captured = await captureDefaultModuleQuery(page, examIndexUrl, 'kscx_cxXsksxxIndex.html', logCb, '考试');

  let semesters = getSemestersToTry();
  if (captured && captured.xnm && captured.xqm) {
    logCb?.(`默认学期侦察(考试): xnm=${captured.xnm} xqm=${captured.xqm}`);
    // 真实默认学期插到最前面优先试，同时去重，避免后面猜测列表里再查一次一样的
    semesters = [
      { xnm: captured.xnm, xqm: captured.xqm },
      ...semesters.filter((s) => !(s.xnm === captured.xnm && s.xqm === captured.xqm)),
    ];
  }
  // captured 为 null 时 captureDefaultModuleQuery 内部已打过诊断日志，这里不重复

  // 乐观读取：按候选顺序试，第一个查到非空数据的学期直接返回，不跟其他学期的数据混在一起
  for (const { xnm, xqm } of semesters) {
    try {
      const result = await page.evaluate(async ({ xnm, xqm }) => {
        try {
          const r = await fetch('/jwglxt/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `xnm=${xnm}&xqm=${xqm}&_search=false&queryModel.showCount=200&queryModel.currentPage=1&queryModel.sortName=&queryModel.sortOrder=asc&time=0`,
          });
          return JSON.stringify({ ok: r.ok, status: r.status, body: await r.text() });
        } catch (e: any) { return JSON.stringify({ error: e.message }); }
      }, { xnm, xqm });
      const parsed = JSON.parse(result);
      if (parsed.error) { logCb?.(`考试 学期${xnm}-${xqm}: 请求失败 ${parsed.error}`); continue; }
      const data = JSON.parse(parsed.body);
      const items = data?.items;
      logCb?.(`考试 学期${xnm}-${xqm}: http=${parsed.status} items=${Array.isArray(items) ? items.length : 'N/A'}`);
      if (Array.isArray(items) && items.length) {
        return items.map((i: any) => ({
          schoolYear: xnm, schoolTerm: xqm,
          courseName: i.kcmc || '未知课程', teacher: i.jsxx || '',
          examName: i.ksmc ?? '', examTime: i.kssj ?? '',
          examLocation: i.cdmc ?? '', campus: i.xqmc ?? '', seatNumber: i.zwh ?? '',
        }));
      }
    } catch (e: any) { logCb?.(`考试 学期${xnm}-${xqm}: 解析异常 ${e?.message || e}`); }
  }
  return [];
}

export function registerWechatAuthRoutes(app: any, pool: Pool) {
  // ── 1. 发起扫码登录（异步，立即返回 sessionId）──
  app.post('/api/v1/auth/wechat-qr', limiter(3, 30), async (req: Request, res: Response) => {
    // 全局并发上限：限流只按 IP，多 IP 同扫仍可能耗尽内存，这里兜底
    const running = runningBrowserCount();
    if (running >= MAX_CONCURRENT_BROWSERS) {
      logger.security('扫码登录并发达上限，拒绝新会话', { running, ip: req.ip, trace_id: req._traceId });
      return fail(res, 503, '当前扫码登录人数较多，请稍后再试');
    }

    const sessionId = genId();
    logger.info('发起扫码登录', { sessionId, running, trace_id: req._traceId });

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
        gradesData: null,
        examsData: null,
        result: null,
        extracting: false,
        landingUrl: null,
        browserReleased: false,
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
        const hint = err.message?.includes('Executable doesn\'t exist') ? '服务器未安装浏览器，请运行 npx playwright install chromium' : '';
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
              logger.info('页面已离开 CAS 登录页 — 扫码成功', { sessionId, trace_id: req._traceId, url: url.slice(0, 200) });
              return ok(res, { status: 'scanned' });
            }
          } catch (e) { logger.warn('page url error', { error: String(e), sessionId, trace_id: req._traceId }); }
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
          let apiStudentId = '', apiName = '', apiDept = '';
          try {
            const resp = await session.page.evaluate(async () => {
              const r = await fetch('https://cas2.scpcfe.cn/passport/v1/user/onlineInfo?clientType=SDPBrowserClient&platform=Linux&lang=zh-CN', {
                credentials: 'include',
              });
              return JSON.stringify(await r.json());
            });
            const parsed = JSON.parse(resp);
            const user = parsed?.data || parsed || {};
            apiStudentId = user.username || user.userId || user.studentId || user.account || '';
            apiName = user.name || user.displayName || user.nickname || user.realName || '';
            apiDept = user.department || user.deptName || user.orgName || user.departmentName || '';
            // 只记字段结构，不落原始响应（含姓名/学号等 PII）
            logger.info('onlineInfo API 响应', { sessionId, trace_id: req._traceId, hasData: !!parsed?.data, fields: Object.keys(user).slice(0, 20).join(','), gotId: !!apiStudentId, gotName: !!apiName, gotDept: !!apiDept });
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
              logger.warn('学号来自兜底正则提取（非权威接口），存在误判风险', { sessionId, trace_id: req._traceId, source: labeled ? 'labeled' : 'bare' });
            }
          }

          // ── 3. 立即判定结果（不阻塞 poll，课表同步延后到 done 阶段）──
          const studentId = apiStudentId || urlStudentId;
          if (studentId) {
            session.userInfo = { studentId, name: apiName, department: apiDept };
            session.status = 'done';
            // student_id 是全站业务日志的统一标识可记录，姓名/院系值不落日志
            logger.info('用户信息提取成功', { sessionId, trace_id: req._traceId, studentId, hasName: !!apiName, hasDept: !!apiDept, source: apiStudentId ? 'onlineInfo' : 'url' });
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
        logger.business('企业微信登录（已有账号）', { user_id: user.id, student_id: studentId, trace_id: req._traceId });
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

      // ── 尝试获取课表数据（防重入：用占位数组阻止并发 poll 重复进入）──
      // 重新设计：不再只挑"当前学期"乐观返回，登录时把近3年+下一学年的课表全部抓一遍存库，
      // 前端仿官网做"学年+学期"选择器，筛的是这里存好的本地数据，不需要保持实时会话
      if (!session.scheduleData) {
        session.scheduleData = []; // 占位，阻止并发进入（[] 和 null 判断上都是"未完成"以外的状态）
        try {
          await session.page.goto('https://jw-scpcfe-cn.scvcfe.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default', {
            waitUntil: 'domcontentloaded', timeout: 5000,
          });
          const scheduleUrl = session.page.url();
          logger.info('课表页导航', { sessionId, trace_id: req._traceId, url: scheduleUrl.slice(0, 200), hasKbcx: scheduleUrl.includes('kbcx') });
          if (scheduleUrl.includes('kbcx')) {
            const { studentId: schId, studentName: schName, className, terms } = await fetchAllSchedules(
              session.page,
              (msg) => logger.info('课表API详情', { sessionId, trace_id: req._traceId, detail: msg }),
            );
            logger.info('课表API', {
              sessionId, trace_id: req._traceId, gotId: !!schId, gotName: !!schName, gotClass: !!className,
              termCount: terms.length, totalCourses: terms.reduce((s, t) => s + t.courses.length, 0),
            });
            // 课表 API 的 schId 来自已登录会话的权威查询，与登录阶段提取的 studentId 交叉校验；
            // 不一致大概率是兜底正则误抓了页面上无关数字，此时账号已按错误学号创建/匹配，先报警，人工介入排查
            if (schId && schId !== studentId) {
              logger.security('学号交叉校验不一致，疑似兜底正则误判', { sessionId, trace_id: req._traceId, user_id: user.id, loginStudentId: studentId, scheduleStudentId: schId });
            }
            // 用课表数据补全姓名和班级（onlineInfo 不返回这些）
            if (schName && !name) {
              session.userInfo!.name = schName;
              await pool.query('UPDATE users SET nickname = ? WHERE student_id = ?', [schName, studentId]).catch(() => {});
            }
            if (className && !department) {
              session.userInfo!.department = className;
              await pool.query('UPDATE users SET department = ? WHERE student_id = ?', [className, studentId]).catch(() => {});
            }
            session.scheduleData = terms;
          }
        } catch (err: any) {
          session.scheduleData = null; // 失败释放占位
          logger.warn('课表获取异常', { sessionId, trace_id: req._traceId, error: err.message });
        }
      }

      // ── gnmkdm 交叉校验（永久保留的安全网，见函数注释）──
      try {
        await checkMenuGnmkdmDrift(session.page, sessionId, req._traceId);
      } catch (err: any) {
        logger.warn('gnmkdm交叉校验调用失败', { sessionId, trace_id: req._traceId, error: err.message });
      }

      // ── 尝试获取成绩数据（复用已登录 session，同一浏览器 origin 下发起相对路径请求）──
      if (!session.gradesData) {
        session.gradesData = []; // 占位，阻止并发进入
        try {
          const grades = await fetchGrades(
            session.page,
            (msg) => logger.info('成绩API详情', { sessionId, trace_id: req._traceId, detail: msg }),
          );
          logger.info('成绩获取结果', { sessionId, trace_id: req._traceId, count: grades.length });
          session.gradesData = grades;
        } catch (err: any) {
          session.gradesData = null; // 失败释放占位
          logger.warn('成绩获取异常（可忽略，不影响登录）', { sessionId, trace_id: req._traceId, error: err.message });
        }
      }

      // ── 尝试获取考试安排数据 ──
      if (!session.examsData) {
        session.examsData = []; // 占位，阻止并发进入
        try {
          const exams = await fetchExams(
            session.page,
            (msg) => logger.info('考试API详情', { sessionId, trace_id: req._traceId, detail: msg }),
          );
          logger.info('考试获取结果', { sessionId, trace_id: req._traceId, count: exams.length });
          session.examsData = exams;
        } catch (err: any) {
          session.examsData = null; // 失败释放占位
          logger.warn('考试获取异常（可忽略，不影响登录）', { sessionId, trace_id: req._traceId, error: err.message });
        }
      }

      // ── 同步课表：多学期全部写入，只清空/覆盖 source='scan_sync' 的记录，不动手动/OCR课程 ──
      let courseCount = 0;
      try {
        const terms: { xnm: string; xqm: string; courses: any[] }[] = Array.isArray(session.scheduleData) ? session.scheduleData : [];
        if (terms.length) {
          // 字段映射已用官网真实课程(职业礼仪/民俗文化与生活/会计信息系统应用，含跨周三、周五两个
          // 不同星期的样本)完整交叉验证过，全部确认无误：
          // xqj=真实星期几(1=周一...5=周五，跟本项目 weekday 惯例一致，不用再转换)——之前用的 day
          // 字段其实是查询当天的日期(日期里的"几号")，跟星期几无关，两个不同星期的课却显示了同一个
          // day 值，这次靠着两门已知真实星期不同的课对比才排除掉这个误判
          // xm=教师姓名——之前误判"接口不返回教师"是因为 describeArrayFields 把字段列表截到25个，
          // 刚好把 xm 截没了，不是接口真的没有这个字段
          // zcd=真实周次文本(如"1-16周")——取代之前误用的 jxbzc(其实是教学班相关文本，不是周次)
          // jc/jcor/jcs=节次范围文本、cdmc=上课地点、jxbmc=教学班、kcmc=课程名，维持原映射
          // 官网富字段这次也基本配齐：xqmc=校区、khfsmc=考核方式、kcxszc=课程学时组成、
          // zhxs=周学时、zxs=总学时、xf=学分；教学班组成/选课备注这两个目前还没找到对应字段，先留空
          const allCourses = terms.flatMap(({ xnm, xqm, courses }) => courses.map((item: any) => {
            const rawXqj = Number(item.xqj);
            const weekday = rawXqj === 0 ? 7 : (rawXqj || 1);
            const periodText = String(item.jcs || item.jcor || item.jc || '');
            const periodMatch = periodText.match(/(\d+)(?:[-~](\d+))?/);
            const start = periodMatch ? parseInt(periodMatch[1], 10) : 1;
            const end = periodMatch && periodMatch[2] ? parseInt(periodMatch[2], 10) : start;
            const zcText = String(item.zcd || '');
            const activeWeeks = parseWeekPattern(zcText);
            // week_start/week_end/week_type 保留作简单兜底展示(比如老版本前端或manual/OCR课程的
            // 展示逻辑)，取活动周次的最小/最大值；真正判断"第N周是否有这门课"用 activeWeeks 精确查
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
              week_type: 'all', // 真实的单双周信息已经精确编码进 active_weeks，这个字段只是兜底展示
              week_pattern: zcText || null,
              active_weeks: activeWeeks.length ? JSON.stringify(activeWeeks) : null,
              course_type: 'theory',
              campus: item.xqmc || null,
              class_group: item.jxbmc || null,
              class_composition: null,
              exam_method: item.khfsmc || null,
              elective_note: null,
              hours_breakdown: item.kcxszc || null,
              weekly_hours: item.zhxs != null && item.zhxs !== '' ? String(item.zhxs) : null,
              total_hours: item.zxs != null && item.zxs !== '' ? String(item.zxs) : null,
              credit: item.xf != null && item.xf !== '' ? String(item.xf) : null,
            };
          }));

          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            await conn.query("DELETE FROM courses WHERE user_id = ? AND source = 'scan_sync'", [user.id]);
            for (const c of allCourses) {
              await conn.query(
                `INSERT INTO courses (user_id, school_year, school_term, source, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, week_pattern, active_weeks, course_type, campus, class_group, class_composition, exam_method, elective_note, hours_breakdown, weekly_hours, total_hours, credit)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [c.user_id, c.school_year, c.school_term, c.source, c.name, c.teacher, c.classroom, c.weekday, c.start_period, c.period_span, c.week_start, c.week_end, c.week_type, c.week_pattern, c.active_weeks, c.course_type, c.campus, c.class_group, c.class_composition, c.exam_method, c.elective_note, c.hours_breakdown, c.weekly_hours, c.total_hours, c.credit],
              );
            }
            await conn.commit();
            courseCount = allCourses.length;
            logger.business('课表自动同步', { user_id: user.id, count: courseCount, termCount: terms.length, trace_id: req._traceId });
          } catch (e: any) {
            await conn.rollback();
            logger.error('课表同步失败', { error: e.message, user_id: user.id, trace_id: req._traceId });
          } finally { conn.release(); }
        }
      } catch (e: any) {
        logger.warn('课表自动同步失败（可忽略）', { error: e.message, user_id: user.id, trace_id: req._traceId });
      }

      // ── 同步成绩（覆盖式：DELETE + INSERT，与课表同步同一模式）──
      let gradeCount = 0;
      try {
        const grades = session.gradesData;
        if (grades?.length) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM grades WHERE user_id = ?', [user.id]);
            for (const g of grades) {
              await conn.query(
                `INSERT INTO grades (user_id, school_year, school_term, course_name, teacher, credit, grade, grade_point, exam_nature, course_nature, course_category, course_attribution, open_college)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user.id, g.schoolYear, g.schoolTerm, g.courseName, g.teacher, g.credit, g.grade, g.gradePoint, g.examNature, g.courseNature, g.courseCategory, g.courseAttribution, g.openCollege],
              );
            }
            await conn.commit();
            gradeCount = grades.length;
            logger.business('成绩自动同步', { user_id: user.id, count: gradeCount, trace_id: req._traceId });
          } catch (e: any) {
            await conn.rollback();
            logger.error('成绩同步失败', { error: e.message, user_id: user.id, trace_id: req._traceId });
          } finally { conn.release(); }
        }
      } catch (e: any) {
        logger.warn('成绩自动同步失败（可忽略）', { error: e.message, user_id: user.id, trace_id: req._traceId });
      }

      // ── 同步考试安排（覆盖式）──
      let examCount = 0;
      try {
        const exams = session.examsData;
        if (exams?.length) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM exams WHERE user_id = ?', [user.id]);
            for (const ex of exams) {
              await conn.query(
                `INSERT INTO exams (user_id, school_year, school_term, course_name, teacher, exam_name, exam_time, exam_location, campus, seat_number)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user.id, ex.schoolYear, ex.schoolTerm, ex.courseName, ex.teacher, ex.examName, ex.examTime, ex.examLocation, ex.campus, ex.seatNumber],
              );
            }
            await conn.commit();
            examCount = exams.length;
            logger.business('考试安排自动同步', { user_id: user.id, count: examCount, trace_id: req._traceId });
          } catch (e: any) {
            await conn.rollback();
            logger.error('考试安排同步失败', { error: e.message, user_id: user.id, trace_id: req._traceId });
          } finally { conn.release(); }
        }
      } catch (e: any) {
        logger.warn('考试安排自动同步失败（可忽略）', { error: e.message, user_id: user.id, trace_id: req._traceId });
      }

      // ── 下发 JWT（amr=scan：教务扫码为权威身份源，1 小时内可免旧密码重设密码） ──
      const isAdmin = !!user.is_admin;
      const accessToken = signAccessToken(user.id, isAdmin, 'scan');
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

      session.result = {
        status: 'done',
        token: accessToken,
        refresh_token: refreshToken,
        user: { isAdmin, authStatus: user.auth_status, department: user.department || '' },
        sync: {
          coursesImported: courseCount,
          gradesImported: gradeCount,
          examsImported: examCount,
          message: courseCount > 0 ? `已同步 ${courseCount} 门课程、${gradeCount} 条成绩、${examCount} 场考试` : '未同步课表',
        },
      };
      // 结果已缓存，浏览器立即释放（原来等 5 分钟清理器回收，每个成功登录白占 ~200MB）
      releaseBrowser(session);
      return ok(res, session.result);

    } catch (err: any) {
      logger.error('轮询扫码结果失败', { error: err.message, sessionId, trace_id: req._traceId });
      closeSession(sessionId);
      return fail(res, 500, '登录处理失败，请重试');
    }
  });
}
