/**
 * Ventana de atención de WhatsApp (Meta Cloud API): 24hs desde el último
 * mensaje ENTRANTE del cliente. Dentro de la ventana se puede mandar texto
 * libre; fuera de ella Meta SOLO acepta plantillas pre-aprobadas — un texto
 * libre fuera de ventana lo rechaza (y si no lo frenamos antes, queda un
 * intento fantasma logueado como 'failed').
 *
 * Pura (sin red, sin base) para poder testear los bordes exactos sin mocks.
 * `now` se inyecta en vez de usar `Date.now()` adentro para que los tests
 * puedan fijar el instante exacto (23:59 / 24:01).
 */
/** Exportado (task 4, 2026-08-03): `lib/integrations/whatsapp/priority.ts` la reusa para calcular cuánto falta como % de la ventana total — nunca hardcodear 24h en otro lado. */
export const WINDOW_MS = 24 * 60 * 60 * 1000

export interface ServiceWindowResult {
  open: boolean
  /** Milisegundos que quedan de ventana. 0 si ya está cerrada. */
  msRemaining: number
}

/**
 * @param lastInboundAt ISO timestamp del último mensaje ENTRANTE del cliente
 *   (`whatsapp_messages.direction = 'in'`), o `null` si nunca hubo uno. Sin
 *   entrante previo la ventana está SIEMPRE cerrada, sin importar cuántos
 *   mensajes salientes se hayan mandado — el negocio no puede "abrirse a sí
 *   mismo" la ventana.
 * @param now Reloj inyectado (no `new Date()` interno) para tests deterministas.
 */
export function serviceWindow(lastInboundAt: string | null, now: Date): ServiceWindowResult {
  if (!lastInboundAt) return { open: false, msRemaining: 0 }

  const last = new Date(lastInboundAt).getTime()
  if (Number.isNaN(last)) return { open: false, msRemaining: 0 }

  const msRemaining = WINDOW_MS - (now.getTime() - last)
  return { open: msRemaining > 0, msRemaining: Math.max(0, msRemaining) }
}
