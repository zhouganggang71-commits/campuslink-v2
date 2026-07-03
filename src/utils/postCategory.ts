/**
 * 帖子分类视觉语言 — 图标 + 主题色，PostCard / HomeTab 共用同一份映射
 * 色板复用课表已有的 course-* 颜色，与"课表"建立统一的色彩记忆。
 */
export interface CategoryStyle {
  icon: string;
  text: string;
  bg: string;
  bar: string;
}

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  sell: { icon: 'shopping_bag', text: 'text-course-blue', bg: 'bg-course-blue/10', bar: 'bg-course-blue' },
  lost: { icon: 'search', text: 'text-course-red', bg: 'bg-course-red/10', bar: 'bg-course-red' },
  found: { icon: 'volunteer_activism', text: 'text-course-green', bg: 'bg-course-green/10', bar: 'bg-course-green' },
  carpool: { icon: 'directions_car', text: 'text-course-orange', bg: 'bg-course-orange/10', bar: 'bg-course-orange' },
  job: { icon: 'work', text: 'text-course-purple', bg: 'bg-course-purple/10', bar: 'bg-course-purple' },
  activity: { icon: 'celebration', text: 'text-amber-700', bg: 'bg-amber-100', bar: 'bg-amber-400' },
  study: { icon: 'school', text: 'text-secondary', bg: 'bg-secondary/10', bar: 'bg-secondary' },
};

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  icon: 'post_add',
  text: 'text-primary',
  bg: 'bg-primary/10',
  bar: 'bg-primary',
};

export function getCategoryStyle(postType: string): CategoryStyle {
  return CATEGORY_STYLE[postType] || DEFAULT_CATEGORY_STYLE;
}
