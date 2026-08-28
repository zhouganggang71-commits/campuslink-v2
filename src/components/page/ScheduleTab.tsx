import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Course, CourseOverride } from '../../types';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ScheduleImportModal from '../modal/ScheduleImportModal';
import GradesExamsModal from '../modal/GradesExamsModal';
import ExamCountdownCard from './ExamCountdownCard';
import { configApi } from '../../api/config';
import { formatSchoolTerm, termChronoKey, pickCurrentOrPastTerm } from '../../utils/schoolTerm';
import { courseEndMin, formatPeriodStart } from '../../utils/classTime';
import { applyOverrides, findOverride, originalCourseId } from '../../utils/courseOverride';
import { coursesApi } from '../../api';
import { academicApi } from '../../api';

// 学年学期显示/排序统一走 utils/schoolTerm（xnm=学期开始自然年，春季学年标签减一）

interface ScheduleTabProps {
  courses: Course[];
  overrides: CourseOverride[];
  onOverridesChanged: () => void;
  onAddCourse: () => void;
  onEditCourse: (course: Course) => void;
  onImportCourses: (courses: Omit<Course, 'id'>[]) => void;
  onShareSchedule: (week: number) => void;
  onDeleteCourse: (id: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info') => void;
  /** 重新扫码登录（教务会话过期时，GradesExamsModal 会触发此回调） */
  onReAuth?: () => void;
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_CHARS = ['一', '二', '三', '四', '五', '六', '日'];

// 节次作息统一走 utils/classTime（官方校历口径，第3-4节分 C教/A、B教）

/** 学期第1周周一 + (week-1)*7 + (weekday-1) 天 = 某周某天的日期（用于周视图表头显示日期数字） */
function dateForWeekday(semesterStartStr: string, week: number, weekday: number): Date {
  const start = new Date(semesterStartStr);
  return new Date(start.getTime() + ((week - 1) * 7 + (weekday - 1)) * 86400000);
}

/** 判断一门课在当前时间是否已结束（仅今天+本周有效） */
function isCourseFinishedNow(
  course: { startPeriod: number; periodSpan: number; classroom?: string },
  currentWeek: number,
  selectedWeek: number,
  selectedDay: number,
): boolean {
  if (currentWeek !== selectedWeek) return false;
  const today = new Date().getDay() || 7;
  if (today !== selectedDay) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endMin = courseEndMin(course.startPeriod, course.periodSpan, course.classroom);
  return endMin !== null && nowMin > endMin;
}

export default function ScheduleTab({
  courses,
  overrides,
  onOverridesChanged,
  onAddCourse,
  onEditCourse,
  onImportCourses,
  onShareSchedule,
  onDeleteCourse,
  onShowToast,
  onReAuth,
}: ScheduleTabProps) {
  // 当前教学周：服务端 /config/term 是权威源（term_config 表），
  // localStorage 只做离线/接口失败时的兜底（成功响应会把 startDate 回写进来）
  const getLocalFallbackWeek = (): number => {
    try {
      const startStr = localStorage.getItem('campuslink_semester_start') || '2026-03-02';
      const start = new Date(startStr);
      const now = new Date();
      const diffMs = now.getTime() - start.getTime();
      const week = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
      return Math.max(1, Math.min(20, week));
    } catch {
      return 16;
    }
  };

  const [currentWeek, setCurrentWeek] = useState(getLocalFallbackWeek);
  // 学期第1周周一日期：用于周视图表头显示每天的日期数字（服务端 /config/term 返回后会回写更准确的值）
  const [semesterStart, setSemesterStart] = useState<string>(() => {
    try {
      return localStorage.getItem('campuslink_semester_start') || '2026-03-02';
    } catch {
      return '2026-03-02';
    }
  });
  const initialWeekRef = useRef(currentWeek);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [scheduleView, setScheduleView] = useState<'week' | 'day' | 'list' | 'overview'>('week');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [examsModalOpen, setExamsModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── 单次调课表单状态 ──
  const [moveFormOpen, setMoveFormOpen] = useState(false);
  const [moveWeek, setMoveWeek] = useState(1);
  const [moveDay, setMoveDay] = useState(1);
  const [movePeriod, setMovePeriod] = useState(1);
  const [moveRoom, setMoveRoom] = useState('');
  const [ovBusy, setOvBusy] = useState(false);

  // ── 学年+学期选择器：仿官网"先选学年学期再看课表"，筛的是本地已同步的数据，不用等网络 ──
  const availableTerms = useMemo(() => {
    const map = new Map<string, { schoolYear: string; schoolTerm: string }>();
    courses.forEach((c) => {
      if (c.schoolYear && c.schoolTerm)
        map.set(`${c.schoolYear}-${c.schoolTerm}`, { schoolYear: c.schoolYear, schoolTerm: c.schoolTerm });
    });
    return Array.from(map.values()).sort(
      (a, b) => termChronoKey(b.schoolYear, b.schoolTerm) - termChronoKey(a.schoolYear, a.schoolTerm),
    );
  }, [courses]);

  const [selectedTerm, setSelectedTerm] = useState<{ schoolYear: string; schoolTerm: string } | null>(() => {
    // 优先选当前学期（按当前日期算），而不是 chrono 最晚的学期
    // 当前学期算法跟服务端 currentTerm.ts 一致：9-12月=秋(xqm=3)，1月=去年秋，2-8月=春(xqm=12，xnm=当年)
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const current: { schoolYear: string; schoolTerm: string } =
      m >= 9
        ? { schoolYear: String(y), schoolTerm: '3' }
        : m === 1
          ? { schoolYear: String(y - 1), schoolTerm: '3' }
          : { schoolYear: String(y), schoolTerm: '12' };

    // 如果当前学期在 courses 里存在，直接用它；不存在则 fallback 到最新学期
    const map = new Map<string, { schoolYear: string; schoolTerm: string }>();
    courses.forEach((c) => {
      if (c.schoolYear && c.schoolTerm)
        map.set(`${c.schoolYear}-${c.schoolTerm}`, { schoolYear: c.schoolYear, schoolTerm: c.schoolTerm });
    });
    const exists = map.get(`${current.schoolYear}-${current.schoolTerm}`);
    if (exists) return exists;

    // fallback：没有当前学期的课（新生/没同步过）——不能简单选 chrono 最晚的，学校经常
    // 提前发布下学期课表，那样会默认跳到一个还没开始的未来学期（第几周都对不上）；
    // 改用 pickCurrentOrPastTerm：优先选"已经开始的学期里最晚的"，全是未来学期才退而求其次
    return pickCurrentOrPastTerm(Array.from(map.values()), now);
  });
  const [isTermDropdownOpen, setIsTermDropdownOpen] = useState(false);

  // 默认选中最新学期；扫码同步/OCR导入之后 availableTerms 变化，若当前选中的学期已经不存在了也重新兜底
  useEffect(() => {
    if (!availableTerms.length) {
      setSelectedTerm(null);
      return;
    }
    const stillValid =
      selectedTerm &&
      availableTerms.some((t) => t.schoolYear === selectedTerm.schoolYear && t.schoolTerm === selectedTerm.schoolTerm);
    if (!stillValid) {
      // 兜底时也优先当前学期，而不是"chrono 最晚"（同上，避免跳到还没开始的未来学期）
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const sy = m >= 9 ? String(y) : m === 1 ? String(y - 1) : String(y);
      const st = m >= 9 || m === 1 ? '3' : '12';
      const cur = availableTerms.find((t) => t.schoolYear === sy && t.schoolTerm === st);
      setSelectedTerm(cur || pickCurrentOrPastTerm(availableTerms, now));
    }
  }, [availableTerms]); // eslint-disable-line react-hooks/exhaustive-deps

  // 挂载时拉服务端权威学期/周数：修正本地周数、回写兜底缓存、默认学期优先跟服务端当前学期
  const availableTermsRef = useRef(availableTerms);
  availableTermsRef.current = availableTerms;
  useEffect(() => {
    let cancelled = false;
    configApi
      .getTerm()
      .then((res) => {
        if (cancelled || res.code !== 0 || !res.data) return;
        const t = res.data;
        if (t.startDate) {
          try {
            localStorage.setItem('campuslink_semester_start', t.startDate);
          } catch {
            /* noop */
          }
          setSemesterStart(t.startDate);
        }
        if (t.week) {
          setCurrentWeek(t.week);
          // 用户还停在初始默认周（没手动切过）才跟着跳到权威本周
          setSelectedWeek((prev) => (prev === initialWeekRef.current ? t.week! : prev));
        }
        if (t.source === 'config') {
          setSelectedTerm((prev) => {
            const list = availableTermsRef.current;
            // 当前学期（按日期算）
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth() + 1;
            const cur = {
              schoolYear: m >= 9 ? String(y) : m === 1 ? String(y - 1) : String(y),
              schoolTerm: m >= 9 || m === 1 ? '3' : '12',
            };
            // 只在"还是自动默认值"时覆盖：服务端当前学期在本地有课就优先选它
            const isDefault = !prev || (prev.schoolYear === cur.schoolYear && prev.schoolTerm === cur.schoolTerm);
            if (!isDefault) return prev;
            const match = list.find((x) => x.schoolYear === t.schoolYear && x.schoolTerm === t.schoolTerm);
            return match || prev;
          });
        }
      })
      .catch(() => {
        /* 离线/失败：维持本地兜底值 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const termCourses = useMemo(() => {
    // selectedTerm 正常情况下不会是 null（挂载时的 useState 初始值和 useEffect 兜底都会算出一个），
    // 这里只是渲染时序上的过渡态兜底，同样不选未来学期
    const term = selectedTerm || pickCurrentOrPastTerm(availableTerms) || null;
    if (!term) return courses;
    const filtered = courses.filter((c) => c.schoolYear === term.schoolYear && c.schoolTerm === term.schoolTerm);
    return filtered;
  }, [courses, selectedTerm, availableTerms]);

  const selectedDay = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  }, []);

  // ── 周过滤 + 单次调课叠加 ── 命中/调课逻辑统一走 utils/courseOverride（内部用 courseWeek）
  const weekCourses = useMemo(
    () => applyOverrides(termCourses, overrides, selectedWeek),
    [termCourses, overrides, selectedWeek],
  );

  // （原"下一堂课"nextClassInfo 计算是从未被引用的死代码，已删除——首页 useTodayClasses 有同等能力）

  // ── 滑动切周 ──
  const touchX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) setSelectedWeek((w) => Math.max(1, Math.min(20, w + (dx > 0 ? -1 : 1))));
  };
  const prevWeek = () => setSelectedWeek((w) => Math.max(1, w - 1));
  const nextWeek = () => setSelectedWeek((w) => Math.min(20, w + 1));

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      {/* 考试倒计时：有未来考试才渲染，点击进考试列表 */}
      <ExamCountdownCard onOpenExams={() => setExamsModalOpen(true)} />
      <GradesExamsModal isOpen={examsModalOpen} onClose={() => setExamsModalOpen(false)} onRefresh={onReAuth} />

      {/* 周选择 + 视图切换 */}
      <section
        className="px-4 py-4 bg-white border-b border-gray-100"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            {/* 学年+学期选择器：仿官网先选学年学期，筛的是本地已同步数据，选完立刻生效不用等待 */}
            <div className="relative -ml-0.5 mb-0.5">
              <button
                onClick={() => availableTerms.length > 1 && setIsTermDropdownOpen(!isTermDropdownOpen)}
                className={`flex items-center gap-0.5 text-[11px] text-gray-400 font-medium px-0.5 ${availableTerms.length > 1 ? 'cursor-pointer hover:text-primary' : ''}`}
              >
                <span>
                  {selectedTerm ? formatSchoolTerm(selectedTerm.schoolYear, selectedTerm.schoolTerm) : '尚未同步课表'}
                </span>
                {availableTerms.length > 1 && <Icon name="chevron_down" className="text-[9px]" />}
              </button>
              {isTermDropdownOpen && availableTerms.length > 1 && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1.5 w-44 max-h-56 overflow-y-auto">
                  {availableTerms.map((t) => (
                    <button
                      key={`${t.schoolYear}-${t.schoolTerm}`}
                      onClick={() => {
                        setSelectedTerm(t);
                        setIsTermDropdownOpen(false);
                      }}
                      className={`w-full text-left text-xs px-4 py-2 hover:bg-slate-50 cursor-pointer ${
                        selectedTerm?.schoolYear === t.schoolYear && selectedTerm?.schoolTerm === t.schoolTerm
                          ? 'text-primary font-bold bg-primary/5'
                          : 'text-gray-700'
                      }`}
                    >
                      {formatSchoolTerm(t.schoolYear, t.schoolTerm)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {scheduleView !== 'list' && scheduleView !== 'overview' && (
                <>
                  <button onClick={prevWeek} className="p-1 hover:bg-slate-100 rounded-full cursor-pointer">
                    <Icon name="chevron_left" className="text-sm text-gray-400" />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setIsWeekDropdownOpen(!isWeekDropdownOpen)}
                      className="flex items-center gap-1 font-headline text-lg font-bold text-on-surface cursor-pointer"
                    >
                      <span>第 {selectedWeek} 周</span>
                      <Icon name="chevron_down" className="text-sm" />
                    </button>
                    {isWeekDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1.5 w-32 max-h-48 overflow-y-auto">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
                          <button
                            key={w}
                            onClick={() => {
                              setSelectedWeek(w);
                              setIsWeekDropdownOpen(false);
                            }}
                            className={`w-full text-left text-xs px-4 py-2 hover:bg-slate-50 cursor-pointer ${selectedWeek === w ? 'text-primary font-bold bg-primary/5' : 'text-gray-700'}`}
                          >
                            第 {w} 周 {w === currentWeek ? '(本周)' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={nextWeek} className="p-1 hover:bg-slate-100 rounded-full cursor-pointer">
                    <Icon name="chevron_right" className="text-sm text-gray-400" />
                  </button>
                </>
              )}
              {scheduleView === 'list' && (
                <span className="font-headline text-lg font-bold text-on-surface">完整课表</span>
              )}
              {scheduleView === 'overview' && (
                <span className="font-headline text-lg font-bold text-on-surface">学期总览</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {scheduleView !== 'list' && scheduleView !== 'overview' && (
              <>
                <button
                  onClick={() => onShareSchedule(selectedWeek)}
                  className="flex items-center gap-1 text-on-surface-variant border border-gray-200 hover:border-primary/30 hover:text-primary px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  <Icon name="share_2" className="text-[10px]" /> 导出
                </button>
                <button
                  onClick={() => setSelectedWeek(currentWeek)}
                  className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer"
                >
                  回本周
                </button>
              </>
            )}
            <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
              <button
                onClick={() => setScheduleView('week')}
                className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'week' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}
              >
                周视图
              </button>
              <button
                onClick={() => setScheduleView('day')}
                className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'day' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}
              >
                日视图
              </button>
              <button
                onClick={() => setScheduleView('list')}
                className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'list' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}
              >
                列表
              </button>
              <button
                onClick={() => setScheduleView('overview')}
                className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'overview' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}
              >
                总览
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 周视图：节次行数按实际课程动态算(不再写死11节，避免超出的课程行高被压缩/错位)，
          行高用 gridTemplateRows 显式声明，隐式行也保证跟其他行一样高；
          同一天同一时段有多门课时用"车道"横向平分，不再简单堆叠互相遮挡 */}
      {scheduleView === 'week' &&
        (() => {
          const maxPeriod = Math.max(11, ...weekCourses.map((c) => c.startPeriod + c.periodSpan - 1), 1);
          const periodRows = Array.from({ length: maxPeriod }, (_, i) => i + 1);

          // 车道分配：同一天按开始节次排序，贪心找一条"上一门课已经下课"的车道复用，找不到就开新车道
          const laned = (() => {
            const byDay: Record<number, Course[]> = {};
            weekCourses.forEach((c) => {
              (byDay[c.weekday] ||= []).push(c);
            });
            const out: Array<Course & { lane: number; laneCount: number }> = [];
            Object.values(byDay).forEach((dayCourses) => {
              const sorted = [...dayCourses].sort((a, b) => a.startPeriod - b.startPeriod);
              const laneEnds: number[] = []; // 每条车道当前占用到的结束节次
              const withLane = sorted.map((c) => {
                const end = c.startPeriod + c.periodSpan - 1;
                let lane = laneEnds.findIndex((e) => e < c.startPeriod);
                if (lane === -1) {
                  lane = laneEnds.length;
                  laneEnds.push(end);
                } else {
                  laneEnds[lane] = end;
                }
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
                className="grid grid-cols-[22px_repeat(7,1fr)] gap-1 relative"
                style={{ gridTemplateRows: `34px repeat(${periodRows.length}, 54px)` }}
              >
                <div />
                {DAY_CHARS.map((d, i) => {
                  const weekday = i + 1;
                  const isToday = selectedWeek === currentWeek && weekday === selectedDay;
                  const cellDate = dateForWeekday(semesterStart, selectedWeek, weekday);
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center justify-center gap-0.5 pb-1 border-b border-gray-100"
                    >
                      <span className={`text-[10px] font-bold ${isToday ? 'text-primary' : 'text-gray-400'}`}>{d}</span>
                      <span
                        className={`text-[9px] leading-none w-4 h-4 flex items-center justify-center rounded-full font-bold ${isToday ? 'bg-primary text-white' : 'text-gray-300'}`}
                      >
                        {cellDate.getDate()}
                      </span>
                    </div>
                  );
                })}
                {/* 今日列高亮：只染当前教学周里"今天"这一列的背景，帮助一眼定位 */}
                {selectedWeek === currentWeek && (
                  <div
                    style={{
                      gridColumnStart: selectedDay + 1,
                      gridColumnEnd: selectedDay + 2,
                      gridRowStart: 2,
                      gridRowEnd: periodRows.length + 2,
                    }}
                    className="bg-primary/[0.04] rounded-lg pointer-events-none"
                  />
                )}
                {periodRows.map((h) => {
                  const startTime = h % 2 === 1 ? formatPeriodStart(h) : null; // 只在每对课的第一节下方标注上课时间(1/3/5/7/9节)
                  return (
                    <div
                      key={h}
                      className="col-start-1 flex flex-col items-center justify-center gap-0.5 border-r border-slate-100/50"
                    >
                      <span className="text-[10px] text-gray-400 font-bold leading-none">{h}</span>
                      {startTime && <span className="text-[7px] text-gray-300 leading-none">{startTime}</span>}
                    </div>
                  );
                })}
                {laned.map((course) => (
                  <div
                    key={course.id}
                    onClick={() => setSelectedCourse(course)}
                    style={{
                      gridRowStart: course.startPeriod + 1,
                      gridRowEnd: course.startPeriod + course.periodSpan + 1,
                      gridColumnStart: course.weekday + 1,
                      gridColumnEnd: course.weekday + 2,
                      marginLeft: `${(100 / course.laneCount) * course.lane}%`,
                      width: `${100 / course.laneCount}%`,
                    }}
                    className={`p-1.5 rounded-xl flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md hover:brightness-95 active:scale-[0.98] transition-all text-left border border-black/5 cursor-pointer relative ${course.colorClass} ${course.isFinished ? 'opacity-40 grayscale' : ''}`}
                  >
                    {course.overrideMoved && (
                      <span className="absolute top-0 right-0 bg-amber-400 text-white text-[7px] font-bold px-1 rounded-bl-md rounded-tr-xl">
                        调
                      </span>
                    )}
                    <span className="font-headline text-[10.5px] font-bold leading-tight line-clamp-3">
                      {course.name}
                    </span>
                    <span className="text-[8px] font-semibold opacity-90 block mt-1 flex items-center gap-0.5 line-clamp-1">
                      <Icon name="map_pin" className="text-[8px] shrink-0" />
                      {course.classroom}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

      {/* 日视图 */}
      {scheduleView === 'day' &&
        (() => {
          const dayCourses = weekCourses
            .filter((c) => c.weekday === selectedDay)
            .map((c) => ({ ...c, isFinished: isCourseFinishedNow(c, currentWeek, selectedWeek, selectedDay) }));
          return (
            <section className="px-4 py-4 flex flex-col gap-3 animate-fade-in flex-1">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {WEEKDAYS[selectedDay - 1]} 课程
                </span>
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
                    <div
                      key={course.id}
                      onClick={() => setSelectedCourse(course)}
                      className={`bg-white rounded-xl p-3.5 shadow-xs border border-slate-100 flex gap-2 items-start relative overflow-hidden transition-all hover:translate-x-1 duration-200 cursor-pointer ${course.isFinished ? 'opacity-50' : ''}`}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${course.colorClass.split(' ')[0]}`}></div>
                      <div className="flex-1 pl-2">
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <h3 className="font-headline font-semibold text-sm">{course.name}</h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {course.teacher} ·{' '}
                              {course.courseType === 'lab'
                                ? '实验'
                                : course.courseType === 'elective'
                                  ? '选修'
                                  : '理论'}
                              {course.weekType !== 'all' ? ` · ${course.weekType === 'odd' ? '单周' : '双周'}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {course.overrideMoved && (
                              <span className="bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                调课
                              </span>
                            )}
                            <span className="bg-slate-100 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold">
                              第 {course.startPeriod}-{course.startPeriod + course.periodSpan - 1} 节
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`删除课程「${course.name}」？`)) onDeleteCourse(course.id);
                              }}
                              className="text-gray-400 hover:text-course-red p-1 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Icon name="trash_2" className="text-sm" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 font-medium mt-2">
                          <span className="flex items-center gap-1">
                            <Icon name="clock" className="text-sm text-primary" />
                            {formatPeriodStart(course.startPeriod, course.classroom) || `第${course.startPeriod}节`}
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon name="map_pin" className="text-sm text-gray-500" />
                            {course.classroom}
                          </span>
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
      {scheduleView === 'list' &&
        (() => {
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
                        <div
                          key={course.id}
                          onClick={() => setSelectedCourse(course)}
                          className={`bg-white rounded-xl p-3 shadow-xs border border-slate-100 flex gap-2 items-start relative overflow-hidden cursor-pointer hover:bg-slate-50 transition-colors ${course.isFinished ? 'opacity-50' : ''}`}
                        >
                          <div
                            className={`absolute left-0 top-0 bottom-0 w-1.5 ${course.colorClass.split(' ')[0]}`}
                          ></div>
                          <div className="flex-1 pl-2 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                              <h3 className="font-headline font-semibold text-sm text-on-surface truncate">
                                {course.name}
                              </h3>
                              <span className="shrink-0 bg-slate-100 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold">
                                第{course.startPeriod}-{course.startPeriod + course.periodSpan - 1}节
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-gray-500">
                              <span>
                                周数：
                                {course.weekPattern ||
                                  `第${course.weekStart}-${course.weekEnd}周${course.weekType !== 'all' ? `(${course.weekType === 'odd' ? '单' : '双'})` : ''}`}
                              </span>
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

      {/* 总览视图：整学期课表一览，星期×节次网格，每时段一个格子，同名课合并 */}
      {scheduleView === 'overview' &&
        (() => {
          const maxPeriod = Math.max(11, ...termCourses.map((c) => c.startPeriod + c.periodSpan - 1), 1);
          const periodRows = Array.from({ length: maxPeriod }, (_, i) => i + 1);

          // grid[period][weekday]: Course[] = 该格子的课程数组，null = 被跨节覆盖（跳过），undefined = 空
          const grid: (Course[] | null | undefined)[][] = Array.from({ length: maxPeriod + 1 }, () =>
            Array(8).fill(undefined),
          );

          termCourses.forEach((c) => {
            if (c.weekday < 1 || c.weekday > 7) return;
            const row = c.startPeriod;
            const col = c.weekday;
            if (row < 1 || row > maxPeriod) return;
            // 按 (startPeriod, periodSpan) 分组：同键位的课放到同一格子
            const key = `${c.startPeriod}-${c.periodSpan}`;
            const slot = grid[row][col];
            if (slot === null || slot === undefined) {
              grid[row][col] = [c];
            } else {
              const slotKey = `${slot[0].startPeriod}-${slot[0].periodSpan}`;
              if (slotKey === key) {
                slot.push(c);
              } else {
                // 不同 periodSpan 的课也收录（同一时段不同跨度的课）
                grid[row][col] = slot.concat(c);
              }
            }
            // 跨节覆盖的格子标 null
            for (let p = c.startPeriod + 1; p < c.startPeriod + c.periodSpan; p++) {
              if (p <= maxPeriod) grid[p][col] = null;
            }
          });

          // 周次标签：优先用教务系统的 weekPattern，否则 fallback 到起止周
          const weekLabel = (c: Course) =>
            c.weekPattern ||
            `第${c.weekStart}-${c.weekEnd}周${c.weekType !== 'all' ? (c.weekType === 'odd' ? '(单)' : '(双)') : ''}`;

          return (
            <section className="px-4 py-4 overflow-x-auto select-none flex-1">
              <div
                className="grid grid-cols-[24px_repeat(7,1fr)] gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200"
                style={{ gridTemplateRows: `32px repeat(${periodRows.length}, minmax(40px, auto))` }}
              >
                {/* 表头行 */}
                <div className="bg-slate-50 flex items-center justify-center">
                  <span className="text-[9px] text-gray-400 font-bold">节</span>
                </div>
                {WEEKDAYS.map((d, i) => (
                  <div
                    key={i}
                    className={`text-center py-1.5 bg-slate-50 ${i + 1 === selectedDay ? 'bg-primary/[0.06]' : ''}`}
                  >
                    <span
                      className={`text-[10px] font-bold ${i + 1 === selectedDay ? 'text-primary' : 'text-gray-500'}`}
                    >
                      {d}
                    </span>
                  </div>
                ))}

                {/* 数据行 */}
                {periodRows.map((period) => (
                  <React.Fragment key={period}>
                    <div className="bg-slate-50 flex flex-col items-center justify-center">
                      <span className="text-[9px] text-gray-400 font-bold leading-none">{period}</span>
                      <span className="text-[6px] text-gray-300 leading-none mt-px">{formatPeriodStart(period)}</span>
                    </div>
                    {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
                      const cell = grid[period]?.[weekday];
                      if (cell === null) return null;
                      if (!cell || cell.length === 0) {
                        return <div key={weekday} className="bg-white" />;
                      }
                      // 同名课合并：周次拼接、教室去重
                      const merged = new Map<string, { course: Course; weekLabels: string[]; rooms: string[] }>();
                      cell.forEach((c) => {
                        const entry = merged.get(c.name);
                        if (entry) {
                          entry.weekLabels.push(weekLabel(c));
                          if (c.classroom && !entry.rooms.includes(c.classroom)) entry.rooms.push(c.classroom);
                        } else {
                          merged.set(c.name, {
                            course: c,
                            weekLabels: [weekLabel(c)],
                            rooms: c.classroom ? [c.classroom] : [],
                          });
                        }
                      });
                      // 取最大 periodSpan 作为格子跨行数（防止同格不同跨度的课被截断）
                      const span = Math.max(...cell.map((c) => c.periodSpan));
                      return (
                        <div
                          key={weekday}
                          className="bg-white p-[2px] flex flex-col gap-[1px] overflow-hidden"
                          style={{ gridRow: `${period + 1} / span ${span}`, gridColumn: `${weekday + 1}` }}
                        >
                          {Array.from(merged.values()).map(({ course, weekLabels, rooms }) => (
                            <div
                              key={course.id}
                              onClick={() => setSelectedCourse(course)}
                              className={`flex-1 min-h-0 rounded-md px-1.5 py-0.5 cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all overflow-hidden flex flex-col justify-center ${course.colorClass}`}
                            >
                              <span className="text-[8px] font-bold leading-tight truncate block">
                                {course.name}
                                {course.overrideMoved && (
                                  <span className="inline-block ml-0.5 bg-amber-400 text-white text-[6px] font-bold px-0.5 rounded align-[1px]">
                                    调
                                  </span>
                                )}
                              </span>
                              <span className="text-[7px] opacity-80 truncate block">{weekLabels.join('，')}</span>
                              {rooms.length > 0 && (
                                <span className="text-[7px] opacity-70 truncate block">{rooms.join('/')}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              {termCourses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-4">
                  <Icon name="calendar" className="text-4xl mb-2 opacity-60" />
                  <p className="text-xs font-semibold text-center">这个学期还没有课程数据</p>
                </div>
              )}
            </section>
          );
        })()}

      <section className="px-4 mt-auto py-4 bg-slate-50 border-t border-slate-100 flex gap-2">
        <button
          onClick={() => setImportOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-xl py-3 cursor-pointer hover:bg-primary/5 transition-colors"
        >
          <Icon name="file_text" className="text-primary text-lg" />
          <span className="text-xs font-semibold text-primary">导入课表（PDF/HTML）</span>
        </button>
        <button
          onClick={async () => {
            setRefreshing(true);
            try {
              const res = await academicApi.refresh();
              if (res.code === 0) {
                onShowToast?.(res.data?.message || '同步完成', 'success');
                if (onOverridesChanged) onOverridesChanged();
              } else {
                onShowToast?.(res.message || '刷新失败', 'info');
              }
            } catch {
              onShowToast?.('刷新失败，请重试', 'info');
            }
            setRefreshing(false);
          }}
          disabled={refreshing}
          className="flex items-center justify-center gap-1.5 border border-dashed border-amber-300 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-50 transition-colors"
        >
          <Icon
            name={refreshing ? 'timer' : 'refresh'}
            className={`text-amber-600 text-lg ${refreshing ? 'animate-spin' : ''}`}
          />
          <span className="text-[10px] font-semibold text-amber-700">{refreshing ? '同步中...' : '刷新'}</span>
        </button>
        <button
          onClick={onAddCourse}
          className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
        >
          <Icon name="add" className="text-gray-500 text-lg" />
        </button>
      </section>

      <ScheduleImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} onImport={onImportCourses} />

      {/* 课程详情弹窗 */}
      {selectedCourse &&
        (() => {
          // 调课操作永远指向"原课程 + 上下文周"：被调进来的克隆(id 带 __ovN)还原出原 id 和原周
          const realCourseId = originalCourseId(selectedCourse.id);
          const ovMatch = selectedCourse.id.match(/__ov(\d+)$/);
          const contextWeek = ovMatch ? parseInt(ovMatch[1], 10) : selectedWeek;
          const existingOverride = findOverride(overrides, realCourseId, contextWeek);

          const finishOv = (msg: string) => {
            onOverridesChanged();
            onShowToast?.(msg, 'success');
            setSelectedCourse(null);
            setMoveFormOpen(false);
          };
          const doCancelWeek = async () => {
            if (ovBusy) return;
            setOvBusy(true);
            try {
              const res = await coursesApi.setOverride(realCourseId, { week: contextWeek, action: 'cancel' });
              if (res.code === 0) finishOv('本周该节课已停');
              else onShowToast?.(res.message || '操作失败', 'info');
            } catch {
              onShowToast?.('网络异常，请重试', 'info');
            } finally {
              setOvBusy(false);
            }
          };
          const doMove = async () => {
            if (ovBusy) return;
            setOvBusy(true);
            try {
              const res = await coursesApi.setOverride(realCourseId, {
                week: contextWeek,
                action: 'move',
                toWeek: moveWeek,
                toWeekday: moveDay,
                toStartPeriod: movePeriod,
                toClassroom: moveRoom.trim() || undefined,
              });
              if (res.code === 0) finishOv('调课成功');
              else onShowToast?.(res.message || '操作失败', 'info');
            } catch {
              onShowToast?.('网络异常，请重试', 'info');
            } finally {
              setOvBusy(false);
            }
          };
          const doRestore = async () => {
            if (ovBusy) return;
            setOvBusy(true);
            try {
              const res = await coursesApi.removeOverride(realCourseId, contextWeek);
              if (res.code === 0) finishOv('已恢复原课表');
              else onShowToast?.(res.message || '操作失败', 'info');
            } catch {
              onShowToast?.('网络异常，请重试', 'info');
            } finally {
              setOvBusy(false);
            }
          };
          return (
            <Modal
              isOpen={true}
              onClose={() => setSelectedCourse(null)}
              title={
                <span className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${selectedCourse.colorClass.split(' ')[0]}`} />
                  {selectedCourse.name}
                </span>
              }
              footer={
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    block
                    onClick={() => {
                      onEditCourse({ ...selectedCourse, id: realCourseId });
                      setSelectedCourse(null);
                    }}
                  >
                    <Icon name="edit" className="text-sm" /> 编辑课程
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    block
                    onClick={() => {
                      if (confirm(`删除课程「${selectedCourse.name}」？`)) {
                        onDeleteCourse(realCourseId);
                        setSelectedCourse(null);
                      }
                    }}
                  >
                    <Icon name="trash_2" className="text-sm" /> 删除课程
                  </Button>
                </div>
              }
            >
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
                  <span className="font-semibold text-on-surface">
                    {WEEKDAYS[selectedCourse.weekday - 1]} 第{selectedCourse.startPeriod}-
                    {selectedCourse.startPeriod + selectedCourse.periodSpan - 1}节
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-gray-400">周次</span>
                  <span className="font-semibold text-on-surface">
                    {selectedCourse.weekPattern || `第${selectedCourse.weekStart}-${selectedCourse.weekEnd}周`}
                  </span>
                </div>
                {/* weekPattern（zcd原文）已经把单双周信息编码在每一段里了，再单独显示笼统的"周类型"会误导，只在没有 weekPattern 时才展示 */}
                {!selectedCourse.weekPattern && (
                  <div className="flex justify-between py-1.5 border-b border-gray-50">
                    <span className="text-gray-400">周类型</span>
                    <span className="font-semibold text-on-surface">
                      {selectedCourse.weekType === 'odd'
                        ? '单周'
                        : selectedCourse.weekType === 'even'
                          ? '双周'
                          : '每周'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-gray-400">类型</span>
                  <span className="font-semibold text-on-surface">
                    {selectedCourse.courseType === 'lab'
                      ? '实验课'
                      : selectedCourse.courseType === 'elective'
                        ? '选修课'
                        : '理论课'}
                  </span>
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

                {/* ── 单次调课：老师口头调课时自己改（列表/总览无周上下文，不显示） ── */}
                {scheduleView !== 'list' && scheduleView !== 'overview' && (
                  <div className="pt-2 space-y-2">
                    {existingOverride ? (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 space-y-2">
                        <p className="text-[11px] text-amber-800 font-medium">
                          {existingOverride.action === 'cancel'
                            ? `第 ${contextWeek} 周本节课已停`
                            : `第 ${contextWeek} 周已调至：第 ${existingOverride.toWeek} 周 ${WEEKDAYS[(existingOverride.toWeekday || 1) - 1]} 第 ${existingOverride.toStartPeriod} 节起${existingOverride.toClassroom ? ` @${existingOverride.toClassroom}` : ''}`}
                        </p>
                        <Button variant="secondary" size="sm" block onClick={doRestore} disabled={ovBusy}>
                          恢复原课表
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="text-[10px] text-gray-400">单次调课 · 只影响第 {contextWeek} 周这一节</p>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" block onClick={doCancelWeek} disabled={ovBusy}>
                            本周停课
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            block
                            onClick={() => {
                              setMoveWeek(contextWeek);
                              setMoveDay(selectedCourse.weekday);
                              setMovePeriod(selectedCourse.startPeriod);
                              setMoveRoom('');
                              setMoveFormOpen((v) => !v);
                            }}
                          >
                            调到其他时间…
                          </Button>
                        </div>
                        {moveFormOpen && (
                          <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <label className="text-[10px] text-gray-400">
                                周次
                                <select
                                  value={moveWeek}
                                  onChange={(e) => setMoveWeek(+e.target.value)}
                                  className="w-full mt-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                                >
                                  {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
                                    <option key={w} value={w}>
                                      第{w}周
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-[10px] text-gray-400">
                                星期
                                <select
                                  value={moveDay}
                                  onChange={(e) => setMoveDay(+e.target.value)}
                                  className="w-full mt-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                                >
                                  {WEEKDAYS.map((d, i) => (
                                    <option key={d} value={i + 1}>
                                      {d}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-[10px] text-gray-400">
                                起始节
                                <select
                                  value={movePeriod}
                                  onChange={(e) => setMovePeriod(+e.target.value)}
                                  className="w-full mt-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                                >
                                  {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                                    <option key={p} value={p}>
                                      第{p}节
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <input
                              value={moveRoom}
                              onChange={(e) => setMoveRoom(e.target.value)}
                              placeholder="教室（不填沿用原教室）"
                              maxLength={64}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white placeholder:text-gray-300"
                            />
                            <Button size="sm" block onClick={doMove} disabled={ovBusy}>
                              确认调课
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Modal>
          );
        })()}
    </div>
  );
}
