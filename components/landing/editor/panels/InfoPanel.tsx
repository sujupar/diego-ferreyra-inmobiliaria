'use client'
/** E1.6 Editor — panel informativo para bloques sin campos editables. */
export function InfoPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
