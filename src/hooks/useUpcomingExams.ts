/**
 * 未来考试列表 — ExamCountdownCard（课表页）和 HomeTab 倒计时 chip 共用
 * 数据按当前登录用户隔离（/exams 按 token 查自己的考试），每个人看到的都是自己的
 * 游客 / 无数据 / 全部考完 / 接口失败 → 返回空数组，调用方不渲染
 */
import { useState, useEffect } from 'react';
import { academicApi, getToken } from '../api';
import type { ExamRow } from '../api';

export interface UpcomingExam {
  row: ExamRow;
  start: Date;
  /** 自然日差：今天=0，明天=1 */
  days: number;
}

function daysFromNow(start: Date, now: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function useUpcomingExams(): UpcomingExam[] {
  const [upcoming, setUpcoming] = useState<UpcomingExam[]>([]);

  useEffect(() => {
    if (!getToken()) return; // 游客不请求
    let cancelled = false;
    academicApi
      .exams()
      .then((res) => {
        if (cancelled || res.code !== 0 || !Array.isArray(res.data)) return;
        const now = new Date();
        const future = res.data
          .filter((r) => r.exam_start && new Date(r.exam_start).getTime() > now.getTime())
          .map((r) => {
            const start = new Date(r.exam_start!);
            return { row: r, start, days: daysFromNow(start, now) };
          })
          .sort((a, b) => a.start.getTime() - b.start.getTime());
        setUpcoming(future);
      })
      .catch(() => {
        /* 静默：倒计时是锦上添花，失败不打扰 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return upcoming;
}
