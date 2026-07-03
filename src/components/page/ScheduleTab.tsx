import { useState, useMemo, useRef, useEffect } from 'react';
import { Course } from '../../types';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ScheduleImportModal from '../modal/ScheduleImportModal';

/** 学期编码转人话："秋季学期"/"春季学期"，跟教务系统官网口径一致（3=秋 12=春） */
function formatSchoolTerm(schoolYear: string, schoolTerm: string): string {
  const y = parseInt(schoolYear, 10);
  const yearLabel = isNaN(y) ? schoolYear : `${y}-${y + 1}学年`;
  const termText = schoolTerm === '3' ? '秋季学期' : schoolTerm === '12' ? '春季学期' : `第${schoolTerm}学期`;
  return `${yearLabel} ${termText}`;
}

/** 学期排序权重：同一学年内春季(12)晚于秋季(3)，用于"最新学期优先"排序 */
function termRank(schoolTerm: string): number {
  return schoolTerm === '12' ? 2 : schoolTerm === '3' ? 1 : 0;
}

interface ScheduleTabProps {
  courses: Course[];
  onAddCourse: () => void;
  onEditCourse: (course: Course) => void;
  onImportCourses: (courses: Omit<Course, 'id'>[]) => void;
  onShareSchedule: (week: number) => void;
  onDeleteCourse: (id: string) => void;
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_CHARS = ['一', '二', '三', '四', '五', '六', '日'];

/** 节次 → 开始时间(小时,分钟) 映射，跟日视图展示口径一致 */
const PERIOD_START: Record<number, [number, number]> = {
  1: [8, 0], 2: [8, 55],
  3: [10, 0], 4: [10, 55],
  5: [14, 0], 6: [14, 55],
  7: [16, 0], 8: [16, 55],
  9: [19, 0], 10: [19, 55],
  11: [20, 30], 12: [21, 25],
};

/** 计算课程结束时间的分钟数(从00:00起)，用于判断课程是否已结束 */
function calcCourseEndMin(course: { startPeriod: number; periodSpan: number }): number | null {
  const start = PERIOD_START[course.startPeriod];
  if (!start) return null;
  const span = Math.max(course.periodSpan, 1);
  return start[0] * 60 + start[1] + span * 45 + (span - 1) * 10;
}

/** 判断一门课在当前时间是否已结束（仅今天+本周有效） */
function isCourseFinishedNow(course: { startPeriod: number; periodSpan: number }, currentWeek: number, selectedWeek: number, selectedDay: number): boolean {
  if (currentWeek !== selectedWeek) return false;
  const today = new Date().getDay() || 7;
  if (today !== selectedDay) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endMin = calcCourseEndMin(course);
  return endMin !== null && nowMin > endMin;
}

export default function ScheduleTab({
  courses,
  onAddCourse,
  onEditCourse,
  onImportCourses,
  onShareSchedule,
  onDeleteCourse,
}: ScheduleTabProps) {
  // 计算当前教学周（学期开始日期可配置）
  const getCurrentTeachingWeek = (): number => {
    try {
      const startStr = localStorage.getItem('campuslink_semester_start') || '2026-03-02';
      const start = new Date(startStr);
      const now = new Date();
      const diffMs = now.getTime() - start.getTime();
      const week = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
      return Math.max(1, Math.min(20, week));
    } catch { return 16; }
  };

  const currentWeek = getCurrentTeachingWeek();
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [scheduleView, setScheduleView] = useState<'week' | 'day' | 'list'>('week');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // ── 学年+学期选择器：仿官网"先选学年学期再看课表"，筛的是本地已同步的数据，不用等网络 ──
  const availableTerms = useMemo(() => {
    const map = new Map<string, { schoolYear: string; schoolTerm: string }>();
    courses.forEach((c) => {
      if (c.schoolYear && c.schoolTerm) map.set(`${c.schoolYear}-${c.schoolTerm}`, { schoolYear: c.schoolYear, schoolTerm: c.schoolTerm });
    });
    return Array.from(map.values()).sort((a, b) =>
      a.schoolYear !== b.schoolYear ? b.schoolYear.localeCompare(a.schoolYear) : termRank(b.schoolTerm) - termRank(a.schoolTerm),
    );
  }, [courses]);

  const [selectedTerm, setSelectedTerm] = useState<{ schoolYear: string; schoolTerm: string } | null>(() => {
    // 直接从 courses 算出默认学期，不用等 useEffect 异步设值，消除初始闪现全部课程的窗口
    const map = new Map<string, { schoolYear: string; schoolTerm: string }>();
    courses.forEach((c) => {
      if (c.schoolYear && c.schoolTerm) map.set(`${c.schoolYear}-${c.schoolTerm}`, { schoolYear: c.schoolYear, schoolTerm: c.schoolTerm });
    });
    const terms = Array.from(map.values()).sort((a, b) =>
      a.schoolYear !== b.schoolYear ? b.schoolYear.localeCompare(a.schoolYear) : termRank(b.schoolTerm) - termRank(a.schoolTerm),
    );
    return terms[0] || null;
  });
  const [isTermDropdownOpen, setIsTermDropdownOpen] = useState(false);

  // 默认选中最新学期；扫码同步/OCR导入之后 availableTerms 变化，若当前选中的学期已经不存在了也重新兜底
  useEffect(() => {
    if (!availableTerms.length) { setSelectedTerm(null); return; }
    const stillValid = selectedTerm && availableTerms.some((t) => t.schoolYear === selectedTerm.schoolYear && t.schoolTerm === selectedTerm.schoolTerm);
    if (!stillValid) setSelectedTerm(availableTerms[0]);
  }, [availableTerms]); // eslint-disable-line react-hooks/exhaustive-deps

  const termCourses = useMemo(() => {
    const term = selectedTerm || availableTerms[0] || null;
    if (!term) return courses;
    const filtered = courses.filter((c) => c.schoolYear === term.schoolYear && c.schoolTerm === term.schoolTerm);
    return filtered;
  }, [courses, selectedTerm, availableTerms]);

  const selectedDay = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  }, []);

  // ── 周过滤（在选中学期的课程里再按周次筛）──
  // 有 activeWeeks（扫码同步、来自 zcd 精确解析）时以它为准；手动/OCR 课程没有这个粒度，退回旧的起止周+单双周逻辑
  const weekCourses = useMemo(
    () =>
      termCourses.filter((c) => {
        if (c.activeWeeks && c.activeWeeks.length > 0) {
          return c.activeWeeks.includes(selectedWeek);
        }
        if (c.weekStart > selectedWeek || c.weekEnd < selectedWeek) return false;
        if (c.weekType === 'odd' && selectedWeek % 2 === 0) return false;
        if (c.weekType === 'even' && selectedWeek % 2 === 1) return false;
        return true;
      }),
    [termCourses, selectedWeek],
  );

  // ── 下一堂课 ──
  const nextClassInfo = useMemo(() => {
    const dayClasses = weekCourses.filter((c) => c.weekday === selectedDay);
    if (dayClasses.length === 0) return { name: '今天没课啦', time: '享受自由时光吧' };
    const sorted = [...dayClasses].sort((a, b) => a.startPeriod - b.startPeriod);
    const now = new Date();
    const today = now.getDay() || 7;
    if (selectedDay === today && selectedWeek === currentWeek) {
      // 今天所有课都结束了？
      const allEnded = sorted.every((c) => isCourseFinishedNow(c, currentWeek, selectedWeek, selectedDay));
      if (allEnded) return { name: '今天没课啦', time: '享受自由时光吧' };
      // 找到还没结束的第一门课（当前正在上的 / 下一节）
      const upcoming = sorted.find((c) => !isCourseFinishedNow(c, currentWeek, selectedWeek, selectedDay));
      if (upcoming) return { name: upcoming.name, time: `第 ${upcoming.startPeriod} 节 · ${upcoming.classroom}` };
    }
    return { name: sorted[0].name, time: `第 ${sorted[0].startPeriod} 节 · ${sorted[0].classroom}` };
  }, [weekCourses, selectedDay, selectedWeek, currentWeek]);

  // ── 滑动切周 ──
  const touchX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) setSelectedWeek((w) => Math.max(1, Math.min(20, w + (dx > 0 ? -1 : 1))));
  };
  const prevWeek = () => setSelectedWeek((w) => Math.max(1, w - 1));
  const nextWeek = () => setSelectedWeek((w) => Math.min(20, w + 1));

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      {/* 周选择 + 视图切换 */}
      <section className="px-4 py-4 bg-white border-b border-gray-100" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            {/* 学年+学期选择器：仿官网先选学年学期，筛的是本地已同步数据，选完立刻生效不用等待 */}
            <div className="relative -ml-0.5 mb-0.5">
              <button
                onClick={() => availableTerms.length > 1 && setIsTermDropdownOpen(!isTermDropdownOpen)}
                className={`flex items-center gap-0.5 text-[11px] text-gray-400 font-medium px-0.5 ${availableTerms.length > 1 ? 'cursor-pointer hover:text-primary' : ''}`}
              >
                <span>{selectedTerm ? formatSchoolTerm(selectedTerm.schoolYear, selectedTerm.schoolTerm) : '尚未同步课表'}</span>
                {availableTerms.length > 1 && <Icon name="chevron_down" className="text-[9px]" />}
              </button>
              {isTermDropdownOpen && availableTerms.length > 1 && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1.5 w-44 max-h-56 overflow-y-auto">
                  {availableTerms.map((t) => (
                    <button
                      key={`${t.schoolYear}-${t.schoolTerm}`}
                      onClick={() => { setSelectedTerm(t); setIsTermDropdownOpen(false); }}
                      className={`w-full text-left text-xs px-4 py-2 hover:bg-slate-50 cursor-pointer ${
                        selectedTerm?.schoolYear === t.schoolYear && selectedTerm?.schoolTerm === t.schoolTerm ? 'text-primary font-bold bg-primary/5' : 'text-gray-700'
                      }`}
                    >
                      {formatSchoolTerm(t.schoolYear, t.schoolTerm)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {scheduleView !== 'list' && (
                <>
                  <button onClick={prevWeek} className="p-1 hover:bg-slate-100 rounded-full cursor-pointer"><Icon name="chevron_left" className="text-sm text-gray-400" /></button>
                  <div className="relative">
                    <button onClick={() => setIsWeekDropdownOpen(!isWeekDropdownOpen)} className="flex items-center gap-1 font-headline text-lg font-bold text-on-surface cursor-pointer">
                      <span>第 {selectedWeek} 周</span><Icon name="chevron_down" className="text-sm" />
                    </button>
                    {isWeekDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1.5 w-32 max-h-48 overflow-y-auto">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
                          <button key={w} onClick={() => { setSelectedWeek(w); setIsWeekDropdownOpen(false); }}
                            className={`w-full text-left text-xs px-4 py-2 hover:bg-slate-50 cursor-pointer ${selectedWeek === w ? 'text-primary font-bold bg-primary/5' : 'text-gray-700'}`}>
                            第 {w} 周 {w === currentWeek ? '(本周)' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={nextWeek} className="p-1 hover:bg-slate-100 rounded-full cursor-pointer"><Icon name="chevron_right" className="text-sm text-gray-400" /></button>
                </>
              )}
              {scheduleView === 'list' && (
                <span className="font-headline text-lg font-bold text-on-surface">完整课表</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {scheduleView !== 'list' && (
              <>
                <button onClick={() => onShareSchedule(selectedWeek)} className="flex items-center gap-1 text-on-surface-variant border border-gray-200 hover:border-primary/30 hover:text-primary px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors"><Icon name="share_2" className="text-[10px]" /> 导出</button>
                <button onClick={() => setSelectedWeek(currentWeek)} className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer">回本周</button>
              </>
            )}
            <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
              <button onClick={() => setScheduleView('week')} className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'week' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}>周视图</button>
              <button onClick={() => setScheduleView('day')} className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'day' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}>日视图</button>
              <button onClick={() => setScheduleView('list')} className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'list' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}>列表</button>
            </div>
          </div>
        </div>
      </section>

      {/* 周视图：节次行数按实际课程动态算(不再写死11节，避免超出的课程行高被压缩/错位)，
          行高用 gridTemplateRows 显式声明，隐式行也保证跟其他行一样高；
          同一天同一时段有多门课时用"车道"横向平分，不再简单堆叠互相遮挡 */}
      {scheduleView === 'week' && (() => {
        const maxPeriod = Math.max(11, ...weekCourses.map((c) => c.startPeriod + c.periodSpan - 1), 1);
        const periodRows = Array.from({ length: maxPeriod }, (_, i) => i + 1);

        // 车道分配：同一天按开始节次排序，贪心找一条"上一门课已经下课"的车道复用，找不到就开新车道
        const laned = (() => {
          const byDay: Record<number, Course[]> = {};
          weekCourses.forEach((c) => { (byDay[c.weekday] ||= []).push(c); });
          const out: Array<Course & { lane: number; laneCount: number }> = [];
          Object.values(byDay).forEach((dayCourses) => {
            const sorted = [...dayCourses].sort((a, b) => a.startPeriod - b.startPeriod);
            const laneEnds: number[] = []; // 每条车道当前占用到的结束节次
            const withLane = sorted.map((c) => {
              const end = c.startPeriod + c.periodSpan - 1;
              let lane = laneEnds.findIndex((e) => e < c.startPeriod);
              if (lane === -1) { lane = laneEnds.length; laneEnds.push(end); } else { laneEnds[lane] = end; }
              return { c: { ...c, isFinished: isCourseFinishedNow(c, currentWeek, selectedWeek, c.weekday) }, lane };
            });
            const laneCount = laneEnds.length;
            withLane.forEach(({ c, lane }) => out.push({ ...c, lane, laneCount }));
          });
          return out;
        })();

        return (
          <section className="px-4 py-4 overflow-x-auto select-none">
            <div
              className="min-w-[560px] grid grid-cols-[36px_repeat(7,1fr)] gap-1 relative"
              style={{ gridTemplateRows: `24px repeat(${periodRows.length}, 52px)` }}
            >
              <div />
              {DAY_CHARS.map((d, i) => (
                <div key={i} className="text-center text-[10px] font-bold text-gray-400 flex items-center justify-center border-b border-gray-100">{d}</div>
              ))}
              {periodRows.map((h) => (
                <div key={h} className="col-start-1 text-center text-[10px] text-gray-400 font-bold flex items-center justify-center border-r border-slate-100/50">{h}</div>
              ))}
              {laned.map((course) => (
                <div key={course.id} onClick={() => setSelectedCourse(course)}
                  style={{
                    gridRowStart: course.startPeriod + 1,
                    gridRowEnd: course.startPeriod + course.periodSpan + 1,
                    gridColumnStart: course.weekday + 1,
                    gridColumnEnd: course.weekday + 2,
                    marginLeft: `${(100 / course.laneCount) * course.lane}%`,
                    width: `${100 / course.laneCount}%`,
                  }}
                  className={`p-1.5 rounded-lg flex flex-col justify-between overflow-hidden shadow-xs hover:brightness-95 transition-all text-left border border-black/5 cursor-pointer ${course.colorClass} ${course.isFinished ? 'opacity-40 grayscale' : ''}`}>
                  <span className="text-[10px] font-bold leading-tight line-clamp-2">{course.name}</span>
                  <span className="text-[8px] font-semibold opacity-90 block mt-1 flex items-center gap-0.5"><Icon name="map_pin" className="text-[8px]" />{course.classroom}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* 日视图 */}
      {scheduleView === 'day' && (() => {
        const dayCourses = weekCourses
          .filter((c) => c.weekday === selectedDay)
          .map((c) => ({ ...c, isFinished: isCourseFinishedNow(c, currentWeek, selectedWeek, selectedDay) }));
        return (
          <section className="px-4 py-4 flex flex-col gap-3 animate-fade-in flex-1">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{WEEKDAYS[selectedDay - 1]} 课程</span>
              <span className="text-xs text-primary font-semibold">共 {dayCourses.length} 门课</span>
            </div>
            {dayCourses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Icon name="party_popper" className="text-4xl mb-2 opacity-60" />
                <p className="text-xs font-semibold text-center">今天不用上课！</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {dayCourses.map((course) => (
                  <div key={course.id} onClick={() => setSelectedCourse(course)}
                    className={`bg-white rounded-xl p-3.5 shadow-xs border border-slate-100 flex gap-2 items-start relative overflow-hidden transition-all hover:translate-x-1 duration-200 cursor-pointer ${course.isFinished ? 'opacity-50' : ''}`}>
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${course.colorClass.split(' ')[0]}`}></div>
                    <div className="flex-1 pl-2">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <h3 className="font-headline font-semibold text-sm">{course.name}</h3>
                          <p className="text-[10px] text-gray-400 mt-0.5">{course.teacher} · {course.courseType === 'lab' ? '实验' : course.courseType === 'elective' ? '选修' : '理论'}{course.weekType !== 'all' ? ` · ${course.weekType === 'odd' ? '单周' : '双周'}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="bg-slate-100 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold">第 {course.startPeriod}-{course.startPeriod + course.periodSpan - 1} 节</span>
                          <button onClick={(e) => { e.stopPropagation(); if (confirm(`删除课程「${course.name}」？`)) onDeleteCourse(course.id); }} className="text-gray-400 hover:text-course-red p-1 rounded-full hover:bg-red-50 transition-colors cursor-pointer"><Icon name="trash_2" className="text-sm" /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 font-medium mt-2">
                        <span className="flex items-center gap-1"><Icon name="clock" className="text-sm text-primary" />{({ 1: '08:00', 3: '10:00', 5: '14:00', 7: '16:00', 9: '19:00', 11: '20:30' } as Record<number, string>)[course.startPeriod] || `${course.startPeriod}:00`}</span>
                        <span className="flex items-center gap-1"><Icon name="map_pin" className="text-sm text-gray-500" />{course.classroom}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* 列表视图：仿教务系统官网，展示选中学期的完整课表（不按周筛选），每门课内联展示完整信息 */}
      {scheduleView === 'list' && (() => {
        const byWeekday = WEEKDAYS.map((_, i) => {
          const weekday = i + 1;
          const list = termCourses.filter((c) => c.weekday === weekday).sort((a, b) => a.startPeriod - b.startPeriod);
          return { weekday, list };
        }).filter((g) => g.list.length > 0);

        return (
          <section className="px-4 py-4 flex flex-col gap-4 animate-fade-in flex-1">
            {byWeekday.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Icon name="calendar" className="text-4xl mb-2 opacity-60" />
                <p className="text-xs font-semibold text-center">这个学期还没有课程数据</p>
              </div>
            ) : (
              byWeekday.map(({ weekday, list }) => (
                <div key={weekday}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-xs font-bold text-primary">{WEEKDAYS[weekday - 1]}</span>
                    <span className="text-[10px] text-gray-400">共 {list.length} 门课</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {list.map((course) => (
                      <div key={course.id} onClick={() => setSelectedCourse(course)}
                        className={`bg-white rounded-xl p-3 shadow-xs border border-slate-100 flex gap-2 items-start relative overflow-hidden cursor-pointer hover:bg-slate-50 transition-colors ${course.isFinished ? 'opacity-50' : ''}`}>
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${course.colorClass.split(' ')[0]}`}></div>
                        <div className="flex-1 pl-2 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="font-headline font-semibold text-sm text-on-surface truncate">{course.name}</h3>
                            <span className="shrink-0 bg-slate-100 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold">第{course.startPeriod}-{course.startPeriod + course.periodSpan - 1}节</span>
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-gray-500">
                            <span>周数：{course.weekPattern || `第${course.weekStart}-${course.weekEnd}周${course.weekType !== 'all' ? `(${course.weekType === 'odd' ? '单' : '双'})` : ''}`}</span>
                            {course.classroom && <span>· 上课地点：{course.classroom}</span>}
                            {course.teacher && <span>· 教师：{course.teacher}</span>}
                            {course.campus && <span>· 校区：{course.campus}</span>}
                            {course.classGroup && <span>· 教学班：{course.classGroup}</span>}
                            {course.classComposition && <span>· 教学班组成：{course.classComposition}</span>}
                            {course.examMethod && <span>· 考核方式：{course.examMethod}</span>}
                            {course.electiveNote && <span>· 选课备注：{course.electiveNote}</span>}
                            {course.hoursBreakdown && <span>· 课程学时组成：{course.hoursBreakdown}</span>}
                            {course.weeklyHours && <span>· 周学时：{course.weeklyHours}</span>}
                            {course.totalHours && <span>· 总学时：{course.totalHours}</span>}
                            {course.credit && <span>· 学分：{course.credit}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        );
      })()}

      <section className="px-4 mt-auto py-4 bg-slate-50 border-t border-slate-100 flex gap-2">
        <button onClick={() => setImportOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-xl py-3 cursor-pointer hover:bg-primary/5 transition-colors">
          <Icon name="file_text" className="text-primary text-lg" />
          <span className="text-xs font-semibold text-primary">导入课表（PDF/HTML）</span>
        </button>
        <button onClick={onAddCourse}
          className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors">
          <Icon name="add" className="text-gray-500 text-lg" />
        </button>
      </section>

      <ScheduleImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} onImport={onImportCourses} />

      {/* 课程详情弹窗 */}
      {selectedCourse && (
        <Modal isOpen={true} onClose={() => setSelectedCourse(null)}
          title={<span className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${selectedCourse.colorClass.split(' ')[0]}`} />{selectedCourse.name}</span>}
          footer={<div className="flex gap-2"><Button variant="primary" size="sm" block onClick={() => { onEditCourse(selectedCourse); setSelectedCourse(null); }}><Icon name="edit" className="text-sm" /> 编辑课程</Button><Button variant="danger" size="sm" block onClick={() => { if (confirm(`删除课程「${selectedCourse.name}」？`)) { onDeleteCourse(selectedCourse.id); setSelectedCourse(null); } }}><Icon name="trash_2" className="text-sm" /> 删除课程</Button></div>}>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-400">教师</span>
              <span className="font-semibold text-on-surface">{selectedCourse.teacher || '未填写'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-400">教室</span>
              <span className="font-semibold text-on-surface">{selectedCourse.classroom || '未填写'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-400">时间</span>
              <span className="font-semibold text-on-surface">{WEEKDAYS[selectedCourse.weekday - 1]} 第{selectedCourse.startPeriod}-{selectedCourse.startPeriod + selectedCourse.periodSpan - 1}节</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-400">周次</span>
              <span className="font-semibold text-on-surface">{selectedCourse.weekPattern || `第${selectedCourse.weekStart}-${selectedCourse.weekEnd}周`}</span>
            </div>
            {/* weekPattern（zcd原文）已经把单双周信息编码在每一段里了，再单独显示笼统的"周类型"会误导，只在没有 weekPattern 时才展示 */}
            {!selectedCourse.weekPattern && (
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-gray-400">周类型</span>
                <span className="font-semibold text-on-surface">{selectedCourse.weekType === 'odd' ? '单周' : selectedCourse.weekType === 'even' ? '双周' : '每周'}</span>
              </div>
            )}
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-400">类型</span>
              <span className="font-semibold text-on-surface">{selectedCourse.courseType === 'lab' ? '实验课' : selectedCourse.courseType === 'elective' ? '选修课' : '理论课'}</span>
            </div>
            {/* 教务系统官网信息：只有扫码同步来的课程才有这些字段，手动/OCR添加的课不显示 */}
            {[
              ['校区', selectedCourse.campus],
              ['教学班', selectedCourse.classGroup],
              ['教学班组成', selectedCourse.classComposition],
              ['考核方式', selectedCourse.examMethod],
              ['选课备注', selectedCourse.electiveNote],
              ['课程学时组成', selectedCourse.hoursBreakdown],
              ['周学时', selectedCourse.weeklyHours],
              ['总学时', selectedCourse.totalHours],
              ['学分', selectedCourse.credit],
            ]
              .filter(([, v]) => !!v)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-semibold text-on-surface">{value}</span>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
