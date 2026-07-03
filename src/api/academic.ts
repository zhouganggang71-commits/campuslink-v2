/**
 * 成绩 / 考试安排 API — 数据来源于扫码登录时顺带同步，这里只读
 */
import { request } from './client';

export interface GradeRow {
  id: number;
  school_year: string | null;
  school_term: string | null;
  course_name: string;
  teacher: string | null;
  credit: string | null;
  grade: string | null;
  grade_point: string | null;
  exam_nature: string | null;
  course_nature: string | null;
  course_category: string | null;
  course_attribution: string | null;
  open_college: string | null;
  created_at: string;
}

export interface ExamRow {
  id: number;
  school_year: string | null;
  school_term: string | null;
  course_name: string;
  teacher: string | null;
  exam_name: string | null;
  exam_time: string | null;
  exam_location: string | null;
  campus: string | null;
  seat_number: string | null;
  created_at: string;
}

export const academicApi = {
  grades() {
    return request<GradeRow[]>('GET', '/grades');
  },
  exams() {
    return request<ExamRow[]>('GET', '/exams');
  },
};
