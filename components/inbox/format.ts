/**
 * Formateo puro compartido por la lista, el hilo y el panel del cliente.
 * Nada de esto toca la red — son funciones de texto, fáciles de probar con
 * `renderToStaticMarkup` o Vitest sin DOM.
 */

/** "hace 5 min" / "hace 2 h" / "hace 3 días" / fecha corta si es más viejo. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} día${d > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('es-AR')
}

/** Cuánto falta de la ventana de 24hs — "2 h 15 min" / "0 min". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0 min'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

/**
 * Duración genérica para las métricas del panel del cliente (task 6): "3 min",
 * "2 h 10 min", "1 día". Distinta de `formatRemaining` (esa es específica de
 * "cuánto FALTA de la ventana"; esta es "cuánto DURÓ algo que ya pasó").
 */
export function formatDuration(ms: number): string {
  if (ms < 60000) return 'menos de 1 min'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  if (h < 24) return m > 0 ? `${h} h ${m} min` : `${h} h`
  const d = Math.floor(h / 24)
  return `${d} día${d > 1 ? 's' : ''}`
}

export function displayPhone(phoneE164: string): string {
  return `+${phoneE164}`
}

/** Separador de fecha del hilo: "29 de julio de 2026" (task 5). */
export function formatDateSeparator(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Clave para agrupar mensajes por día (independiente del formato de exhibición). */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export interface DayGrouped<T> {
  item: T
  /** true si `item` es el primero de su día en la lista — ahí va el separador. */
  showSeparator: boolean
}

/**
 * Marca, para cada mensaje en orden cronológico, si es el primero de un día
 * nuevo (`ChatThread` usa esto para los separadores de fecha). Función pura
 * de módulo (no un componente/hook) a propósito: si esta lógica vivía como
 * una mutación de `let lastDay` dentro del `.map()` de JSX del componente,
 * el linter de reglas de React (`react-hooks/immutability`, activo en este
 * proyecto) la marca como error — reasignar una variable capturada durante el
 * render no es seguro bajo el modelo de renders concurrentes/dobles de React.
 * Sacando el cálculo a una función de datos común (sin JSX, sin hooks) el
 * problema desaparece Y queda más fácil de testear.
 */
export function groupByDay<T extends { created_at: string }>(items: T[]): DayGrouped<T>[] {
  let lastDay: string | null = null
  return items.map(item => {
    const key = dayKey(item.created_at)
    const showSeparator = key !== lastDay
    lastDay = key
    return { item, showSeparator }
  })
}

export function messageText(m: { body_preview: string | null; template_name: string | null }): string {
  if (m.body_preview) return m.body_preview
  if (m.template_name) return `Plantilla: ${m.template_name}`
  return '(sin contenido)'
}

/** Saca el prefijo "[imagen] "/"[documento] "/etc. del body_preview, para mostrarlo como caption debajo del adjunto en vez de duplicar la etiqueta. */
export function mediaCaption(bodyPreview: string | null): string | null {
  if (!bodyPreview) return null
  const sinPrefijo = bodyPreview.replace(/^\[[^\]]+\]\s?/, '').trim()
  return sinPrefijo.length > 0 ? sinPrefijo : null
}
