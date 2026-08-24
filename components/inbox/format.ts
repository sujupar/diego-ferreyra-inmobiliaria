import { reconstruirDesdeParametros } from '@/lib/integrations/whatsapp/cuerpos'

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

/**
 * "14:32" — la hora del mensaje, para mostrar DENTRO de la burbuja del hilo.
 *
 * El hilo ya viene agrupado por día con su separador de fecha, así que repetir
 * "hace 3 días" debajo de cada burbuja era a la vez redundante y menos útil: el
 * asesor nunca sabía a qué hora se había mandado nada. `relativeTime` se queda
 * donde sí sirve — la fila de la lista de conversaciones, donde lo único que
 * importa es hace cuánto fue la última actividad.
 */
export function horaCorta(iso: string): string {
  // `hour12: false` explícito: sin eso, `es-AR` devuelve "02:32 p. m." según el
  // ICU que le toque, y en una burbuja de chat eso es cuatro caracteres de ruido
  // y una convención que en Argentina no se usa. Se quiere "14:32".
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
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

/**
 * Separador de fecha del hilo: "Hoy", "Ayer" o "29 de julio de 2026".
 *
 * Los dos primeros no son adorno. El separador es, desde que la burbuja pasó a
 * mostrar solo la hora, el ÚNICO lugar del hilo donde se lee la fecha; con la
 * fecha completa siempre, el asesor tenía que hacer la cuenta mental de si "9 de
 * agosto de 2026" era hoy o anteayer para saber si el cliente le está esperando
 * una respuesta AHORA. "Hoy" y "Ayer" son las dos únicas fechas que se
 * consultan cien veces por día, y son las dos que el cerebro no debería tener
 * que calcular.
 *
 * `now` es un parámetro con valor por omisión (mismo criterio que
 * `relativeTime`) para que esto se pueda probar sin viajar en el tiempo.
 *
 * "Ayer" se calcula restando un DÍA DE CALENDARIO, no 24 horas: con un cambio
 * de horario de por medio, `now - 86400000` puede caer en el mismo día y el
 * separador de ayer diría "Hoy" dos veces seguidas.
 */
export function formatDateSeparator(iso: string, now: number = Date.now()): string {
  const clave = dayKey(iso)
  const ahora = new Date(now)
  if (clave === claveDeFecha(ahora)) return 'Hoy'
  const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1)
  if (clave === claveDeFecha(ayer)) return 'Ayer'
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** La misma clave de día, a partir de un `Date` ya construido. */
function claveDeFecha(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Clave para agrupar mensajes por día (independiente del formato de exhibición). */
export function dayKey(iso: string): string {
  return claveDeFecha(new Date(iso))
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
  // Envíos VIEJOS de plantilla: quedaron guardados como los parámetros pegados
  // con puntos ("Juan · Roque Pérez 3059 · https://…") y así se leían en el
  // chat, aunque el cliente hubiera recibido un mensaje entero. Se rearman con
  // el cuerpo aprobado. Los envíos nuevos ya guardan el texto y no se tocan.
  const rearmado = reconstruirDesdeParametros(m.template_name, m.body_preview)
  if (rearmado) return rearmado
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
