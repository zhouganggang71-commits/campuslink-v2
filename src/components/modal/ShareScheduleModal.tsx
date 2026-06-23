import { useMemo, useState } from 'react';
import { Course } from '../../types';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface ShareScheduleModalProps {
  isOpen: boolean;
  selectedWeek: number;
  courseCount: number;
  courses: Course[];
  onClose: () => void;
}

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default function ShareScheduleModal({ isOpen, selectedWeek, courseCount, courses, onClose }: ShareScheduleModalProps) {
  const [copied, setCopied] = useState(false);

  // 按周过滤+按天分组+按节次排序
  const weekCourses = useMemo(() => {
    return courses
      .filter((c) => {
        if (c.weekStart > selectedWeek || c.weekEnd < selectedWeek) return false;
        if (c.weekType === 'odd' && selectedWeek % 2 === 0) return false;
        if (c.weekType === 'even' && selectedWeek % 2 === 1) return false;
        return true;
      })
      .sort((a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod);
  }, [courses, selectedWeek]);

  const generateText = () => {
    const lines: string[] = [];
    lines.push(`📅 CampusLink 课表 · 第 ${selectedWeek} 周`);
    lines.push(`共 ${courseCount} 门课 · 进度 ${Math.round((selectedWeek / 18) * 100)}%`);
    lines.push('');

    for (let d = 1; d <= 7; d++) {
      const dayCourses = weekCourses.filter((c) => c.weekday === d);
      if (dayCourses.length === 0) continue;
      lines.push(`【${WEEKDAY_NAMES[d - 1]}】`);
      for (const c of dayCourses) {
        const period = c.periodSpan > 1
          ? `${c.startPeriod}-${c.startPeriod + c.periodSpan - 1}节`
          : `${c.startPeriod}节`;
        const weekLabel = c.weekType === 'odd' ? '[单周]' : c.weekType === 'even' ? '[双周]' : '';
        lines.push(`  ${period} ${c.name} @${c.classroom} ${weekLabel} ${c.teacher ? '· ' + c.teacher : ''}`);
      }
      lines.push('');
    }

    lines.push('— 来自 CampusLink 校园信息平台');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：选中文本手动复制
    }
  };

  const text = generateText();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="导出课表"
      subtitle={`第 ${selectedWeek} 周 · ${courseCount} 门课`}
      footer={
        <Button variant="primary" block onClick={handleCopy}>
          <Icon name="content_copy" className="text-sm" /> {copied ? '已复制！' : '复制文字版'}
        </Button>
      }
    >
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs space-y-1">
        <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-2">
          <span className="font-bold text-primary text-sm flex items-center gap-1">
            <Icon name="school" className="text-xs" /> CampusLink 课表
          </span>
          <span className="bg-course-green/10 text-course-green text-[9px] px-1.5 py-0.5 rounded-full font-bold">
            第 {selectedWeek} 周
          </span>
        </div>
        <p className="text-gray-500 text-[11px]">
          本学期共修读 <b className="text-on-surface">{courseCount}</b> 门课 · 当前进度 <b className="text-on-surface">{Math.round((selectedWeek / 18) * 100)}%</b>
        </p>
        <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans leading-relaxed mt-2 max-h-40 overflow-y-auto bg-white border border-slate-100 rounded-lg p-3">
          {text}
        </pre>
      </div>
    </Modal>
  );
}
