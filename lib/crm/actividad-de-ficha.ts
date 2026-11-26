// Arma un registro de la actividad para la ficha (design.md D4). Puro: las rutas le
// pasan lo que leyeron de la base (intento, nombre del autor, tarea creada).
import { puedeAnular, puedeEditarNota, tituloActividad } from './actividades'
import type { Actividad, ActividadDeFicha, TareaCreadaPorActividad, UsuarioMinimo } from './tipos'

export function armarActividadDeFicha(
  fila: Actividad & { client_token?: string | null },
  c: {
    intento: number | null
    autorNombre: string | null
    tareaCreada: TareaCreadaPorActividad | null
    usuario: UsuarioMinimo
  },
): ActividadDeFicha {
  // Se copian las columnas una por una: así `client_token` (y cualquier columna que se
  // sume a la tabla) no viaja a la pantalla sin que nadie lo decida.
  const actividad: Actividad = {
    id: fila.id,
    contact_id: fila.contact_id,
    deal_id: fila.deal_id,
    kind: fila.kind,
    call_outcome: fila.call_outcome,
    body: fila.body,
    occurred_at: fila.occurred_at,
    callback_at: fila.callback_at,
    created_at: fila.created_at,
    updated_at: fila.updated_at,
    created_by: fila.created_by,
    voided_at: fila.voided_at,
    voided_by: fila.voided_by,
    automatic: fila.automatic,
  }
  return {
    ...actividad,
    intento: c.intento,
    titulo: tituloActividad(actividad, c.intento),
    autor: actividad.created_by ? { id: actividad.created_by, nombre: c.autorNombre ?? '' } : null,
    editada: actividad.updated_at !== null,
    tarea_creada: c.tareaCreada,
    puede_editar: puedeEditarNota(actividad, c.usuario),
    puede_anular: puedeAnular(actividad, c.usuario),
  }
}
