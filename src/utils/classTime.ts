/**
 * 节次作息表 — 全局唯一口径（前后端共享，未来上课提醒也用这份）
 *
 * 依据：四川财经职业学院 2026-2027学年第1学期校历「作息时间表」（果果 2026-07-04 提供）
 *   第1-2节  8:30-10:00
 *   课间休息 C教 10:00-10:20 / A、B教 10:00-10:30（两教学楼不同！）
 *   第3-4节  C教 10:20-11:50 / A、B教 10:30-12:00
 *   第5-6节  14:00-15:30
 *   课间休息 15:30-15:45
 *   第7-8节  15:45-17:15
 *   第9-10节 18:30-20:00
 * 每节 45 分钟，同一对(1-2/3-4/…)内两节连续无间隔。学校只有 10 节，11+ 返回 null。
 *
 * 第3-4节按教室楼栋区分：教室名以 C 开头走 C教时间，A/B 开头走 A、B教时间，
 * 未知教室按 A、B教（多数教室）兜底——两者只差 10 分钟，展示/提醒场景可接受。
 */

const DURATION_MIN = 45;

/** 楼栋无关的节次开始时间（3-4节按 AB 教兜底） */
const START_AB: Record<number, [number, number]> = {
  1: [8, 30],
  2: [9, 15],
  3: [10, 30],
  4: [11, 15],
  5: [14, 0],
  6: [14, 45],
  7: [15, 45],
  8: [16, 30],
  9: [18, 30],
  10: [19, 15],
};

const START_C_34: Record<number, [number, number]> = {
  3: [10, 20],
  4: [11, 5],
};

function isCBuilding(classroom?: string | null): boolean {
  return !!classroom && /^c/i.test(classroom.trim());
}

/** 某节课的开始时间 [时, 分]；超出 1-10 节返回 null */
export function getPeriodStart(period: number, classroom?: string | null): [number, number] | null {
  if ((period === 3 || period === 4) && isCBuilding(classroom)) {
    return START_C_34[period];
  }
  return START_AB[period] ?? null;
}

/** 某节课开始时间的"分钟数"(从当天00:00起)；未知节次返回 null */
export function periodStartMin(period: number, classroom?: string | null): number | null {
  const start = getPeriodStart(period, classroom);
  return start ? start[0] * 60 + start[1] : null;
}

/** 一段连排课程的结束"分钟数"：起始节开始 + 节数×45（对内连续，跨对时忽略课间，偏保守晚结束） */
export function courseEndMin(startPeriod: number, periodSpan: number, classroom?: string | null): number | null {
  const startMin = periodStartMin(startPeriod, classroom);
  if (startMin === null) return null;
  const span = Math.max(periodSpan, 1);
  const lastPeriod = startPeriod + span - 1;
  // 优先用"最后一节的开始 + 45"，能正确算进跨对的课间休息
  const lastStart = periodStartMin(lastPeriod, classroom);
  if (lastStart !== null) return lastStart + DURATION_MIN;
  return startMin + span * DURATION_MIN;
}

/** 格式化 "8:30" */
export function formatPeriodStart(period: number, classroom?: string | null): string | null {
  const start = getPeriodStart(period, classroom);
  if (!start) return null;
  return `${start[0]}:${String(start[1]).padStart(2, '0')}`;
}
