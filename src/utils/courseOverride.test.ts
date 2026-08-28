import { describe, it, expect } from 'vitest';
import { applyOverrides, originalCourseId } from './courseOverride';
import type { Course, CourseOverride } from '../types';

const base: Course = {
  id: 'c1',
  name: '会计基础',
  teacher: '张三',
  classroom: 'C103',
  weekday: 3,
  startPeriod: 5,
  periodSpan: 2,
  weekStart: 1,
  weekEnd: 16,
  weekType: 'all',
  courseType: 'theory',
  colorClass: 'bg-course-blue',
};

describe('applyOverrides', () => {
  it('无调课：按周次正常命中', () => {
    expect(applyOverrides([base], [], 5)).toHaveLength(1);
    expect(applyOverrides([base], [], 17)).toHaveLength(0);
  });

  it('cancel：该周消失，其他周不受影响', () => {
    const ov: CourseOverride[] = [{ id: 1, courseId: 'c1', week: 5, action: 'cancel' }];
    expect(applyOverrides([base], ov, 5)).toHaveLength(0);
    expect(applyOverrides([base], ov, 6)).toHaveLength(1);
  });

  it('同周调：原时段消失，新时段出现且带标记', () => {
    const ov: CourseOverride[] = [
      { id: 1, courseId: 'c1', week: 5, action: 'move', toWeek: 5, toWeekday: 5, toStartPeriod: 7 },
    ];
    const week5 = applyOverrides([base], ov, 5);
    expect(week5).toHaveLength(1);
    expect(week5[0].weekday).toBe(5);
    expect(week5[0].startPeriod).toBe(7);
    expect(week5[0].overrideMoved).toBe(true);
    expect(week5[0].classroom).toBe('C103'); // 没填目标教室沿用原课
  });

  it('跨周调：原周消失，目标周多出一节（即使目标周本来也有这门课）', () => {
    const ov: CourseOverride[] = [
      {
        id: 1,
        courseId: 'c1',
        week: 5,
        action: 'move',
        toWeek: 6,
        toWeekday: 1,
        toStartPeriod: 1,
        toClassroom: 'A201',
      },
    ];
    expect(applyOverrides([base], ov, 5)).toHaveLength(0);
    const week6 = applyOverrides([base], ov, 6);
    expect(week6).toHaveLength(2); // 第6周原本的一节 + 调进来的一节
    const moved = week6.find((c) => c.overrideMoved)!;
    expect(moved.classroom).toBe('A201');
    expect(moved.weekday).toBe(1);
  });

  it('调到课程本不上课的周（第17周）也能出现', () => {
    const ov: CourseOverride[] = [
      { id: 1, courseId: 'c1', week: 16, action: 'move', toWeek: 17, toWeekday: 2, toStartPeriod: 3 },
    ];
    const week17 = applyOverrides([base], ov, 17);
    expect(week17).toHaveLength(1);
    expect(week17[0].overrideMoved).toBe(true);
  });
});

describe('originalCourseId', () => {
  it('还原克隆 id', () => {
    expect(originalCourseId('c1__ov5')).toBe('c1');
    expect(originalCourseId('c1')).toBe('c1');
  });
});
