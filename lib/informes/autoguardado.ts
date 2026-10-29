/**
 * Reglas del autoguardado de la pantalla del informe (pedido del dueño, 2026-10-24: "es fundamental que el auto
 * guardado funcione perfectamente"). Puro. Antes se guardaba SOLO al salir de cada campo: cerrar la pestaña
 * escribiendo perdía lo escrito, y un guardado que fallaba (red cortada) no se reintentaba.
 */

import type { Manual, Textos } from './tipos'

/** Pausa al tipear antes de guardar. El informe es un borrador interno: guardar a mitad de una frase no se ve en
 * ningún lado público (a diferencia del precio de la ficha, que la landing lee en vivo). */
export const ESPERA_AL_TIPEAR_MS = 1_500

const ESPERAS = [2_000, 5_000, 10_000, 20_000, 30_000]

/** Espera antes del intento número `intento` (0 = el primero). Sigue cada 30 s mientras la pantalla esté abierta. */
export function esperaParaReintento(intento: number): number {
  return ESPERAS[Math.min(intento, ESPERAS.length - 1)]
}

/**
 * Un fallo del CAMINO (sin conexión = 0, servidor caído o lento) se reintenta solo: el dato es bueno.
 * Un rechazo del DATO o del estado (inválido, sin permiso, informe listo) no: insistir no lo arregla.
 */
export function esReintentable(status: number): boolean {
  // 401 = sesión vencida: el dato es bueno; al volver a entrar, el reintento lo manda. Descartarlo perdería el trabajo.
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
}

export type EstadoGuardado = { tipo: 'nada' | 'guardando' | 'guardado' | 'sin_guardar'; texto: string }

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })

export function estadoDelGuardado(e: { guardando: number; escribiendo: number; fallo: string | null; guardadoEn: Date | null }): EstadoGuardado {
  // El fallo manda: mientras lo escrito no entró a la base, la pantalla no puede decir "guardado".
  if (e.fallo) return { tipo: 'sin_guardar', texto: `Sin guardar — reintentando (${e.fallo})` }
  if (e.guardando > 0 || e.escribiendo > 0) return { tipo: 'guardando', texto: 'Guardando…' }
  if (e.guardadoEn) return { tipo: 'guardado', texto: `Guardado ${HORA.format(e.guardadoEn)}` }
  return { tipo: 'nada', texto: '' }
}

function igualesProfundo(a: unknown, b: unknown): boolean {
  const orden = (v: unknown): unknown => Array.isArray(v) ? v.map(orden)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, orden((v as Record<string, unknown>)[k])])) : v
  return JSON.stringify(orden(a)) === JSON.stringify(orden(b))
}

/**
 * La plataforma escribió los textos (el servidor devolvió su `manual`) mientras en pantalla se cargaba algo más.
 * Antes se adoptaba lo del servidor y lo cargado en el medio se perdía (revisión adversarial, 2026-10-24).
 * Regla: lo que no son textos sale de pantalla (el servidor solo cambió textos y redacción); cada texto, de pantalla
 * si la persona lo tocó en el medio, si no el nuevo de la plataforma. `hayQueMandar`: la mezcla difiere de la base.
 */
export function mezclarTrasEscribir(e: { local: Manual; confirmadoAntes: Manual; servidor: Manual }): { manual: Manual; hayQueMandar: boolean } {
  const textos: Textos = { ...(e.servidor.textos ?? {}) }
  // Las claves salen de los propios textos (no de CAMPOS_TEXTO: importarlo de redaccion.ts metería el prompt entero
  // en el código del navegador, que también usa este módulo).
  const claves = new Set([...Object.keys(e.local.textos ?? {}), ...Object.keys(e.confirmadoAntes.textos ?? {})]) as Set<keyof Textos>
  for (const c of claves) {
    const local = e.local.textos?.[c]
    if ((local ?? '') !== (e.confirmadoAntes.textos?.[c] ?? '')) textos[c] = local
  }
  const manual: Manual = { ...e.local, textos }
  if (e.servidor.redaccion) manual.redaccion = e.servidor.redaccion
  else delete manual.redaccion
  // La marca de "datos corregidos después de escribir": el servidor la borró. Solo queda si se corrigió en el medio.
  if (e.local.ajustesEn === e.confirmadoAntes.ajustesEn) {
    if (e.servidor.ajustesEn) manual.ajustesEn = e.servidor.ajustesEn
    else delete manual.ajustesEn
  }
  return { manual, hayQueMandar: !igualesProfundo(manual, e.servidor) }
}
