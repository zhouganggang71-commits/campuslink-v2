/**
 * 成绩 / 考试安排 — 展示扫码登录时顺带同步的数据，避免学生再登录教务系统查询
 */
import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';
import { academicApi } from '../../api';
import type { GradeRow, ExamRow } from '../../api';
import { reportClientError } from '../../utils/clientLog';

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
  return 'text-course-green';
}

/** 后端现在按"乐观单学期"读取，同一批数据只会来自一个学期，取第一条格式化成人话标签即可 */
function formatTerm(schoolYear: string | null | undefined, schoolTerm: string | null | undefined): string | null {
  if (!schoolYear) return null;
  const y = parseInt(schoolYear, 10);
  const yearLabel = isNaN(y) ? schoolYear : `${y}-${y + 1}学年`;
  const termLabel = schoolTerm === '1' ? '秋季学期' : schoolTerm === '2' ? '春季学期' : schoolTerm ? `第${schoolTerm}学期` : '';
  return termLabel ? `${yearLabel} ${termLabel}` : yearLabel;
}

export default function GradesExamsModal({ isOpen, onClose, onRefresh }: GradesExamsModalProps) {
  const [tab, setTab] = useState<'grades' | 'exams'>('grades');
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setState('loading');
    setErrorMsg('');

    Promise.all([academicApi.grades(), academicApi.exams()])
      .then(([gRes, eRes]) => {
        if (gRes.code === 0 && Array.isArray(gRes.data)) {
          setGrades(gRes.data);
        } else {
          // 接口返回但结构不对，不算网络异常，单独上报方便排查（不含具体成绩内容，只记结构）
          reportClientError('成绩接口返回异常', { component: 'GradesExamsModal', stack: `code=${gRes.code} message=${gRes.message}` });
        }
        if (eRes.code === 0 && Array.isArray(eRes.data)) {
          setExams(eRes.data);
        } else {
          reportClientError('考试接口返回异常', { component: 'GradesExamsModal', stack: `code=${eRes.code} message=${eRes.message}` });
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
  }, [isOpen]);

  const list = tab === 'grades' ? grades : exams;
  const isEmpty = state === 'loaded' && list.length === 0;
  const termLabel = tab === 'grades'
    ? formatTerm(grades[0]?.school_year, grades[0]?.school_term)
    : formatTerm(exams[0]?.school_year, exams[0]?.school_term);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="成绩与考试"
      subtitle="扫码登录时自动同步，不用再登录教务系统查询"
    >
      <div className="space-y-3">
        {/* Tab 切换 + 刷新 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex bg-slate-100 rounded-xl p-1">
            {([
              { key: 'grades' as const, label: '成绩', icon: 'school' },
              { key: 'exams' as const, label: '考试安排', icon: 'calendar' },
            ]).map((t) => (
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

        {/* 当前展示的数据所属学期——避免用户误以为是本学期数据 */}
        {state === 'loaded' && !isEmpty && termLabel && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-primary/5 rounded-lg text-[10px] text-primary/80">
            <Icon name="info" className="text-[9px]" />
            当前显示：{termLabel}（教务系统能查到的最新一期数据，不一定是本学期）
          </div>
        )}

        {state === 'loading' && (
          <div className="py-10 text-center text-xs text-gray-400">加载中…</div>
        )}

        {state === 'error' && (
          <div className="py-10 text-center">
            <p className="text-xs text-course-red">{errorMsg}</p>
          </div>
        )}

        {isEmpty && (
          <div className="py-10 text-center text-xs text-gray-400 space-y-1">
            <p>暂无{tab === 'grades' ? '成绩' : '考试安排'}数据</p>
            <p className="text-[10px] text-gray-300">已扫码登录但仍无数据？可能是教务系统接口还没适配好，欢迎反馈给管理员</p>
          </div>
        )}

        {state === 'loaded' && !isEmpty && tab === 'grades' && (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {grades.map((g) => (
              <div key={g.id} className="bg-white border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">{g.course_name}</span>
                  <span className={`text-sm font-bold shrink-0 ${gradeColor(g.grade)}`}>{g.grade || '—'}</span>
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
        )}

        {state === 'loaded' && !isEmpty && tab === 'exams' && (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {exams.map((ex) => (
              <div key={ex.id} className="bg-white border border-gray-100 rounded-xl p-3">
                <span className="text-xs font-semibold text-gray-700 block truncate">{ex.course_name}</span>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 flex-wrap">
                  {ex.exam_time && <span>{ex.exam_time}</span>}
                  {ex.exam_location && <span>· {ex.exam_location}</span>}
                  {ex.seat_number && <span>· 座位{ex.seat_number}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
