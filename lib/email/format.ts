import 'server-only'

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  return fullName.trim().split(/\s+/)[0]
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // Accept YYYY-MM-DD or ISO timestamp.
  const date = value.length <= 10 ? new Date(value + 'T00:00:00') : new Date(value)
  if (isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatMoney(amount: number | null | undefined, currency?: string | null): string | null {
  if (amount == null || isNaN(amount)) return null
  const formatted = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(amount)
  return currency ? `${currency} ${formatted}` : formatted
}

export function propertyTypeLabel(type: string | null | undefined, other?: string | null): string {
  if (!type) return '—'
  if (type === 'otro' && other) return other
  const map: Record<string, string> = { departamento: 'Departamento', casa: 'Casa', ph: 'PH', otro: 'Otro' }
  return map[type] || type
}
