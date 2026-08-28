/**
 * 学年学期口径测试 — 用果果 2026-07 真实数据组合固定语义，防止回归
 *
 * 语义：xnm=学期开始所在的自然年
 *   秋季 xqm=3：xnm=Y → Y-(Y+1)学年 秋季
 *   春季 xqm=12：xnm=Y → (Y+1)-(Y+2)学年 春季
 * 课程数据春季为 (2025,12) → 显示 "2026-2027学年 春季学期"
 */
import { describe, it, expect } from 'vitest';
import { formatSchoolTerm, termChronoKey, pickCurrentOrPastTerm } from './schoolTerm';

describe('formatSchoolTerm', () => {
  it('秋季：xnm=2025 → 2025-2026学年', () => {
    expect(formatSchoolTerm('2025', '3')).toBe('2025-2026学年 秋季学期');
  });

  it('春季：xnm=2025 → 2026-2027学年（公式 (y+1)-(y+2)）', () => {
    expect(formatSchoolTerm('2025', '12')).toBe('2026-2027学年 春季学期');
  });

  it('下学年秋季：xnm=2026 → 2026-2027学年', () => {
    expect(formatSchoolTerm('2026', '3')).toBe('2026-2027学年 秋季学期');
  });

  it('未知编码兜底不崩', () => {
    expect(formatSchoolTerm('2026', '7')).toContain('2026');
    expect(formatSchoolTerm('abc', '3')).toContain('abc');
  });
});

describe('termChronoKey（时间序）', () => {
  it('同一学年内：秋(2025,3)=2025年9月 早于 春(2025,12)=2026年3月', () => {
    expect(termChronoKey('2025', '3')).toBeLessThan(termChronoKey('2025', '12'));
  });

  it('完整时间线：25秋 < 26春 < 26秋', () => {
    const keys = [termChronoKey('2025', '3'), termChronoKey('2025', '12'), termChronoKey('2026', '3')];
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });
});

describe('pickCurrentOrPastTerm（默认学期兜底，不选未来学期）', () => {
  const now = new Date(2026, 6, 4); // 2026-07-04，当前学期应为 (2025,12) 春季

  it('已经开始的学期里选最晚的（不是 chrono 最晚的下学期）', () => {
    // 25秋(已开始) / 25春(已开始，当前) / 26秋(还没开始，2026-08-31 才开学)
    const terms = [
      { schoolYear: '2025', schoolTerm: '3' },
      { schoolYear: '2025', schoolTerm: '12' },
      { schoolYear: '2026', schoolTerm: '3' },
    ];
    expect(pickCurrentOrPastTerm(terms, now)).toEqual({ schoolYear: '2025', schoolTerm: '12' });
  });

  it('全是未来学期时退而求其次选最早的', () => {
    // 只提前同步到了下学期和下下学期，一条已开始的数据都没有
    const terms = [
      { schoolYear: '2027', schoolTerm: '12' },
      { schoolYear: '2026', schoolTerm: '3' },
    ];
    expect(pickCurrentOrPastTerm(terms, now)).toEqual({ schoolYear: '2026', schoolTerm: '3' });
  });

  it('空数组返回 null', () => {
    expect(pickCurrentOrPastTerm([], now)).toBeNull();
  });

  it('只有一个学期直接返回它', () => {
    const terms = [{ schoolYear: '2025', schoolTerm: '3' }];
    expect(pickCurrentOrPastTerm(terms, now)).toEqual(terms[0]);
  });
});
