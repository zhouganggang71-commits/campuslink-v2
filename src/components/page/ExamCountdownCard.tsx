/**
 * 考试倒计时卡片 — 课表页顶部，只显示未来最近的一场考试
 * 显示规则从严：未登录 / 无数据 / 全部考完 / 加载失败 → 一律不渲染，不打扰
 * 数据来自 useUpcomingExams（与 HomeTab 倒计时 chip 共用），按登录用户隔离
 */
import Icon from '../ui/Icon';
import { useUpcomingExams } from '../../hooks/useUpcomingExams';

function fmtTime(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ExamCountdownCard({ onOpenExams }: { onOpenExams: () => void }) {
  const upcoming = useUpcomingExams();
  if (upcoming.length === 0) return null;

  const next = upcoming[0];
  const todayCount = upcoming.filter((e) => e.days === 0).length;
  const isToday = next.days === 0;
  const place = [next.row.exam_location, next.row.seat_number ? `座位${next.row.seat_number}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      onClick={onOpenExams}
      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b cursor-pointer transition-colors ${
        isToday
          ? 'bg-course-red/5 border-course-red/10 hover:bg-course-red/10'
          : 'bg-amber-50/60 border-amber-100 hover:bg-amber-50'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-course-red/10 text-course-red' : 'bg-amber-100 text-amber-600'}`}
      >
        <span className="text-sm font-bold leading-none">{next.days}</span>
        <span className="text-[8px] leading-tight">天</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-on-surface truncate">
          {isToday && todayCount > 1
            ? `今天有 ${todayCount} 场考试`
            : `「${next.row.course_name}」${isToday ? '今天开考' : `还有 ${next.days} 天`}`}
        </p>
        <p className="text-[10px] text-gray-400 truncate">
          {fmtTime(next.start)}
          {place ? ` · ${place}` : ''}
          {upcoming.length > 1 ? ` · 共 ${upcoming.length} 场` : ''}
        </p>
      </div>
      <Icon name="chevron_right" className="text-sm text-gray-300 shrink-0" />
    </button>
  );
}
