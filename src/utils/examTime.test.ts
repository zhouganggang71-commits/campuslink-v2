/**
 * 考试时间解析测试 — 覆盖正方系统常见格式 + 兜底行为
 */
import { describe, it, expect } from 'vitest';
import { parseExamStart, daysUntilExam } from './examTime';

describe('parseExamStart', () => {
  it('标准格式：日期 空格 时间段(~分隔)', () => {
    const d = parseExamStart('2026-06-30 09:00~11:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(30);
    expect(d!.getHours()).toBe(9);
    expect(d!.getMinutes()).toBe(0);
  });

  it('括号格式：日期(时间段)', () => {
    const d = parseExamStart('2026-06-30(09:00-11:00)');
    expect(d!.getHours()).toBe(9);
  });

  it('带周次前缀不误吞：第20周 星期二(2026-06-30) 14:30-16:30', () => {
    const d = parseExamStart('第20周 星期二(2026-06-30) 14:30-16:30');
    expect(d!.getDate()).toBe(30);
    expect(d!.getHours()).toBe(14);
    expect(d!.getMinutes()).toBe(30);
  });

  it('中文日期分隔：2026年6月30日 09:00', () => {
    const d = parseExamStart('2026年6月30日 09:00');
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(30);
  });

  it('只有日期没有时刻：按 00:00', () => {
    const d = parseExamStart('2026-06-30');
    expect(d!.getHours()).toBe(0);
  });

  it('单位数月日', () => {
    const d = parseExamStart('2026-7-5 08:30');
    expect(d!.getMonth()).toBe(6);
    expect(d!.getDate()).toBe(5);
  });

  it('无法解析返回 null', () => {
    expect(parseExamStart('时间待定')).toBeNull();
    expect(parseExamStart('')).toBeNull();
    expect(parseExamStart(null)).toBeNull();
    expect(parseExamStart(undefined)).toBeNull();
  });

  it('非法日期返回 null', () => {
    expect(parseExamStart('2026-13-40 09:00')).toBeNull();
  });
});

describe('daysUntilExam', () => {
  const now = new Date(2026, 6, 4, 12, 0); // 2026-07-04 12:00

  it('未来考试算自然日差', () => {
    expect(daysUntilExam('2026-07-09 09:00', now)).toBe(5);
  });

  it('今天晚些时候 = 0 天', () => {
    expect(daysUntilExam('2026-07-04 15:00', now)).toBe(0);
  });

  it('已开始/已过期返回 null', () => {
    expect(daysUntilExam('2026-07-04 09:00', now)).toBeNull();
    expect(daysUntilExam('2026-06-30 09:00', now)).toBeNull();
  });

  it('解析失败返回 null', () => {
    expect(daysUntilExam('待定', now)).toBeNull();
  });
});
