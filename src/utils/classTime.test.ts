/**
 * 节次作息测试 — 按 2026-2027学年第1学期官方校历固定口径
 */
import { describe, it, expect } from 'vitest';
import { getPeriodStart, courseEndMin, formatPeriodStart } from './classTime';

describe('getPeriodStart（官方校历作息）', () => {
  it('第1节 8:30（不是旧代码的 8:00）', () => {
    expect(getPeriodStart(1)).toEqual([8, 30]);
  });

  it('第3节分楼栋：C教 10:20，A、B教 10:30', () => {
    expect(getPeriodStart(3, 'C103')).toEqual([10, 20]);
    expect(getPeriodStart(3, 'A201')).toEqual([10, 30]);
    expect(getPeriodStart(3, 'B305')).toEqual([10, 30]);
    expect(getPeriodStart(3)).toEqual([10, 30]); // 未知教室按 A、B 兜底
  });

  it('第7节 15:45、第9节 18:30（晚课）', () => {
    expect(getPeriodStart(7)).toEqual([15, 45]);
    expect(getPeriodStart(9)).toEqual([18, 30]);
  });

  it('学校只有10节，第11节返回 null', () => {
    expect(getPeriodStart(11)).toBeNull();
  });
});

describe('courseEndMin', () => {
  it('第1-2节连排：10:00 结束（8:30起，对内连续）', () => {
    expect(courseEndMin(1, 2)).toBe(10 * 60);
  });

  it('C教第3-4节连排：11:50 结束', () => {
    expect(courseEndMin(3, 2, 'C103')).toBe(11 * 60 + 50);
  });

  it('第5-8节跨对连排：17:15 结束（正确算进课间休息）', () => {
    expect(courseEndMin(5, 4)).toBe(17 * 60 + 15);
  });
});

describe('formatPeriodStart', () => {
  it('格式化 "8:30"', () => {
    expect(formatPeriodStart(1)).toBe('8:30');
    expect(formatPeriodStart(5)).toBe('14:00');
  });
});
