import { describe, it, expect, vi } from 'vitest'
import {
  sincronizarMl as sincronizarMlReal,
  sincronizarAp as sincronizarApReal,
  fusionarMetadata,
  precioDeFicha,
  MENSAJE_PRECIO_INVALIDO,
  MENSAJE_AVISO_CAMBIO,
  diferenciasDePortales,
  limiteReclamo,
  MENSAJE_EN_CURSO,
  type DepsMl,
  type DepsAp,
  type DepsComunes,
  type FichaSincronizable,
  type ListingSincronizable,
} from './sincronizar-portal'
import type { MlItemVivo } from './mercadolibre/edicion'
import type { MlRawAttribute } from './mercadolibre/category-attributes'
import type { ApAvisoVivo } from './argenprop/edicion'
import { MENSAJE_ELIMINADO_SIN_REPUBLICAR } from './argenprop/cambio-categoria'
import { PortalAdapterError } from './types'

const fichaDepto: FichaSincronizable = {
  property_type: 'departamento', operation_type: 'venta', asking_price: 79000, currency: 'USD',
  photos: ['https://cdn/a.jpg', 'data:image/png;base64,xxx', 'https://cdn/b.jpg'],
}

// Por defecto la relectura tras reservar devuelve el mismo listing que se pasó
// (nadie lo cambió). Los tests que quieren otro comportamiento lo pisan.
const releerEco = new WeakSet<DepsComunes>()
function sincronizarMl(deps: DepsMl, entrada: Parameters<typeof sincronizarMlReal>[1]) {
  if (releerEco.has(deps)) vi.mocked(deps.releerListing).mockImplementation(async () => entrada.listing)
  return sincronizarMlReal(deps, entrada)
}
function sincronizarAp(deps: DepsAp, entrada: Parameters<typeof sincronizarApReal>[1]) {
  if (releerEco.has(deps)) vi.mocked(deps.releerListing).mockImplementation(async () => entrada.listing)
  return sincronizarApReal(deps, entrada)
}

function comunes() {
  const llamadas: string[] = []
  const deps: DepsComunes = {
    guardarListing: vi.fn(async () => { llamadas.push('guardarListing') }),
    sincronizarMapa: vi.fn(async () => { llamadas.push('sincronizarMapa') }),
    auditar: vi.fn(async () => { llamadas.push('auditar') }),
    ahora: () => '2026-11-11T12:00:00.000Z',
    reclamar: vi.fn(async () => { llamadas.push('reclamar'); return true }),
    liberar: vi.fn(async () => { llamadas.push('liberar') }),
    releerListing: vi.fn(async () => null),
  }
  return { deps, llamadas }
}

// ─── MercadoLibre ──────────────────────────────────────────────────────────

const itemDepto: MlItemVivo = {
  id: 'MLA1', title: 'Depto', status: 'active', category_id: 'MLA401686', price: 79000, currency_id: 'USD',
  permalink: 'https://ml/MLA1',
  attributes: [{ id: 'ROOMS', value_id: null, value_name: '3' }],
}

const rawCasa: MlRawAttribute[] = [
  { id: 'PROPERTY_TYPE', name: 'Tipo', value_type: 'list', tags: { fixed: true }, values: [{ id: '242062', name: 'Casa' }] },
  { id: 'ROOMS', name: 'Ambientes', value_type: 'number' },
]

const listingMl: ListingSincronizable = {
  id: 'L1', status: 'published', external_id: 'MLA1', external_url: 'https://ml/MLA1',
  metadata: { ml_attributes: { ROOMS: { value_name: '3' }, OPERATION_SUBTYPE: { value_id: 'x' } }, listing_type: 'silver', media_choice: 'video' },
}

function depsMl(over: Partial<DepsMl> = {}) {
  const c = comunes()
  const llamadas = c.llamadas
  const deps: DepsMl = {
    leerAviso: vi.fn(async () => itemDepto),
    atributosDeCategoria: vi.fn(async () => rawCasa),
    idsAceptados: vi.fn(async () => new Set(['ROOMS'])),
    cambiarEnElLugar: vi.fn(async () => { llamadas.push('cambiarEnElLugar') }),
    publicarReemplazo: vi.fn(async () => { llamadas.push('publicarReemplazo'); return { externalId: 'MLA2', externalUrl: 'https://ml/MLA2', metadata: { listingTypeUsed: 'silver' } } }),
    cerrar: vi.fn(async () => { llamadas.push('cerrar') }),
    ...c.deps,
    ...over,
  }
  if (!over.releerListing) releerEco.add(deps)
  return { deps, llamadas }
}

describe('sincronizarMl', () => {
  it('sin categoría para la ficha → error claro y no toca ML', async () => {
    const { deps } = depsMl()
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'cochera', operation_type: 'temporario' }, listing: listingMl })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/MercadoLibre no tiene una categoría para/)
    expect(r.error).toMatch(/revisá el tipo y la operación de la ficha/)
    expect(deps.leerAviso).not.toHaveBeenCalled()
    expect(deps.cambiarEnElLugar).not.toHaveBeenCalled()
  })

  it('ya coincide → nada, sin escribir', async () => {
    const { deps } = depsMl()
    const r = await sincronizarMl(deps, { ficha: fichaDepto, listing: listingMl })
    expect(r).toMatchObject({ ok: true, accion: 'nada' })
    expect(deps.cambiarEnElLugar).not.toHaveBeenCalled()
  })

  it('solo precio → PUT de price+currency_id, sin categoría ni atributos', async () => {
    const { deps } = depsMl()
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, asking_price: 75000 }, listing: listingMl })
    expect(r).toMatchObject({ ok: true, accion: 'actualizado', externalUrl: 'https://ml/MLA1' })
    expect(deps.cambiarEnElLugar).toHaveBeenCalledWith('MLA1', { price: 75000, currency_id: 'USD' })
    expect(deps.atributosDeCategoria).not.toHaveBeenCalled()
    expect(deps.auditar).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'updated',
      payload: expect.objectContaining({ origen: 'sincronizar', accion: 'precio' }),
    }))
  })

  it('tipo + precio → UN solo PUT con categoría, fijos y precio', async () => {
    const { deps } = depsMl()
    await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa', asking_price: 75000 }, listing: listingMl })
    expect(deps.cambiarEnElLugar).toHaveBeenCalledTimes(1)
    const body = vi.mocked(deps.cambiarEnElLugar).mock.calls[0][1]
    expect(body.category_id).toBe('MLA401685')
    expect(body.price).toBe(75000)
    expect(body.currency_id).toBe('USD')
    expect(deps.atributosDeCategoria).toHaveBeenCalledWith('MLA401685')
  })

  it('ML rechaza el cambio de categoría → error con plan B, auditado failed', async () => {
    const { deps } = depsMl({
      cambiarEnElLugar: vi.fn(async () => { throw new PortalAdapterError('ML rechazó el cambio', 'mercadolibre', 'validation', false, 'ML 400 crudo') }),
    })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl })
    expect(r).toMatchObject({ ok: false, error: 'ML rechazó el cambio', planBDisponible: true, status: 409 })
    expect(deps.auditar).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'failed', errorMessage: expect.stringContaining('ML 400 crudo') }))
    expect(deps.guardarListing).not.toHaveBeenCalled()
  })

  it('categoría nueva sin atributos → no manda el PUT', async () => {
    const { deps } = depsMl({ atributosDeCategoria: vi.fn(async () => []) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl })
    expect(r.ok).toBe(false)
    expect(deps.cambiarEnElLugar).not.toHaveBeenCalled()
  })

  it('plan B: publica, DESPUÉS cierra el viejo, y apunta listing y mapa al nuevo', async () => {
    const { deps, llamadas } = depsMl()
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    expect(r).toMatchObject({ ok: true, accion: 'reemplazado', externalUrl: 'https://ml/MLA2' })
    expect(llamadas.indexOf('publicarReemplazo')).toBeLessThan(llamadas.indexOf('cerrar'))
    expect(deps.cerrar).toHaveBeenCalledWith('MLA1')
    expect(deps.cambiarEnElLugar).not.toHaveBeenCalled()
    // Opciones del borrador, con los atributos filtrados a los que acepta la categoría NUEVA.
    expect(deps.idsAceptados).toHaveBeenCalledWith('MLA401685')
    const opts = vi.mocked(deps.publicarReemplazo).mock.calls[0][0]
    expect(opts.attributeOverrides).toEqual({ ROOMS: { value_name: '3' } })
    expect(opts.listingType).toBe('silver')
    expect(opts.mediaChoice).toBe('video')
    expect(opts.allowedAttributeIds).toEqual(new Set(['ROOMS']))
    expect(deps.guardarListing).toHaveBeenCalledWith(expect.objectContaining({
      status: 'published', external_id: 'MLA2', external_url: 'https://ml/MLA2',
      last_published_at: '2026-11-11T12:00:00.000Z', last_error: null,
      metadata: { poner: { reemplaza_a: 'MLA1', listing_type: 'silver', needs_picture_check: true }, quitar: ['reemplazo_pendiente'] },
    }))
    expect(deps.sincronizarMapa).toHaveBeenCalledWith('MLA2', 'https://ml/MLA2')
  })

  it('plan B: si publicar falla, NUNCA cierra el viejo ni toca el listing', async () => {
    const { deps } = depsMl({ publicarReemplazo: vi.fn(async () => { throw new Error('sin cupo') }) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    expect(r).toMatchObject({ ok: false, error: 'sin cupo' })
    expect(deps.cerrar).not.toHaveBeenCalled()
    expect(deps.guardarListing).not.toHaveBeenCalled()
    expect(deps.sincronizarMapa).not.toHaveBeenCalled()
    expect(deps.auditar).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'failed' }))
  })

  it('plan B: publicó pero no pudo cerrar el viejo → igual apunta al nuevo y avisa', async () => {
    const { deps } = depsMl({ cerrar: vi.fn(async () => { throw new Error('no se pudo cerrar') }) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mensaje).toMatch(/MLA1/)
    expect(deps.guardarListing).toHaveBeenCalledWith(expect.objectContaining({ external_id: 'MLA2' }))
  })

  it('plan B sin cambio de tipo/operación → no publica nada', async () => {
    const { deps } = depsMl()
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, asking_price: 1 }, listing: listingMl, planB: true })
    expect(r.ok).toBe(false)
    expect(deps.publicarReemplazo).not.toHaveBeenCalled()
  })

  it('aviso cerrado en ML → error, sin escribir', async () => {
    const { deps } = depsMl({ leerAviso: vi.fn(async () => ({ ...itemDepto, status: 'closed' })) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, asking_price: 1 }, listing: listingMl })
    expect(r.ok).toBe(false)
    expect(deps.cambiarEnElLugar).not.toHaveBeenCalled()
  })
})

// ─── Argenprop ─────────────────────────────────────────────────────────────

const avisoDepto: ApAvisoVivo = {
  Codigo: '60U6_abc', IdAviso: 10, Titulo: 'T', Descripcion: 'D', AptoCredito: true, AceptaPermuta: false,
  Categoria: { Tipo: 'DEPARTAMENTO' },
  Publicacion: { Visible: true },
  Precio: { Monto: 79000, Moneda: 'USD', Operacion: 'VENTA', Mostrar: true },
  Caracteristicas: [{ Id: 'AMBIENTES', Valor: 3 }, { Id: 'DISPOSICION', Valor: 'FRENTE' }],
  Multimedia: [{ Tipo: 'FOTO', Url: 'https://vivo/1.jpg' }],
  Localizacion: { Localidad: { Id: 'LOC' } },
}

const listingAp: ListingSincronizable = {
  id: 'L2', status: 'published', external_id: '60U6_abc', external_url: 'https://www.argenprop.com/departamento-en-venta--10',
  metadata: { aviso_id: 10, codigo: '60U6_abc' },
}

function depsAp(over: Partial<DepsAp> = {}) {
  const c = comunes()
  const llamadas = c.llamadas
  const deps: DepsAp = {
    leerAviso: vi.fn(async () => avisoDepto),
    idAnunciante: () => 7,
    caracteristicasDeCategoria: vi.fn(async () => { llamadas.push('caracteristicas'); return new Set(['AMBIENTES']) }),
    republicar: vi.fn(async () => { llamadas.push('republicar'); return { avisoId: 99 } }),
    enviarAviso: vi.fn(async () => { llamadas.push('enviarAviso') }),
    suspender: vi.fn(async () => { llamadas.push('suspender') }),
    urlPublica: (avisoId: number) => `https://www.argenprop.com/casa-en-venta--${avisoId}`,
    ...c.deps,
    ...over,
  }
  if (!over.releerListing) releerEco.add(deps)
  return { deps, llamadas }
}

describe('sincronizarAp', () => {
  it('ya coincide → nada', async () => {
    const { deps } = depsAp()
    const r = await sincronizarAp(deps, { ficha: fichaDepto, listing: listingAp })
    expect(r).toMatchObject({ ok: true, accion: 'nada' })
    expect(deps.enviarAviso).not.toHaveBeenCalled()
    expect(deps.republicar).not.toHaveBeenCalled()
  })

  it('solo precio → PUT del aviso completo con el precio nuevo, sin republicar', async () => {
    const { deps } = depsAp()
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, asking_price: 75000 }, listing: listingAp })
    expect(r).toMatchObject({ ok: true, accion: 'actualizado' })
    const dto = vi.mocked(deps.enviarAviso).mock.calls[0][0]
    expect(dto).toMatchObject({ Codigo: '60U6_abc', Categoria: { Tipo: 'DEPARTAMENTO' }, Precio: { Monto: 75000, Moneda: 'USD', Operacion: 'VENTA' } })
    expect(deps.republicar).not.toHaveBeenCalled()
    expect(deps.caracteristicasDeCategoria).not.toHaveBeenCalled()
  })

  it('operación a alquiler → PUT con AptoCredito false', async () => {
    const { deps } = depsAp()
    await sincronizarAp(deps, { ficha: { ...fichaDepto, operation_type: 'alquiler' }, listing: listingAp })
    expect(vi.mocked(deps.enviarAviso).mock.calls[0][0]).toMatchObject({ AptoCredito: false, Precio: { Operacion: 'ALQUILER' } })
  })

  it('tipo → catálogo PRIMERO, después republica con fotos válidas de la ficha, y apunta al IdAviso nuevo', async () => {
    const { deps, llamadas } = depsAp()
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(r).toMatchObject({ ok: true, accion: 'republicado', externalUrl: 'https://www.argenprop.com/casa-en-venta--99' })
    expect(llamadas.indexOf('caracteristicas')).toBeLessThan(llamadas.indexOf('republicar'))
    expect(deps.caracteristicasDeCategoria).toHaveBeenCalledWith('CASA')
    const [codigo, dto] = vi.mocked(deps.republicar).mock.calls[0]
    expect(codigo).toBe('60U6_abc')
    expect(dto).toMatchObject({ Categoria: { Tipo: 'CASA' }, Caracteristicas: [{ Id: 'AMBIENTES', Valor: 3 }] })
    expect(dto.Multimedia).toEqual([{ Tipo: 'FOTO', Url: 'https://cdn/a.jpg' }, { Tipo: 'FOTO', Url: 'https://cdn/b.jpg' }])
    expect(deps.guardarListing).toHaveBeenCalledWith(expect.objectContaining({
      external_url: 'https://www.argenprop.com/casa-en-venta--99', last_error: null,
      metadata: { poner: { aviso_id: 99, codigo: '60U6_abc' } },
    }))
    expect(deps.sincronizarMapa).toHaveBeenCalledWith('99', 'https://www.argenprop.com/casa-en-venta--99')
  })

  it('tipo + precio → UNA republicación que lleva el precio nuevo', async () => {
    const { deps } = depsAp()
    await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa', asking_price: 75000, operation_type: 'alquiler' }, listing: listingAp })
    expect(deps.republicar).toHaveBeenCalledTimes(1)
    expect(deps.enviarAviso).not.toHaveBeenCalled()
    expect(vi.mocked(deps.republicar).mock.calls[0][1]).toMatchObject({ Precio: { Monto: 75000, Operacion: 'ALQUILER' }, AptoCredito: false })
  })

  it('error del catálogo ANTES de eliminar → aviso intacto, listing sin tocar', async () => {
    const { deps } = depsAp({ caracteristicasDeCategoria: vi.fn(async () => { throw new Error('catálogo caído') }) })
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(r).toMatchObject({ ok: false, error: 'catálogo caído' })
    expect(deps.republicar).not.toHaveBeenCalled()
    expect(deps.guardarListing).not.toHaveBeenCalled()
    expect(deps.auditar).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'failed' }))
  })

  it('eliminado y no republicado → listing failed con el detalle y mensaje claro', async () => {
    const err = new PortalAdapterError(MENSAJE_ELIMINADO_SIN_REPUBLICAR, 'argenprop', 'unknown', false, 'AP 500 crudo')
    const { deps } = depsAp({ republicar: vi.fn(async () => { throw err }) })
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(r).toMatchObject({ ok: false, error: MENSAJE_ELIMINADO_SIN_REPUBLICAR })
    expect(deps.guardarListing).toHaveBeenCalledWith({ status: 'failed', last_error: expect.stringContaining('AP 500 crudo') })
    expect(deps.sincronizarMapa).not.toHaveBeenCalled()
  })

  it('falla al eliminar (el aviso sigue) → no marca failed', async () => {
    const { deps } = depsAp({ republicar: vi.fn(async () => { throw new Error('no se pudo eliminar') }) })
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(r.ok).toBe(false)
    expect(deps.guardarListing).not.toHaveBeenCalled()
  })

  it('sin fotos válidas en la ficha → conserva las FOTO vivas', async () => {
    const { deps } = depsAp()
    await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa', photos: [] }, listing: listingAp })
    expect(vi.mocked(deps.republicar).mock.calls[0][1].Multimedia).toEqual([{ Tipo: 'FOTO', Url: 'https://vivo/1.jpg' }])
  })

  it('aviso eliminado en Argenprop → error, sin escribir', async () => {
    const { deps } = depsAp({ leerAviso: vi.fn(async () => ({ ...avisoDepto, Publicacion: { Visible: false, EstadoPublicacion: 'Eliminado' } })) })
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, asking_price: 1 }, listing: listingAp })
    expect(r.ok).toBe(false)
    expect(deps.enviarAviso).not.toHaveBeenCalled()
  })
})

describe('diferenciasDePortales', () => {
  it('un portal caído vuelve con su error y el otro igual responde', async () => {
    const listings = [
      { portal: 'mercadolibre' as const, external_url: 'https://ml/MLA1', status: 'published' },
      { portal: 'argenprop' as const, external_url: 'https://ap/10', status: 'paused' },
    ]
    const filas = await diferenciasDePortales(listings, async l => {
      if (l.portal === 'mercadolibre') throw new PortalAdapterError('MercadoLibre no responde', 'mercadolibre', 'network', true, 'ETIMEDOUT')
      return { portal: 'argenprop', diferencias: [{ campo: 'tipo', antes: 'Departamento', despues: 'Casa' }], accion: 'republicar' }
    })
    expect(filas).toEqual([
      { portal: 'mercadolibre', error: 'MercadoLibre no responde' },
      { portal: 'argenprop', diferencias: [{ campo: 'tipo', antes: 'Departamento', despues: 'Casa' }], accion: 'republicar', externalUrl: 'https://ap/10', estado: 'paused' },
    ])
  })
})

// ─── Fix round 1 ───────────────────────────────────────────────────────────

describe('reserva del listing', () => {
  const ahora = new Date('2026-11-11T12:00:00.000Z')
  it('limiteReclamo = ahora − 3 min', () => {
    expect(limiteReclamo(ahora)).toBe('2026-11-11T11:57:00.000Z')
  })
  it('ML: si no se puede reservar → 409 y ninguna llamada al portal', async () => {
    const { deps } = depsMl({ reclamar: vi.fn(async () => false) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    expect(r).toMatchObject({ ok: false, error: MENSAJE_EN_CURSO, status: 409 })
    expect(deps.leerAviso).not.toHaveBeenCalled()
    expect(deps.publicarReemplazo).not.toHaveBeenCalled()
    expect(deps.liberar).not.toHaveBeenCalled()
  })
  it('AP: si no se puede reservar → 409 y ninguna llamada al portal', async () => {
    const { deps } = depsAp({ reclamar: vi.fn(async () => false) })
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(r).toMatchObject({ ok: false, error: MENSAJE_EN_CURSO, status: 409 })
    expect(deps.leerAviso).not.toHaveBeenCalled()
    expect(deps.republicar).not.toHaveBeenCalled()
  })
  it('libera la reserva al terminar, haya salido bien o mal', async () => {
    const bien = depsMl()
    await sincronizarMl(bien.deps, { ficha: { ...fichaDepto, asking_price: 1 }, listing: listingMl })
    expect(bien.llamadas[0]).toBe('reclamar')
    expect(bien.llamadas.at(-1)).toBe('liberar')
    const mal = depsAp({ leerAviso: vi.fn(async () => { throw new Error('caído') }) })
    await sincronizarAp(mal.deps, { ficha: fichaDepto, listing: listingAp })
    expect(mal.deps.liberar).toHaveBeenCalledTimes(1)
  })
})

describe('avisos pausados', () => {
  it('AP republicado de un listing pausado → se vuelve a suspender y la base sigue paused', async () => {
    const { deps, llamadas } = depsAp()
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: { ...listingAp, status: 'paused' } })
    expect(r.ok).toBe(true)
    expect(deps.suspender).toHaveBeenCalledWith('60U6_abc')
    expect(llamadas.indexOf('republicar')).toBeLessThan(llamadas.indexOf('suspender'))
    expect(vi.mocked(deps.guardarListing).mock.calls[0][0]).not.toHaveProperty('status')
  })
  it('AP publicado → no suspende', async () => {
    const { deps } = depsAp()
    await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(deps.suspender).not.toHaveBeenCalled()
  })
  it('ML plan B de un listing pausado → status paused y needs_pause_after_active', async () => {
    const { deps } = depsMl()
    await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: { ...listingMl, status: 'paused' }, planB: true })
    expect(deps.guardarListing).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'paused', external_id: 'MLA2',
      metadata: expect.objectContaining({ poner: expect.objectContaining({ needs_pause_after_active: true }) }),
    }))
  })
})

describe('plan B robusto', () => {
  it('anota reemplazo_pendiente ANTES de cerrar el viejo y lo borra al final', async () => {
    const { deps, llamadas } = depsMl()
    await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    const guardados = vi.mocked(deps.guardarListing).mock.calls.map(c => c[0])
    expect(guardados[0]).toEqual({ metadata: { poner: { reemplazo_pendiente: { nuevo: 'MLA2', url: 'https://ml/MLA2', desde: 'MLA1', listingType: 'silver' } } } })
    expect(llamadas.indexOf('guardarListing')).toBeLessThan(llamadas.indexOf('cerrar'))
    expect(guardados[1].metadata?.quitar).toEqual(['reemplazo_pendiente'])
  })
  it('reanuda un reemplazo a medias: cierra el viejo y apunta al nuevo, SIN publicar un tercero', async () => {
    const { deps } = depsMl()
    const listing = { ...listingMl, metadata: { ...listingMl.metadata, reemplazo_pendiente: { nuevo: 'MLA2', url: 'https://ml/MLA2', desde: 'MLA1' } } }
    const r = await sincronizarMl(deps, { ficha: fichaDepto, listing })
    expect(r).toMatchObject({ ok: true, accion: 'reemplazado', externalUrl: 'https://ml/MLA2' })
    expect(deps.publicarReemplazo).not.toHaveBeenCalled()
    expect(deps.cerrar).toHaveBeenCalledWith('MLA1')
    const final = vi.mocked(deps.guardarListing).mock.calls.at(-1)?.[0]
    expect(final).toMatchObject({ external_id: 'MLA2', external_url: 'https://ml/MLA2', metadata: { poner: { reemplaza_a: 'MLA1' }, quitar: ['reemplazo_pendiente'] } })
    expect(deps.sincronizarMapa).toHaveBeenCalledWith('MLA2', 'https://ml/MLA2')
  })
  it('reanudando, si el viejo ya está cerrado no lo vuelve a cerrar', async () => {
    const { deps } = depsMl({ leerAviso: vi.fn(async () => ({ ...itemDepto, status: 'closed' })) })
    const listing = { ...listingMl, metadata: { reemplazo_pendiente: { nuevo: 'MLA2', url: 'https://ml/MLA2', desde: 'MLA1' } } }
    const r = await sincronizarMl(deps, { ficha: fichaDepto, listing })
    expect(r.ok).toBe(true)
    expect(deps.cerrar).not.toHaveBeenCalled()
  })
  it('la categoría nueva sin campos aceptados → falla ANTES de publicar', async () => {
    const { deps } = depsMl({ idsAceptados: vi.fn(async () => new Set<string>()) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    expect(r.ok).toBe(false)
    expect(deps.publicarReemplazo).not.toHaveBeenCalled()
    expect(deps.cerrar).not.toHaveBeenCalled()
  })
})

describe('Argenprop eliminado sin republicar y la base caída', () => {
  it('igual devuelve el mensaje claro', async () => {
    const err = new PortalAdapterError(MENSAJE_ELIMINADO_SIN_REPUBLICAR, 'argenprop', 'unknown', false, 'crudo')
    const { deps } = depsAp({
      republicar: vi.fn(async () => { throw err }),
      guardarListing: vi.fn(async () => { throw new Error('db caída') }),
    })
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(r).toMatchObject({ ok: false, error: MENSAJE_ELIMINADO_SIN_REPUBLICAR })
  })
})

describe('ML sin currency_id', () => {
  it('mismo monto y ficha en ARS → nada (no inventa un cambio de moneda)', async () => {
    const { currency_id: _omitida, ...sinMoneda } = itemDepto
    void _omitida
    const { deps } = depsMl({ leerAviso: vi.fn(async () => sinMoneda) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, currency: 'ARS' }, listing: listingMl })
    expect(r).toMatchObject({ ok: true, accion: 'nada' })
    expect(deps.cambiarEnElLugar).not.toHaveBeenCalled()
  })
})

// ─── Fix round 2 ───────────────────────────────────────────────────────────

describe('fusionarMetadata', () => {
  it('una marca que agregó otro entre la lectura y la escritura sobrevive', () => {
    const fresca = { listing_type: 'silver', needs_update: true, cambios_ficha: ['expensas'], sync_en_curso: 't1', reemplazo_pendiente: { nuevo: 'MLA2' } }
    const out = fusionarMetadata(fresca, { poner: { reemplaza_a: 'MLA1', needs_pause_after_active: true }, quitar: ['reemplazo_pendiente'] })
    expect(out).toEqual({
      listing_type: 'silver', needs_update: true, cambios_ficha: ['expensas'], sync_en_curso: 't1',
      reemplaza_a: 'MLA1', needs_pause_after_active: true,
    })
  })
  it('metadata fresca nula o rara → parte de vacío', () => {
    expect(fusionarMetadata(null, { poner: { a: 1 } })).toEqual({ a: 1 })
    expect(fusionarMetadata([1, 2], {})).toEqual({})
  })
})

describe('relectura tras reservar', () => {
  it('si el aviso cambió de id (otro terminó un plan B) → 409, sin tocar el portal, y libera', async () => {
    const { deps } = depsMl({ releerListing: vi.fn(async () => ({ ...listingMl, external_id: 'MLA9' })) })
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    expect(r).toMatchObject({ ok: false, error: MENSAJE_AVISO_CAMBIO, status: 409 })
    expect(deps.leerAviso).not.toHaveBeenCalled()
    expect(deps.publicarReemplazo).not.toHaveBeenCalled()
    expect(deps.liberar).toHaveBeenCalledTimes(1)
  })
  it('si la fila ya no está publicada/pausada → 409', async () => {
    const { deps } = depsAp({ releerListing: vi.fn(async () => ({ ...listingAp, status: 'failed' })) })
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingAp })
    expect(r).toMatchObject({ ok: false, error: MENSAJE_AVISO_CAMBIO })
    expect(deps.republicar).not.toHaveBeenCalled()
  })
  it('usa la fila releída: un pausado que la UI vio publicado igual queda pausado', async () => {
    const { deps } = depsMl({ releerListing: vi.fn(async () => ({ ...listingMl, status: 'paused' })) })
    await sincronizarMl(deps, { ficha: { ...fichaDepto, property_type: 'casa' }, listing: listingMl, planB: true })
    expect(deps.guardarListing).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'paused' }))
  })
})

describe('precio de la ficha inválido', () => {
  it('precioDeFicha devuelve null con NaN, 0, negativo o ausente', () => {
    expect(precioDeFicha({ ...fichaDepto, asking_price: NaN })).toBeNull()
    expect(precioDeFicha({ ...fichaDepto, asking_price: 0 })).toBeNull()
    expect(precioDeFicha({ ...fichaDepto, asking_price: -5 })).toBeNull()
    expect(precioDeFicha(JSON.parse('{"currency":"USD"}'))).toBeNull()
    expect(precioDeFicha({ ...fichaDepto, asking_price: 75000 })).toEqual({ monto: 75000, moneda: 'USD' })
    expect(MENSAJE_PRECIO_INVALIDO).toMatch(/precio de la ficha no es válido/)
  })
  it('ML con precio 0: no escribe ningún precio', async () => {
    const { deps } = depsMl()
    const r = await sincronizarMl(deps, { ficha: { ...fichaDepto, asking_price: 0 }, listing: listingMl })
    expect(r).toMatchObject({ ok: true, accion: 'nada' })
    expect(deps.cambiarEnElLugar).not.toHaveBeenCalled()
  })
  it('Argenprop con precio NaN: no escribe ningún precio', async () => {
    const { deps } = depsAp()
    const r = await sincronizarAp(deps, { ficha: { ...fichaDepto, asking_price: NaN }, listing: listingAp })
    expect(r).toMatchObject({ ok: true, accion: 'nada' })
    expect(deps.enviarAviso).not.toHaveBeenCalled()
  })
})
