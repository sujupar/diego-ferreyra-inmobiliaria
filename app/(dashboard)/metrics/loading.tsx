export default function Loading() {
  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded bg-muted" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg bg-muted"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
      {/* Main chart */}
      <div className="h-80 animate-pulse rounded-lg bg-muted" />
      {/* Bottom panels */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}
