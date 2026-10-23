/**
 * Informes guardados con la forma de la Entrega 1 (2026-10-22). La fuente de MercadoLibre era `{avisoId, visitas}`
 * y el manual de ML traía contactos, llamadas, WhatsApp y preguntas cargados a mano. Sin esto, la pantalla de ese
 * informe se caía (`avisos.length` de undefined) y ningún guardado pasaba la validación (el manual viaja entero y
 * esas claves ya no se aceptan). Puro: se aplica al LEER, la fila se reescribe sola en el próximo guardado.
 */
import type { DatosMercadoLibre, Fuentes, Manual } from './tipos'

export function actualizarFormaVieja(fuentes: Fuentes, manual: Manual): { fuentes: Fuentes; manual: Manual } {
  let f = fuentes
  const ml = fuentes.mercadolibre
  const datos = ml?.datos as (Partial<DatosMercadoLibre> & { avisoId?: unknown }) | null | undefined
  if (ml && datos && !Array.isArray(datos.avisos)) {
    const id = typeof datos.avisoId === 'string' ? datos.avisoId : null
    const nuevos: DatosMercadoLibre = {
      avisos: id ? [{ id, titulo: null, url: null, origen: 'plataforma' }] : [],
      visitas: typeof datos.visitas === 'number' ? datos.visitas : 0,
    }
    f = { ...fuentes, mercadolibre: { ...ml, datos: nuevos } }
  }

  let m = manual
  const mm = manual.mercadolibre as Record<string, unknown> | undefined
  if (mm && Object.keys(mm).some(k => k !== 'aviso' && k !== 'excluidos')) {
    const limpio: NonNullable<Manual['mercadolibre']> = {}
    if (typeof mm.aviso === 'string') limpio.aviso = mm.aviso
    if (Array.isArray(mm.excluidos)) limpio.excluidos = mm.excluidos.filter((x): x is string => typeof x === 'string')
    m = { ...manual, mercadolibre: limpio }
  }
  return { fuentes: f, manual: m }
}
