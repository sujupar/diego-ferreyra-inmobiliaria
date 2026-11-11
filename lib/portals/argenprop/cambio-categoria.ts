/**
 * Cambios de operación/precio y de TIPO en un aviso ya publicado de Argenprop.
 * Puro (sin red). Verificado con sondas reales (2026-11-11):
 *  - PUT con otra Categoria.Tipo → 400 PUB001: el tipo NO se cambia en el lugar.
 *  - Operación por PUT: OK, salvo AptoCredito=true hacia no-VENTA → 400 PUB003.
 *  - estado/eliminado + POST con el MISMO Codigo → 201 con IdAviso nuevo.
 */
import { armarAvisoActualizado, type ApAvisoVivo } from './edicion'
import type { ApField } from './field-schema'
import { PortalAdapterError } from '../types'

export function armarAvisoConOperacionYPrecio(
  aviso: ApAvisoVivo,
  cambios: { operacion?: string; monto?: number; moneda?: string },
  schema: readonly ApField[],
  idAnunciante: number,
): Record<string, unknown> {
  const { dto } = armarAvisoActualizado(
    aviso,
    { valores: {}, ...(cambios.monto !== undefined ? { precio: cambios.monto } : {}) },
    schema,
    idAnunciante,
  )
  const operacion = cambios.operacion ?? aviso.Precio.Operacion
  const precio = {
    ...(dto.Precio as Record<string, unknown>),
    Operacion: operacion,
    ...(cambios.moneda ? { Moneda: cambios.moneda } : {}),
  }
  // PUB003: "AptoCredito: opción sólo disponible para operaciones de Venta".
  return { ...dto, Precio: precio, ...(operacion !== 'VENTA' ? { AptoCredito: false } : {}) }
}

export function armarAvisoRepublicado(
  aviso: ApAvisoVivo,
  nueva: { tipo: string; subtipo?: string },
  caracteristicasAceptadas: ReadonlySet<string>,
  fotosFicha: string[],
  idAnunciante: number,
): Record<string, unknown> {
  // Base completa (Codigo, Titulo, Contacto, Localizacion con Ids, Precio...).
  const { dto } = armarAvisoActualizado(aviso, { valores: {} }, [], idAnunciante)
  const subtipo = nueva.tipo === 'CASA' ? undefined : nueva.subtipo
  const caracteristicas = (dto.Caracteristicas as { Id: string; Valor: string | number | boolean }[])
    .filter(c => caracteristicasAceptadas.has(c.Id))
  const multimedia = [
    ...fotosFicha.map(Url => ({ Tipo: 'FOTO', Url })),
    ...aviso.Multimedia.filter(m => m.Tipo !== 'FOTO'),
  ]
  return {
    ...dto,
    Categoria: { Tipo: nueva.tipo, ...(subtipo ? { Subtipo: subtipo } : {}) },
    Caracteristicas: caracteristicas,
    Multimedia: multimedia,
  }
}

export const MENSAJE_ELIMINADO_SIN_REPUBLICAR =
  'El aviso de Argenprop se eliminó pero no se pudo volver a publicar. Publicalo desde el asistente de Argenprop.'

/**
 * Eliminar + POST con reintento único. Las llamadas de red se inyectan.
 * Si el POST falla dos veces el aviso ya no existe: error claro con el crudo.
 */
export async function republicarAviso(
  deps: { eliminar: () => Promise<void>; publicar: (dto: Record<string, unknown>) => Promise<number | undefined> },
  dto: Record<string, unknown>,
): Promise<{ avisoId: number }> {
  await deps.eliminar()
  let ultimo: unknown
  for (let intento = 0; intento < 2; intento++) {
    try {
      const id = await deps.publicar(dto)
      if (typeof id !== 'number') throw new Error('Argenprop no devolvió el IdAviso del aviso republicado')
      return { avisoId: id }
    } catch (err) {
      ultimo = err
    }
  }
  const detalle = ultimo instanceof PortalAdapterError ? (ultimo.original ?? ultimo.message) : ultimo
  throw new PortalAdapterError(MENSAJE_ELIMINADO_SIN_REPUBLICAR, 'argenprop', 'unknown', false, detalle)
}
