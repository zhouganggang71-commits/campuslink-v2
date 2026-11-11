/**
 * 成绩 / 考试安排 — 展示扫码登录时顺带同步的数据，避免学生再登录教务系统查询
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';
import { academicApi } from '../../api';
import type { GradeRow, ExamRow } from '../../api';
import { reportClientError } from '../../utils/clientLog';
import { formatSchoolTerm, termChronoKey } from '../../utils/schoolTerm';

interface GradesExamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 点击"刷新"时触发——目前的刷新方式是重新走一次扫码登录（同一套流程会顺带重新同步课表/成绩/考试） */
  onRefresh?: () => void;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/** 本地缓存：成绩/考试来自教务扫码同步，数据只在本机查看。
 *  缓存按学号分区（换账号不串数据），退出登录时由 clearStorageCache 统一清除。
 *  作用：登录态过期/断网时弹窗仍能展示上次同步的成绩，不会被"未登录"刷掉。 */
const CACHE_PREFIX = 'campuslink_academic_cache_v1_';

interface AcademicCache {
  savedAt: string; // ISO
  grades: GradeRow[];
  exams: ExamRow[];
}

function currentStudentId(): string | null {
  try {
    const raw = localStorage.getItem('campuslink_profile');
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p?.studentId || null;
  } catch {
    return null;
  }
}

function loadCache(): AcademicCache | null {
  const sid = currentStudentId();
  if (!sid) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + sid);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!Array.isArray(c?.grades) || !Array.isArray(c?.exams)) return null;
    return c as AcademicCache;
  } catch {
    return null;
  }
}

function saveCache(grades: GradeRow[], exams: ExamRow[]): void {
  const sid = currentStudentId();
  if (!sid) return;
  try {
    localStorage.setItem(CACHE_PREFIX + sid, JSON.stringify({ savedAt: new Date().toISOString(), grades, exams }));
  } catch {
    /* 存储满/不可用就跳过缓存，不影响在线展示 */
  }
}

function gradeColor(grade: string | null): string {
  if (!grade) return 'text-gray-400';
  const num = parseFloat(grade);
  if (!isNaN(num)) return num < 60 ? 'text-course-red' : 'text-course-green';
  if (grade.includes('不及格') || grade.includes('缓考') || grade.includes('缺考')) return 'text-course-red';
  // 非数字、非挂科文本（如"待评价""合格""通过"等），用中性色而非绿色
  return 'text-gray-600';
}

/** 挂科判定：数字成绩 <60，或文本含 不及格/缺考/缓考 */
function isFailed(grade: string | null): boolean {
  if (!grade) return false;
  const num = parseFloat(grade);
  if (!isNaN(num)) return num < 60;
  return grade.includes('不及格') || grade.includes('缺考') || grade.includes('缓考');
}

interface GpaSummary {
  gpa: number; // 加权平均绩点 Σ(学分×绩点)/Σ学分
  totalCredit: number;
  courseCount: number; // 计入绩点的课程数
  failedCount: number; // 全部成绩里的挂科数（含没绩点的）
}

/** 学分/绩点是教务原样存的字符串，能解析成数字的才计入；一门都解析不了返回 null 不显示卡片 */
function calcGpa(grades: GradeRow[]): GpaSummary | null {
  let weighted = 0;
  let totalCredit = 0;
  let courseCount = 0;
  grades.forEach((g) => {
    const credit = parseFloat(g.credit ?? '');
    const point = parseFloat(g.grade_point ?? '');
    if (isNaN(credit) || isNaN(point) || credit <= 0) return;
    weighted += credit * point;
    totalCredit += credit;
    courseCount++;
  });
  if (courseCount === 0 || totalCredit === 0) return null;
  return {
    gpa: weighted / totalCredit,
    totalCredit,
    courseCount,
    failedCount: grades.filter((g) => isFailed(g.grade)).length,
  };
}

/** 距考试的自然日差（今天=0）；已开考/无解析值返回 null（不显示标签，原文照展示） */
function examDays(examStart: string | null): number | null {
  if (!examStart) return null;
  const start = new Date(examStart);
  const now = new Date();
  if (isNaN(start.getTime()) || start.getTime() < now.getTime()) return null;
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** 缓存同步时间 → "M月D日 HH:mm"（给降级提示用） */
function fmtSyncTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function GradesExamsModal({ isOpen, onClose, onRefresh }: GradesExamsModalProps) {
  const [tab, setTab] = useState<'grades' | 'exams'>('grades');
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // 展示的是本地缓存（未登录/离线时降级），此时显示"上次同步"提示 + 重新扫码入口
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string>('');
  // 镜像最新数据：网络回调里判断"是否还有东西可展示"需要读最新值，不能依赖闭包旧 state
  const gradesRef = useRef<GradeRow[]>([]);
  const examsRef = useRef<ExamRow[]>([]);
  const setBoth = (g: GradeRow[], e: ExamRow[]) => {
    gradesRef.current = g;
    examsRef.current = e;
    setGrades(g);
    setExams(e);
  };

  /** 网络拉取：成功 → 更新展示 + 写缓存；失败 → 保留已有展示并标记 offline（有缓存/数据可看时不清空） */
  const refreshFromServer = useCallback(() => {
    Promise.all([academicApi.grades(), academicApi.exams()])
      .then(([gRes, eRes]) => {
        const gOk = gRes.code === 0 && Array.isArray(gRes.data);
        const eOk = eRes.code === 0 && Array.isArray(eRes.data);
        if (gOk || eOk) {
          // 失败的接口沿用缓存/现有数据，不让半个 tab 变空
          const nextG = gOk ? (gRes.data as GradeRow[]) : gradesRef.current;
          const nextE = eOk ? (eRes.data as ExamRow[]) : examsRef.current;
          setBoth(nextG, nextE);
          setOffline(false);
          setCachedAt('');
          setState('loaded');
          saveCache(nextG, nextE);
        } else {
          // 网络失败或登录失效：只要有数据就保留展示（来自缓存或本次会话早先拉到的），不清空
          if (gradesRef.current.length || examsRef.current.length) {
            setOffline(true);
            setState('loaded');
          } else {
            setState('error');
            setErrorMsg(gRes.message || eRes.message || '加载失败，请重试');
          }
          reportClientError('成绩接口返回异常', {
            component: 'GradesExamsModal',
            stack: `code=${gRes.code} message=${gRes.message}`,
          });
        }
      })
      .catch((err: any) => {
        // 网络异常同理：有数据就降级展示，不刷掉
        if (gradesRef.current.length || examsRef.current.length) {
          setOffline(true);
          setState('loaded');
        } else {
          setState('error');
          setErrorMsg('网络异常，请重试');
        }
        reportClientError('成绩/考试加载异常', { component: 'GradesExamsModal', stack: err?.message });
      });
  }, []);

  // ── 打开弹窗：先用本地缓存立即展示（未登录也看得到），再后台拉新 ──
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    const cache = loadCache();
    if (cache && (cache.grades.length || cache.exams.length)) {
      // 有缓存：立即展示上次同步的数据，避免空白/等待，再静默刷新
      setBoth(cache.grades, cache.exams);
      setCachedAt(cache.savedAt || '');
      setOffline(false);
      setState('loaded');
      refreshFromServer();
    } else {
      // 无缓存（含换账号后旧缓存不属于本学号的情况）：先清空残留再走加载态，避免串号
      setBoth([], []);
      setCachedAt('');
      setOffline(false);
      setState('loading');
      refreshFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const list = tab === 'grades' ? grades : exams;
  const isEmpty = state === 'loaded' && list.length === 0;
  const gpaSummary = useMemo(() => calcGpa(grades), [grades]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="成绩与考试" subtitle="扫码登录时同步，重新扫码可获取最新数据">
      <div className="space-y-3">
        {/* Tab 切换 + 刷新 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex bg-slate-100 rounded-xl p-1">
            {[
              { key: 'grades' as const, label: '成绩', icon: 'school' },
              { key: 'exams' as const, label: '考试安排', icon: 'calendar' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon name={t.icon} className="text-xs" />
                {t.label}
              </button>
            ))}
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="重新扫码同步最新数据"
              className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-gray-500 hover:bg-slate-200 hover:text-primary transition-colors cursor-pointer"
            >
              <Icon name="scan" className="text-sm" />
            </button>
          )}
        </div>

        {offline && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <Icon name="info" className="text-amber-500 text-base shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">当前为上次同步的数据</p>
              <p className="text-[10px] text-amber-600 mt-0.5">
                {cachedAt ? `同步于 ${fmtSyncTime(cachedAt)}，` : ''}登录已过期或网络不可用，重新扫码可获取最新成绩
              </p>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="mt-2 inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                >
                  <Icon name="scan" className="text-[10px]" />
                  重新扫码登录
                </button>
              )}
            </div>
          </div>
        )}

        {state === 'loading' && <div className="py-10 text-center text-xs text-gray-400">加载中…</div>}

        {state === 'error' && (
          <div className="py-10 text-center">
            <p className="text-xs text-course-red">{errorMsg}</p>
          </div>
        )}

        {isEmpty && (
          <div className="py-10 text-center text-xs text-gray-400 space-y-1">
            <p>暂无{tab === 'grades' ? '成绩' : '考试安排'}数据</p>
            <p className="text-[10px] text-gray-300">扫码登录时同步，重新扫码可获取最新数据</p>
          </div>
        )}

        {/* 绩点汇总 — 加权平均，只统计学分和绩点都能解析的课程 */}
        {state === 'loaded' && !isEmpty && tab === 'grades' && gpaSummary && (
          <div className="bg-primary/5 border border-primary/10 rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="shrink-0">
              <p className="text-xl font-bold text-primary leading-tight">{gpaSummary.gpa.toFixed(2)}</p>
              <p className="text-[10px] text-gray-400">平均绩点</p>
            </div>
            <div className="flex-1 min-w-0 text-[11px] text-gray-500 space-y-0.5">
              <p>
                {gpaSummary.courseCount} 门课 · {gpaSummary.totalCredit} 学分
                {gpaSummary.failedCount > 0 ? ` · ${gpaSummary.failedCount} 门未通过` : ''}
              </p>
              <p className="text-[10px] text-gray-400">加权平均：Σ(学分×绩点)÷Σ学分，缺学分/绩点的课程不计入</p>
            </div>
          </div>
        )}

        {state === 'loaded' && !isEmpty && tab === 'grades' && (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto">
            {(() => {
              // 按学期分组
              const groups = new Map<string, GradeRow[]>();
              for (const g of grades) {
                const key = `${g.school_year}-${g.school_term}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(g);
              }
              const sorted = [...groups.entries()].sort(([a], [b]) => {
                const [ay, at] = a.split('-');
                const [by, bt] = b.split('-');
                return termChronoKey(by, bt) - termChronoKey(ay, at);
              });
              return sorted.map(([key, items]) => {
                const [y, t] = key.split('-');
                return (
                  <div key={key}>
                    <p className="text-[10px] font-semibold text-primary mb-1.5 px-0.5">{formatSchoolTerm(y, t)}</p>
                    <div className="space-y-2">
                      {items.map((g) => (
                        <div key={g.id} className="bg-white border border-gray-100 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">
                              {g.course_name}
                            </span>
                            <span className={`text-sm font-bold shrink-0 ${gradeColor(g.grade)}`}>
                              {g.grade || '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 flex-wrap">
                            {g.teacher && <span>{g.teacher}</span>}
                            {g.credit && <span>· {g.credit}学分</span>}
                            {g.grade_point && <span>· 绩点{g.grade_point}</span>}
                            {g.course_nature && <span>· {g.course_nature}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {state === 'loaded' && !isEmpty && tab === 'exams' && (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto">
            {(() => {
              const groups = new Map<string, ExamRow[]>();
              for (const ex of exams) {
                const key = `${ex.school_year}-${ex.school_term}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(ex);
              }
              const sorted = [...groups.entries()].sort(([a], [b]) => {
                const [ay, at] = a.split('-');
                const [by, bt] = b.split('-');
                return termChronoKey(by, bt) - termChronoKey(ay, at);
              });
              return sorted.map(([key, items]) => {
                const [y, t] = key.split('-');
                return (
                  <div key={key}>
                    <p className="text-[10px] font-semibold text-primary mb-1.5 px-0.5">{formatSchoolTerm(y, t)}</p>
                    <div className="space-y-2">
                      {items.map((ex) => {
                        const days = examDays(ex.exam_start);
                        return (
                          <div key={ex.id} className="bg-white border border-gray-100 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">
                                {ex.course_name}
                              </span>
                              {days !== null && (
                                <span
                                  className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-full ${days === 0 ? 'bg-course-red/10 text-course-red' : days <= 7 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-gray-500'}`}
                                >
                                  {days === 0 ? '今天' : `还有${days}天`}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 flex-wrap">
                              {ex.exam_time && <span>{ex.exam_time}</span>}
                              {ex.exam_location && <span>· {ex.exam_location}</span>}
                              {ex.seat_number && <span>· 座位{ex.seat_number}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </Modal>
  );
}
