/**
 * 时间格式化工具 — 统一相对时间显示
 */
export function timeAgo(ts: string): string {
  if (!ts) return '';
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts; // 已是格式化文本（如"2小时前"），直接返回
    const diff = Date.now() - date.getTime();
    if (diff < 0) return ts?.substring(0, 10) || ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    return ts?.substring(0, 10) || ts;
  } catch {
    return ts;
  }
}

/**
 * JSON 安全解析 — JSON.parse 可能抛异常的场景统一由此处理
 */
export function safeParseJsonArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.filter((x): x is string => typeof x === "string");
  if (typeof input === "string") {
    try { return JSON.parse(input); } catch { return []; }
  }
  return [];
}
