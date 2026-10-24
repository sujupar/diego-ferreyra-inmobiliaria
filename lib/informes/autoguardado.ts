/**
 * Reglas del autoguardado de la pantalla del informe (pedido del dueño, 2026-10-24: "es fundamental que el auto
 * guardado funcione perfectamente"). Puro. Antes se guardaba SOLO al salir de cada campo: cerrar la pestaña
 * escribiendo perdía lo escrito, y un guardado que fallaba (red cortada) no se reintentaba.
 */

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
  return status === 0 || status === 408 || status === 429 || status >= 500
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
