'use client'

// Acciones de tareas desde la pantalla (crm-tareas-y-campanita, D5): una sola forma de
// completar, reabrir, posponer y crear, y el aviso `tareas:cambio` que escucha la
// campanita. Toda mutación lo emite, así el número se actualiza en cualquier pantalla.
import { leerJson, type RespuestaLeida } from '@/lib/crm/leer-json'

export const EVENTO_CAMBIO = 'tareas:cambio'

export function avisarCambioTareas(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CAMBIO))
}

async function cambiar<T>(id: string, cuerpo: Record<string, unknown>): Promise<RespuestaLeida<T>> {
  try {
    const r = await leerJson<T>(
      await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      }),
    )
    if (r.ok) avisarCambioTareas()
    return r
  } catch (err) {
    console.error('[tareas] no se pudo guardar', err)
    return { ok: false, status: 0, error: 'No se pudo guardar. Revisá la conexión y probá de nuevo.' }
  }
}

export const completarTarea = (id: string) => cambiar<{ success: boolean }>(id, { action: 'complete' })
export const reabrirTareaPedida = (id: string) => cambiar<{ success: boolean }>(id, { action: 'reopen' })

export interface FechaDeTarea {
  due_date: string | null
  due_time: string | null
}

export const posponerTareaPedida = (id: string, fecha: string, hora: string) =>
  cambiar<{ success: boolean; anterior: FechaDeTarea }>(id, { action: 'posponer', due_date: fecha, due_time: hora })

/** El "Deshacer" de posponer: vuelve a `anterior` solo si la tarea sigue con lo que se le puso. */
export const deshacerPosponer = (id: string, anterior: FechaDeTarea, puesto: { fecha: string; hora: string }) =>
  cambiar<{ success: boolean }>(id, {
    action: 'posponer',
    deshacer: true,
    due_date: anterior.due_date,
    due_time: anterior.due_time,
    desde_fecha: puesto.fecha,
    desde_hora: puesto.hora,
  })

export async function crearTarea(cuerpo: Record<string, unknown>): Promise<RespuestaLeida<{ success: boolean; id?: string; skipped?: boolean }>> {
  try {
    const r = await leerJson<{ success: boolean; id?: string; skipped?: boolean }>(
      await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }),
    )
    if (r.ok) avisarCambioTareas()
    return r
  } catch (err) {
    console.error('[tareas] no se pudo crear', err)
    return { ok: false, status: 0, error: 'No se pudo crear la tarea. Revisá la conexión y probá de nuevo.' }
  }
}
