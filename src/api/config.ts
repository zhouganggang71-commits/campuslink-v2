/**
 * 业务配置 API
 */
import { request } from './client';

export interface TermInfo {
  schoolYear: string;
  schoolTerm: string;
  startDate: string | null;
  week: number | null;
  totalWeeks: number;
  source: 'config' | 'guess';
}

export const configApi = {
  /** 当前学年/学期/第几周（服务端权威值） */
  getTerm() {
    return request<TermInfo>('GET', '/config/term');
  },
};
