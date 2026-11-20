import { describe, it, expect } from 'vitest'
import { armarVideoCohortes, type SesionVideoRow, type VistaVideoRow } from './video-cohortes'

const RANGO = { desde: '2026-11-20', hasta: '2026-11-30' }
// 15:00 UTC = 12:00 en Argentina: el día no cambia.
const ses = (anon: string, page = 'tasacion-neta', contact: string | null = null, first = '2026-11-21T15:00:00Z'): SesionVideoRow => ({
  anon_id: anon, page, contact_id: contact, first_at: first,
})
const vista = (anon: string, segs: number, extra: Partial<VistaVideoRow> = {}): VistaVideoRow => ({
  anon_id: anon, video_key: 'hero-tasacion-b-animado', watch_seconds: segs, duration_s: 200,
  max_percent: Math.round((segs / 200) * 100), completed: false, play_intents: 1, playback_started: segs > 0,
  watched_buckets: null, contact_id: null, ...extra,
})
const base = { identidades: new Map<string, string>(), pruebas: new Set<string>(), rango: RANGO }

describe('armarVideoCohortes', () => {
  it('cuenta a TODOS los visitantes: quien no tocó play entra con 0 %', () => {
    const r = armarVideoCohortes({
      ...base,
      sesiones: [ses('a'), ses('b'), ses('c'), ses('d')],
      videos: [vista('a', 100)], // solo "a" miró: 100 de 200 s = 50 %
    })
    const v = r.find((x) => x.videoKey === 'hero-tasacion-b-animado')!
    expect(v.noRegistrado.personas).toBe(4)
    expect(v.noRegistrado.tocaronPlay).toBe(1)
    expect(v.noRegistrado.pctPromTodos).toBeCloseTo(0.125) // 50 % / 4
    expect(v.noRegistrado.pctPromPlay).toBeCloseTo(0.5)
    expect(v.noRegistrado.segPromPlay).toBe(100)
  })

  it('separa registrados de no registrados (contacto en la sesión o en anon_identity)', () => {
    const r = armarVideoCohortes({
      ...base,
      identidades: new Map([['b', 'contacto-b']]),
      sesiones: [ses('a', 'tasacion-neta', 'contacto-a'), ses('b'), ses('c')],
      videos: [vista('a', 200, { completed: true }), vista('b', 20), vista('c', 10)],
    })
    const v = r[0]
    expect(v.registrado.personas).toBe(2)
    expect(v.registrado.pctPromTodos).toBeCloseTo((1 + 0.1) / 2)
    expect(v.registrado.llegaronFinal).toBe(1)
    expect(v.noRegistrado.personas).toBe(1)
    expect(v.noRegistrado.pctPromTodos).toBeCloseTo(0.05)
  })

  it('las pruebas internas no cuentan en ningún grupo', () => {
    const r = armarVideoCohortes({
      ...base,
      pruebas: new Set(['julian']),
      identidades: new Map([['x', 'julian']]),
      sesiones: [ses('x'), ses('y', 'tasacion-neta', 'julian'), ses('z')],
      videos: [vista('x', 200), vista('z', 0, { play_intents: 0 })],
    })
    const v = r[0]
    expect(v.registrado.personas).toBe(0)
    expect(v.noRegistrado.personas).toBe(1)
  })

  it('las visitas fuera del período no cuentan (día en hora argentina)', () => {
    const r = armarVideoCohortes({
      ...base,
      // 02:00 UTC del 20/11 = 23:00 del 19/11 en Argentina → fuera.
      sesiones: [ses('a', 'tasacion-neta', null, '2026-11-20T02:00:00Z'), ses('b')],
      videos: [],
    })
    expect(r[0].noRegistrado.personas).toBe(1)
  })

  it('sin fila de video, el visitante va al video que estaba publicado ese día', () => {
    const r = armarVideoCohortes({
      ...base,
      rango: { desde: '2026-11-01', hasta: '2026-11-30' },
      sesiones: [
        ses('viejo', 'tasacion-neta', null, '2026-11-03T15:00:00Z'), // VSL largo
        ses('medio', 'tasacion-neta', null, '2026-11-10T15:00:00Z'), // VSL corto
        ses('nuevo'), // animado
      ],
      videos: [],
    })
    const por = Object.fromEntries(r.map((v) => [v.videoKey, v.noRegistrado.personas]))
    expect(por['hero-tasacion-neta']).toBe(1)
    expect(por['hero-tasacion-neta-corto']).toBe(1)
    expect(por['hero-tasacion-b-animado']).toBe(1)
  })

  it('con fila de video, manda la fila (el día del cambio pudo ver el anterior)', () => {
    const r = armarVideoCohortes({
      ...base,
      rango: { desde: '2026-11-19', hasta: '2026-11-30' },
      sesiones: [ses('a', 'tasacion-neta', null, '2026-11-19T15:00:00Z')],
      videos: [vista('a', 30, { video_key: 'hero-tasacion-neta-corto', duration_s: 450 })],
    })
    expect(r.map((v) => v.videoKey)).toEqual(['hero-tasacion-neta-corto'])
  })

  it('cada landing usa su video: la clase no se mezcla con tasación', () => {
    const r = armarVideoCohortes({
      ...base,
      sesiones: [ses('a', 'clase'), ses('b')],
      videos: [vista('a', 50, { video_key: 'hero-clase', duration_s: 100 })],
    })
    const clase = r.find((v) => v.videoKey === 'hero-clase')!
    expect(clase.noRegistrado.personas).toBe(1)
    expect(clase.noRegistrado.pctPromPlay).toBeCloseTo(0.5)
    expect(r.find((v) => v.videoKey === 'hero-tasacion-b-animado')!.noRegistrado.tocaronPlay).toBe(0)
  })

  it('curva de retención: % de los que tocaron play que vio cada tramo', () => {
    const mitad = '1'.repeat(50) + '0'.repeat(50)
    const todo = '1'.repeat(100)
    const r = armarVideoCohortes({
      ...base,
      sesiones: [ses('a'), ses('b'), ses('c')],
      videos: [vista('a', 100, { watched_buckets: mitad }), vista('b', 200, { watched_buckets: todo })],
    })
    const g = r[0].noRegistrado
    expect(g.conCurva).toBe(2)
    expect(g.curva[0]).toBeCloseTo(1)
    expect(g.curva[75]).toBeCloseTo(0.5)
  })

  it('nunca pasa del 100 % aunque los segundos superen la duración', () => {
    const r = armarVideoCohortes({ ...base, sesiones: [ses('a')], videos: [vista('a', 999)] })
    expect(r[0].noRegistrado.pctPromPlay).toBe(1)
  })

  it('tocó play pero el video no arrancó: cuenta como tocó play con 0 %', () => {
    const r = armarVideoCohortes({
      ...base,
      sesiones: [ses('a')],
      videos: [vista('a', 0, { play_intents: 2, playback_started: false })],
    })
    const g = r[0].noRegistrado
    expect(g.tocaronPlay).toBe(1)
    expect(g.arrancaron).toBe(0)
    expect(g.pctPromPlay).toBe(0)
  })

  it('páginas sin video y grupos vacíos: sin divisiones por cero', () => {
    const r = armarVideoCohortes({ ...base, sesiones: [ses('a', 'pagina-sin-video')], videos: [] })
    expect(r).toEqual([])
    const r2 = armarVideoCohortes({ ...base, sesiones: [ses('a')], videos: [] })
    expect(r2[0].registrado.personas).toBe(0)
    expect(r2[0].registrado.pctPromTodos).toBeNull()
    expect(r2[0].noRegistrado.pctPromPlay).toBeNull()
  })
})
