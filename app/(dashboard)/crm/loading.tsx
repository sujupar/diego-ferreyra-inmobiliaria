export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-9 w-32 bg-muted animate-pulse rounded" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted/50 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted/30 animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
