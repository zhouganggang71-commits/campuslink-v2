/**
 * ExamCountdownCard — 考试倒计时卡片
 *
 * 展示最近一场未考的考试倒计时（纯前端，数据来自扫码登录时同步的 exams 表）
 * - 自动取 exams API，找最近的一场未来考试
 * - 每分钟刷新倒计时数字
 * - 没有即将到来的考试时完全不渲染
 * - 加载/报错时静默不显示，不干扰页面布局
 */
import { useState, useEffect, useRef } from 'react';
import { academicApi, ExamRow } from '../../api/academic';
import Icon from './Icon';

/** 解析 exam_time 字符串（"2026-07-10 08:30" 或 "2026-07-10 08:30:00"）→ Date */
function parseExamTime(s: string): Date | null {
  // 兼容带 T 的 ISO 格式和不带 T 的"YYYY-MM-DD HH:mm"格式
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

/** 计算目标时间与现在的时间差（毫秒），返回 null 如果已过期 */
function getCountdownMs(target: Date, now: number): number | null {
  const diff = target.getTime() - now;
  return diff > 0 ? diff : null;
}

/** 格式化为"X天 X小时 X分钟" */
function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);

  if (days > 0) return `${days}天 ${hours}小时 ${minutes}分钟`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟`;
}

/** 取远日期（只看天） */
function formatDateOnly(s: string): string {
  // "2026-07-10 08:30" → "7月10日"
  const d = parseExamTime(s);
  if (!d) return s;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 取时间部分 */
function formatTimeOnly(s: string): string {
  // "2026-07-10 08:30" → "08:30"
  const match = s.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : '';
}

export default function ExamCountdownCard() {
  const [exams, setExams] = useState<ExamRow[] | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(Date.now());

  // 挂载时拉一次考试数据
  useEffect(() => {
    let cancelled = false;
    academicApi
      .exams()
      .then((res) => {
        if (cancelled || res.code !== 0 || !res.data) return;
        setExams(res.data);
      })
      .catch(() => {
        /* 静默失败 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 每分钟刷新 now 触发重算倒计时
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // 计算最近一场未来考试
  const upcoming = (() => {
    if (!exams || exams.length === 0) return null;

    // 按 exam_time 排序（近→远）
    const sorted = [...exams]
      .filter((e) => e.exam_time)
      .sort((a, b) => {
        const da = parseExamTime(a.exam_time!);
        const db = parseExamTime(b.exam_time!);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });

    // 找第一场还没考的
    const found = sorted.find((e) => {
      const d = parseExamTime(e.exam_time!);
      return d && d.getTime() > now;
    });
    return found || null;
  })();

  // 没有即将到来的考试 → 不渲染
  if (!upcoming || !upcoming.exam_time) return null;

  const examDate = parseExamTime(upcoming.exam_time);
  const countdownMs = examDate ? getCountdownMs(examDate, now) : null;

  // 已过期也不渲染
  if (countdownMs === null) return null;

  const totalDays = Math.floor(countdownMs / 86400_000);

  return (
    <section className="mx-4 mt-4 mb-2 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon name="alarm_clock" className="text-amber-500 text-sm" />
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">考试倒计时</span>
          </div>

          {/* 课程名 */}
          <h3 className="font-headline font-bold text-sm text-amber-900 truncate mb-2">{upcoming.course_name}</h3>

          {/* 倒计时数字（大号显示） */}
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-2xl font-bold text-amber-600 tabular-nums">{totalDays}</span>
            <span className="text-[11px] font-semibold text-amber-500">天</span>
            {countdownMs < 86400_000 && (
              <>
                <span className="text-2xl font-bold text-amber-600 tabular-nums ml-1">
                  {Math.floor((countdownMs % 86400_000) / 3600_000)}
                </span>
                <span className="text-[11px] font-semibold text-amber-500">小时</span>
              </>
            )}
            <span className="text-[10px] text-amber-400 ml-auto">{formatCountdown(countdownMs)}</span>
          </div>

          {/* 考试时间+地点 */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-amber-700/70">
            <span className="flex items-center gap-1">
              <Icon name="calendar" className="text-[10px]" />
              {formatDateOnly(upcoming.exam_time)}
              {formatTimeOnly(upcoming.exam_time) && (
                <span className="ml-0.5">{formatTimeOnly(upcoming.exam_time)}</span>
              )}
            </span>
            {upcoming.exam_location && (
              <span className="flex items-center gap-1">
                <Icon name="map_pin" className="text-[10px]" />
                {upcoming.exam_location}
              </span>
            )}
            {upcoming.campus && (
              <span className="flex items-center gap-1">
                <Icon name="building" className="text-[10px]" />
                {upcoming.campus}
              </span>
            )}
            {upcoming.seat_number && (
              <span className="flex items-center gap-1">
                <Icon name="grid_3x3" className="text-[10px]" />
                座位 {upcoming.seat_number}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
