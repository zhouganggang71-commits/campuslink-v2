import { useState, useMemo, useRef } from 'react';
import { Course } from '../../types';
import { api } from '../../utils/api';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ScheduleImportModal from '../modal/ScheduleImportModal';

interface ScheduleTabProps {
  courses: Course[];
  onAddCourse: () => void;
  onImportCourses: (courses: Omit<Course, 'id'>[]) => void;
  onShareSchedule: () => void;
  onDeleteCourse: (id: string) => void;
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_CHARS = ['一', '二', '三', '四', '五', '六', '日'];

export default function ScheduleTab({
  courses,
  onAddCourse,
  onImportCourses,
  onShareSchedule,
  onDeleteCourse,
}: ScheduleTabProps) {
  const [selectedWeek, setSelectedWeek] = useState(16);
  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [scheduleView, setScheduleView] = useState<'week' | 'day'>('week');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const selectedDay = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  }, []);

  // ── 周过滤 ──
  const weekCourses = useMemo(
    () =>
      courses.filter((c) => {
        if (c.weekStart > selectedWeek || c.weekEnd < selectedWeek) return false;
        if (c.weekType === 'odd' && selectedWeek % 2 === 0) return false;
        if (c.weekType === 'even' && selectedWeek % 2 === 1) return false;
        return true;
      }),
    [courses, selectedWeek],
  );

  // ── 下一堂课 ──
  const nextClassInfo = useMemo(() => {
    const dayClasses = weekCourses.filter((c) => c.weekday === selectedDay);
    if (dayClasses.length === 0) return { name: '今天没课啦', time: '享受自由时光吧' };
    const sorted = [...dayClasses].sort((a, b) => a.startPeriod - b.startPeriod);
    const now = new Date();
    const today = now.getDay() || 7;
    const currentHour = now.getHours();
    const currentPeriod = currentHour < 9 ? 1 : currentHour < 11 ? 3 : currentHour < 14 ? 5 : currentHour < 16 ? 7 : currentHour < 18 ? 9 : 11;
    if (selectedDay === today) {
      const upcoming = sorted.find((c) => c.startPeriod >= currentPeriod);
      if (upcoming) return { name: upcoming.name, time: `第 ${upcoming.startPeriod} 节 · ${upcoming.classroom}` };
    }
    return { name: sorted[0].name, time: `第 ${sorted[0].startPeriod} 节 · ${sorted[0].classroom}` };
  }, [weekCourses, selectedDay]);

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
            <span className="text-[11px] text-gray-400 mb-0.5 font-medium">2023-2024学年 秋季学期</span>
            <div className="flex items-center gap-1">
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
                        第 {w} 周 {w === 16 ? '(本周)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={nextWeek} className="p-1 hover:bg-slate-100 rounded-full cursor-pointer"><Icon name="chevron_right" className="text-sm text-gray-400" /></button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedWeek(16)} className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer">回本周</button>
            <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
              <button onClick={() => setScheduleView('week')} className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'week' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}>周视图</button>
              <button onClick={() => setScheduleView('day')} className={`text-[10px] font-bold px-3 py-1 rounded-md cursor-pointer ${scheduleView === 'day' ? 'bg-white text-on-surface shadow-xs' : 'text-gray-500'}`}>日视图</button>
            </div>
          </div>
        </div>
      </section>

      {/* 周视图 */}
      {scheduleView === 'week' && (
        <section className="px-4 py-4 overflow-x-auto select-none">
          <div className="min-w-[480px] grid grid-cols-[32px_repeat(7,1fr)] gap-1 relative">
            <div className="h-6"></div>
            {DAY_CHARS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-gray-400 h-6 flex items-center justify-center border-b border-gray-100">{d}</div>
            ))}
            {Array.from({ length: 11 }, (_, i) => i + 1).map((h) => (
              <div key={h} className="col-start-1 text-center text-[10px] text-gray-400 font-bold h-12 flex items-center justify-center border-r border-slate-100/50">{h}</div>
            ))}
            {weekCourses.map((course) => (
              <div key={course.id} onClick={() => setSelectedCourse(course)}
                style={{ gridRowStart: course.startPeriod + 1, gridRowEnd: course.startPeriod + course.periodSpan + 1, gridColumnStart: course.weekday + 1, gridColumnEnd: course.weekday + 2 }}
                className={`p-1.5 rounded-lg flex flex-col justify-between overflow-hidden shadow-xs hover:brightness-95 transition-all text-left border border-black/5 cursor-pointer ${course.colorClass} ${course.isFinished ? 'opacity-40 grayscale' : ''}`}>
                <span className="text-[10px] font-bold leading-tight line-clamp-2">{course.name}</span>
                <span className="text-[8px] font-semibold opacity-90 block mt-1 flex items-center gap-0.5"><Icon name="map_pin" className="text-[8px]" />{course.classroom}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 日视图 */}
      {scheduleView === 'day' && (() => {
        const dayCourses = weekCourses.filter((c) => c.weekday === selectedDay);
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
          footer={<Button variant="danger" block onClick={() => { if (confirm(`删除课程「${selectedCourse.name}」？`)) { onDeleteCourse(selectedCourse.id); setSelectedCourse(null); } }}><Icon name="trash_2" className="text-sm" /> 删除课程</Button>}>
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
              <span className="font-semibold text-on-surface">第{selectedCourse.weekStart}-{selectedCourse.weekEnd}周</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-400">周类型</span>
              <span className="font-semibold text-on-surface">{selectedCourse.weekType === 'odd' ? '单周' : selectedCourse.weekType === 'even' ? '双周' : '每周'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-400">类型</span>
              <span className="font-semibold text-on-surface">{selectedCourse.courseType === 'lab' ? '实验课' : selectedCourse.courseType === 'elective' ? '选修课' : '理论课'}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
