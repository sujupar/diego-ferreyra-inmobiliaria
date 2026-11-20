import { describe, expect, it } from 'vitest'
import { estadoFranja } from './estado'
import { armarAnunciosVivo, calcularAjustes, campaniaTasacionVigente, porCampania, totalAnuncios, tramosDeAjuste } from './anuncios'
import { consultasPorPortal, mediana, medianaDiasAgenda, origenRegistro, referidos, registrosMetaPorPropiedad, registrosPorPropiedad, sinAgendar, type LeadRow } from './comercial'
import { cartera, resumenPropiedades } from './propiedades'
import { numerosPagina, paginasPublicadas, varianteVigente, variantesPublicadas, videoVigente } from './pagina'
import { mesAntes, rangoComparado } from '../panel/rango'
import { validarHito } from '../panel/validar'
import type { MetaDia } from '../panel/embudo'
import type { DealRow, Persona } from '../panel/personas'
import type { VideoCohorte, GrupoVideo } from '../panel/video-cohortes'

const TAS = '🟡 CONV: [Tasación Gratuita] | Primer Nivel'
const CLASE = '🟡 CONV: [Clase Gratuita] | Segundo Nivel'
const m = (fecha: string, campania: string, gasto: number, registros = 0, visitasMeta = 0, campaniaId = campania): MetaDia =>
  ({ fecha, campania, campaniaId, gasto, registros, visitasMeta, impresiones: 0, clics: 0 })

describe('estado de la franja', () => {
  it('sin dato de un lado → Sin datos', () => {
    expect(estadoFranja(null, 3, 'sube')).toBe('sin_datos')
    expect(estadoFranja(3, undefined, 'sube')).toBe('sin_datos')
  })
  it('diferencia menor al 10 % → Igual; los dos en cero → Igual', () => {
    expect(estadoFranja(105, 100, 'sube')).toBe('igual')
    expect(estadoFranja(0, 0, 'sube')).toBe('igual')
  })
  it('respeta para qué lado es bueno', () => {
    expect(estadoFranja(9, 15, 'sube')).toBe('empeoro')
    expect(estadoFranja(29_000, 17_000, 'baja')).toBe('empeoro')
    expect(estadoFranja(10_000, 17_000, 'baja')).toBe('mejoro')
  })
  it('de cero a algo cuenta entero', () => {
    expect(estadoFranja(3, 0, 'sube')).toBe('mejoro')
    expect(estadoFranja(-1824, 0, 'sube')).toBe('empeoro')
  })
})

describe('comparar con el mismo tramo del mes anterior', () => {
  it('1–20/11 → 1–20/10', () => {
    expect(rangoComparado({ desde: '2026-11-01', hasta: '2026-11-20' }, 'mes_anterior')).toEqual({ desde: '2026-10-01', hasta: '2026-10-20' })
  })
  it('mes completo → mes anterior completo', () => {
    expect(rangoComparado({ desde: '2026-11-01', hasta: '2026-11-30' }, 'mes_anterior')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(rangoComparado({ desde: '2026-03-01', hasta: '2026-03-31' }, 'mes_anterior')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
  })
  it('un día que no existe en el mes anterior cae al último', () => {
    expect(mesAntes('2026-03-30')).toBe('2026-02-28')
    expect(mesAntes('2028-03-30')).toBe('2028-02-29')
    expect(mesAntes('2026-01-15')).toBe('2025-12-15')
    expect(rangoComparado({ desde: '2026-03-29', hasta: '2026-03-30' }, 'mes_anterior')).toEqual({ desde: '2026-02-28', hasta: '2026-02-28' })
  })
})

describe('anuncios', () => {
  const meta = [
    m('2026-11-01', TAS, 10_000, 1, 10, 't'), m('2026-11-02', TAS, 20_000, 0, 5, 't'),
    m('2026-11-01', CLASE, 3_000, 1, 2, 'c'),
    m('2026-11-02', '[Auto] Roque Pérez 3059 (x)', 4_000, 0, 7, 'p1'),
    m('2026-11-02', '[Auto] Sin ficha', 1_000, 0, 1, 'p2'),
  ]
  it('totales por tipo; null si Meta no tiene filas en el rango', () => {
    expect(totalAnuncios(meta, { desde: '2026-11-01', hasta: '2026-11-30' }, 'tasacion')).toEqual({ gasto: 30_000, visitas: 15, registros: 1, costoPorRegistro: 30_000, diasConDato: 2 })
    expect(totalAnuncios(meta, { desde: '2026-10-01', hasta: '2026-10-31' }, 'tasacion')).toBeNull()
  })
  it('por campaña: el píxel para tasación/clase, la ficha para propiedades', () => {
    const filas = porCampania(meta, { desde: '2026-11-01', hasta: '2026-11-30' }, new Map([['p1', { propiedadId: 'prop1', nombre: 'Roque Pérez 3059' }]]), new Map([['prop1', 2]]))
    expect(filas.map(f => [f.tipo, f.nombre, f.registros, f.costoPorRegistro])).toEqual([
      ['tasacion', TAS, 1, 30_000],
      ['clase', CLASE, 1, 3_000],
      ['propiedad', 'Roque Pérez 3059', 2, 2_000],
      ['propiedad', '[Auto] Sin ficha', null, null],
    ])
  })
  it('tramos de un ajuste: el día del ajuste no entra en ninguno', () => {
    expect(tramosDeAjuste('2026-11-19', '2026-11-20', null)).toEqual({ antes: { desde: '2026-11-01', hasta: '2026-11-18' }, despues: { desde: '2026-11-20', hasta: '2026-11-20' } })
    expect(tramosDeAjuste('2026-11-01', '2026-11-20', null).antes).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(tramosDeAjuste('2026-11-19', '2026-11-19', null).despues).toBeNull()
    expect(tramosDeAjuste('2026-11-19', '2026-11-25', '2026-11-10').antes).toEqual({ desde: '2026-11-11', hasta: '2026-11-18' })
  })
  it('antes y después con datos reales de la forma del 19/11', () => {
    const datos = [m('2026-11-17', TAS, 100_000, 3), m('2026-11-18', TAS, 137_868, 4), m('2026-11-19', TAS, 11_573, 1), m('2026-11-20', TAS, 14_948, 1)]
    const [a] = calcularAjustes([{ id: 'h', fecha: '2026-11-19', embudo: 'tasacion', titulo: 'Ajuste', detalle: null, meta_costo_registro_ars: 20_000 }], datos, '2026-11-20', '2026-01-01')
    expect(a.antes).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-18', gasto: 237_868, registros: 7 })
    expect(a.antes!.costoPorRegistro).toBeCloseTo(33_981.14, 1)
    expect(a.despues).toMatchObject({ gasto: 14_948, registros: 1, costoPorRegistro: 14_948 })
    expect(a.metaCostoRegistroArs).toBe(20_000)
  })
  it('un tramo anterior a los datos bajados es "sin dato"; el más reciente va primero; sin embudo = tasación', () => {
    const r = calcularAjustes([
      { id: 'a', fecha: '2026-01-05', embudo: null, titulo: 'viejo', detalle: null },
      { id: 'b', fecha: '2026-11-19', embudo: 'tasacion', titulo: 'nuevo', detalle: null },
      { id: 'c', fecha: '2026-12-01', embudo: 'tasacion', titulo: 'futuro', detalle: null },
    ], [], '2026-11-20', '2026-01-01')
    expect(r.map(x => x.id)).toEqual(['b', 'a'])
    expect(r[1].embudo).toBe('tasacion')
    expect(r[1].antes).toMatchObject({ gasto: null, registros: null })
    expect(r[0].antes).toMatchObject({ desde: '2026-11-01' })
  })
  it('anuncios en vivo: solo conjuntos activos, con registros y costo', () => {
    const r = armarAnunciosVivo(
      [{ id: 'v', name: 'Validados', effective_status: 'ACTIVE' }, { id: 'x', name: 'Viejo', effective_status: 'PAUSED' }],
      {
        v: [
          { id: '1', name: 'AD01', effective_status: 'PAUSED', insights: { data: [{ spend: '500', actions: [] }] } },
          { id: '2', name: 'AD02', effective_status: 'ACTIVE', insights: { data: [{ spend: '1000', actions: [{ action_type: 'REG', value: '2' }, { action_type: 'landing_page_view', value: '9' }] }] } },
          { id: '3', name: 'AD03', effective_status: 'ACTIVE' },
        ],
        x: [{ id: '4', name: 'no', effective_status: 'ACTIVE' }],
      }, 'REG')
    expect(r.map(a => [a.nombre, a.gasto, a.visitas, a.registros, a.costoPorRegistro])).toEqual([
      ['AD02', 1000, 9, 2, 500], ['AD03', 0, 0, 0, null], ['AD01', 500, 0, 0, null],
    ])
  })
  it('la campaña de tasación vigente es la última con gasto', () => {
    expect(campaniaTasacionVigente([m('2026-10-01', TAS, 5, 0, 0, 'vieja'), m('2026-11-19', TAS, 5, 0, 0, 'nueva'), m('2026-11-20', TAS, 0, 0, 0, 'cero'), m('2026-11-20', CLASE, 9, 0, 0, 'c')])).toBe('nueva')
    expect(campaniaTasacionVigente([])).toBeNull()
  })
})

const persona = ({ fechas, ...o }: Partial<Omit<Persona, 'fechas'>> & { fechas: Partial<Persona['fechas']> }): Persona => ({
  embudo: 'tasacion', dealId: 'd', contactId: null, identidad: 'i', variante: null, historico: false,
  ...o,
  fechas: { solicitud: null, agendada: null, realizada: null, entregada: null, captada: null, ...fechas },
})
const deal = (o: Partial<DealRow>): DealRow => ({ id: 'd', contact_id: null, origin: 'embudo', stage: 'request', created_at: '2026-11-01T12:00:00Z', notes: null, appraisal_id: null, landing_variant: null, scheduled_at: null, visited_at: null, visit_completed_at: null, delivered_at: null, captured_at: null, ...o })

describe('comercial', () => {
  const nov = { desde: '2026-11-01', hasta: '2026-11-30' }
  it('mediana', () => {
    expect(mediana([])).toBeNull()
    expect(mediana([5, 1, 3])).toBe(3)
    expect(mediana([1, 2, 3, 10])).toBe(2.5)
  })
  it('días de solicitud a agendada: solo agendadas del período, sin sistema viejo ni clase', () => {
    const r = medianaDiasAgenda([
      persona({ fechas: { solicitud: '2026-11-01', agendada: '2026-11-03' } }),
      persona({ fechas: { solicitud: '2026-10-20', agendada: '2026-11-06' } }),
      persona({ fechas: { solicitud: '2026-11-01', agendada: '2026-11-01' }, historico: true }),
      persona({ fechas: { solicitud: '2026-11-01', agendada: '2026-11-09' }, embudo: 'clase' }),
      persona({ fechas: { solicitud: '2026-10-01', agendada: '2026-10-05' } }),
    ], nov)
    expect(r).toEqual({ dias: 9.5, n: 2 })
  })
  it('sin agendar > 48 h: en "Solicitud", del período, las más viejas primero', () => {
    const ahora = new Date('2026-11-20T15:00:00Z')
    const ps = [
      persona({ dealId: 'a', fechas: { solicitud: '2026-11-10' } }),
      persona({ dealId: 'b', fechas: { solicitud: '2026-11-20' } }),
      persona({ dealId: 'c', fechas: { solicitud: '2026-11-05' } }),
      persona({ dealId: 'e', fechas: { solicitud: '2026-11-05', agendada: '2026-11-06' } }),
      persona({ dealId: 'f', fechas: { solicitud: '2026-11-05' } }),
    ]
    const deals = new Map([
      ['a', deal({ id: 'a', created_at: '2026-11-10T12:00:00Z', contact_id: 'k' })],
      ['b', deal({ id: 'b', created_at: '2026-11-20T10:00:00Z' })],
      ['c', deal({ id: 'c', created_at: '2026-11-05T12:00:00Z' })],
      ['e', deal({ id: 'e', stage: 'scheduled' })],
      ['f', deal({ id: 'f', stage: 'lost' })],
    ])
    const r = sinAgendar(ps, deals, new Map([['k', 'Ana']]), nov, ahora)
    expect(r.map(x => [x.dealId, x.nombre, x.horas])).toEqual([['c', null, 363], ['a', 'Ana', 243]])
  })
  it('referidos: eventos del período por etapa, una vez por proceso, sin pruebas', () => {
    const deals = [deal({ id: 'r1', origin: 'referido', created_at: '2026-11-02T12:00:00Z' }), deal({ id: 'r2', origin: 'referido', created_at: '2026-09-01T12:00:00Z' }), deal({ id: 'r3', origin: 'referido', contact_id: 'prueba', created_at: '2026-11-02T12:00:00Z' }), deal({ id: 'e1', origin: 'embudo' })]
    const historia = [
      { deal_id: 'r1', to_stage: 'scheduled', changed_at: '2026-11-03T12:00:00Z' },
      { deal_id: 'r1', to_stage: 'scheduled', changed_at: '2026-11-10T12:00:00Z' },
      { deal_id: 'r2', to_stage: 'visited', changed_at: '2026-11-04T12:00:00Z' },
      { deal_id: 'r2', to_stage: 'captured', changed_at: '2026-10-04T12:00:00Z' },
      { deal_id: 'r3', to_stage: 'scheduled', changed_at: '2026-11-03T12:00:00Z' },
      { deal_id: 'e1', to_stage: 'scheduled', changed_at: '2026-11-03T12:00:00Z' },
    ]
    expect(referidos(deals, historia, nov, new Set(['prueba']))).toEqual({ nuevos: 1, agendados: 1, realizados: 1, captados: 0 })
  })
  it('origen de un registro', () => {
    expect(origenRegistro('visita:cartel', {})).toBe('cartel')
    expect(origenRegistro('landing', { utm_source: 'instagram', utm_medium: 'reel', fbclid: 'x' })).toBe('reel')
    expect(origenRegistro('landing', { fbclid: 'x', utm_source: 'meta', utm_medium: 'paid_social' })).toBe('meta')
    expect(origenRegistro('landing', { utm_source: 'fb', utm_medium: 'paid' })).toBe('meta')
    expect(origenRegistro('landing', { fbclid: 'x' })).toBe('meta')
    expect(origenRegistro('landing', {})).toBe('directo')
    expect(origenRegistro(null, null)).toBe('directo')
  })
  it('registros por propiedad: sin robots ni borrados, fecha Argentina', () => {
    const l = (o: Partial<LeadRow>): LeadRow => ({ property_id: 'p', source: 'landing', utm: {}, created_at: '2026-11-05T12:00:00Z', suspected_bot: false, deleted_at: null, ...o })
    const leads = [
      l({}), l({ utm: { fbclid: 'x' } }), l({ property_id: 'q', source: 'visita:cartel' }),
      l({ suspected_bot: true }), l({ deleted_at: '2026-11-06T00:00:00Z' }),
      l({ created_at: '2026-11-01T02:00:00Z' }), // 31/10 en Argentina
      l({ property_id: null }),
    ]
    const r = registrosPorPropiedad(leads, nov, new Map([['p', 'Salta 297']]))
    expect(r.total).toBe(3)
    expect(r.porOrigen).toEqual({ cartel: 1, reel: 0, meta: 1, directo: 1 })
    expect(r.porPropiedad[0]).toMatchObject({ propiedadId: 'p', direccion: 'Salta 297', total: 2 })
    expect(registrosMetaPorPropiedad(leads, nov)).toEqual(new Map([['p', 1]]))
  })
  it('consultas por portal, por fecha de recepción', () => {
    const r = consultasPorPortal([
      { portal: 'zonaprop', received_at: '2026-11-01T16:00:00Z', created_at: '2026-11-01T16:05:00Z' },
      { portal: 'zonaprop', received_at: null, created_at: '2026-11-02T16:05:00Z' },
      { portal: 'argenprop', received_at: '2026-10-31T23:00:00Z', created_at: '2026-11-01T03:30:00Z' },
      { portal: 'mercadolibre', received_at: '2026-11-03T16:00:00Z', created_at: '2026-11-03T16:05:00Z' },
    ], nov)
    expect(r).toEqual({ total: 3, porPortal: [{ portal: 'zonaprop', cantidad: 2 }, { portal: 'mercadolibre', cantidad: 1 }] })
  })
})

describe('propiedades', () => {
  const props = [
    { id: '1', address: 'Olmos 585', captured_at: '2026-11-11T10:40:30Z', commercial_status: 'disponible', status: 'approved' },
    { id: '2', address: 'Bahía Blanca 4500', captured_at: '2026-11-20T19:18:02Z', commercial_status: 'disponible', status: 'approved' },
    { id: '3', address: '[FUSIONADA->abc] Olmos', captured_at: '2026-11-11T10:40:30Z', commercial_status: 'descartada', status: 'descartada' },
    { id: '4', address: 'X', captured_at: '2026-05-01T10:00:00Z', commercial_status: 'reservada', status: 'approved' },
    { id: '5', address: 'Y', captured_at: '2026-05-01T10:00:00Z', commercial_status: 'descartada', status: 'descartada' },
    { id: '6', address: 'Z', captured_at: null, commercial_status: 'disponible', status: 'approved' },
  ]
  it('captadas, reservas y escrituras del período', () => {
    const ventas = [
      { estado: 'reservada', reservada_en: '2026-11-03', escriturada_en: null },
      { estado: 'caida', reservada_en: '2026-11-04', escriturada_en: null },
      { estado: 'vendida', reservada_en: '2026-09-01', escriturada_en: '2026-11-15' },
    ]
    expect(resumenPropiedades(props, ventas, { desde: '2026-11-01', hasta: '2026-11-20' })).toEqual({ captadas: 2, reservas: 1, escrituras: 1 })
  })
  it('cartera de hoy por estado comercial', () => {
    expect(cartera(props)).toEqual({ disponible: 2, porEstado: [{ estado: 'disponible', cantidad: 2 }, { estado: 'reservada', cantidad: 1 }] })
  })
})

const grupo = (o: Partial<GrupoVideo>): GrupoVideo => ({ personas: 0, tocaronPlay: 0, arrancaron: 0, pctPromTodos: null, pctPromPlay: null, segPromPlay: null, llegaronFinal: 0, curva: [], conCurva: 0, ...o })
const video = (videoKey: string, reg: Partial<GrupoVideo>, noReg: Partial<GrupoVideo>): VideoCohorte => ({ videoKey, label: videoKey, pagina: '', duracionS: null, registrado: grupo(reg), noRegistrado: grupo(noReg) })

describe('página y video publicados', () => {
  it('variantes publicadas según el A/B', () => {
    expect(variantesPublicadas({ status: 'off', splitB: 50, winner: 'B' })).toEqual(['B'])
    expect(variantesPublicadas({ status: 'off', splitB: 50, winner: null })).toEqual(['A'])
    expect(variantesPublicadas({ status: 'paused', splitB: 50, winner: 'B' })).toEqual(['A'])
    expect(variantesPublicadas({ status: 'running', splitB: 50, winner: null })).toEqual(['A', 'B'])
    expect(variantesPublicadas({ status: 'running', splitB: 100, winner: null })).toEqual(['B'])
    expect(variantesPublicadas(null)).toEqual(['A'])
  })
  it('con la B ganadora: páginas y videos vigentes', () => {
    const paginas = paginasPublicadas(['B'])
    expect(paginas.sort()).toEqual(['clase', 'tasacion-neta'])
    expect(videoVigente('hero-tasacion-b-animado', paginas)).toBe(true)
    expect(videoVigente('hero-tasacion-neta-corto', paginas)).toBe(false)
    expect(videoVigente('hero-tasacion', paginas)).toBe(false)
    expect(videoVigente('hero-clase', paginas)).toBe(true)
    expect(videoVigente('clase-completa', paginas)).toBe(false)
    expect(varianteVigente({ embudo: 'tasacion', variante: 'A' }, ['B'])).toBe(false)
    expect(varianteVigente({ embudo: 'clase', variante: '-' }, ['B'])).toBe(true)
  })
  it('números de la franja: solo tasación publicada', () => {
    const variantes = [
      { embudo: 'tasacion' as const, variante: 'B', visitas: 200, solicitudes: 6, conversion: 0.03 },
      { embudo: 'tasacion' as const, variante: 'A', visitas: 50, solicitudes: 1, conversion: 0.02 },
      { embudo: 'clase' as const, variante: '-', visitas: 80, solicitudes: 4, conversion: 0.05 },
    ]
    const videos = [
      video('hero-tasacion-b-animado', { personas: 4, tocaronPlay: 4, pctPromTodos: 0.5 }, { personas: 16, tocaronPlay: 6, pctPromTodos: 0.1 }),
      video('hero-tasacion-neta-corto', { personas: 10, tocaronPlay: 10, pctPromTodos: 1 }, { personas: 10, tocaronPlay: 10, pctPromTodos: 1 }),
      video('hero-clase', { personas: 10, tocaronPlay: 10, pctPromTodos: 1 }, {}),
    ]
    const r = numerosPagina(variantes, videos, ['B'])
    expect(r).toMatchObject({ visitas: 200, solicitudes: 6, conversion: 0.03, pctTocaPlay: 0.5, pctVistoRegistrados: 0.5, pctVistoNoRegistrados: 0.1 })
    expect(numerosPagina([], null, ['B'])).toEqual({ visitas: null, solicitudes: null, conversion: null, pctTocaPlay: null, pctVistoRegistrados: null, pctVistoNoRegistrados: null })
  })
})

describe('validar un ajuste de campaña', () => {
  it('acepta los campos nuevos opcionales', () => {
    const v = validarHito({ fecha: '2026-11-19', titulo: 'Ajuste', embudo: 'tasacion', resultado_buscado: 'bajar el costo', meta_costo_registro_ars: '20000', fecha_decision: '2026-11-26' })
    expect(v).toEqual({ hito: { fecha: '2026-11-19', embudo: 'tasacion', titulo: 'Ajuste', detalle: null }, ajuste: { resultado_buscado: 'bajar el costo', meta_costo_registro_ars: 20000, fecha_decision: '2026-11-26' } })
  })
  it('sin los campos nuevos, el ajuste viene vacío (el código viejo sigue igual)', () => {
    expect(validarHito({ fecha: '2026-11-19', titulo: 'x' })).toMatchObject({ ajuste: {} })
  })
  it('rechaza meta no positiva o decisión antes del ajuste', () => {
    expect(validarHito({ fecha: '2026-11-19', titulo: 'x', meta_costo_registro_ars: -1 })).toHaveProperty('error')
    expect(validarHito({ fecha: '2026-11-19', titulo: 'x', fecha_decision: '2026-11-01' })).toHaveProperty('error')
  })
})
