import { useMemo, useState, useCallback } from 'react';
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
const PERIODS = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节', '13-14节'];

// 课程颜色映射（与 ScheduleTab 中的颜色类对应）
function getCourseColor(courseType: string): string {
  const map: Record<string, string> = {
    theory: '#4a90d9', lab: '#52c41a', elective: '#fa8c16',
  };
  return map[courseType] || '#4a90d9';
}

export default function ShareScheduleModal({ isOpen, selectedWeek, courseCount, courses, onClose }: ShareScheduleModalProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    } catch { /* 降级 */ }
  };

  // ── 图片导出 ──
  const handleExportImage = useCallback(() => {
    setExporting(true);
    // 延迟确保 UI 更新后再绘制
    requestAnimationFrame(() => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { setExporting(false); return; }

        // 布局参数
        const HEADER_H = 56;
        const ROW_H = 56;
        const COL_W = 100;
        const LEFT_W = 52;
        const PAD = 8;
        const COLS = 7;
        const ROWS = 7;
        const W = LEFT_W + COLS * COL_W + PAD;
        const H = HEADER_H + ROWS * ROW_H + PAD * 2;

        canvas.width = W * 2; // 2x for retina
        canvas.height = H * 2;
        ctx.scale(2, 2);

        // 背景
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);

        // 标题
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 14px "Hanken Grotesk", system-ui, sans-serif';
        ctx.fillText(`📅 CampusLink 课表 · 第 ${selectedWeek} 周`, PAD, 22);

        ctx.fillStyle = '#64748b';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(`共 ${courseCount} 门课 · 进度 ${Math.round((selectedWeek / 18) * 100)}%`, PAD, 40);

        // 表头
        for (let d = 0; d < COLS; d++) {
          const x = LEFT_W + d * COL_W;
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(WEEKDAY_NAMES[d], x + COL_W / 2, HEADER_H - 10);
        }

        // 网格线
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.5;
        for (let r = 0; r <= ROWS; r++) {
          const y = HEADER_H + r * ROW_H;
          ctx.beginPath();
          ctx.moveTo(LEFT_W, y);
          ctx.lineTo(W - PAD, y);
          ctx.stroke();
        }
        for (let d = 0; d <= COLS; d++) {
          const x = LEFT_W + d * COL_W;
          ctx.beginPath();
          ctx.moveTo(x, HEADER_H);
          ctx.lineTo(x, H - PAD);
          ctx.stroke();
        }

        // 节次标签
        ctx.textAlign = 'center';
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        for (let r = 0; r < ROWS; r++) {
          const y = HEADER_H + r * ROW_H + ROW_H / 2 + 4;
          ctx.fillText(PERIODS[r], LEFT_W / 2, y);
        }

        // 课程块
        for (const c of weekCourses) {
          const col = c.weekday - 1;
          const row = Math.floor((c.startPeriod - 1) / 2);
          const span = Math.min(c.periodSpan, (ROWS - row) * 2);
          const blockRows = Math.max(1, Math.ceil(span / 2));
          const x = LEFT_W + col * COL_W + 2;
          const y = HEADER_H + row * ROW_H + 2;
          const bw = COL_W - 4;
          const bh = Math.min(blockRows * ROW_H - 4, (ROWS - row) * ROW_H - 4);

          const color = getCourseColor(c.courseType);
          ctx.fillStyle = color + '18';
          ctx.fillRect(x, y, bw, bh);
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 3, bh);

          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(c.name.slice(0, 8), x + 8, y + 18);

          ctx.fillStyle = '#64748b';
          ctx.font = '9px system-ui, sans-serif';
          const sub = [c.classroom, c.teacher].filter(Boolean).join(' · ') || '';
          ctx.fillText(sub.slice(0, 12), x + 8, y + 32);
        }

        ctx.textAlign = 'start';

        // 下载
        canvas.toBlob((blob) => {
          if (!blob) { setExporting(false); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `课表_第${selectedWeek}周.png`;
          a.click();
          URL.revokeObjectURL(url);
          setExporting(false);
        }, 'image/png');
      } catch {
        setExporting(false);
      }
    });
  }, [weekCourses, selectedWeek, courseCount]);

  const text = generateText();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="导出课表"
      subtitle={`第 ${selectedWeek} 周 · ${courseCount} 门课`}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={handleCopy}>
            <Icon name="content_copy" className="text-sm" /> {copied ? '已复制！' : '复制文字'}
          </Button>
          <Button variant="primary" block onClick={handleExportImage} disabled={exporting}>
            <Icon name="image" className="text-sm" /> {exporting ? '生成中...' : '导出图片'}
          </Button>
        </div>
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
