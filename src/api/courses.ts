/**
 * 课表 API — CRUD/批量导入
 */
import { request } from './client';

export const coursesApi = {
  list() {
    return request<any[]>('GET', '/courses');
  },

  /** 该用户已有数据的学年学期组合，用于渲染"学年+学期"选择器 */
  terms() {
    return request<{ school_year: string; school_term: string }[]>('GET', '/courses/terms');
  },

  create(course: {
    name: string;
    teacher: string;
    classroom: string;
    weekday: number;
    startPeriod: number;
    periodSpan?: number;
    weekStart?: number;
    weekEnd?: number;
    weekType?: string;
    courseType?: string;
    colorClass?: string;
  }) {
    return request<{ id: number }>('POST', '/courses', course);
  },

  update(courseId: string, course: Record<string, any>) {
    return request('PUT', `/courses/${courseId}`, course);
  },

  delete(courseId: string) {
    return request('DELETE', `/courses/${courseId}`);
  },

  /** 批量替换课表（原子操作） */
  batchReplace(courses: Record<string, any>[]) {
    return request<{ count: number }>('PUT', '/courses/batch', courses);
  },

  /** 清空全部课表 */
  clearAll() {
    return request('DELETE', '/courses');
  },

  // ── 单次调课 ──
  listOverrides() {
    return request<any[]>('GET', '/course-overrides');
  },

  /** 设置调课：cancel=本周停课；move=挪到目标周/星期/节次（同周调=toWeek 传原周） */
  setOverride(
    courseId: string,
    body: {
      week: number;
      action: 'cancel' | 'move';
      toWeek?: number;
      toWeekday?: number;
      toStartPeriod?: number;
      toPeriodSpan?: number;
      toClassroom?: string;
    },
  ) {
    return request<{ message: string }>('POST', `/courses/${courseId}/override`, body);
  },

  /** 恢复某周原课表 */
  removeOverride(courseId: string, week: number) {
    return request<{ message: string }>('DELETE', `/courses/${courseId}/override?week=${week}`);
  },
};
