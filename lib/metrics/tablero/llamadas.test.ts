import { describe, expect, it, vi } from 'vitest'
import { DIA_INICIO_MEDICION, pisoDeLectura, seccionLlamadas, solicitudesMedidas } from './llamadas'
import type { Persona } from '../panel/personas'

const persona = (dealId: string, solicitud: string, o: Partial<Persona> = {}): Persona => ({
  embudo: 'tasacion', dealId, contactId: `c-${dealId}`, identidad: `c-${dealId}`, variante: null, historico: false,
  fechas: { solicitud, agendada: null, realizada: null, entregada: null, captada: null }, ...o,
})
const NOV = { desde: '2026-11-01', hasta: '2026-11-30' }

describe('solicitudes medidas', () => {
  it('el día de inicio es el 26/11 de Argentina', () => {
    expect(DIA_INICIO_MEDICION).toBe('2026-11-26')
  })
  it('tasación, dentro del período y creada desde las 21:04:52 del 26/11', () => {
    const personas = [
      persona('antes', '2026-11-26'),
      persona('justo', '2026-11-26'),
      persona('despues', '2026-11-28'),
      persona('clase', '2026-11-28', { embudo: 'clase' }),
      persona('diciembre', '2026-12-01'),
      persona('sin-deal', '2026-11-28'),
    ]
    const deals = [
      { id: 'antes', created_at: '2026-11-27T00:04:51.000Z' },
      { id: 'justo', created_at: '2026-11-27T00:04:52.000Z' },
      { id: 'despues', created_at: '2026-11-28T15:00:00.000Z' },
      { id: 'clase', created_at: '2026-11-28T15:00:00.000Z' },
      { id: 'diciembre', created_at: '2026-12-01T15:00:00.000Z' },
    ]
    expect(solicitudesMedidas(personas, deals, NOV)).toEqual([
      { dealId: 'justo', contactId: 'c-justo', creadoEn: '2026-11-27T00:04:52.000Z' },
      { dealId: 'despues', contactId: 'c-despues', creadoEn: '2026-11-28T15:00:00.000Z' },
    ])
  })
})

/** Un cliente de Supabase que devuelve `paginas` en orden y anota cada filtro. */
function cliente(paginas: { data: unknown[] | null; error: { message: string } | null }[]) {
  const filtros: unknown[][] = []
  let i = 0
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'is', 'gte', 'order']) q[m] = (...a: unknown[]) => { filtros.push([m, ...a]); return q }
  q.range = (...a: unknown[]) => { filtros.push(['range', ...a]); return Promise.resolve(paginas[i++] ?? { data: [], error: null }) }
  return { sb: { from: (t: string) => { filtros.push(['from', t]); return q } } as never, filtros }
}
const todas = async <T,>(leer: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) => {
  const out: T[] = []
  for (let p = 0; ; p++) {
    const { data, error } = await leer(p * 1000, p * 1000 + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) return out
  }
}

describe('seccionLlamadas', () => {
  const personas = [persona('d1', '2026-11-28')]
  const deals = [{ id: 'd1', created_at: '2026-11-28T13:00:00.000Z' }]

  it('lee llamadas y WhatsApp sin anular, cargados desde la medición, con orden fijo; marca la medición recortada', async () => {
    const { sb, filtros } = cliente([{ data: [{ id: 'a', deal_id: 'd1', contact_id: 'c-d1', kind: 'call', call_outcome: 'agendo', occurred_at: '2026-11-28T14:00:00.000Z', created_at: '2026-11-28T14:00:00.000Z', voided_at: null }], error: null }])
    const r = await seccionLlamadas(sb, todas, personas, deals, NOV)
    expect(r.ok && r.medicionRecortada).toBe(true)
    expect(r.ok && r.datos.agendados).toEqual({ n: 1, de: 1 })
    expect(filtros).toEqual([
      ['from', 'contact_activities'],
      ['select', 'id, deal_id, contact_id, kind, call_outcome, occurred_at, created_at, voided_at'],
      ['in', 'kind', ['call', 'whatsapp_sent']],
      ['is', 'voided_at', null],
      ['gte', 'created_at', '2026-11-27T00:04:52.000Z'],
      ['order', 'id'],
      ['range', 0, 999],
    ])
  })

  it('recortada si empieza el 26/11 o antes; no si empieza el 27; anterior si termina antes del 26', async () => {
    const corre = (desde: string, hasta: string) => seccionLlamadas(cliente([]).sb, todas, personas, deals, { desde, hasta })
    expect(await corre('2026-11-26', '2026-11-30')).toMatchObject({ medicionRecortada: true, antesDeLaMedicion: false })
    expect(await corre('2026-11-27', '2026-11-30')).toMatchObject({ medicionRecortada: false, antesDeLaMedicion: false })
    expect(await corre('2026-10-01', '2026-10-31')).toMatchObject({ medicionRecortada: true, antesDeLaMedicion: true })
  })
  it('lee desde el día anterior al período, nunca antes de la medición', () => {
    expect(pisoDeLectura({ desde: '2026-11-01', hasta: '2026-11-30' })).toBe('2026-11-27T00:04:52.000Z')
    expect(pisoDeLectura({ desde: '2026-12-10', hasta: '2026-12-31' })).toBe('2026-12-09T03:00:00.000Z')
  })

  it('pagina pasadas las 1000 filas', async () => {
    const fila = (k: number) => ({ id: `a${k}`, deal_id: 'otro', contact_id: 'x', kind: 'call', call_outcome: 'no_atendio', occurred_at: '2026-11-28T14:00:00.000Z', created_at: '2026-11-28T14:00:00.000Z', voided_at: null })
    const { sb, filtros } = cliente([
      { data: Array.from({ length: 1000 }, (_, k) => fila(k)), error: null },
      { data: [{ ...fila(1000), deal_id: 'd1' }], error: null },
    ])
    const r = await seccionLlamadas(sb, todas, personas, deals, NOV)
    expect(filtros.filter((f) => f[0] === 'range')).toEqual([['range', 0, 999], ['range', 1000, 1999]])
    expect(r.ok && r.datos.llamadas).toBe(1)
  })

  it('sin solicitudes no lee nada', async () => {
    const { sb, filtros } = cliente([])
    const r = await seccionLlamadas(sb, todas, [], [], NOV)
    expect(filtros).toEqual([])
    expect(r.ok && r.datos.solicitudes).toBe(0)
  })

  it('si la lectura falla, la sección queda sin cargar (sin tirar el Tablero)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await seccionLlamadas(cliente([{ data: null, error: { message: 'boom' } }]).sb, todas, personas, deals, NOV)
    expect(r).toEqual({ ok: false })
    error.mockRestore()
  })
})
