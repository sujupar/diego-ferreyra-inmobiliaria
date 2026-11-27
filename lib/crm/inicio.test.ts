import { describe, expect, it } from 'vitest'
import type { FilaCartera } from './cartera'
import {
  colaParaLlamar,
  colapsarCopias,
  fechaDeHoy,
  inicioDeCohorte,
  leadsSinPrimerContacto,
  paraManana,
  procesosQueEsperan,
  saludo,
  sinRespuesta,
  tareasSinLasDeLaCola,
  tasacionesHoyYManana,
  tiempoMedio,
} from './inicio'

const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`)
const AHORA = ar('2026-11-25', '10:40') // miércoles
const COORD = 'u-paula'

function fila(o: Partial<FilaCartera>): FilaCartera {
  return {
    id: 'd1', contactoId: 'c1', nombre: 'Marcela Ibáñez', telefono: '1155550142', email: null,
    propiedad: 'Depto 3 amb, Caballito', direccion: 'Yatay 540', etapa: 'solicitud', abierto: true,
    origen: 'embudo', asesor: null, creadoEn: ar('2026-11-24', '18:20').toISOString(), cerradoEn: null,
    colega: false, anteriorAlRegistro: false, ultimoContacto: null, proximo: null, tasacion: null, ...o,
  }
}
const proximo = (o: Partial<Exclude<FilaCartera['proximo'], null | 'error'>>) => ({
  clase: 'tarea' as const, titulo: 'Primera llamada', vence: { due_date: '2026-11-25', due_time: '09:00', all_day: false },
  quien: { id: COORD, nombre: 'Paula' }, espera: null, instante: ar('2026-11-25', '09:00').toISOString(), ...o,
})

describe('colaParaLlamar', () => {
  it('sin primer contacto y llamadas vencidas de la coordinación, de la más vieja a la más nueva, una vez por persona', () => {
    const r = colaParaLlamar(
      [
        fila({ id: 'd2', contactoId: 'c2', nombre: 'Patricia', creadoEn: ar('2026-11-25', '10:12').toISOString(), proximo: proximo({ vence: { due_date: '2026-11-25', due_time: '10:12', all_day: false }, espera: { registradoEn: ar('2026-11-25', '10:12').toISOString() } }) }),
        fila({ id: 'd1', proximo: proximo({}) }),
        fila({
          id: 'd3', contactoId: 'c3', nombre: 'Rubén', creadoEn: ar('2026-11-23', '11:30').toISOString(),
          ultimoContacto: { at: ar('2026-11-24', '11:00').toISOString(), que: 'llamada', resultado: 'no_atendio' },
          proximo: proximo({ titulo: 'Llamada 2' }),
        }),
        fila({ id: 'd3b', contactoId: 'c3', nombre: 'Rubén', creadoEn: ar('2026-11-24', '11:30').toISOString(), proximo: proximo({}) }), // otra solicitud de la misma persona
      ],
      new Set([COORD]),
      AHORA,
    )
    expect(r.map((x) => x.nombre)).toEqual(['Rubén', 'Marcela Ibáñez', 'Patricia'])
    expect(r[0]).toMatchObject({ llamada: 'Llamada 2', estado: { texto: 'Vencida hace 1 h', tipo: 'vencida' }, anterior: 'Anterior: no atendió, ayer', registrado: 'Se registró hace 2 días' })
    expect(r[1]).toMatchObject({ llamada: 'Llamada 1', estado: { texto: 'Vencida hace 1 h' } })
    expect(r[2]).toMatchObject({ llamada: 'Llamada 1', estado: { texto: 'Espera hace 28 min', tipo: 'espera' }, anterior: null })
  })

  it('no entran: anteriores al registro, cerrados, llamadas de un asesor, mensajes, ni lo que todavía no vence si ya tuvo contacto', () => {
    const r = colaParaLlamar(
      [
        fila({ anteriorAlRegistro: true, proximo: proximo({}) }),
        fila({ id: 'x', contactoId: 'x', abierto: false, proximo: proximo({}) }),
        fila({ id: 'y', contactoId: 'y', ultimoContacto: { at: AHORA.toISOString(), que: 'llamada', resultado: 'no_atendio' }, proximo: proximo({ titulo: 'Llamada 2', quien: { id: 'u-asesor', nombre: 'Tomás' } }) }),
        fila({ id: 'z', contactoId: 'z', ultimoContacto: { at: AHORA.toISOString(), que: 'llamada', resultado: 'no_atendio' }, proximo: proximo({ titulo: 'Enviar WhatsApp' }) }),
        fila({ id: 'w', contactoId: 'w', ultimoContacto: { at: AHORA.toISOString(), que: 'llamada', resultado: 'no_atendio' }, proximo: proximo({ titulo: 'Llamada 2', vence: { due_date: '2026-11-26', due_time: '09:00', all_day: false } }) }),
      ],
      new Set([COORD]),
      AHORA,
    )
    expect(r).toEqual([])
  })
})

describe('sinRespuesta', () => {
  it('solicitud con contacto, sin tarea y con WhatsApp en la racha', () => {
    const filas = [
      fila({ id: 'g', contactoId: 'cg', nombre: 'Gustavo', creadoEn: ar('2026-11-18', '12:00').toISOString(), ultimoContacto: { at: ar('2026-11-23', '10:00').toISOString(), que: 'whatsapp', resultado: null } }),
      fila({ id: 'h', contactoId: 'ch', nombre: 'Con tarea', ultimoContacto: { at: AHORA.toISOString(), que: 'whatsapp', resultado: null }, proximo: proximo({ titulo: 'Llamar', vence: { due_date: '2026-11-27', due_time: null, all_day: true } }) }),
    ]
    const intento = (id: string, kind: 'call' | 'whatsapp_sent', cuando: Date, call_outcome: string | null = null) => ({
      id, deal_id: 'g', kind, call_outcome, occurred_at: cuando.toISOString(), created_at: cuando.toISOString(), voided_at: null,
    })
    const intentos = new Map([
      ['g', [intento('1', 'call', ar('2026-11-19', '10:00'), 'no_atendio'), intento('2', 'call', ar('2026-11-21', '10:00'), 'no_atendio'), intento('3', 'whatsapp_sent', ar('2026-11-23', '10:00'))]],
      ['h', [intento('4', 'whatsapp_sent', AHORA)]],
    ]) as never
    const r = sinRespuesta(filas, intentos, AHORA)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ nombre: 'Gustavo', linea: 'WhatsApp enviado hace 2 días · 2 llamadas sin atender', registrado: 'Se registró 18 nov' })
  })
})

describe('tasaciones, leads y procesos', () => {
  it('tasaciones de hoy y mañana, por hora', () => {
    const r = tasacionesHoyYManana(
      [
        fila({ id: 'a', etapa: 'coordinada', tasacion: { fecha: '2026-11-26', hora: '11:00', instante: ar('2026-11-26', '11:00').toISOString(), asesor: 'Tomás', direccion: 'Bacacay 2450' } }),
        fila({ id: 'b', etapa: 'coordinada', tasacion: { fecha: '2026-11-25', hora: '16:00', instante: ar('2026-11-25', '16:00').toISOString(), asesor: 'Tomás', direccion: 'Yatay 540' } }),
        fila({ id: 'c', etapa: 'coordinada', tasacion: { fecha: '2026-11-28', hora: '11:00', instante: ar('2026-11-28', '11:00').toISOString(), asesor: null, direccion: null } }),
      ],
      AHORA,
    )
    expect(r.map((x) => [x.dia, x.hora, x.direccion])).toEqual([['Hoy', '16:00', 'Yatay 540'], ['Mañana', '11:00', 'Bacacay 2450']])
  })

  it('leads sin primer contacto con la espera y quién llama', () => {
    const [x] = leadsSinPrimerContacto([fila({})], AHORA)
    expect(x.espera).toBe('Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles · la llama la coordinación')
  })

  it('procesos que esperan algo del asesor', () => {
    const fechas = new Map([
      ['r', { visited_at: ar('2026-11-21', '10:00').toISOString(), delivered_at: null }],
      ['e', { visited_at: null, delivered_at: ar('2026-11-19', '10:00').toISOString() }],
      ['e2', { visited_at: null, delivered_at: ar('2026-11-23', '10:00').toISOString() }],
    ])
    const r = procesosQueEsperan(
      [
        fila({ id: 'r', nombre: 'Mirta', etapa: 'realizada' }),
        fila({ id: 'e', nombre: 'Jorge', etapa: 'entregada' }),
        fila({ id: 'e2', nombre: 'Reciente', etapa: 'entregada' }),
        fila({ id: 't', nombre: 'Ernesto', etapa: 'coordinada', tasacion: { fecha: '2026-11-24', hora: '11:00', instante: ar('2026-11-24', '11:00').toISOString(), asesor: 'Tomás', direccion: 'x' } }),
      ],
      fechas,
      AHORA,
    )
    expect(r.map((x) => x.texto)).toEqual([
      'Llamar por la respuesta: la tasación se entregó hace 6 días.',
      'Entregar la tasación: la visita fue hace 4 días.',
      'Cargar el resultado de la tasación: fue el mar 24 nov.',
    ])
  })
})

describe('tiempo medio a la primera llamada', () => {
  it('cohorte desde el lunes y desde el registro de llamadas; media de reloj y hábiles', () => {
    // El lunes 23 es anterior al registro de llamadas (26/11): la cohorte arranca el 26.
    expect(inicioDeCohorte(AHORA).toISOString()).toBe(ar('2026-11-26', '00:00').toISOString())
    expect(inicioDeCohorte(ar('2026-12-02', '10:00')).toISOString()).toBe(ar('2026-11-30', '00:00').toISOString())
    const r = tiempoMedio(
      [
        { creadoEn: ar('2026-11-25', '09:00').toISOString(), primeraLlamada: ar('2026-11-25', '10:00').toISOString() },
        { creadoEn: ar('2026-11-25', '09:30').toISOString(), primeraLlamada: ar('2026-11-25', '10:30').toISOString() },
        { creadoEn: ar('2026-11-25', '10:00').toISOString(), primeraLlamada: null },
      ],
    )
    expect(r).toEqual({ n: 2, sinLlamar: 1, reloj: '1 h', habiles: '1 h', pocos: true })
  })
  it('sin casos', () => {
    expect(tiempoMedio([{ creadoEn: AHORA.toISOString(), primeraLlamada: null }])).toEqual({ n: 0, sinLlamar: 1, reloj: null, habiles: null, pocos: true })
  })
})

describe('tareas', () => {
  const t = (id: string, o: Record<string, unknown> = {}) => ({
    id, title: `T ${id}`, tipo: 'llamada' as const, due_date: '2026-11-25', due_time: '09:00', todoElDia: false,
    vencimiento: { texto: 'Vencida hace 1 h', estado: 'vencida' }, enlace: '/x', contacto: { id: 'c1', nombre: 'M' }, asignado: null, ...o,
  })
  it('la coordinación no ve las llamadas que ya están en la cola', () => {
    expect(tareasSinLasDeLaCola([t('a'), t('b', { contacto: { id: 'c9', nombre: 'N' } }), t('c', { tipo: 'mensaje' })], new Set(['c1'])).map((x) => x.id)).toEqual(['b', 'c'])
  })
  it('para mañana', () => {
    expect(paraManana([t('a', { due_date: '2026-11-26' }), t('b', { due_date: '2026-11-27' })], AHORA).map((x) => x.id)).toEqual(['a'])
  })
  it('colapsa las copias de la coordinación', () => {
    expect(colapsarCopias([t('a'), t('b', { title: 'T a' }), t('c', { title: 'Otra' })]).map((x) => x.id)).toEqual(['a', 'c'])
  })
})

describe('saludo y fecha', () => {
  it('saludo', () => {
    expect(saludo('coordinador', 'Paula Pandolfo')).toBe('Hola, Paula')
    expect(saludo('admin', 'Raúl')).toBe('Inicio · vista del dueño')
    expect(saludo('dueno', 'Diego')).toBe('Inicio · vista del dueño')
    expect(saludo('asesor', null)).toBe('Hola')
  })
  it('fecha', () => {
    expect(fechaDeHoy(AHORA)).toBe('Miércoles 25 de noviembre · 10:40')
  })
})
