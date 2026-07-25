'use client'
/**
 * E1.6 Editor — campo de texto con contador y límite (del schema). Capa la longitud
 * al máximo permitido para no romper el Zod al guardar.
 */
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FIELD_MAX } from '@/lib/landing/editor/editable'

export function Field({ label, value, maxKey, multiline, onChange }: {
  label: string
  value: string
  maxKey: string
  multiline?: boolean
  onChange: (v: string) => void
}) {
  const max = FIELD_MAX[maxKey] ?? 200
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <Textarea value={value} maxLength={max} rows={3}
          onChange={(e) => onChange(e.target.value.slice(0, max))} />
      ) : (
        <Input value={value} maxLength={max}
          onChange={(e) => onChange(e.target.value.slice(0, max))} />
      )}
      <span className="block text-right text-[10px] text-muted-foreground">{value.length}/{max}</span>
    </label>
  )
}
