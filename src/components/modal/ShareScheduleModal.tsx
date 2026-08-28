import { useMemo, useState, useCallback, useEffect } from 'react';
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

// ── 课程颜色（跟 index.css --color-course-* 一致）──
function courseColor(colorClass?: string): string {
  const map: Record<string, string> = {
    'bg-course-red': '#f5222d',
    'bg-course-volcano': '#fa541c',
    'bg-course-orange': '#fa8c16',
    'bg-course-gold': '#faad14',
    'bg-course-yellow': '#fadb14',
    'bg-course-lime': '#a0d911',
    'bg-course-green': '#52c41a',
    'bg-course-cyan': '#13c2c2',
    'bg-course-blue': '#1890ff',
    'bg-course-indigo': '#2f54eb',
    'bg-course-purple': '#722ed1',
    'bg-course-magenta': '#eb2f96',
    'bg-course-grey': '#8c8c8c',
    'bg-course-brown': '#873800',
  };
  if (!colorClass) return '#4F46E5';
  for (const [cls, c] of Object.entries(map)) {
    if (colorClass.includes(cls)) return c;
  }
  return '#4F46E5';
}

const TIME_SLOTS = [
  { label: '1-2', period: 1 },
  { label: '3-4', period: 3 },
  { label: '5-6', period: 5 },
  { label: '7-8', period: 7 },
  { label: '9-10', period: 9 },
];

function slotOf(p: number) {
  return Math.max(0, Math.min(4, Math.floor((p - 1) / 2)));
}

// ── 卡片尺寸 ──
const W = 1080;
const H = 1520;
const ML = 48;
const MR = 48;
const CONTENT = W - ML - MR; // 984
const PW = 64; // period label width
const GX = ML + PW;
const CW = Math.floor((CONTENT - PW) / 7); // ~131
const RH = 96;
const SLOTS = 5;

// ── API URL ──
const CAMPUS_URL = 'https%3A%2F%2Fjhcaishui.cn%2Fcampus%2F';
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${CAMPUS_URL}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export default function ShareScheduleModal({
  isOpen,
  selectedWeek,
  courseCount,
  courses,
  onClose,
}: ShareScheduleModalProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 过滤当周课程
  const weekCourses = useMemo(
    () =>
      courses
        .filter((c) => {
          if (c.weekStart > selectedWeek || c.weekEnd < selectedWeek) return false;
          if (c.weekType === 'odd' && selectedWeek % 2 === 0) return false;
          if (c.weekType === 'even' && selectedWeek % 2 === 1) return false;
          return true;
        })
        .sort((a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod),
    [courses, selectedWeek],
  );

  // 统计
  const theoryCount = useMemo(() => weekCourses.filter((c) => c.courseType === 'theory').length, [weekCourses]);
  const labCount = useMemo(() => weekCourses.filter((c) => c.courseType === 'lab').length, [weekCourses]);
  const electiveCount = useMemo(() => weekCourses.filter((c) => c.courseType === 'elective').length, [weekCourses]);

  // ── 异步绘制卡片（加载二维码）──
  const drawCard = useCallback(async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    // 尝试预加载二维码
    let qrImg: HTMLImageElement | null = null;
    try {
      qrImg = await loadImage(QR_URL);
    } catch {
      /* fallback */
    }

    // ── 背景 ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#EEF2FF');
    bg.addColorStop(1, '#F5F3FF');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── 顶部渐变 ──
    const hdr = ctx.createLinearGradient(0, 0, W, 210);
    hdr.addColorStop(0, '#4F46E5');
    hdr.addColorStop(0.6, '#7C3AED');
    hdr.addColorStop(1, '#A855F7');
    ctx.fillStyle = hdr;
    ctx.beginPath();
    ctx.moveTo(ML, 0);
    ctx.lineTo(W - ML, 0);
    ctx.quadraticCurveTo(W - ML, 18, W - ML, 18);
    ctx.lineTo(W - ML, 210);
    ctx.lineTo(ML, 210);
    ctx.lineTo(ML, 18);
    ctx.quadraticCurveTo(ML, 0, ML + 18, 0);
    ctx.closePath();
    ctx.fill();

    // 装饰圆
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(W - ML - 40, 30, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ML + 140, 195, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── 标题 ──
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px system-ui,-apple-system,sans-serif';
    ctx.fillText('📚 我的课表', ML + 24, 62);

    ctx.font = '15px system-ui,-apple-system,sans-serif';
    ctx.globalAlpha = 0.85;
    ctx.fillText('川财CampusLink', ML + 24, 95);
    ctx.globalAlpha = 1;

    ctx.font = '20px system-ui,-apple-system,sans-serif';
    ctx.fillText(`第 ${selectedWeek} 周  ·  2026-2027 第一学期`, ML + 24, 145);

    // 进度条
    const p = Math.min(1, selectedWeek / 18);
    const bx = ML + 24,
      by = 172,
      bw = 260,
      bh = 8;
    ctx.globalAlpha = 0.3;
    roundRect(ctx, bx, by, bw, bh, 4);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;
    roundRect(ctx, bx, by, bw * p, bh, 4);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.font = '12px system-ui,-apple-system,sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText(`学期进度 ${Math.round(p * 100)}%`, bx + bw + 12, by + 7);
    ctx.globalAlpha = 1;

    // ── 课表网格 ──
    const GY = 230; // grid start y
    const WDY = 180; // weekday y
    const GH = SLOTS * RH;
    const GE = GY + GH;

    // 星期头
    ctx.font = 'bold 14px system-ui,-apple-system,sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    for (let d = 0; d < 7; d++) {
      ctx.fillText(WEEKDAY_NAMES[d], GX + d * CW + CW / 2, WDY + 36);
    }

    // 周末列淡出
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#94A3B8';
    for (let d = 5; d < 7; d++) {
      ctx.fillRect(GX + d * CW, GY, CW, GH);
    }
    ctx.globalAlpha = 1;

    // 网格线
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 0.5;
    ctx.textAlign = 'center';
    for (let s = 0; s < SLOTS; s++) {
      const y = GY + s * RH;
      ctx.beginPath();
      ctx.moveTo(GX, y);
      ctx.lineTo(GX + CW * 7, y);
      ctx.stroke();
      ctx.font = '11px system-ui,-apple-system,sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(TIME_SLOTS[s].label, ML + PW / 2, y + RH / 2 + 4);
    }
    // 关闭底部网格线（最后一行不画底边）
    // 竖线
    for (let d = 0; d <= 7; d++) {
      const x = GX + d * CW;
      ctx.beginPath();
      ctx.moveTo(x, GY);
      ctx.lineTo(x, GE);
      ctx.stroke();
    }

    // ── 课程块 ──
    for (const c of weekCourses) {
      const col = c.weekday - 1;
      if (col < 0 || col > 6) continue;
      const ss = slotOf(c.startPeriod);
      const es = Math.min(4, slotOf(c.startPeriod + c.periodSpan - 1));
      const rs = es - ss + 1;
      const cx = GX + col * CW + 3,
        cy = GY + ss * RH + 3,
        cw = CW - 6,
        ch = rs * RH - 6;
      const color = courseColor(c.colorClass);

      // 背景
      ctx.fillStyle = color + '16';
      roundRect(ctx, cx, cy, cw, ch, 8);
      ctx.fill();

      // 左侧色条
      ctx.fillStyle = color;
      roundRect(ctx, cx, cy, 4, ch, 3);
      ctx.fill();

      // 课程名
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 13px system-ui,-apple-system,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(c.name.length > 5 ? c.name.slice(0, 5) + '…' : c.name, cx + 10, cy + 24);

      // 教室
      if (ch > 54 && c.classroom) {
        ctx.fillStyle = '#64748B';
        ctx.font = '10px system-ui,-apple-system,sans-serif';
        ctx.fillText(c.classroom.length > 6 ? c.classroom.slice(0, 6) : c.classroom, cx + 10, cy + 44);
      }
    }

    // ── 统计 ──
    const sy = GE + 32;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 21px system-ui,-apple-system,sans-serif';
    ctx.fillText('📊 学期概览', W / 2, sy + 4);

    ctx.fillStyle = '#64748B';
    ctx.font = '14px system-ui,-apple-system,sans-serif';
    const statsParts: string[] = [];
    if (theoryCount > 0) statsParts.push(`理论 ${theoryCount}`);
    if (labCount > 0) statsParts.push(`实验 ${labCount}`);
    if (electiveCount > 0) statsParts.push(`选修 ${electiveCount}`);
    const statsLine =
      `共 ${courseCount} 门课  ·  第 ${selectedWeek} 周进行中` +
      (statsParts.length ? `  ·  ${statsParts.join(' · ')}` : '');
    ctx.fillText(statsLine, W / 2, sy + 36);

    // 分隔线
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 100, sy + 58);
    ctx.lineTo(W / 2 + 100, sy + 58);
    ctx.stroke();

    // ── 二维码 + CTA ──
    const qy = sy + 100;
    // CTA 卡片背景
    const ctaGrad = ctx.createLinearGradient(W / 2 - 210, 0, W / 2 + 210, 0);
    ctaGrad.addColorStop(0, '#EEF2FF');
    ctaGrad.addColorStop(1, '#F5F3FF');
    ctx.fillStyle = ctaGrad;
    roundRect(ctx, W / 2 - 210, qy, 420, 200, 16);
    ctx.fill();
    ctx.strokeStyle = '#C7D2FE';
    ctx.lineWidth = 1;
    roundRect(ctx, W / 2 - 210, qy, 420, 200, 16);
    ctx.stroke();

    // 二维码
    const qs = 120;
    const qx = (W - qs) / 2;
    const qyy = qy + 18;
    if (qrImg) {
      ctx.save();
      roundRect(ctx, qx, qyy, qs, qs, 8);
      ctx.clip();
      ctx.drawImage(qrImg, qx, qyy, qs, qs);
      ctx.restore();
    } else {
      // 无二维码时的占位
      ctx.fillStyle = '#E0E7FF';
      roundRect(ctx, qx, qyy, qs, qs, 8);
      ctx.fill();
      ctx.fillStyle = '#6366F1';
      ctx.font = '28px system-ui,-apple-system,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📱', W / 2, qyy + 76);
    }

    // CTA 文字
    ctx.fillStyle = '#4F46E5';
    ctx.font = 'bold 16px system-ui,-apple-system,sans-serif';
    ctx.fillText('扫码自动生成课表', W / 2, qyy + qs + 30);

    ctx.fillStyle = '#6B7280';
    ctx.font = '12px system-ui,-apple-system,sans-serif';
    ctx.fillText('分享给同学，一起来用川财CampusLink', W / 2, qyy + qs + 54);

    // ── 底部品牌 ──
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '12px system-ui,-apple-system,sans-serif';
    ctx.fillText('—— 来自川财CampusLink 校园信息平台 ——', W / 2, qyy + qs + 94);

    return canvas;
  }, [weekCourses, selectedWeek, courseCount]);

  // ── 自动生成预览 ──
  useEffect(() => {
    if (!isOpen) {
      setPreviewUrl(null);
      return;
    }
    // 预加载二维码
    const timer = setTimeout(async () => {
      try {
        const canvas = await drawCard();
        setPreviewUrl(canvas.toDataURL('image/png'));
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isOpen, drawCard]);

  // ── 文字导出 ──
  const generateText = () => {
    const lines: string[] = [];
    lines.push(`📚 我的课表 · 川财CampusLink · 第 ${selectedWeek} 周`);
    lines.push(`共 ${courseCount} 门课 · 学期进度 ${Math.round((selectedWeek / 18) * 100)}%`);
    if (theoryCount > 0) lines.push(`理论课 ${theoryCount} 门`);
    if (labCount > 0) lines.push(`实验课 ${labCount} 门`);
    if (electiveCount > 0) lines.push(`选修课 ${electiveCount} 门`);
    lines.push('');
    for (let d = 1; d <= 7; d++) {
      const dayCourses = weekCourses.filter((c) => c.weekday === d);
      if (!dayCourses.length) continue;
      lines.push(`【${WEEKDAY_NAMES[d - 1]}】`);
      for (const c of dayCourses) {
        const period =
          c.periodSpan > 1 ? `${c.startPeriod}-${c.startPeriod + c.periodSpan - 1}节` : `${c.startPeriod}节`;
        const wl = c.weekType === 'odd' ? '[单]' : c.weekType === 'even' ? '[双]' : '';
        lines.push(`  ${period} ${c.name} @${c.classroom}${wl}${c.teacher ? ' · ' + c.teacher : ''}`);
      }
      lines.push('');
    }
    lines.push('— 来自川财CampusLink 校园信息平台 —');
    lines.push('扫码访问: https://jhcaishui.cn/campus/');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 降级 */
    }
  };

  const handleExportImage = useCallback(async () => {
    setExporting(true);
    try {
      const canvas = await drawCard();
      setPreviewUrl(canvas.toDataURL('image/png'));
      canvas.toBlob((blob) => {
        if (!blob) {
          setExporting(false);
          return;
        }
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
  }, [drawCard, selectedWeek]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="分享课表"
      subtitle={`第 ${selectedWeek} 周 · ${courseCount} 门课`}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={handleCopy}>
            <Icon name="content_copy" className="text-sm" /> {copied ? '已复制！' : '复制文字'}
          </Button>
          <Button variant="primary" block onClick={handleExportImage} disabled={exporting}>
            <Icon name="image" className="text-sm" /> {exporting ? '生成中...' : '保存图片'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center">
        {previewUrl ? (
          <div className="w-full max-h-[420px] overflow-hidden rounded-xl shadow-lg border border-slate-200 dark:border-slate-600">
            <img src={previewUrl} alt="课表分享卡片预览" className="w-full h-auto" loading="lazy" />
          </div>
        ) : (
          <div className="w-full h-64 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 text-sm">
            <Icon name="schedule" className="text-2xl mr-2" /> 生成预览中...
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3 text-center">保存图片后，可直接分享到微信/朋友圈</p>
      </div>
    </Modal>
  );
}
