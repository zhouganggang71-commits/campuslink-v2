/**
 * 上传 API — 文件上传/课表解析/OCR
 */
import { request } from './client';

export const uploadApi = {
  /** 通用图片上传 */
  uploadImage(formData: FormData) {
    return request<{ url: string }>('POST', '/upload', formData, true);
  },

  /** PDF 课表解析 */
  parseSchedulePDF(formData: FormData) {
    return request<{ courses: any[]; rawText: string }>('POST', '/parse-schedule', formData, true);
  },

  /** HTML 课表解析 */
  parseScheduleHTML(html: string) {
    return request<{ courses: any[] }>('POST', '/parse-schedule-html', { html });
  },

  /** OCR 学生证识别 */
  ocrStudentId(formData: FormData) {
    return request<any>('POST', '/ocr-student-id', formData, true);
  },

  /** OCR 课表图片上传（异步轮询） */
  ocrScheduleImage(formData: FormData) {
    return request<{ taskId: string }>('POST', '/ocr-schedule', formData, true);
  },

  /** 轮询 OCR 课表结果 */
  pollScheduleResult(taskId: string) {
    return request<{ status: string; courses?: any[]; error?: string }>('GET', `/ocr-schedule/${taskId}`);
  },
};
