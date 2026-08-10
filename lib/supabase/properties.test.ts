/**
 * La capa de datos de propiedades no tenía ni un test: todo lo que se verificaba
 * de ella era a través de rutas que la mockean entera. Acá hay un cliente de
 * Supabase falso —encadenable y con respuestas guionadas— para poder mirar
 * DOS cosas que ninguna otra prueba puede ver:
 *
 *  - que aprobar la documentación no se caiga por culpa del auto-avance (H4);
 *  - qué consulta arma el listado, que es donde vivía el filtro que nunca
 *    devolvía nada (D5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Respuesta { data?: unknown; error?: unknown; count?: number }
interface Op { op: string; args: unknown[] }

const { estado } = vi.hoisted(() => ({
  estado: {
    cola: [] as Array<{ data?: unknown; error?: unknown; count?: number }>,
    consultas: [] as Array<{ tabla: string; ops: Array<{ op: string; args: unknown[] }> }>,
  },
}))

vi.mock('@supabase/supabase-js', () => {
  function siguiente(): Respuesta {
    return estado.cola.shift() ?? { data: null, error: null }
  }
  function builder(tabla: string) {
    const ops: Op[] = []
    estado.consultas.push({ tabla, ops })
    // Un proxy: cualquier método de PostgREST encadena y registra; `then` cierra
    // la cadena con la próxima respuesta guionada.
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined
        if (prop === 'then') {
          return (ok: (r: Respuesta) => unknown, fail?: (e: unknown) => unknown) =>
            Promise.resolve(siguiente()).then(ok, fail)
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => { ops.push({ op: prop, args: [] }); return Promise.resolve(siguiente()) }
        }
        return (...args: unknown[]) => { ops.push({ op: prop, args }); return b }
      },
    })
    return b
  }
  return { createClient: () => ({ from: (tabla: string) => builder(tabla) }) }
})

const notificar = vi.fn(async () => {})
vi.mock('@/lib/email/notifications/property-captured', () => ({
  notifyPropertyCaptured: notificar,
}))

import { reviewProperty, getPropertiesListPage, getPropertiesPendientesDeRevisionLegal } from './properties'

/** Ops de la consulta N (en orden de creación). */
function ops(indice: number): Op[] {
  return estado.consultas[indice]?.ops ?? []
}
function tieneOp(indice: number, op: string, args?: unknown[]): boolean {
  return ops(indice).some(o => o.op === op && (args === undefined || JSON.stringify(o.args) === JSON.stringify(args)))
}

beforeEach(() => {
  estado.cola = []
  estado.consultas = []
  notificar.mockClear()
})

describe('reviewProperty — aprobar no puede caerse por el auto-avance (H4)', () => {
  /**
   * `checkAndAdvanceProperty` dispara los mails N8A/N8B y toca la base otra
   * vez. Sin try/catch, un fallo suyo le devolvía 500 al abogado sobre una
   * revisión que YA se había guardado: el abogado veía "Error al procesar
   * revisión" y volvía a apretar Aprobar sobre algo ya aprobado. Los otros dos
   * llamadores del avance (POST /api/properties y media/commit) sí lo envuelven.
   */
  it('si el auto-avance explota, la revisión ya guardada no se convierte en un error', async () => {
    estado.cola = [
      // getProperty de reviewProperty
      { data: { id: 'p1', status: 'pending_docs', legal_status: 'pending', photos: ['a.jpg'], captured_at: null } },
      // update del carril legal: OK
      { error: null },
      // getProperty de checkAndAdvanceProperty: se cae
      { data: null, error: { message: 'timeout' } },
    ]

    await expect(reviewProperty('p1', true, 'abogado-1', 'todo ok')).resolves.toBeUndefined()

    // Y la revisión sí se escribió.
    expect(tieneOp(1, 'update')).toBe(true)
    const update = ops(1).find(o => o.op === 'update')!.args[0] as Record<string, unknown>
    expect(update.legal_status).toBe('approved')
  })

  it('un fallo del UPDATE de la revisión SÍ tiene que llegar arriba', async () => {
    estado.cola = [
      { data: { id: 'p1', status: 'pending_docs', legal_status: 'pending', photos: [], captured_at: null } },
      { error: { message: 'no se pudo escribir' } },
    ]
    await expect(reviewProperty('p1', true, 'abogado-1')).rejects.toBeTruthy()
  })

  it('aprobar sobre una propiedad con fotos la capta y anuncia una sola vez', async () => {
    estado.cola = [
      { data: { id: 'p1', status: 'pending_docs', legal_status: 'pending', photos: ['a.jpg'], captured_at: null } },
      { error: null },
      // getProperty de checkAndAdvanceProperty
      { data: { id: 'p1', status: 'pending_docs', legal_status: 'approved', photos: ['a.jpg'], captured_at: null } },
      // reclamo atómico: gana
      { data: [{ id: 'p1' }], error: null },
    ]

    await reviewProperty('p1', true, 'abogado-1')
    expect(notificar).toHaveBeenCalledTimes(1)
  })

  it('rechazar no dispara el avance', async () => {
    estado.cola = [
      { data: { id: 'p1', status: 'pending_docs', legal_status: 'pending', photos: ['a.jpg'], captured_at: null } },
      { error: null },
    ]
    await reviewProperty('p1', false, 'abogado-1', 'Escritura vencida')
    expect(notificar).not.toHaveBeenCalled()
    // Solo las dos consultas de reviewProperty: getProperty + update.
    expect(estado.consultas).toHaveLength(2)
  })
})

describe('getPropertiesListPage — la cohorte «Pend. Fotos» (D5)', () => {
  const pagina = { limit: 24, offset: 0 }

  it('sin cohorte no agrega nada raro a la consulta', async () => {
    estado.cola = [{ data: [], count: 0 }]
    await getPropertiesListPage({}, pagina)
    expect(tieneOp(0, 'eq', ['photo_count', 0])).toBe(false)
    expect(tieneOp(0, 'in')).toBe(false)
  })

  /**
   * El desplegable ofrecía «Pend. Fotos» y consultaba `status='pending_photos'`,
   * un valor que ningún camino de la app escribe: devolvía siempre vacío. La
   * cohorte real son DOS condiciones, y una (`photo_count`) solo existe en la
   * vista.
   */
  it('la cohorte filtra por captación abierta Y sin fotos', async () => {
    estado.cola = [{ data: [], count: 0 }]
    await getPropertiesListPage({ cohorte: 'sin_fotos' }, pagina)

    expect(estado.consultas[0].tabla).toBe('vw_properties_list')
    expect(tieneOp(0, 'in', ['status', ['draft', 'pending_docs', 'pending_photos', 'pending_review']])).toBe(true)
    expect(tieneOp(0, 'eq', ['photo_count', 0])).toBe(true)
  })

  /**
   * Las banderas se piden POR LOS IDS de la página ya resuelta. Antes repetían
   * filtros + orden + `range` esperando caer en el mismo conjunto: en cuanto
   * apareció un filtro que solo la vista sabe contestar, esa simetría dejó de
   * ser posible y el merge habría quedado cojo (banderas de otras filas).
   */
  it('las banderas se piden por los ids de la página, no repitiendo el rango', async () => {
    estado.cola = [
      { data: [{ id: 'b' }, { id: 'a' }], count: 2 },
      { data: [{ id: 'a', legal_docs_pending: true, origin_pending: false }], error: null },
    ]

    const r = await getPropertiesListPage({ cohorte: 'sin_fotos' }, pagina)

    expect(estado.consultas[1].tabla).toBe('properties')
    expect(tieneOp(1, 'in', ['id', ['b', 'a']])).toBe(true)
    // Nada de re-filtrar ni de re-paginar la segunda consulta.
    expect(tieneOp(1, 'range')).toBe(false)
    expect(tieneOp(1, 'eq')).toBe(false)

    expect(r.data).toEqual([
      { id: 'b', legal_docs_pending: false, origin_pending: false },
      { id: 'a', legal_docs_pending: true, origin_pending: false },
    ])
    expect(r.total).toBe(2)
  })

  it('con la página vacía no gasta un segundo viaje', async () => {
    estado.cola = [{ data: [], count: 0 }]
    const r = await getPropertiesListPage({}, pagina)
    expect(estado.consultas).toHaveLength(1)
    expect(r.data).toEqual([])
    expect(r.hasMore).toBe(false)
  })
})

describe('getPropertiesPendientesDeRevisionLegal — la bandeja del abogado', () => {
  /**
   * La bandeja mostraba "0 docs" en TODAS las filas porque contaba
   * `properties.documents`, la columna que quedó huérfana en abril. Los
   * archivos del checklist viven en `legal_docs`.
   */
  it('cuenta los documentos de legal_docs, no la columna muerta', async () => {
    estado.cola = [{
      data: [
        {
          id: 'p1', address: 'Rivadavia 4820',
          legal_docs: {
            escritura: { file_url: 'https://x/e.pdf', status: 'pending' },
            dni_titulares: { file_url: 'https://x/d.pdf', status: 'pending' },
            plano: { status: 'missing' },
          },
        },
        { id: 'p2', address: 'Junín 1200', legal_docs: {} },
      ],
      count: 2,
    }]

    const { data, total } = await getPropertiesPendientesDeRevisionLegal()

    expect(total).toBe(2)
    expect((data[0] as { documentos_cargados: number }).documentos_cargados).toBe(2)
    expect((data[1] as { documentos_cargados: number }).documentos_cargados).toBe(0)
    // Y `legal_docs` (que puede ser grande) no viaja al navegador.
    expect(data[0]).not.toHaveProperty('legal_docs')
  })

  it('pide solo lo enviado y todavía sin resolver', async () => {
    estado.cola = [{ data: [], count: 0 }]
    await getPropertiesPendientesDeRevisionLegal()
    expect(tieneOp(0, 'eq', ['legal_status', 'pending'])).toBe(true)
    expect(tieneOp(0, 'not', ['legal_submitted_at', 'is', null])).toBe(true)
  })
})
