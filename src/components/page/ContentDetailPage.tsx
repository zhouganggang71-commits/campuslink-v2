/**
 * 内容详情页（R12 Phase 1）— 覆盖层，手机阅读优化
 *
 * - body_type=html：DOMPurify 白名单清洗后渲染（防运营后台被入侵后存储型 XSS）
 * - body_type=calendar_json：渲染结构化校历视图（学期起止/节假日/考试周/倒计时）
 *
 * 手机适配（对标微信文章阅读体验）：
 *   顶栏 sticky 悬浮 + 标题两行截断；封面 16:9；正文 15px/28px 行高；
 *   h2 左强调条；表格自适应；底部安全区留白；深色模式 tokens。
 */
import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Content, CalendarJson } from '../../types';
import Icon from '../ui/Icon';

interface Props {
  content: Content;
  onBack: () => void;
}

function parseCalendar(raw: string): CalendarJson {
  try {
    const data = JSON.parse(raw);
    return {
      termName: data.termName || '',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      holidays: Array.isArray(data.holidays) ? data.holidays : [],
      examWeeks: Array.isArray(data.examWeeks) ? data.examWeeks : [],
    };
  } catch {
    return { termName: '', startDate: '', endDate: '', holidays: [], examWeeks: [] };
  }
}

/** 校历结构化视图（calendar_json） */
function CalendarView({ data }: { data: CalendarJson }) {
  const today = new Date();
  const start = data.startDate ? new Date(data.startDate) : null;
  const end = data.endDate ? new Date(data.endDate) : null;
  const daysToStart = start ? Math.ceil((start.getTime() - today.getTime()) / 86400000) : null;
  const daysToEnd = end ? Math.ceil((end.getTime() - today.getTime()) / 86400000) : null;

  const statusBadge =
    !daysToStart || !daysToEnd
      ? null
      : daysToStart > 0
        ? { text: `距开学 ${daysToStart} 天`, cls: 'bg-course-blue/10 text-course-blue' }
        : daysToEnd > 0
          ? { text: `本学期进行中 · 剩 ${daysToEnd} 天`, cls: 'bg-course-green/10 text-course-green' }
          : { text: '本学期已结束', cls: 'bg-on-surface/5 text-on-surface-variant' };

  return (
    <div className="flex flex-col gap-3">
      <div className="card-float rounded-2xl p-4">
        <div className="text-sm font-bold">{data.termName || '校历'}</div>
        {data.startDate && data.endDate && (
          <div className="text-xs text-on-surface-variant mt-1">
            {data.startDate} ~ {data.endDate}
          </div>
        )}
        {statusBadge && (
          <div className="mt-3">
            <span className={`text-[11px] px-2 py-1 rounded-full ${statusBadge.cls}`}>{statusBadge.text}</span>
          </div>
        )}
      </div>

      {data.holidays.length > 0 && (
        <div className="card-float rounded-2xl p-4">
          <div className="text-sm font-bold mb-2">节假日</div>
          {data.holidays.map((h, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-outline-variant/50 last:border-0"
            >
              <span className="text-sm">{h.name}</span>
              <span className="text-xs text-on-surface-variant">
                {h.start} ~ {h.end}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.examWeeks.length > 0 && (
        <div className="card-float rounded-2xl p-4">
          <div className="text-sm font-bold mb-2">考试周</div>
          {data.examWeeks.map((e, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-outline-variant/50 last:border-0"
            >
              <span className="text-sm">{e.name}</span>
              <span className="text-xs text-on-surface-variant">
                第 {e.weekStart}-{e.weekEnd} 周
              </span>
            </div>
          ))}
        </div>
      )}

      {(data as any).notes && (
        <div className="card-float rounded-2xl p-4">
          <div className="text-sm font-bold mb-2">重要安排</div>
          <div className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
            {(data as any).notes}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContentDetailPage({ content, onBack }: Props) {
  const calendar = useMemo(
    () => (content.bodyType === 'calendar_json' ? parseCalendar(content.body) : null),
    [content.body, content.bodyType],
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* 顶栏：sticky 悬浮，滚动时保持可见 */}
      <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 h-12 shrink-0 bg-background/95 backdrop-blur border-b border-outline-variant/40">
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-on-surface/5 rounded-full transition-colors shrink-0"
        >
          <Icon name="arrow_back" className="text-xl" />
        </button>
        <span className="text-[15px] font-semibold leading-tight line-clamp-2 flex-1 min-w-0">{content.title}</span>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {content.coverUrl && (
          <img
            src={content.coverUrl}
            alt=""
            // 长图完整显示：不裁切（如资助政策表/校历长图），按图片实际比例高度自适应
            className="w-full h-auto object-contain bg-on-surface/5"
            loading="lazy"
          />
        )}
        <div className="px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+40px)]">
          <h1 className="text-[17px] sm:text-lg font-bold leading-snug">{content.title}</h1>
          <div className="text-[11px] text-on-surface-variant/70 mt-2 flex items-center gap-1.5">
            <Icon name="visibility" className="text-xs" />
            {content.viewCount} 次浏览
            {content.updatedAt ? (
              <>
                <span className="mx-0.5">·</span>
                <span>{content.updatedAt.slice(0, 10)}</span>
              </>
            ) : null}
          </div>

          {/* 资料下载（新生资料库钩子） */}
          {content.resourceUrl && (
            <a
              href={content.resourceUrl}
              download={content.resourceName || undefined}
              target={content.resourceUrl.startsWith('http') ? '_blank' : undefined}
              rel="noreferrer"
              className="mt-4 flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon name="file_text" className="text-lg" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-primary">下载资料</div>
                  <div className="text-[11px] text-on-surface-variant truncate">
                    {content.resourceName || '资料文件'}
                  </div>
                </div>
              </div>
              <Icon name="download" className="text-primary text-lg shrink-0" />
            </a>
          )}

          {/* 分割线 */}
          <div className="my-4 h-px bg-outline-variant/50" />

          <div>
            {calendar ? (
              <CalendarView data={calendar} />
            ) : (
              <div
                className="text-[15px] leading-[1.75] text-on-surface
                  [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-3 [&_img]:shadow-card
                  [&_h1]:text-[17px] [&_h1]:font-bold [&_h1]:my-4 [&_h1]:leading-snug
                  [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:pl-3 [&_h2]:border-l-[3px] [&_h2]:border-primary
                  [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5
                  [&_p]:my-2.5 [&_p:first-child]:mt-0
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1.5
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1.5
                  [&_li]:leading-relaxed
                  [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
                  [&_strong]:font-semibold
                  [&_blockquote]:border-l-[3px] [&_blockquote]:border-outline [&_blockquote]:pl-3 [&_blockquote]:my-3 [&_blockquote]:text-on-surface-variant
                  [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:my-3 [&_table]:leading-relaxed
                  [&_th]:border [&_th]:border-outline-variant/60 [&_th]:p-1.5 [&_th]:bg-on-surface/5 [&_th]:font-semibold [&_th]:text-left
                  [&_td]:border [&_td]:border-outline-variant/60 [&_td]:p-1.5 [&_td]:align-top"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content.body) }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
