/**
 * 首页"第N周·今日课程"chip 的数据 — 学生一天问自己频率最高的问题：
 * 这周第几周？今天还有几节课？下节在哪？
 *
 * 口径全部复用权威源：周数来自 /config/term（term_config 表），
 * 周次命中走 utils/courseWeek，节次时间走 utils/classTime（官方校历作息）。
 * 不显示的情况：假期/学期未配置（week=null）、该学期本地没有任何课（没同步过课表）。
 */
import { useState, useEffect, useMemo } from 'react';
import { configApi } from '../api';
import type { TermInfo } from '../api';
import type { Course, CourseOverride } from '../types';
import { applyOverrides } from '../utils/courseOverride';
import { periodStartMin, courseEndMin, formatPeriodStart } from '../utils/classTime';

export interface TodayClasses {
  /** null = 不该显示 chip */
  week: number | null;
  total: number;
  remaining: number;
  /** 下一节/正在上 的展示文本；今天没课或已上完为 null */
  nextText: string | null;
  allDone: boolean;
}

export function useTodayClasses(courses: Course[], overrides: CourseOverride[] = []): TodayClasses | null {
  const [term, setTerm] = useState<TermInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    configApi
      .getTerm()
      .then((res) => {
        if (!cancelled && res.code === 0 && res.data) setTerm(res.data);
      })
      .catch(() => {
        /* 离线/失败不显示，锦上添花不打扰 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    // 只有配置来源的周数才可信（猜出来的学期没有周数）
    if (!term || term.source !== 'config' || !term.week) return null;

    const termCourses = courses.filter((c) => c.schoolYear === term.schoolYear && c.schoolTerm === term.schoolTerm);
    if (termCourses.length === 0) return null; // 该学期没同步过课，不显示

    const now = new Date();
    const today = now.getDay() === 0 ? 7 : now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 叠加单次调课（停课的不出现、调进来的按新时间算）
    const todays = applyOverrides(termCourses, overrides, term.week)
      .filter((c) => c.weekday === today)
      .sort((a, b) => a.startPeriod - b.startPeriod);

    const remaining = todays.filter((c) => {
      const end = courseEndMin(c.startPeriod, c.periodSpan, c.classroom);
      return end !== null && end > nowMin;
    });

    let nextText: string | null = null;
    const ongoing = remaining.find((c) => {
      const start = periodStartMin(c.startPeriod, c.classroom);
      return start !== null && start <= nowMin;
    });
    if (ongoing) {
      nextText = `「${ongoing.name}」正在上`;
    } else if (remaining.length > 0) {
      const next = remaining[0];
      const time = formatPeriodStart(next.startPeriod, next.classroom);
      nextText = `下一节 ${time ? `${time} ` : ''}「${next.name}」${next.classroom ? ` @${next.classroom}` : ''}`;
    }

    return {
      week: term.week,
      total: todays.length,
      remaining: remaining.length,
      nextText,
      allDone: todays.length > 0 && remaining.length === 0,
    };
  }, [term, courses, overrides]);
}
