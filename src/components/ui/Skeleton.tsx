export function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-slate-200"></div>
      <div className="p-3 space-y-2">
        <div className="h-3 bg-slate-200 rounded w-3/4"></div>
        <div className="h-2 bg-slate-100 rounded w-full"></div>
        <div className="h-2 bg-slate-100 rounded w-1/2"></div>
        <div className="flex justify-between pt-2 border-t border-slate-50">
          <div className="h-3 bg-slate-200 rounded w-12"></div>
          <div className="h-3 bg-slate-100 rounded w-16"></div>
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
