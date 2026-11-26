// Reglas de la cadencia de llamadas (design.md D2; spec crm-cadencia-llamadas).
// Un caso por escenario: la tabla es la spec ejecutable.
import { describe, expect, it } from 'vitest'
import { numerarLlamadas } from './actividades'
import {
  cierraSoloPropias,
  decidirCadencia,
  estadoCadencia,
  hayTareaWhatsappDeCadenciaPendiente,
  tareasACerrar,
  type DecisionCadencia,
  type EntradaCadencia,
  type IntentoDeCadencia,
  type TareaPendiente,
} from './cadencia'
import type { ResultadoLlamada } from './tipos'

// Calendario de noviembre de 2026: martes 24, miércoles 25, jueves 26, viernes 27,
// sábado 28, domingo 29, lunes 30. Argentina = UTC−3.

let secuencia = 0
type Opciones = { deal?: string | null; creado?: string; anulado?: boolean; id?: string }

function llamada(resultado: ResultadoLlamada, ocurrio: string, o: Opciones = {}): IntentoDeCadencia {
  secuencia += 1
  return {
    id: o.id ?? `act-${secuencia}`,
    deal_id: o.deal === undefined ? 'deal-1' : o.deal,
    kind: 'call',
    call_outcome: resultado,
    occurred_at: ocurrio,
    created_at: o.creado ?? ocurrio,
    voided_at: o.anulado ? ocurrio : null,
  }
}

function whatsapp(ocurrio: string, o: Opciones = {}): IntentoDeCadencia {
  return { ...llamada('no_atendio', ocurrio, o), kind: 'whatsapp_sent', call_outcome: null }
}

const NA = (h: string, o?: Opciones) => llamada('no_atendio', h, o)
const VOLVER = (h: string, o?: Opciones) => llamada('volver_a_llamar', h, o)

/**
 * Arma la entrada como la arma `aplicarCadencia` (D4): el evaluado es el último elemento
 * del historial que se pasa (el que se acaba de guardar), y su número sale de
 * `numerarLlamadas` sobre los intentos no anulados.
 */
function entradaDesde(historial: IntentoDeCadencia[], o: Partial<EntradaCadencia> = {}): EntradaCadencia {
  const evaluado = historial[historial.length - 1]
  const vivos = historial.filter((i) => !i.voided_at)
  const numeros = numerarLlamadas(vivos)
  return {
    evaluado,
    intentosDelProceso: historial,
    numeroDeIntento: evaluado.kind === 'call' ? (numeros.get(evaluado.id) ?? null) : null,
    nombreContacto: 'María López',
    situacion: 'solicitud',
    puedeConvertir: true,
    puedeCerrar: true,
    puedeAbrir: true,
    procesoPropio: true,
    hayTareaWhatsappDeCadenciaPendiente: false,
    volverEl: null,
    cargadoEn: new Date(evaluado.created_at),
    ...o,
  }
}

const decidir = (historial: IntentoDeCadencia[], o?: Partial<EntradaCadencia>) =>
  decidirCadencia(entradaDesde(historial, o))

// Martes 24/11 a distintas horas de Argentina, en UTC.
const MAR_10 = '2026-11-24T13:00:00.000Z'
const MAR_1030 = '2026-11-24T13:30:00.000Z'
const MAR_11 = '2026-11-24T14:00:00.000Z'
const MAR_12 = '2026-11-24T15:00:00.000Z'
const MAR_13 = '2026-11-24T16:00:00.000Z'
const MAR_14 = '2026-11-24T17:00:00.000Z'

const LLAMADA_2_MIERCOLES = { title: 'Llamada 2 a María López', channel: 'call', due_date: '2026-11-25', due_time: '09:00' }
const WHATSAPP_MIERCOLES = { title: 'Enviar WhatsApp a María López', channel: 'message', due_date: '2026-11-25', due_time: '09:00' }

const SIN_TAREA = (motivo: DecisionCadencia['motivoSinTarea']) => ({ tarea: null, motivoSinTarea: motivo })

describe('estadoCadencia', () => {
  it.each<[string, IntentoDeCadencia[], { noAtendioSeguidas: number; whatsappEnLaRacha: boolean }]>([
    ['sin intentos', [], { noAtendioSeguidas: 0, whatsappEnLaRacha: false }],
    ['una no atendida', [NA(MAR_10)], { noAtendioSeguidas: 1, whatsappEnLaRacha: false }],
    ['tres no atendidas', [NA(MAR_10), NA(MAR_11), NA(MAR_12)], { noAtendioSeguidas: 3, whatsappEnLaRacha: false }],
    ['no atendió, atendió, no atendió', [NA(MAR_10), VOLVER(MAR_11), NA(MAR_12)], { noAtendioSeguidas: 1, whatsappEnLaRacha: false }],
    ['WhatsApp solo', [whatsapp(MAR_10)], { noAtendioSeguidas: 0, whatsappEnLaRacha: true }],
    ['WhatsApp y después no atendió', [whatsapp(MAR_10), NA(MAR_11)], { noAtendioSeguidas: 1, whatsappEnLaRacha: true }],
    [
      'WhatsApp viejo antes de la última atendida',
      [NA(MAR_10), NA(MAR_11), whatsapp(MAR_12), VOLVER(MAR_13), NA(MAR_14)],
      { noAtendioSeguidas: 1, whatsappEnLaRacha: false },
    ],
    ['una anulada no cuenta', [NA(MAR_10, { anulado: true }), NA(MAR_11)], { noAtendioSeguidas: 1, whatsappEnLaRacha: false }],
    ['un WhatsApp anulado no cuenta', [whatsapp(MAR_10, { anulado: true }), NA(MAR_11)], { noAtendioSeguidas: 1, whatsappEnLaRacha: false }],
    ['ordena por la hora, no por la posición', [NA(MAR_12), VOLVER(MAR_10)], { noAtendioSeguidas: 1, whatsappEnLaRacha: false }],
  ])('%s', (_n, intentos, esperado) => {
    expect(estadoCadencia(intentos)).toEqual(esperado)
  })
})

describe('decidirCadencia — una llamada no atendida agenda la siguiente', () => {
  it('primera no atendida un martes → "Llamada 2" para el miércoles 9:00', () => {
    expect(decidir([NA(MAR_10)])).toEqual<DecisionCadencia>({
      aplica: true,
      tarea: LLAMADA_2_MIERCOLES,
      motivoSinTarea: null,
      cerrarWhatsapp: false,
      ofrecer: null,
    })
  })

  it('un asesor en su propio proceso: corre igual (la tarea la asigna quien registra)', () => {
    expect(decidir([NA(MAR_10)], { procesoPropio: true, puedeConvertir: false, puedeCerrar: false })).toMatchObject({
      tarea: LLAMADA_2_MIERCOLES,
    })
  })

  it('viernes 27 → lunes 30', () => {
    expect(decidir([NA('2026-11-27T15:00:00.000Z')]).tarea).toMatchObject({ due_date: '2026-11-30', due_time: '09:00' })
  })

  it.each([
    ['sábado', '2026-11-28T15:00:00.000Z'],
    ['domingo', '2026-11-29T15:00:00.000Z'],
  ])('%s → lunes 30', (_n, cuando) => {
    expect(decidir([NA(cuando)]).tarea).toMatchObject({ due_date: '2026-11-30', due_time: '09:00' })
  })

  it('miércoles → jueves', () => {
    expect(decidir([NA('2026-11-25T15:00:00.000Z')]).tarea).toMatchObject({ due_date: '2026-11-26' })
  })

  it('martes 22:30 de Argentina (ya miércoles en UTC) → miércoles, no jueves', () => {
    expect(decidir([NA('2026-11-25T01:30:00+00:00')]).tarea).toMatchObject({ due_date: '2026-11-25' })
  })

  it('miércoles 00:30 de Argentina → jueves', () => {
    expect(decidir([NA('2026-11-25T03:30:00.000Z')]).tarea).toMatchObject({ due_date: '2026-11-26' })
  })

  it('feriado: queda igual para ese día (jueves 24/12 → viernes 25/12)', () => {
    expect(decidir([NA('2026-12-24T15:00:00.000Z')]).tarea).toMatchObject({ due_date: '2026-12-25' })
  })

  it('reintento al día siguiente: decide con el momento en que se cargó, no con el de hoy', () => {
    const martes = NA(MAR_10)
    expect(decidir([martes], { cargadoEn: new Date(martes.created_at) }).tarea).toMatchObject({ due_date: '2026-11-25' })
  })

  it('el número mostrado no es la racha: la quinta llamada, primera no atendida → "Llamada 6"', () => {
    const historial = [VOLVER(MAR_10), VOLVER(MAR_11), VOLVER(MAR_12), VOLVER(MAR_13), NA(MAR_14)]
    expect(decidir(historial).tarea?.title).toBe('Llamada 6 a María López')
  })

  it('atendió en el medio: no atendió, atendió, no atendió → "Llamada 4"', () => {
    expect(decidir([NA(MAR_10), VOLVER(MAR_11), NA(MAR_12)]).tarea).toMatchObject({
      title: 'Llamada 4 a María López',
      channel: 'call',
    })
  })

  it('una anulada no cuenta: cuenta como primera no atendida seguida', () => {
    expect(decidir([NA(MAR_10, { anulado: true }), NA(MAR_11)]).tarea).toEqual(LLAMADA_2_MIERCOLES)
  })

  it('WhatsApp viejo y después atendió: se crea una tarea de llamada', () => {
    const historial = [NA(MAR_10), NA(MAR_11), whatsapp(MAR_12), VOLVER(MAR_13), NA(MAR_14)]
    expect(decidir(historial).tarea).toMatchObject({ title: 'Llamada 5 a María López', channel: 'call' })
  })

  it('la hora corregida que igual queda última: corre normal', () => {
    const ayer = NA('2026-11-23T15:00:00.000Z')
    const recien = NA(MAR_10, { creado: MAR_1030 })
    expect(decidir([ayer, recien])).toMatchObject({ aplica: true, tarea: WHATSAPP_MIERCOLES })
  })

  it('ordena aunque las fechas vengan en distintos formatos de UTC', () => {
    // 10:30−03:00 es 13:30Z: queda DESPUÉS de la de las 13:00Z.
    const primera = NA('2026-11-24T13:00:00+00:00')
    const segunda = NA('2026-11-24T10:30:00-03:00')
    expect(decidir([primera, segunda])).toMatchObject({ aplica: true, tarea: WHATSAPP_MIERCOLES })
  })
})

describe('decidirCadencia — dos no atendidas seguidas piden un WhatsApp', () => {
  it('segunda no atendida → "Enviar WhatsApp", de tipo mensaje, y no "Llamada 3"', () => {
    expect(decidir([NA(MAR_10), NA(MAR_11)])).toEqual<DecisionCadencia>({
      aplica: true,
      tarea: WHATSAPP_MIERCOLES,
      motivoSinTarea: null,
      cerrarWhatsapp: false,
      ofrecer: null,
    })
  })

  it('tercera con la tarea de WhatsApp de la cadencia pendiente → no crea otra', () => {
    expect(decidir([NA(MAR_10), NA(MAR_11), NA(MAR_12)], { hayTareaWhatsappDeCadenciaPendiente: true })).toMatchObject(
      SIN_TAREA('whatsapp_ya_pendiente'),
    )
  })

  it('la tarea de WhatsApp se completó con el tilde, sin marcar el WhatsApp → crea otra "Enviar WhatsApp"', () => {
    expect(decidir([NA(MAR_10), NA(MAR_11), NA(MAR_12)], { hayTareaWhatsappDeCadenciaPendiente: false }).tarea).toEqual(
      WHATSAPP_MIERCOLES,
    )
  })

  it('la segunda no atendida decidida dos veces da lo mismo', () => {
    const historial = [NA(MAR_10), NA(MAR_11)]
    const evaluado = historial[1]
    const primera = decidir(historial)
    // La segunda vez ya existe la tarea que creó ella misma: no cuenta como pendiente.
    const propia = tarea({ id: 't-propia', channel: 'message', source_activity_id: evaluado.id, created_at: '2026-11-24T14:00:01.000Z' })
    const hay = hayTareaWhatsappDeCadenciaPendiente([propia], {
      evaluadoId: evaluado.id,
      dealId: 'deal-1',
      contactId: 'contacto-1',
      creadasAntesDe: evaluado.created_at,
    })
    expect(hay).toBe(false)
    expect(decidir(historial, { hayTareaWhatsappDeCadenciaPendiente: hay })).toEqual(primera)
  })
})

describe('decidirCadencia — el WhatsApp marcado termina la secuencia', () => {
  it('marcar el WhatsApp después de dos no atendidas → secuencia terminada, cierra la tarea de WhatsApp', () => {
    expect(decidir([NA(MAR_10), NA(MAR_11), whatsapp(MAR_12)])).toEqual<DecisionCadencia>({
      aplica: true,
      tarea: null,
      motivoSinTarea: 'secuencia_terminada',
      cerrarWhatsapp: true,
      ofrecer: null,
    })
  })

  it('no atendió después del WhatsApp → nada, "ya se le mandó"', () => {
    expect(decidir([NA(MAR_10), NA(MAR_11), whatsapp(MAR_12), NA(MAR_13)])).toMatchObject(
      SIN_TAREA('whatsapp_ya_enviado'),
    )
  })

  it('WhatsApp sin llamadas previas y después no atendió → "Llamada 1", nada', () => {
    const historial = [whatsapp(MAR_10), NA(MAR_11)]
    expect(entradaDesde(historial).numeroDeIntento).toBe(1)
    expect(decidir(historial)).toMatchObject(SIN_TAREA('whatsapp_ya_enviado'))
  })

  it('volver a llamar, WhatsApp, no atendió → nada (el WhatsApp es posterior a la atendida)', () => {
    expect(decidir([VOLVER(MAR_10), whatsapp(MAR_11), NA(MAR_12)])).toMatchObject(SIN_TAREA('whatsapp_ya_enviado'))
  })

  it('un WhatsApp sin proceso también termina la secuencia', () => {
    expect(decidir([whatsapp(MAR_10, { deal: null })], { situacion: 'sin_proceso' })).toMatchObject({
      aplica: true,
      ...SIN_TAREA('secuencia_terminada'),
      cerrarWhatsapp: true,
    })
  })
})

describe('decidirCadencia — un intento cargado fuera de orden no mueve tareas', () => {
  it('no atendió cargada después de una atendida más nueva → no crea ni cierra', () => {
    const atendida = VOLVER(MAR_1030)
    const vieja = NA(MAR_10, { creado: MAR_11 })
    expect(decidir([atendida, vieja])).toMatchObject({ aplica: false, ...SIN_TAREA('fuera_de_orden') })
  })

  it('volver a llamar fuera de orden → no crea la tarea "Llamar a…"', () => {
    const reciente = NA(MAR_1030)
    const vieja = VOLVER(MAR_10, { creado: MAR_11 })
    expect(
      decidir([reciente, vieja], { volverEl: { fecha: '2026-11-25', hora: '16:00' } }),
    ).toMatchObject({ aplica: false, ...SIN_TAREA('fuera_de_orden') })
  })

  it('WhatsApp marcado fuera de orden sobre un proceso ajeno → fuera de orden, no proceso ajeno', () => {
    const reciente = NA(MAR_1030)
    const wa = whatsapp(MAR_10, { creado: MAR_11 })
    expect(decidir([reciente, wa], { procesoPropio: false, puedeAbrir: false })).toMatchObject({
      aplica: false,
      ...SIN_TAREA('fuera_de_orden'),
    })
  })

  it('fuera de orden conserva el `ofrecer` que le correspondería', () => {
    const reciente = NA(MAR_1030)
    const agendo = llamada('agendo', MAR_10, { creado: MAR_11 })
    expect(decidir([reciente, agendo])).toMatchObject({
      aplica: false,
      motivoSinTarea: 'fuera_de_orden',
      ofrecer: 'coordinar_solicitud',
    })
  })

  it('fuera de orden entre los registros sin proceso del contacto', () => {
    const reciente = NA(MAR_1030, { deal: null })
    const vieja = VOLVER(MAR_10, { deal: null, creado: MAR_11 })
    expect(
      decidir([reciente, vieja], { situacion: 'sin_proceso', volverEl: { fecha: '2026-11-25', hora: '16:00' } }),
    ).toMatchObject({ aplica: false, ...SIN_TAREA('fuera_de_orden') })
  })

  it('un intento posterior ANULADO no deja al evaluado fuera de orden', () => {
    const anulada = NA(MAR_1030, { anulado: true })
    const vieja = NA(MAR_10, { creado: MAR_11 })
    expect(decidir([anulada, vieja])).toMatchObject({ aplica: true, tarea: LLAMADA_2_MIERCOLES })
  })
})

describe('decidirCadencia — qué regla gana cuando se cruzan dos (No atendió)', () => {
  it('1 vs 2: fuera de orden y sin proceso → fuera de orden', () => {
    const reciente = NA(MAR_1030, { deal: null })
    const vieja = NA(MAR_10, { deal: null, creado: MAR_11 })
    expect(decidir([reciente, vieja], { situacion: 'sin_proceso' })).toMatchObject(SIN_TAREA('fuera_de_orden'))
  })

  it('1 vs 4: fuera de orden y con WhatsApp en la racha → fuera de orden', () => {
    const wa = whatsapp(MAR_10)
    const reciente = NA(MAR_12)
    const vieja = NA(MAR_11, { creado: MAR_13 })
    expect(decidir([wa, reciente, vieja])).toMatchObject({ aplica: false, ...SIN_TAREA('fuera_de_orden') })
  })

  it('2 vs 3: sin proceso y "proceso ajeno" → sin proceso', () => {
    expect(decidir([NA(MAR_10, { deal: null })], { situacion: 'sin_proceso', procesoPropio: false })).toMatchObject(
      SIN_TAREA('sin_proceso'),
    )
  })

  it('3 vs 4: proceso ajeno y con WhatsApp en la racha → proceso ajeno', () => {
    expect(decidir([whatsapp(MAR_10), NA(MAR_11)], { procesoPropio: false })).toMatchObject(SIN_TAREA('proceso_ajeno'))
  })

  it('4 vs 5: WhatsApp marcado y tarea de WhatsApp pendiente → "ya se le mandó"', () => {
    expect(
      decidir([NA(MAR_10), NA(MAR_11), whatsapp(MAR_12), NA(MAR_13)], { hayTareaWhatsappDeCadenciaPendiente: true }),
    ).toMatchObject(SIN_TAREA('whatsapp_ya_enviado'))
  })

  it('5 vs 6: racha 2 y tarea de WhatsApp pendiente → no crea otra', () => {
    expect(decidir([NA(MAR_10), NA(MAR_11)], { hayTareaWhatsappDeCadenciaPendiente: true })).toMatchObject(
      SIN_TAREA('whatsapp_ya_pendiente'),
    )
  })

  it('ninguna excepción: primera no atendida, propia, en orden, sin WhatsApp → "Llamada 2"', () => {
    expect(decidir([NA(MAR_10)]).tarea).toEqual(LLAMADA_2_MIERCOLES)
  })

  // Caso alcanzable: NA, NA (crea WhatsApp), un asesor ajeno registra "Atendió" (no cierra
  // la tarea de la coordinación), la coordinadora registra NA (racha 1). Manda la spec.
  it('racha 1 con la tarea de WhatsApp de la cadencia pendiente → no crea "Llamada N+1"', () => {
    expect(decidir([NA(MAR_10)], { hayTareaWhatsappDeCadenciaPendiente: true })).toMatchObject(
      SIN_TAREA('whatsapp_ya_pendiente'),
    )
  })
})

describe('decidirCadencia — sin proceso activo y proceso ajeno', () => {
  it('no atendió sin proceso → nada', () => {
    expect(decidir([NA(MAR_10, { deal: null })], { situacion: 'sin_proceso' })).toMatchObject({
      aplica: true,
      ...SIN_TAREA('sin_proceso'),
      ofrecer: null,
    })
  })

  it('no atendió sobre un proceso ajeno → nada', () => {
    expect(decidir([NA(MAR_10)], { procesoPropio: false, puedeAbrir: false })).toMatchObject({
      aplica: true,
      ...SIN_TAREA('proceso_ajeno'),
    })
  })

  it('WhatsApp marcado sobre un proceso ajeno → proceso ajeno (gana sobre secuencia terminada)', () => {
    expect(decidir([NA(MAR_10), whatsapp(MAR_11)], { procesoPropio: false })).toMatchObject({
      aplica: true,
      ...SIN_TAREA('proceso_ajeno'),
      cerrarWhatsapp: true,
    })
  })

  it('el intento del asesor cuenta en la racha: después la coordinadora → "Enviar WhatsApp"', () => {
    const delAsesor = NA(MAR_10)
    expect(decidir([delAsesor, NA(MAR_11)], { procesoPropio: true })).toMatchObject({ tarea: WHATSAPP_MIERCOLES })
  })

  it('"Agendó" de un asesor en un proceso ajeno en Coordinada → `proceso_ya_coordinado`, sin botón', () => {
    expect(
      decidir([llamada('agendo', MAR_10)], {
        situacion: 'coordinada_o_posterior',
        procesoPropio: false,
        puedeAbrir: false,
        puedeConvertir: false,
        puedeCerrar: false,
      }),
    ).toMatchObject({ ...SIN_TAREA('no_corresponde'), ofrecer: 'proceso_ya_coordinado' })
  })
})

describe('decidirCadencia — volver a llamar agenda en el día y la hora pedidos', () => {
  const VOLVER_EL = { fecha: '2026-11-25', hora: '16:00' }

  it('mañana a las 16:00', () => {
    expect(decidir([VOLVER(MAR_10)], { volverEl: VOLVER_EL })).toEqual<DecisionCadencia>({
      aplica: true,
      tarea: { title: 'Llamar a María López', channel: 'call', due_date: '2026-11-25', due_time: '16:00' },
      motivoSinTarea: null,
      cerrarWhatsapp: true,
      ofrecer: null,
    })
  })

  it('pidió un sábado a las 11:00: no se mueve al lunes', () => {
    expect(decidir([VOLVER(MAR_10)], { volverEl: { fecha: '2026-11-28', hora: '11:00' } }).tarea).toMatchObject({
      due_date: '2026-11-28',
      due_time: '11:00',
    })
  })

  it('sin proceso activo: crea igual su tarea', () => {
    expect(
      decidir([VOLVER(MAR_10, { deal: null })], { situacion: 'sin_proceso', volverEl: VOLVER_EL }).tarea?.title,
    ).toBe('Llamar a María López')
  })

  it('sobre un proceso ajeno: crea igual su tarea', () => {
    expect(decidir([VOLVER(MAR_10)], { procesoPropio: false, puedeAbrir: false, volverEl: VOLVER_EL })).toMatchObject({
      motivoSinTarea: null,
      tarea: { title: 'Llamar a María López' },
    })
  })

  it('con un WhatsApp marcado antes: crea igual su tarea (lo pidió la persona)', () => {
    expect(decidir([whatsapp(MAR_10), VOLVER(MAR_11)], { volverEl: VOLVER_EL }).tarea?.title).toBe('Llamar a María López')
  })

  it('sin día ni hora pedidos falla ruidoso: es un dato roto, no una decisión', () => {
    expect(() => decidir([VOLVER(MAR_10)], { volverEl: null })).toThrow(/volver a llamar/i)
  })

  it('una "No atendió" sin número falla ruidoso', () => {
    expect(() => decidir([NA(MAR_10)], { numeroDeIntento: null })).toThrow(/número/i)
  })
})

describe('decidirCadencia — los resultados que no agendan ofrecen el paso siguiente', () => {
  const AGENDO = () => [llamada('agendo', MAR_10)]
  const NO_INTERESA = () => [llamada('no_interesa', MAR_10)]
  const EQUIVOCADO = () => [llamada('numero_equivocado', MAR_10)]

  it.each<[string, IntentoDeCadencia[], Partial<EntradaCadencia>, DecisionCadencia['ofrecer']]>([
    ['Agendó, solicitud que puede coordinar', AGENDO(), { situacion: 'solicitud', puedeConvertir: true }, 'coordinar_solicitud'],
    ['Agendó, clase gratuita', AGENDO(), { situacion: 'clase_gratuita' }, 'coordinar_nuevo'],
    ['Agendó, sin proceso activo', [llamada('agendo', MAR_10, { deal: null })], { situacion: 'sin_proceso' }, 'coordinar_nuevo'],
    ['Agendó, coordinada y puede abrirla', AGENDO(), { situacion: 'coordinada_o_posterior', puedeAbrir: true }, 'abrir_proceso'],
    ['Agendó, coordinada y no puede abrirla', AGENDO(), { situacion: 'coordinada_o_posterior', puedeAbrir: false }, 'proceso_ya_coordinado'],
    ['Agendó, solicitud que no puede coordinar', AGENDO(), { situacion: 'solicitud', puedeConvertir: false }, 'pedir_coordinacion'],
    ['No le interesa, puede cerrar', NO_INTERESA(), { puedeCerrar: true }, 'cerrar_proceso'],
    ['Número equivocado, puede cerrar', EQUIVOCADO(), { puedeCerrar: true }, 'cerrar_proceso'],
    ['No le interesa, no puede cerrar', NO_INTERESA(), { puedeCerrar: false }, 'pedir_cierre'],
    ['Número equivocado, no puede cerrar', EQUIVOCADO(), { puedeCerrar: false }, 'pedir_cierre'],
    ['No le interesa, sin proceso', [llamada('no_interesa', MAR_10, { deal: null })], { situacion: 'sin_proceso' }, 'nada_que_cerrar'],
    ['Número equivocado, sin proceso', [llamada('numero_equivocado', MAR_10, { deal: null })], { situacion: 'sin_proceso' }, 'nada_que_cerrar'],
    ['No le interesa, sin proceso aunque "pueda cerrar"', [llamada('no_interesa', MAR_10, { deal: null })], { situacion: 'sin_proceso', puedeCerrar: true }, 'nada_que_cerrar'],
    ['No le interesa en una clase gratuita', NO_INTERESA(), { situacion: 'clase_gratuita', puedeCerrar: true }, 'cerrar_proceso'],
  ])('%s', (_n, historial, o, ofrecer) => {
    expect(decidir(historial, o)).toEqual<DecisionCadencia>({
      aplica: true,
      tarea: null,
      motivoSinTarea: 'no_corresponde',
      cerrarWhatsapp: true,
      ofrecer,
    })
  })

  it.each<[string, IntentoDeCadencia[]]>([
    ['No atendió', [NA(MAR_10)]],
    ['WhatsApp', [whatsapp(MAR_10)]],
  ])('%s no ofrece nada', (_n, historial) => {
    expect(decidir(historial).ofrecer).toBeNull()
  })

  describe('se calcula con quien hace el pedido, no con quien registró', () => {
    it('"Agendó" de la coordinadora reintentado por un asesor que no puede convertir → pedir coordinación', () => {
      expect(decidir(AGENDO(), { procesoPropio: true, puedeConvertir: false })).toMatchObject({
        ofrecer: 'pedir_coordinacion',
      })
    })

    it('"No le interesa" reintentado por alguien que no puede cerrar → pedir cierre', () => {
      expect(decidir(NO_INTERESA(), { procesoPropio: true, puedeCerrar: false }).ofrecer).toBe('pedir_cierre')
    })

    it('"Agendó" en Coordinada reintentado por quien no puede abrirlo → sin botón', () => {
      expect(
        decidir(AGENDO(), { situacion: 'coordinada_o_posterior', procesoPropio: true, puedeAbrir: false }).ofrecer,
      ).toBe('proceso_ya_coordinado')
    })

    it('al revés: lo registró un asesor ajeno y lo reintenta la coordinadora → puede coordinar', () => {
      expect(decidir(AGENDO(), { procesoPropio: false, puedeConvertir: true }).ofrecer).toBe('coordinar_solicitud')
    })

    it('"No atendió" de la coordinadora reintentado por un asesor: la tarea sigue saliendo (decide quien registró)', () => {
      expect(
        decidir([NA(MAR_10)], { procesoPropio: true, puedeConvertir: false, puedeCerrar: false, puedeAbrir: false }).tarea,
      ).toEqual(LLAMADA_2_MIERCOLES)
    })
  })
})

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

const COORD_A = 'coord-a'
const COORD_B = 'coord-b'
const ASESOR = 'asesor-1'
const OTRO_ASESOR = 'asesor-2'
const ANTES = '2026-11-24T12:00:00.000Z'
const LA_LLAMADA = MAR_10
const DESPUES = '2026-11-24T13:00:01.000Z'

let numTarea = 0
function tarea(o: Partial<TareaPendiente> = {}): TareaPendiente {
  numTarea += 1
  return {
    id: `t-${numTarea}`,
    title: 'Tarea',
    type: 'follow_up',
    channel: 'call',
    assigned_to: COORD_A,
    assigned_role: 'coordinador',
    created_at: ANTES,
    deal_id: 'deal-1',
    contact_id: 'contacto-1',
    appraisal_id: null,
    source_activity_id: null,
    ...o,
  }
}

const entradaDeLead = (quien: string) =>
  tarea({ title: 'Nuevo lead: María López', type: 'update_contact', channel: null, assigned_to: quien })

type Contexto = Parameters<typeof tareasACerrar>[1]
const base: Contexto = {
  dealId: 'deal-1',
  contactId: 'contacto-1',
  registranteId: COORD_A,
  incluirWhatsapp: false,
  creadasAntesDe: LA_LLAMADA,
  soloPropias: false,
}
const ids = (ts: TareaPendiente[]) => ts.map((t) => t.id).sort()
function cierra(pendientes: TareaPendiente[], c: Partial<Contexto> = {}) {
  return ids(tareasACerrar(pendientes, { ...base, ...c }))
}

describe('tareasACerrar — registrar una llamada cierra lo pendiente de ese proceso', () => {
  it('la tarea de entrada de los dos coordinadores, también la del que no llamó', () => {
    const a = entradaDeLead(COORD_A)
    const b = entradaDeLead(COORD_B)
    expect(cierra([a, b])).toEqual(ids([a, b]))
  })

  it('la tarea del agente de tasación (update_contact sin tasación)', () => {
    const t = tarea({ title: 'Llamar para coordinar tasación: María López', type: 'update_contact', channel: null })
    expect(cierra([t])).toEqual([t.id])
  })

  it('la "actualizar contacto" ligada a una tasación sigue pendiente', () => {
    expect(cierra([tarea({ type: 'update_contact', channel: null, appraisal_id: 'tasacion-1' })])).toEqual([])
  })

  it('la de la cadencia de otra persona se cierra', () => {
    const t = tarea({ title: 'Llamada 2 a María López', assigned_to: COORD_B, source_activity_id: 'act-x' })
    expect(cierra([t])).toEqual([t.id])
  })

  it('la llamada que otra coordinadora se agendó a mano se cierra (por su rol)', () => {
    const t = tarea({ assigned_to: COORD_B, assigned_role: 'coordinador' })
    expect(cierra([t])).toEqual([t.id])
  })

  it('con el rol del asignado vacío, la manual de otra persona NO se cierra', () => {
    expect(cierra([tarea({ assigned_to: COORD_B, assigned_role: null })])).toEqual([])
  })

  it('la llamada que un asesor se agendó a mano sigue pendiente', () => {
    expect(cierra([tarea({ assigned_to: ASESOR, assigned_role: 'asesor' })])).toEqual([])
  })

  it('la propia manual se cierra', () => {
    const t = tarea({ assigned_to: COORD_A, assigned_role: 'admin' })
    expect(cierra([t])).toEqual([t.id])
  })

  it('el "Llamar a…" que un asesor creó con "volver a llamar" en un proceso ajeno se cierra cuando llama la coordinación', () => {
    const t = tarea({ title: 'Llamar a María López', assigned_to: ASESOR, assigned_role: 'asesor', source_activity_id: 'act-v' })
    expect(cierra([t])).toEqual([t.id])
  })

  it('las tareas de otro proceso siguen pendientes', () => {
    const llamadaDelOtro = tarea({ deal_id: 'deal-2', source_activity_id: 'act-x' })
    const entradaDelOtro = { ...entradaDeLead(COORD_A), deal_id: 'deal-2' }
    expect(cierra([llamadaDelOtro, entradaDelOtro])).toEqual([])
  })

  it('las ligadas solo a otro contacto siguen pendientes', () => {
    expect(cierra([tarea({ deal_id: null, contact_id: 'contacto-2' })])).toEqual([])
  })

  it('tareas de otro tipo (visita, documentación) siguen pendientes', () => {
    expect(cierra([tarea({ type: 'visit', channel: null }), tarea({ type: 'documentation', channel: null })])).toEqual([])
  })

  it('un mensaje creado a mano sigue pendiente, aun con incluirWhatsapp', () => {
    expect(cierra([tarea({ channel: 'message' })], { incluirWhatsapp: true })).toEqual([])
  })

  it('la tarea creada después de la actividad no se toca', () => {
    expect(cierra([tarea({ created_at: DESPUES, source_activity_id: 'act-posterior' })])).toEqual([])
  })

  it('creada en el mismo instante tampoco (el corte es estricto)', () => {
    expect(cierra([tarea({ created_at: LA_LLAMADA })])).toEqual([])
  })

  it('compara instantes aunque vengan en distintos formatos de UTC', () => {
    const t = tarea({ created_at: '2026-11-24T09:59:00-03:00' })
    expect(cierra([t], { creadasAntesDe: '2026-11-24T13:00:00+00:00' })).toEqual([t.id])
  })

  it('llamada atendida con la tarea "Enviar WhatsApp" de la cadencia pendiente → se cierra', () => {
    const wa = tarea({ title: 'Enviar WhatsApp a María López', channel: 'message', source_activity_id: 'act-2' })
    expect(cierra([wa], { incluirWhatsapp: true })).toEqual([wa.id])
  })

  it('no atendió con la tarea "Enviar WhatsApp" pendiente → sigue pendiente', () => {
    const wa = tarea({ channel: 'message', source_activity_id: 'act-2' })
    expect(cierra([wa], { incluirWhatsapp: false })).toEqual([])
  })
})

describe('tareasACerrar — con soloPropias', () => {
  it('proceso ajeno: deja la entrada de la coordinación y la cadencia de otro; cierra la llamada propia', () => {
    const entrada = entradaDeLead(COORD_A)
    const cadenciaDeOtro = tarea({ assigned_to: COORD_A, source_activity_id: 'act-x' })
    const propia = tarea({ assigned_to: ASESOR, assigned_role: 'asesor', source_activity_id: 'act-v' })
    expect(cierra([entrada, cadenciaDeOtro, propia], { registranteId: ASESOR, soloPropias: true })).toEqual([propia.id])
  })

  it('decide a nombre de quién está, no el tipo: una update_contact asignada a quien registra se cierra', () => {
    const t = tarea({ type: 'update_contact', channel: null, assigned_to: ASESOR, assigned_role: 'asesor' })
    expect(cierra([t], { registranteId: ASESOR, soloPropias: true })).toEqual([t.id])
  })

  it('WhatsApp marcado en proceso ajeno: la "Enviar WhatsApp" de la coordinación sigue pendiente', () => {
    const wa = tarea({ channel: 'message', source_activity_id: 'act-2', assigned_to: COORD_A })
    expect(cierra([wa], { registranteId: ASESOR, soloPropias: true, incluirWhatsapp: true })).toEqual([])
  })

  it('sin proceso, asesor: cierra su llamada ligada al contacto y deja la update_contact y la manual de la coordinación', () => {
    const suya = tarea({ deal_id: null, assigned_to: ASESOR, assigned_role: 'asesor', source_activity_id: 'act-v' })
    const actualizar = tarea({ deal_id: null, type: 'update_contact', channel: null, assigned_to: COORD_A })
    const manualCoord = tarea({ deal_id: null, assigned_to: COORD_A })
    expect(cierra([suya, actualizar, manualCoord], { dealId: null, registranteId: ASESOR, soloPropias: true })).toEqual([
      suya.id,
    ])
  })

  it('sin proceso, coordinadora: cierra las tres', () => {
    const delAsesor = tarea({ deal_id: null, assigned_to: ASESOR, assigned_role: 'asesor', source_activity_id: 'act-v' })
    const actualizar = tarea({ deal_id: null, type: 'update_contact', channel: null, assigned_to: COORD_A })
    const manualCoord = tarea({ deal_id: null, assigned_to: COORD_B })
    expect(cierra([delAsesor, actualizar, manualCoord], { dealId: null })).toEqual(ids([delAsesor, actualizar, manualCoord]))
  })

  it('espejo: la llamada que un asesor se creó a mano, ligada solo al contacto, queda cuando llama la coordinadora', () => {
    expect(cierra([tarea({ deal_id: null, assigned_to: OTRO_ASESOR, assigned_role: 'asesor' })], { dealId: null })).toEqual([])
  })

  it('sin proceso no toma las tareas de los procesos del contacto', () => {
    expect(cierra([tarea({ deal_id: 'deal-1' })], { dealId: null })).toEqual([])
  })
})

describe('cierraSoloPropias', () => {
  it.each<[string, { procesoPropio: boolean; rolRegistrante: string; dealId: string | null }, boolean]>([
    ['coordinadora en su proceso', { procesoPropio: true, rolRegistrante: 'coordinador', dealId: 'deal-1' }, false],
    ['asesor en su proceso', { procesoPropio: true, rolRegistrante: 'asesor', dealId: 'deal-1' }, false],
    ['asesor en un proceso ajeno', { procesoPropio: false, rolRegistrante: 'asesor', dealId: 'deal-1' }, true],
    ['asesor sin proceso', { procesoPropio: true, rolRegistrante: 'asesor', dealId: null }, true],
    ['coordinadora sin proceso', { procesoPropio: true, rolRegistrante: 'coordinador', dealId: null }, false],
    ['dueño sin proceso', { procesoPropio: true, rolRegistrante: 'dueno', dealId: null }, false],
  ])('%s', (_n, c, esperado) => {
    expect(cierraSoloPropias(c)).toBe(esperado)
  })
})

describe('hayTareaWhatsappDeCadenciaPendiente', () => {
  const c = { evaluadoId: 'act-3', dealId: 'deal-1' as string | null, contactId: 'contacto-1', creadasAntesDe: LA_LLAMADA }
  const waCadencia = (o: Partial<TareaPendiente> = {}) => tarea({ channel: 'message', source_activity_id: 'act-2', ...o })

  it('la de la cadencia, de otro intento y de este proceso → sí', () => {
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia()], c)).toBe(true)
  })

  it('un mensaje agendado a mano no frena', () => {
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia({ source_activity_id: null })], c)).toBe(false)
  })

  it('la de la cadencia en OTRO proceso no frena', () => {
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia({ deal_id: 'deal-viejo' })], c)).toBe(false)
  })

  it('la que creó el propio intento no cuenta', () => {
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia({ source_activity_id: 'act-3' })], c)).toBe(false)
  })

  it('una creada después del intento no cuenta', () => {
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia({ created_at: DESPUES })], c)).toBe(false)
  })

  it('una tarea de llamada de la cadencia no cuenta', () => {
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia({ channel: 'call' })], c)).toBe(false)
  })

  it('sin proceso: cuenta la del mismo contacto sin proceso, no la de un proceso', () => {
    const sinProceso = { ...c, dealId: null }
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia({ deal_id: null })], sinProceso)).toBe(true)
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia()], sinProceso)).toBe(false)
    expect(hayTareaWhatsappDeCadenciaPendiente([waCadencia({ deal_id: null, contact_id: 'otro' })], sinProceso)).toBe(false)
  })
})
