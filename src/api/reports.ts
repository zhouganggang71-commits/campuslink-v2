/**
 * 内容举报 API —— 帖子/圈子帖子/圈子评论/私信通用
 */
import { request } from './client';
import type { ReportInput, ReportAppeal } from '../types';

export const reportsApi = {
  submit(input: ReportInput) {
    return request<{ reported: boolean; duplicate: boolean }>('POST', '/reports', input);
  },

  /** 内容因举报被隐藏后，作者本人提交/重新提交申诉 */
  submitAppeal(targetType: 'post' | 'circle_post' | 'circle_comment', targetId: number, appealText: string) {
    return request<{ submitted: boolean }>('POST', '/report-appeals', { targetType, targetId, appealText });
  },

  /** 查自己某条内容的申诉状态；没提交过返回 null */
  myAppeal(targetType: 'post' | 'circle_post' | 'circle_comment', targetId: number) {
    return request<ReportAppeal | null>('GET', `/report-appeals/mine?targetType=${targetType}&targetId=${targetId}`);
  },
};
