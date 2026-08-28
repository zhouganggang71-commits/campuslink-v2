/**
 * 权威业务时间：当前学年/学期/第几周
 * - 优先 term_config 表（管理员配置的开学日期）
 * - 表空/未迁移/所有学期都不在教学周期内 → 回退 currentTerm.ts 按月份猜学期，week=null
 * - 上课提醒等调度逻辑只在 source='config' 且 week 非空时工作（猜出来的学期没有周数可言）
 */
import { getCurrentSchoolTerm } from './currentTerm';
import { logger } from '../utils/logger';

export interface TermInfo {
  schoolYear: string;
  schoolTerm: string;
  /** 开学日期 YYYY-MM-DD；guess 时为 null */
  startDate: string | null;
  /** 当前教学周（1 起）；不在任何已配置学期的教学周期内为 null */
  week: number | null;
  totalWeeks: number;
  source: 'config' | 'guess';
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getCurrentTermInfo(pool: any): Promise<TermInfo> {
  try {
    // 取开学日期已到的最近一个学期
    const [rows]: any = await pool.query(
      'SELECT school_year, school_term, start_date, weeks FROM term_config WHERE start_date <= CURDATE() ORDER BY start_date DESC LIMIT 1',
    );
    if (rows.length) {
      const row = rows[0];
      const start = new Date(row.start_date);
      const now = new Date();
      // 按天差算周数，避免时分秒/夏令时干扰
      const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000);
      const week = Math.floor(diffDays / 7) + 1;
      if (week >= 1 && week <= row.weeks) {
        return {
          schoolYear: String(row.school_year),
          schoolTerm: String(row.school_term),
          startDate: toDateStr(start),
          week,
          totalWeeks: row.weeks,
          source: 'config',
        };
      }
      // 超出教学周期（假期）：学期归属仍按月份猜，但周数为 null
    }
  } catch (err: any) {
    // 表未迁移等情况：降级到猜测，不影响调用方
    logger.error('term_config 读取失败，回退月份猜测', { error: err.message });
  }

  const guess = getCurrentSchoolTerm();
  return {
    schoolYear: guess.schoolYear,
    schoolTerm: guess.schoolTerm,
    startDate: null,
    week: null,
    totalWeeks: 20,
    source: 'guess',
  };
}
