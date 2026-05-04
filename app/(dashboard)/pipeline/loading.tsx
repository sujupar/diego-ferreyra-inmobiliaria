export default function Loading() {
  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded bg-muted" />
      </div>
      {/* Filters */}
      <div className="flex gap-3">
        <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded bg-muted" />
      </div>
      {/* Kanban columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-5 w-8 animate-pulse rounded bg-muted/60" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg bg-muted"
                  style={{ animationDelay: `${(col * 3 + i) * 50}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
