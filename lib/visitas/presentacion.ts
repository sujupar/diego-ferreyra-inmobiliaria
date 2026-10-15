/**
 * Cómo se DICE cada número de la sección Visitas. Puro y seguro para el navegador.
 * Regla del tablero: sin base ⇒ "Sin datos" (lo pinta StatTile con `value={null}`),
 * nunca "0 %"; base chica ⇒ "orientativo".
 */
import type { Cifra } from './metricas'
import { ORIGEN_INFO, PORTAL_ETIQUETA, type OrigenVisita } from './origen'
import { fechaEnArgentina, horaEnArgentina } from './horario'

export const TEXTO_SIN_DATOS = 'Sin datos'
export const TEXTO_LLEGA_CON_LA_ENCUESTA = 'Sin datos — llega con la encuesta'

export function textoPorcentaje(c: Cifra): string | null {
  return c.valor === null ? null : `${c.valor} %`
}

export function textoDuracion(ms: number): string {
  const minutos = Math.round(ms / 60_000)
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.round(ms / 3_600_000)
  if (horas < 48) return `${horas} h`
  return `${Math.round(ms / 86_400_000)} días`
}

export function textoDeTiempo(c: Cifra): string | null {
  return c.valor === null ? null : textoDuracion(c.valor)
}

export function textoDeBase(c: Cifra, sustantivo: { uno: string; varios: string }): string {
  if (c.valor === null) return `sin ${sustantivo.varios} para calcularlo`
  return `de ${c.base} ${c.base === 1 ? sustantivo.uno : sustantivo.varios}${c.orientativo ? ' · orientativo' : ''}`
}

export function etiquetaDeOrigen(origen: OrigenVisita | null, detalle: string | null): string {
  if (!origen) return 'Sin origen'
  const base = ORIGEN_INFO[origen].etiqueta
  if (!detalle) return base
  if (origen === 'portal') return `${base} · ${PORTAL_ETIQUETA[detalle] ?? detalle}`
  if (origen === 'otro' || origen === 'publicidad_paga') return `${base} · ${detalle}`
  return base
}

export function resumenDelDia(visitasHoy: number, porResolver: number): string {
  const hoy = visitasHoy === 0 ? 'Sin visitas hoy' : `${visitasHoy} visita${visitasHoy === 1 ? '' : 's'} hoy`
  const resolver = porResolver === 0 ? 'nada para resolver' : `${porResolver} cosa${porResolver === 1 ? '' : 's'} para resolver`
  return `${hoy} · ${resolver}`
}

/** "01/08/26, 12:00" — con año (el coordinador mira rangos viejos) y en hora argentina. */
export function formatearFechaCorta(v: string | Date): string {
  const d = typeof v === 'string' ? new Date(v) : v
  const [anio, mes, dia] = fechaEnArgentina(d).split('-')
  return `${dia}/${mes}/${anio.slice(2)}, ${horaEnArgentina(d)}`
}
