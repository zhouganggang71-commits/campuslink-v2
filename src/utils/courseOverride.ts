/**
 * 单次调课叠加逻辑 — 全局唯一口径（周视图/日视图/今日课程 chip/未来上课提醒共用）
 *
 * 输入"该学期全部课程 + 全部调课记录 + 目标周"，输出该周实际要上的课：
 *   1. 基础：isCourseInWeek 命中该周的课
 *   2. 减去：该周被 cancel / move 走的节次
 *   3. 加上：从别的周（或本周其他时间）move 进来的节次——克隆原课程，替换星期/节次/教室，
 *      打 overrideMoved 标记（渲染角标用），id 加后缀避免跟原课 key 冲突
 */
import type { Course, CourseOverride } from '../types';
import { isCourseInWeek } from './courseWeek';

export function applyOverrides(courses: Course[], overrides: CourseOverride[], week: number): Course[] {
  if (!overrides.length) return courses.filter((c) => isCourseInWeek(c, week));

  const byCourse = new Map<string, CourseOverride[]>();
  overrides.forEach((o) => {
    const list = byCourse.get(o.courseId) || [];
    list.push(o);
    byCourse.set(o.courseId, list);
  });

  const result: Course[] = [];

  courses.forEach((c) => {
    const os = byCourse.get(c.id) || [];
    // 本周正常命中，且没有针对本周的调课记录 → 照常上
    if (isCourseInWeek(c, week) && !os.some((o) => o.week === week)) {
      result.push(c);
    }
    // 有 move 记录把这门课的某一节调到了本周 → 按目标时间渲染
    os.forEach((o) => {
      if (o.action !== 'move' || o.toWeek !== week) return;
      // 防御：目标节次数据不全的脏记录跳过
      if (!o.toWeekday || !o.toStartPeriod) return;
      result.push({
        ...c,
        id: `${c.id}__ov${o.week}`, // 渲染 key 用，避免与原课冲突；操作调课记录仍用原 course id + 原周
        weekday: o.toWeekday,
        startPeriod: o.toStartPeriod,
        periodSpan: o.toPeriodSpan || c.periodSpan,
        classroom: o.toClassroom || c.classroom,
        overrideMoved: true,
      });
    });
  });

  return result;
}

/** 查某课程某周的调课记录（详情弹窗展示/恢复按钮用） */
export function findOverride(overrides: CourseOverride[], courseId: string, week: number): CourseOverride | undefined {
  return overrides.find((o) => o.courseId === courseId && o.week === week);
}

/** 从"被调进来的克隆课程 id"还原原课程 id（xxx__ov5 → xxx） */
export function originalCourseId(renderId: string): string {
  return renderId.replace(/__ov\d+$/, '');
}
