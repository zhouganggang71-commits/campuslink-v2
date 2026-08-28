/**
 * API 模块统一导出
 * 用法: import { authApi, postsApi, coursesApi, circlesApi } from '../api';
 */
export { authApi } from './auth';
export { postsApi } from './posts';
export { coursesApi } from './courses';
export { circlesApi } from './circles';
export { uploadApi } from './upload';
export { noticesApi } from './notices';
export { dmApi } from './messages';
export { academicApi } from './academic';
export type { GradeRow, ExamRow } from './academic';
export { pushApi } from './push';
export { configApi } from './config';
export type { TermInfo } from './config';
export { reportsApi } from './reports';
export { transactionsApi } from './transactions';
export type { TransactionRow } from './transactions';
export { request, setSession, getToken } from './client';
export type { ApiResponse } from './client';
