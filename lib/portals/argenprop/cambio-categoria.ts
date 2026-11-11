/**
 * Cambios de operación/precio y de TIPO en un aviso ya publicado de Argenprop.
 * Puro (sin red). Verificado con sondas reales (2026-11-11):
 *  - PUT con otra Categoria.Tipo → 400 PUB001: el tipo NO se cambia en el lugar.
 *  - Operación por PUT: OK, salvo AptoCredito=true hacia no-VENTA → 400 PUB003.
 *  - estado/eliminado + POST con el MISMO Codigo → 201 con IdAviso nuevo.
 */
import { armarAvisoActualizado, aId, type ApAvisoVivo } from './edicion'
import { AP_MAX_FOTOS_AVISO } from '../photo-limits'
import type { ApField } from './field-schema'
import { PortalAdapterError } from '../types'

/** "venta" / "alquiler temporario" / etc. → VENTA | ALQUILER | ALQUILER_TEMPORAL. */
export function normalizarOperacion(op: string): string {
  const k = op.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, '_')
  if (k === 'TEMPORARIO' || k === 'TEMPORAL' || k === 'ALQUILER_TEMPORARIO') return 'ALQUILER_TEMPORAL'
  return k
}

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
  const operacion = cambios.operacion ? normalizarOperacion(cambios.operacion) : aviso.Precio.Operacion
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
  cambios: { operacion?: string; monto?: number; moneda?: string } = {},
): Record<string, unknown> {
  // Base completa (Codigo, Titulo, Contacto, Localizacion con Ids, Precio...) con operación/precio aplicados.
  const base = armarAvisoConOperacionYPrecio(aviso, cambios, [], idAnunciante)
  // Forma probada: CASA se publicó con Subtipo 'CASA'.
  const subtipo = nueva.subtipo ? aId(nueva.subtipo) : nueva.tipo === 'CASA' ? 'CASA' : undefined
  // SUPERFICIE_TOTAL se conserva aunque el catálogo de CASA no la liste: la sonda
  // real (2026-11-11) mostró que Argenprop la acepta y la guarda para CASA; filtrarla
  // haría perder la superficie total en un depto→casa.
  const caracteristicas = (base.Caracteristicas as { Id: string; Valor: string | number | boolean }[])
    .filter(c => caracteristicasAceptadas.has(c.Id) || c.Id === 'SUPERFICIE_TOTAL')
  const fotos = fotosFicha.length > 0
    ? fotosFicha.slice(0, AP_MAX_FOTOS_AVISO).map(Url => ({ Tipo: 'FOTO', Url }))
    : aviso.Multimedia.filter(m => m.Tipo === 'FOTO')
  return {
    ...base,
    Categoria: { Tipo: nueva.tipo, ...(subtipo ? { Subtipo: subtipo } : {}) },
    Caracteristicas: caracteristicas,
    Multimedia: [...fotos, ...aviso.Multimedia.filter(m => m.Tipo !== 'FOTO')],
  }
}

export const MENSAJE_ELIMINADO_SIN_REPUBLICAR =
  'El aviso de Argenprop se eliminó pero no se pudo volver a publicar. Publicalo desde el asistente de Argenprop.'

/** Lo que importa de un aviso que ya ocupa un Codigo. */
export interface AvisoExistente { idAviso: number; eliminado: boolean; tipo: string }

/** Cuántos códigos alternativos (…r2, …r3, …r4) se prueban antes de rendirse. */
export const MAX_CODIGOS_ALTERNATIVOS = 3

/**
 * `60U6_d8ca41a3347c` → `60U6_d8ca41a3347cr2`. La raíz es hexadecimal, así que la
 * `r` nunca aparece en ella: un código ya alternativo (`…r2`) sigue con `…r3`.
 */
export function partirCodigo(codigo: string): { raiz: string; n: number } {
  const m = codigo.match(/^(.*)r(\d+)$/)
  return m ? { raiz: m[1], n: Number(m[2]) } : { raiz: codigo, n: 1 }
}
export const codigoNumero = (raiz: string, n: number): string => (n <= 1 ? raiz : `${raiz}r${n}`)

function esYaExiste(err: unknown): boolean {
  const txt = `${err instanceof Error ? err.message : ''} ${err instanceof PortalAdapterError ? String(err.original ?? '') : ''}`
  return /ENT002|ya existe un aviso/i.test(txt)
}

/**
 * POST del aviso cuidando el Codigo. Argenprop deja un aviso ELIMINADO ocupando su
 * código: el POST responde ENT002 y un PUT encima responde PUB001 si cambió el
 * tipo (caso real: Olmos 585, 2026-11-11). Ese código ya no sirve → se publica con
 * el siguiente (`…r2`). Si el código lo ocupa un aviso VIVO, decide `siExisteVivo`
 * (el asistente lo actualiza; la republicación lo acepta solo si ya es del tipo nuevo).
 * Un error de lectura se propaga: nunca se publica a ciegas un posible duplicado.
 */
export async function publicarConCodigoLibre(
  deps: {
    publicar: (dto: Record<string, unknown>) => Promise<number | undefined>
    /** undefined = el código no tiene aviso (404 / ENT001). */
    leerExistente: (codigo: string) => Promise<AvisoExistente | undefined>
    siExisteVivo: (codigo: string, existente: AvisoExistente, dto: Record<string, unknown>) => Promise<number | undefined>
  },
  dto: Record<string, unknown>,
): Promise<{ avisoId: number | undefined; codigo: string }> {
  const { raiz, n: desde } = partirCodigo(String(dto.Codigo))
  let ultimo: unknown
  for (let n = desde; n <= desde + MAX_CODIGOS_ALTERNATIVOS; n++) {
    const codigo = codigoNumero(raiz, n)
    const conCodigo = { ...dto, Codigo: codigo }
    try {
      return { avisoId: await deps.publicar(conCodigo), codigo }
    } catch (err) {
      if (!esYaExiste(err)) throw err
      ultimo = err
      const existente = await deps.leerExistente(codigo)
      if (existente && !existente.eliminado) return { avisoId: await deps.siExisteVivo(codigo, existente, conCodigo), codigo }
      // Ocupado por un aviso eliminado: probar el código siguiente.
    }
  }
  const detalle = ultimo instanceof PortalAdapterError ? (ultimo.original ?? ultimo.message) : ultimo
  throw new PortalAdapterError(
    'Argenprop tiene ocupados los códigos de aviso de esta propiedad por avisos eliminados. Avisale al equipo técnico.',
    'argenprop', 'validation', false, detalle,
  )
}

/**
 * Eliminar + POST con reintento único. Las llamadas de red se inyectan.
 * Si el POST falla dos veces el aviso ya no existe: error claro con el crudo.
 * Devuelve el Codigo final: puede ser otro si el original quedó ocupado (ver
 * publicarConCodigoLibre).
 */
export async function republicarAviso(
  deps: {
    eliminar: () => Promise<void>
    publicar: (dto: Record<string, unknown>) => Promise<number | undefined>
    leerExistente: (codigo: string) => Promise<AvisoExistente | undefined>
  },
  dto: Record<string, unknown>,
): Promise<{ avisoId: number; codigo: string }> {
  await deps.eliminar()
  const tipoNuevo = (dto.Categoria as { Tipo?: string } | undefined)?.Tipo
  let ultimo: unknown
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await publicarConCodigoLibre({
        publicar: deps.publicar,
        leerExistente: deps.leerExistente,
        // Vivo con este código y ya del tipo nuevo: lo creó el intento anterior
        // (se perdió la respuesta). Vivo con el tipo VIEJO: no se eliminó → error.
        siExisteVivo: async (codigo, existente) => {
          if (existente.tipo === tipoNuevo) return existente.idAviso
          throw new Error(`El aviso ${codigo} sigue publicado como ${existente.tipo}`)
        },
      }, dto)
      if (typeof r.avisoId !== 'number') throw new Error('Argenprop no devolvió el IdAviso del aviso republicado')
      return { avisoId: r.avisoId, codigo: r.codigo }
    } catch (err) {
      ultimo = err
    }
  }
  const detalle = ultimo instanceof PortalAdapterError ? (ultimo.original ?? ultimo.message) : ultimo
  throw new PortalAdapterError(MENSAJE_ELIMINADO_SIN_REPUBLICAR, 'argenprop', 'unknown', false, detalle)
}
