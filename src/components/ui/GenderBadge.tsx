/**
 * 性别标识 — 小圆点符号，仅当用户主动公开时才会拿到非 null 的值去渲染
 * 男 ♂ 蓝色 / 女 ♀ 粉色，与头像/昵称同行内联展示
 */
interface GenderBadgeProps {
  gender: 'male' | 'female' | null | undefined;
  className?: string;
}

export default function GenderBadge({ gender, className = '' }: GenderBadgeProps) {
  if (!gender) return null;
  const isMale = gender === 'male';
  return (
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] leading-none shrink-0 ${
        isMale ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'
      } ${className}`}
      aria-label={isMale ? '男' : '女'}
    >
      {isMale ? '♂' : '♀'}
    </span>
  );
}
