/**
 * 分页组件 — 纯 Tailwind，零依赖
 */
import Button from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPage }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 3);
  const end = Math.min(totalPages, page + 3);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center gap-2 py-3">
      <Button variant="ghost" size="md" disabled={page === 1} onClick={() => onPage(page - 1)} className="flex-1 max-w-[80px]">
        上一页
      </Button>
      {/* 页码 */}
      <div className="flex items-center gap-1.5 flex-1 justify-center">
        {start > 1 && (
          <>
            <Button variant="ghost" size="md" onClick={() => onPage(1)} className="min-w-[40px]">1</Button>
            {start > 2 && <span className="text-sm text-gray-300">...</span>}
          </>
        )}
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === page ? 'primary' : 'ghost'}
            size="md"
            onClick={() => onPage(p)}
            className="min-w-[40px]"
          >
            {p}
          </Button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="text-sm text-gray-300">...</span>}
            <Button variant="ghost" size="md" onClick={() => onPage(totalPages)} className="min-w-[40px]">{totalPages}</Button>
          </>
        )}
      </div>
      <Button variant="ghost" size="md" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="flex-1 max-w-[80px]">
        下一页
      </Button>
    </div>
  );
}
