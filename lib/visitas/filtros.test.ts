import { describe, it, expect } from 'vitest'
import { leerFiltrosLista, leerFiltrosResumen } from './filtros'

const AHORA = new Date('2026-10-15T15:00:00.000Z')
const ASESOR = '22222222-2222-4222-8222-222222222222'
const PROP = '33333333-3333-4333-8333-333333333333'
const sp = (q: string) => new URLSearchParams(q)

function lista(q: string) {
  const r = leerFiltrosLista(sp(q), AHORA)
  if (!r.ok) throw new Error(r.error)
  return r.valor
}

describe('leerFiltrosLista', () => {
  it('sin parámetros: todo abierto, página 1 de 50', () => {
    expect(lista('')).toEqual({ asesorId: null, propiedadId: null, origen: null, desdeInstante: null, hastaInstante: null, estados: null, pagina: 1, porPagina: 50 })
  })
  it('un día se convierte en el día ARGENTINO completo', () => {
    expect(lista('desde=2026-10-01&hasta=2026-10-31')).toMatchObject({
      desdeInstante: '2026-10-01T00:00:00.000-03:00', hastaInstante: '2026-10-31T23:59:59.999999-03:00',
    })
  })
  it('alias viejos de /inicio y /tasks: from/to con instante, advisor_id, property_id, status', () => {
    expect(lista(`from=2026-10-15T03:00:00.000Z&to=2026-10-16T02:59:59.999Z&advisor_id=${ASESOR}&property_id=${PROP}&status=scheduled`)).toMatchObject({
      desdeInstante: '2026-10-15T03:00:00.000Z', hastaInstante: '2026-10-16T02:59:59.999Z',
      asesorId: ASESOR, propiedadId: PROP, estados: ['scheduled'],
    })
  })
  it('los nombres nuevos ganan sobre los viejos', () => {
    expect(lista(`asesor=${ASESOR}&advisor_id=11111111-1111-4111-8111-111111111111`).asesorId).toBe(ASESOR)
  })
  it('activas y sin_resultado; sin_resultado recorta el "hasta" a ahora', () => {
    expect(lista('estado=activas').estados).toEqual(['pending_confirmation', 'scheduled'])
    expect(lista('estado=sin_resultado')).toMatchObject({ estados: ['pending_confirmation', 'scheduled'], hastaInstante: '2026-10-15T15:00:00.000Z' })
    expect(lista('estado=sin_resultado&hasta=2026-10-01').hastaInstante).toBe('2026-10-01T23:59:59.999999-03:00')
  })
  it('origen del catálogo o sin_origen', () => {
    expect(lista('origen=portal').origen).toBe('portal')
    expect(lista('origen=sin_origen').origen).toBe('sin_origen')
  })
  it('paginado con límites', () => {
    expect(lista('pagina=3&porPagina=25')).toMatchObject({ pagina: 3, porPagina: 25 })
  })
  it('errores en castellano, sin llegar a la base', () => {
    const error = (q: string) => { const r = leerFiltrosLista(sp(q), AHORA); return r.ok ? null : r.error }
    expect(error('asesor=abc')).toBe('El asesor no es válido')
    expect(error('propiedad=1,2')).toBe('La propiedad no es válida')
    expect(error('origen=google')).toBe('El origen no es válido')
    expect(error('estado=borrada')).toBe('El estado no es válido')
    expect(error('desde=2026-02-31')).toBe('La fecha "desde" no es válida')
    expect(error('hasta=mañana')).toBe('La fecha "hasta" no es válida')
    expect(error('pagina=0')).toBe('La página no es válida')
    expect(error('porPagina=500')).toBe('La cantidad por página no es válida')
    expect(error('pagina=1.5')).toBe('La página no es válida')
  })
})

describe('leerFiltrosResumen', () => {
  it('exige el período en días', () => {
    const r = leerFiltrosResumen(sp(`desde=2026-09-16&hasta=2026-10-15&origen=cartel&asesor=${ASESOR}`))
    expect(r).toEqual({ ok: true, valor: { desde: '2026-09-16', hasta: '2026-10-15', origen: 'cartel', asesorId: ASESOR, propiedadId: null } })
  })
  it('sin período, invertido o de más de un año: error', () => {
    expect(leerFiltrosResumen(sp(''))).toEqual({ ok: false, error: 'Elegí las dos fechas del período' })
    expect(leerFiltrosResumen(sp('desde=2026-10-10&hasta=2026-10-01'))).toEqual({ ok: false, error: 'La fecha "desde" es posterior a "hasta"' })
    expect(leerFiltrosResumen(sp('desde=2024-01-01&hasta=2026-10-01'))).toEqual({ ok: false, error: 'Elegí un período de hasta un año' })
  })
})
