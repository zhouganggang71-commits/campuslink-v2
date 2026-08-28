/**
 * 成绩 / 考试安排 — 展示扫码登录时顺带同步的数据，避免学生再登录教务系统查询
 */
import { useState, useEffect, useMemo } from 'react';
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

export default function GradesExamsModal({ isOpen, onClose, onRefresh }: GradesExamsModalProps) {
  const [tab, setTab] = useState<'grades' | 'exams'>('grades');
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sessionExpired, setSessionExpired] = useState(false);

  /** 从本地数据重新加载 grades + exams */
  const reloadLocal = () => {
    Promise.all([academicApi.grades(), academicApi.exams()])
      .then(([gRes, eRes]) => {
        if (gRes.code === 0 && Array.isArray(gRes.data)) {
          setGrades(gRes.data);
        } else {
          // 接口返回但结构不对，不算网络异常，单独上报方便排查（不含具体成绩内容，只记结构）
          reportClientError('成绩接口返回异常', {
            component: 'GradesExamsModal',
            stack: `code=${gRes.code} message=${gRes.message}`,
          });
        }
        if (eRes.code === 0 && Array.isArray(eRes.data)) {
          setExams(eRes.data);
        } else {
          reportClientError('考试接口返回异常', {
            component: 'GradesExamsModal',
            stack: `code=${eRes.code} message=${eRes.message}`,
          });
        }
        if (gRes.code !== 0 && eRes.code !== 0) {
          setState('error');
          setErrorMsg(gRes.message || eRes.message || '加载失败，请重试');
        } else {
          setState('loaded');
        }
      })
      .catch((err: any) => {
        setState('error');
        setErrorMsg('网络异常，请重试');
        reportClientError('成绩/考试加载异常', { component: 'GradesExamsModal', stack: err?.message });
      });
  };

  // ── 打开弹窗时加载数据 ──
  useEffect(() => {
    if (!isOpen) return;
    setState('loading');
    setErrorMsg('');
    reloadLocal();
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

        {sessionExpired && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <Icon name="info" className="text-amber-500 text-base shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">教务登录已过期</p>
              <p className="text-[10px] text-amber-600 mt-0.5">
                存储的教务会话已失效，需要重新扫码登录才能继续使用一键刷新功能
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
