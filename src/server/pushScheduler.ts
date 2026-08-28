/**
 * 通知闭环调度器 — 一个全局每分钟 tick，不是每用户一个定时器
 *
 * 上课提醒：courses JOIN push_subscriptions 先把候选收窄到"订阅了推送的用户"，
 * 在 JS 里用项目已有的共用口径（termConfig/applyOverrides/classTime）算出"这节课今天几点上"，
 * 命中"距现在 19-21 分钟"这个窗口就推送。
 * 考试提醒：同一个 tick 里，只在每天 8:00 那一分钟才真正跑一次（省资源），配合 push_log 兜底
 * pm2 重启错过整点也能当天补跑，不会漏推也不会重推。
 *
 * push_log 唯一键防重推：两条提醒都可能因为 tick 抖动/服务重启被重复算出来，
 * 写日志失败直接跳过（保守：宁可某次没发，也不要在异常语义不明时重复轰炸）。
 */
import { Pool } from 'mysql2/promise';
import { getCurrentTermInfo } from './termConfig';
import { sendPushToUser, isPushConfigured } from './push';
import { applyOverrides, originalCourseId } from '../utils/courseOverride';
import { periodStartMin, formatPeriodStart } from '../utils/classTime';
import { daysUntilExam, parseExamStart } from '../utils/examTime';
import { logger } from '../utils/logger';
import type { Course, CourseOverride } from '../types';

// 上课提醒暂不启动（果果 2026-07-06 决定）：当前订阅推送的只有十几个试用用户，
// 先把资源和验证精力集中在考试提醒（尤其是考前1小时这条）上，代码保留，改这一行即可随时打开
const CLASS_REMINDER_ENABLED = false;

const TICK_MS = 60_000;
// 上课提醒窗口：20 分钟前，容忍 tick 本身 ±1 分钟的粒度
const REMINDER_LOW_MIN = 19;
const REMINDER_HIGH_MIN = 21;
// 考前1小时提醒窗口：60 分钟前，容忍 tick 本身 ±5 分钟的粒度（同一分钟内多次 tick 靠 push_log 去重兜底）
const ONE_HOUR_MIN = 60;
const ONE_HOUR_WINDOW = 5;

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseActiveWeeks(raw: any): number[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 写入去重日志；true=首次（应该发送），false=已发过或写入异常（保守跳过） */
async function tryLogPush(pool: Pool, userId: number, pushType: string, dedupKey: string): Promise<boolean> {
  try {
    await (pool as any).query('INSERT INTO push_log (user_id, push_type, dedup_key) VALUES (?, ?, ?)', [
      userId,
      pushType,
      dedupKey,
    ]);
    return true;
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return false; // 正常的去重路径，已经推过
    if (err.code === 'ER_NO_SUCH_TABLE') return true; // 迁移未跑：退化为不去重也发，好过完全不提醒
    logger.error('push_log 写入失败', { error: err.message, user_id: userId, push_type: pushType });
    return false;
  }
}

async function classReminderTick(pool: Pool): Promise<void> {
  const term = await getCurrentTermInfo(pool);
  if (term.source !== 'config' || term.week === null) return; // 猜出来的学期没有可信周数，不触发

  let courseRows: any[];
  try {
    [courseRows] = (await (pool as any).query(
      `SELECT DISTINCT c.id, c.user_id, c.name, c.teacher, c.classroom, c.weekday, c.start_period,
              c.period_span, c.week_start, c.week_end, c.week_type, c.active_weeks
       FROM courses c
       INNER JOIN push_subscriptions ps ON ps.user_id = c.user_id
       WHERE c.school_year = ? AND c.school_term = ?`,
      [term.schoolYear, term.schoolTerm],
    )) as any;
  } catch (err: any) {
    logger.error('上课提醒查询课程失败', { error: err.message });
    return;
  }
  if (!courseRows.length) return;

  const userIds = [...new Set(courseRows.map((r: any) => r.user_id))] as number[];

  let overrideRows: any[];
  try {
    [overrideRows] = (await (pool as any).query(
      `SELECT user_id, course_id, week, action, to_week, to_weekday, to_start_period, to_period_span, to_classroom
       FROM course_overrides WHERE week = ? AND user_id IN (${userIds.map(() => '?').join(',')})`,
      [term.week, ...userIds],
    )) as any;
  } catch {
    overrideRows = []; // course_overrides 未迁移等情况：降级为"没有调课记录"，基础提醒照常工作
  }

  const overridesByUser = new Map<number, CourseOverride[]>();
  for (const o of overrideRows) {
    const list = overridesByUser.get(o.user_id) || [];
    list.push({
      id: o.id ?? 0,
      courseId: String(o.course_id),
      week: o.week,
      action: o.action,
      toWeek: o.to_week,
      toWeekday: o.to_weekday,
      toStartPeriod: o.to_start_period,
      toPeriodSpan: o.to_period_span,
      toClassroom: o.to_classroom,
    });
    overridesByUser.set(o.user_id, list);
  }

  const coursesByUser = new Map<number, Course[]>();
  for (const r of courseRows) {
    const course: Course = {
      id: String(r.id),
      name: r.name,
      teacher: r.teacher || '',
      classroom: r.classroom || '',
      weekday: r.weekday || 1,
      startPeriod: r.start_period || 1,
      periodSpan: r.period_span || 2,
      weekStart: r.week_start || 1,
      weekEnd: r.week_end || 18,
      weekType: r.week_type || 'all',
      courseType: 'theory',
      colorClass: '',
      activeWeeks: parseActiveWeeks(r.active_weeks),
    };
    const list = coursesByUser.get(r.user_id) || [];
    list.push(course);
    coursesByUser.set(r.user_id, list);
  }

  const now = new Date();
  const jsDay = now.getDay(); // 0=周日..6=周六
  const todayWeekday = jsDay === 0 ? 7 : jsDay; // 项目惯例 1=周一..7=周日
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayStr = toDateStr(now);

  let matched = 0;
  for (const [userId, courses] of coursesByUser) {
    const overrides = overridesByUser.get(userId) || [];
    // 用全学期课程 + 本周调课记录算"这周实际要上的课"——不能提前按 weekday 过滤原始行，
    // 否则"从别的星期调到今天"的课会因为原始行 weekday 对不上而被漏查
    const effective = applyOverrides(courses, overrides, term.week as number);
    for (const c of effective) {
      if (c.weekday !== todayWeekday) continue;
      const startMin = periodStartMin(c.startPeriod, c.classroom);
      if (startMin === null) continue;
      const diff = startMin - nowMin;
      if (diff < REMINDER_LOW_MIN || diff > REMINDER_HIGH_MIN) continue;

      const originalId = originalCourseId(c.id);
      const dedupKey = `${originalId}-${todayStr}`;

      const shouldSend = await tryLogPush(pool, userId, 'class_reminder', dedupKey);
      if (!shouldSend) continue;

      matched++;
      const timeStr = formatPeriodStart(c.startPeriod, c.classroom) || '';
      sendPushToUser(pool, userId, {
        title: '上课提醒',
        body: `${timeStr} ${c.name} @ ${c.classroom || '教室待定'}`,
        tag: `class-${originalId}`,
        url: '/campus/?tab=schedule',
      });
    }
  }
  if (matched) logger.business('上课提醒 tick 命中', { count: matched, week: term.week, weekday: todayWeekday });
}

async function examReminderTick(pool: Pool): Promise<void> {
  let examRows: any[];
  try {
    [examRows] = (await (pool as any).query(
      `SELECT DISTINCT e.id, e.user_id, e.course_name, e.exam_time, e.exam_location
       FROM exams e INNER JOIN push_subscriptions ps ON ps.user_id = e.user_id`,
    )) as any;
  } catch (err: any) {
    logger.error('考试提醒查询失败', { error: err.message });
    return;
  }
  if (!examRows.length) return;

  const now = new Date();
  let matched = 0;
  for (const e of examRows) {
    const days = daysUntilExam(e.exam_time, now);
    if (days !== 7 && days !== 1) continue;

    const dedupKey = `${e.id}-T${days}`;

    const shouldSend = await tryLogPush(pool, e.user_id, 'exam_reminder', dedupKey);
    if (!shouldSend) continue;

    matched++;
    const label = days === 7 ? '还有7天' : '明天';
    sendPushToUser(pool, e.user_id, {
      title: '考试提醒',
      body: `${e.course_name} ${label}开考${e.exam_location ? '，地点 ' + e.exam_location : ''}`,
      tag: `exam-${e.id}-T${days}`,
      url: '/campus/?tab=schedule',
    });
  }
  if (matched) logger.business('考试提醒 tick 命中', { count: matched });
}

/**
 * 考前1小时提醒 — 每分钟都跑（跟 T-7/T-1 那条"每天8点跑一次"不同，1小时是分钟级精度，
 * 必须每个 tick 都检查才能准确捕捉到"还有1小时"这个时刻）。
 * exams 表数据量很小（全校也就几千条量级，何况现在只有十几个订阅用户），
 * 每分钟查一次的开销可以忽略，不需要像上课提醒那样做复杂的候选收窄。
 */
async function examReminder1hTick(pool: Pool): Promise<void> {
  let examRows: any[];
  try {
    [examRows] = (await (pool as any).query(
      `SELECT DISTINCT e.id, e.user_id, e.course_name, e.exam_time, e.exam_location
       FROM exams e INNER JOIN push_subscriptions ps ON ps.user_id = e.user_id`,
    )) as any;
  } catch (err: any) {
    logger.error('考前1小时提醒查询失败', { error: err.message });
    return;
  }
  if (!examRows.length) return;

  const now = new Date();
  let matched = 0;
  for (const e of examRows) {
    const start = parseExamStart(e.exam_time);
    if (!start) continue; // 解析失败：GET /exams 那边已经记日志核对原文格式，这里静默跳过
    const diffMin = Math.round((start.getTime() - now.getTime()) / 60000);
    if (diffMin < ONE_HOUR_MIN - ONE_HOUR_WINDOW || diffMin > ONE_HOUR_MIN + ONE_HOUR_WINDOW) continue;

    const dedupKey = `${e.id}-T1h`;

    const shouldSend = await tryLogPush(pool, e.user_id, 'exam_reminder', dedupKey);
    if (!shouldSend) continue;

    matched++;
    sendPushToUser(pool, e.user_id, {
      title: '考试提醒',
      body: `${e.course_name} 1小时后开考${e.exam_location ? '，地点 ' + e.exam_location : ''}`,
      tag: `exam-${e.id}-T1h`,
      url: '/campus/?tab=schedule',
    });
  }
  if (matched) logger.business('考前1小时提醒 tick 命中', { count: matched });
}

let lastExamCheckDate: string | null = null;

async function tick(pool: Pool): Promise<void> {
  if (CLASS_REMINDER_ENABLED) {
    try {
      await classReminderTick(pool);
    } catch (err: any) {
      logger.error('上课提醒 tick 异常', { error: err.message });
    }
  }

  try {
    await examReminder1hTick(pool);
  } catch (err: any) {
    logger.error('考前1小时提醒 tick 异常', { error: err.message });
  }

  const now = new Date();
  const todayStr = toDateStr(now);
  // 每天 8:00 那一分钟正常触发；如果服务器当时恰好在重启错过了，当天只要 8 点后
  // 再来一次 tick、发现"今天还没查过"就补跑一次——push_log 去重保证补跑不会重复发送
  if (now.getHours() >= 8 && lastExamCheckDate !== todayStr) {
    lastExamCheckDate = todayStr;
    try {
      await examReminderTick(pool);
    } catch (err: any) {
      logger.error('考试提醒 tick 异常', { error: err.message });
    }
  }
}

let started = false;

/** server.ts 在 initPush() 之后调用一次；推送未配置(缺 VAPID 密钥)时不启动，省一个无意义的定时器 */
export function startPushScheduler(pool: Pool): void {
  if (started) return; // 防御性：避免被意外调用两次导致 tick 重复注册
  if (!isPushConfigured()) {
    logger.business('推送未配置，通知闭环调度器不启动', {});
    return;
  }
  started = true;
  setInterval(() => {
    tick(pool).catch((err: any) => logger.error('推送调度器 tick 未捕获异常', { error: err.message }));
  }, TICK_MS);
  logger.business('推送调度器已启动', { intervalMs: TICK_MS });
}
