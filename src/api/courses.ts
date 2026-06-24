/**
 * 课表 API — CRUD/批量导入
 */
import { request } from './client';

export const coursesApi = {
  list() {
    return request<any[]>('GET', '/courses');
  },

  create(course: {
    name: string; teacher: string; classroom: string;
    weekday: number; startPeriod: number; periodSpan?: number;
    weekStart?: number; weekEnd?: number; weekType?: string;
    courseType?: string; colorClass?: string;
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
};
