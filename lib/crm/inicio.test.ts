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
  solicitudesSinTarea,
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
const _proximo = (o: Partial<Exclude<FilaCartera['proximo'], null | 'error'>>) => ({
  clase: 'tarea' as const, titulo: 'Primera llamada', vence: { due_date: '2026-11-25', due_time: '09:00', all_day: false },
  quien: { id: COORD, nombre: 'Paula' }, espera: null, instante: ar('2026-11-25', '09:00').toISOString(), ...o,
})

const tarea = (o: Record<string, unknown>) => ({
  id: 't', deal_id: 'd1', title: 'Llamada', tipo: 'llamada' as const, due_date: '2026-11-25', due_time: '09:00', todoElDia: false,
  vencimiento: { texto: 'Vencida hace 1 h', estado: 'vencida' }, enlace: '/x', contacto: { id: 'c1', nombre: 'M' },
  asignado: { id: COORD, nombre: 'Paula' }, ...o,
})

describe('colaParaLlamar', () => {
  it('sin primer contacto y llamadas vencidas de cualquier coordinadora; una vez por persona; de la más vieja a la más nueva', () => {
    const r = colaParaLlamar(
      [
        fila({ id: 'd2', contactoId: 'c2', nombre: 'Patricia', creadoEn: ar('2026-11-25', '10:12').toISOString() }),
        fila({ id: 'd1' }),
        fila({
          id: 'd3', contactoId: 'c3', nombre: 'Rubén', creadoEn: ar('2026-11-23', '11:30').toISOString(),
          ultimoContacto: { at: ar('2026-11-24', '11:00').toISOString(), que: 'llamada', resultado: 'no_atendio' },
        }),
        fila({ id: 'd3b', contactoId: 'c3', nombre: 'Rubén', creadoEn: ar('2026-11-24', '11:30').toISOString() }),
      ],
      [
        tarea({ id: 'e1', deal_id: 'd1' }),
        tarea({ id: 'e2', deal_id: 'd2', vencimiento: { texto: 'Espera hace 28 min', estado: 'vencida' } }),
        // La "Llamada 2" de Rubén es de la OTRA coordinadora: igual entra (cola única).
        tarea({ id: 'r2', deal_id: 'd3', title: 'Llamar a Rubén', asignado: { id: 'u-julia', nombre: 'Julia' } }),
      ],
      new Map([['d3', 1]]),
      AHORA,
    )
    expect(r.map((x) => x.nombre)).toEqual(['Rubén', 'Marcela Ibáñez', 'Patricia'])
    expect(r[0]).toMatchObject({ llamada: 'Llamada 2', estado: { texto: 'Vencida hace 1 h', tipo: 'vencida' }, anterior: 'Anterior: no atendió, ayer', registrado: 'Se registró hace 2 días' })
    expect(r[1]).toMatchObject({ llamada: 'Llamada 1', estado: { texto: 'Vencida hace 1 h' } })
    expect(r[2]).toMatchObject({ llamada: 'Llamada 1', estado: { texto: 'Espera hace 28 min', tipo: 'espera' } })
  })

  it('una llamada vencida de una solicitud de antes del registro también entra', () => {
    const r = colaParaLlamar(
      [fila({ anteriorAlRegistro: true, ultimoContacto: { at: AHORA.toISOString(), que: 'llamada', resultado: 'no_atendio' } })],
      [tarea({})],
      new Map([['d1', 1]]),
      AHORA,
    )
    expect(r.map((x) => x.llamada)).toEqual(['Llamada 2'])
  })

  it('sin primer contacto y sin tarea: espera desde el registro', () => {
    const [x] = colaParaLlamar([fila({})], [], new Map(), AHORA)
    expect(x.estado).toEqual({ texto: 'Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles', tipo: 'espera' })
  })

  it('no entran: cerrados, colegas, clases, mensajes ni llamadas que todavía no vencen de quien ya tuvo contacto', () => {
    const contacto = { at: AHORA.toISOString(), que: 'llamada' as const, resultado: 'no_atendio' as const }
    const r = colaParaLlamar(
      [
        fila({ id: 'x', contactoId: 'x', abierto: false }),
        fila({ id: 'y', contactoId: 'y', colega: true }),
        fila({ id: 'z', contactoId: 'z', etapa: 'clase_gratuita' }),
        fila({ id: 'w', contactoId: 'w', ultimoContacto: contacto }),
        fila({ id: 'v', contactoId: 'v', ultimoContacto: contacto }),
      ],
      [tarea({ deal_id: 'w', tipo: 'mensaje' }), tarea({ deal_id: 'v', vencimiento: { texto: 'Mañana 9:00', estado: 'proxima' } })],
      new Map(),
      AHORA,
    )
    expect(r).toEqual([])
  })
})

describe('sin respuesta y sin próximo paso', () => {
  const intento = (id: string, deal: string, kind: 'call' | 'whatsapp_sent', cuando: Date, call_outcome: string | null = null) => ({
    id, deal_id: deal, kind, call_outcome, occurred_at: cuando.toISOString(), created_at: cuando.toISOString(), voided_at: null,
  })
  const AHORA2 = ar('2026-12-02', '10:40')
  const filas = [
    fila({ id: 'g', contactoId: 'cg', nombre: 'Gustavo', creadoEn: ar('2026-11-26', '12:00').toISOString(), ultimoContacto: { at: ar('2026-11-30', '10:00').toISOString(), que: 'whatsapp', resultado: null } }),
    fila({ id: 's', contactoId: 'cs', nombre: 'Sin tarea', creadoEn: ar('2026-11-27', '12:00').toISOString(), ultimoContacto: { at: ar('2026-11-28', '10:00').toISOString(), que: 'llamada', resultado: 'numero_equivocado' } }),
    fila({ id: 'h', contactoId: 'ch', nombre: 'Con tarea en la ficha', ultimoContacto: { at: AHORA2.toISOString(), que: 'whatsapp', resultado: null } }),
    fila({ id: 'n', contactoId: 'cn', nombre: 'Sin contacto todavía' }),
  ]
  it('reparte en "con WhatsApp" y "sin próximo paso"; una tarea del contacto (de la ficha) lo saca', () => {
    const sinTarea = solicitudesSinTarea(filas, new Set(['ch']))
    expect(sinTarea.map((f) => f.id)).toEqual(['g', 's'])
    const intentos = new Map([
      ['g', [intento('1', 'g', 'call', ar('2026-11-27', '10:00'), 'no_atendio'), intento('2', 'g', 'call', ar('2026-11-28', '10:00'), 'no_atendio'), intento('3', 'g', 'whatsapp_sent', ar('2026-11-30', '10:00'))]],
      ['s', [intento('4', 's', 'call', ar('2026-11-28', '10:00'), 'numero_equivocado')]],
    ]) as never
    const r = sinRespuesta(sinTarea, intentos, AHORA2)
    expect(r.conWhatsapp).toEqual([expect.objectContaining({ nombre: 'Gustavo', linea: 'WhatsApp enviado hace 2 días · 2 llamadas sin atender', registrado: 'Se registró 26 nov' })])
    expect(r.sinProximo).toEqual([expect.objectContaining({ nombre: 'Sin tarea', linea: 'Sin tarea pendiente · último contacto hace 4 días · 1 llamada' })])
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
    expect(leadsSinPrimerContacto([fila({ colega: true })], AHORA)).toEqual([])
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
  it('la coordinación no ve las llamadas que ya están en la cola (por proceso), sí un mensaje de esa persona', () => {
    const cola = [{ procesoId: 'd1', contactoId: 'c1' }] as never
    expect(tareasSinLasDeLaCola([t('a', { deal_id: 'd1' }), t('b', { deal_id: 'd9' }), t('c', { deal_id: 'd1', tipo: 'mensaje' }), t('d', { deal_id: null })], cola).map((x) => x.id)).toEqual(['b', 'c'])
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
