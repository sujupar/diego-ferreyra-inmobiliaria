import { describe, expect, it } from 'vitest'
import { armarAviso, textoToastPerdido, type EntradaAviso } from './aviso-guardado'
import type { BloqueCadencia } from '@/lib/supabase/cadencia'

const ahora = new Date('2026-11-25T13:00:00Z') // miércoles 10:00 AR

const cad = (c: Partial<BloqueCadencia> = {}): BloqueCadencia => ({
  aplica: true,
  tareaCreada: null,
  motivoSinTarea: null,
  tareasCerradas: [],
  ofrecer: null,
  dealId: 'd1',
  ...c,
})

const llamada = (e: Partial<EntradaAviso> & { resultado?: EntradaAviso['resultado'] } = {}): EntradaAviso => ({
  tipo: 'call',
  titulo: 'Llamada 1 · No atendió',
  intento: 1,
  resultado: 'no_atendio',
  cadencia: cad(),
  pendiente: false,
  contactoId: 'c1',
  nombreContacto: 'María López',
  etiquetaEtapa: 'Coordinada',
  ahora,
  ...e,
})

const textos = (a: ReturnType<typeof armarAviso>) => a.lineas.map((l) => l.texto)
const acciones = (a: ReturnType<typeof armarAviso>) => a.acciones.map((x) => x.tipo)

describe('armarAviso: tarea agendada', () => {
  it('"No atendió" con Llamada 2 para mañana 9:00 y "Ver en Tareas"', () => {
    const a = armarAviso(
      llamada({
        cadencia: cad({
          tareaCreada: { id: 't', title: 'Llamada 2 a María López', due_date: '2026-11-26', due_time: '09:00:00', channel: 'call' },
          motivoSinTarea: null,
        }),
      }),
    )
    expect(a.titulo).toBe('Llamada 1 · No atendió')
    expect(textos(a)).toEqual(['Se agendó Llamada 2 para mañana 9:00.'])
    expect(acciones(a)).toEqual(['ver_tareas'])
    expect(a.toast).toBe('Llamada 1 guardada. Se agendó Llamada 2 para mañana 9:00.')
  })
  it('crm-cadencia-paula: la Llamada 2 de esa misma tarde dice "para hoy 13:30"', () => {
    const a = armarAviso(
      llamada({ cadencia: cad({ tareaCreada: { id: 't', title: 'Llamada 2 a María López', due_date: '2026-11-25', due_time: '13:30:00', channel: 'call' } }) }),
    )
    expect(textos(a)).toEqual(['Se agendó Llamada 2 para hoy 13:30.'])
  })

  it('crm-cadencia-paula: el WhatsApp que vence ya dice "para ahora", no "recién" ni "hace 1 min"', () => {
    for (const hora of ['10:00:00', '09:59:00', '09:40:00']) {
      const a = armarAviso(
        llamada({ cadencia: cad({ tareaCreada: { id: 't', title: 'Enviar WhatsApp a María López', due_date: '2026-11-25', due_time: hora, channel: 'message' } }) }),
      )
      expect(textos(a)).toEqual(['Se agendó Enviar WhatsApp para ahora.'])
    }
  })

  it('un viernes dice "lun 30 nov, 9:00"', () => {
    const a = armarAviso(
      llamada({
        ahora: new Date('2026-11-27T13:00:00Z'),
        cadencia: cad({
          tareaCreada: { id: 't', title: 'Llamada 2 a María López', due_date: '2026-11-30', due_time: '09:00', channel: 'call' },
        }),
      }),
    )
    expect(textos(a)).toEqual(['Se agendó Llamada 2 para lun 30 nov, 9:00.'])
  })
  it('"Enviar WhatsApp" corto, y "Llamar a…" se nombra entero', () => {
    const w = armarAviso(
      llamada({ cadencia: cad({ tareaCreada: { id: 't', title: 'Enviar WhatsApp a María López', due_date: '2026-11-26', due_time: '09:00', channel: 'message' } }) }),
    )
    expect(textos(w)[0]).toBe('Se agendó Enviar WhatsApp para mañana 9:00.')
    const v = armarAviso(
      llamada({
        resultado: 'volver_a_llamar',
        titulo: 'Llamada 1 · Volver a llamar',
        cadencia: cad({ tareaCreada: { id: 't', title: 'Llamar a María López', due_date: '2026-11-26', due_time: '16:00', channel: 'call' }, motivoSinTarea: null }),
      }),
    )
    expect(textos(v)[0]).toBe('Se agendó Llamar a María López para mañana 16:00.')
  })
})

describe('armarAviso: sin tarea', () => {
  it.each([
    ['whatsapp_ya_enviado', ['Ya se le mandó WhatsApp: no se crea otra tarea. Si querés seguirla, agendá una con «+ Tarea».']],
    ['whatsapp_ya_pendiente', ['Ya hay una tarea pendiente de enviarle WhatsApp: no se crea otra.']],
    ['sin_proceso', ['No tiene un proceso abierto: no se agenda la llamada siguiente.']],
    [
      'proceso_ajeno',
      ['Quedó anotada. Este proceso lo lleva otra persona: no se agenda la siguiente ni se cierran las tareas de esa persona.'],
    ],
  ] as const)('%s', (motivo, esperado) => {
    expect(textos(armarAviso(llamada({ cadencia: cad({ motivoSinTarea: motivo }) })))).toEqual(esperado)
  })
  it('fuera de orden', () => {
    const a = armarAviso(llamada({ cadencia: cad({ aplica: false, motivoSinTarea: 'fuera_de_orden' }) }))
    expect(textos(a)).toEqual(['Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea.'])
  })
  it('fuera de orden con "volver a llamar" suma el "+ Tarea" y no agenda nada', () => {
    const a = armarAviso(
      llamada({ resultado: 'volver_a_llamar', cadencia: cad({ aplica: false, motivoSinTarea: 'fuera_de_orden' }) }),
    )
    expect(textos(a)).toEqual([
      'Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea. Si hace falta, agendala con «+ Tarea».',
    ])
    expect(acciones(a)).toEqual([])
  })
  it('proceso ajeno con la propia "Llamar a…" cerrada la nombra en otro renglón', () => {
    const a = armarAviso(
      llamada({ cadencia: cad({ motivoSinTarea: 'proceso_ajeno', tareasCerradas: [{ id: 'x', title: 'Llamar a María López' }] }) }),
    )
    expect(textos(a)).toEqual([
      'Quedó anotada. Este proceso lo lleva otra persona: no se agenda la siguiente ni se cierran las tareas de esa persona.',
      'Se completó sola la tarea «Llamar a María López».',
    ])
  })
})

describe('armarAviso: WhatsApp marcado', () => {
  it('secuencia terminada', () => {
    const a = armarAviso(
      llamada({
        tipo: 'whatsapp_sent',
        titulo: 'WhatsApp enviado',
        intento: null,
        resultado: null,
        cadencia: cad({ motivoSinTarea: 'secuencia_terminada', tareasCerradas: [{ id: 'w', title: 'Enviar WhatsApp a María López' }] }),
      }),
    )
    expect(a.titulo).toBe('WhatsApp marcado como enviado')
    expect(textos(a)).toEqual([
      'La secuencia termina acá: no se crea ninguna tarea más.',
      'Se completó sola la tarea «Enviar WhatsApp a María López».',
      'Si no contesta y querés seguirla, agendá una con «+ Tarea».',
    ])
    expect(a.toast).toBe('WhatsApp marcado como enviado. No se crea ninguna tarea más.')
  })
})

describe('armarAviso: lo que se ofrece (las ocho filas)', () => {
  const ofrecer = (o: BloqueCadencia['ofrecer'], resultado: EntradaAviso['resultado'] = 'agendo') =>
    armarAviso(llamada({ resultado, titulo: 'Llamada 1 · Agendó', cadencia: cad({ motivoSinTarea: 'no_corresponde', ofrecer: o }) }))

  it('coordinar_solicitud', () => {
    const a = ofrecer('coordinar_solicitud')
    expect(textos(a)).toEqual(['Falta coordinar día, hora y asesor de la tasación.'])
    expect(a.acciones).toEqual([{ tipo: 'coordinar', etiqueta: 'Coordinar tasación', href: '/pipeline/new?deal=d1' }])
  })
  it('coordinar_nuevo', () => {
    const a = ofrecer('coordinar_nuevo')
    expect(textos(a)).toEqual(['Falta coordinar día, hora y asesor de la tasación. Se abre como un proceso nuevo.'])
    expect(a.acciones).toEqual([{ tipo: 'coordinar', etiqueta: 'Coordinar tasación', href: '/pipeline/new?contact=c1' }])
  })
  it('abrir_proceso', () => {
    const a = ofrecer('abrir_proceso')
    expect(textos(a)).toEqual(['El proceso ya está en Coordinada: no hace falta coordinar de nuevo.'])
    expect(a.acciones).toEqual([{ tipo: 'abrir', etiqueta: 'Abrir el proceso', href: '/pipeline/d1' }])
  })
  it('proceso_ya_coordinado: el texto sin ningún botón', () => {
    const a = ofrecer('proceso_ya_coordinado')
    expect(textos(a)).toEqual(['El proceso ya está en Coordinada: no hace falta coordinar de nuevo.'])
    expect(a.acciones).toEqual([])
  })
  it('pedir_coordinacion', () => {
    const a = ofrecer('pedir_coordinacion')
    expect(textos(a)).toEqual(['Falta coordinar día, hora y asesor de la tasación. Pedíselo a la coordinación.'])
    expect(a.acciones).toEqual([])
  })
  it('cerrar_proceso', () => {
    const a = ofrecer('cerrar_proceso', 'no_interesa')
    expect(textos(a)).toEqual(['El proceso sigue abierto. Si no hay nada más que hacer, podés cerrarlo.'])
    expect(a.acciones).toEqual([
      { tipo: 'perdido', etiqueta: 'Marcar proceso como perdido', dealId: 'd1' },
      { tipo: 'dejar_abierto', etiqueta: 'Dejarlo abierto' },
    ])
  })
  it('pedir_cierre', () => {
    const a = ofrecer('pedir_cierre', 'numero_equivocado')
    expect(textos(a)).toEqual(['El proceso sigue abierto. Si hay que cerrarlo, avisale a la coordinación.'])
    expect(a.acciones).toEqual([])
  })
  it('nada_que_cerrar', () => {
    const a = ofrecer('nada_que_cerrar', 'no_interesa')
    expect(textos(a)).toEqual(['No tiene ningún proceso abierto: no hay nada que cerrar.'])
    expect(a.acciones).toEqual([])
  })
})

describe('armarAviso: pendiente (D7)', () => {
  it('la llamada quedó guardada pero faltó agendar: "Reintentar"', () => {
    const a = armarAviso(llamada({ pendiente: true }))
    expect(a.variante).toBe('pendiente')
    expect(textos(a)[0]).toBe('La llamada quedó guardada, pero no se pudo agendar la siguiente.')
    expect(acciones(a)).toContain('reintentar')
  })
})

describe('ningún texto nombra «Sin respuesta» (todavía no existe)', () => {
  it('en ninguna variante', () => {
    const todas = [
      ...(['whatsapp_ya_enviado', 'whatsapp_ya_pendiente', 'sin_proceso', 'proceso_ajeno', 'secuencia_terminada', 'fuera_de_orden'] as const).map(
        (m) => armarAviso(llamada({ cadencia: cad({ motivoSinTarea: m }) })),
      ),
      armarAviso(llamada({ pendiente: true })),
      armarAviso(llamada({ tipo: 'whatsapp_sent', resultado: null, intento: null, cadencia: cad({ motivoSinTarea: 'secuencia_terminada' }) })),
    ]
    for (const a of todas) expect(JSON.stringify(a)).not.toContain('Sin respuesta')
  })
})

describe('textoToastPerdido', () => {
  it('con y sin tasación agendada', () => {
    expect(textoToastPerdido(false)).toBe('Proceso marcado como perdido.')
    expect(textoToastPerdido(true)).toBe('Proceso marcado como perdido. Se quitó la tasación agendada.')
  })
})

describe('vencimientoEnHistorial (crm-cadencia-paula)', () => {
  it('futura: relativa; pasada: día y hora exactos; sin hora: 9:00', async () => {
    const { vencimientoEnHistorial } = await import('./formato-fecha')
    expect(vencimientoEnHistorial('2026-11-26', '10:00:00', ahora)).toBe('mañana 10:00')
    expect(vencimientoEnHistorial('2026-11-25', '09:40:00', ahora)).toBe('mié 25 nov, 9:40')
    expect(vencimientoEnHistorial('2026-11-24', null, ahora)).toBe('mar 24 nov, 9:00')
  })
  it('"para ahora" también con el reloj del navegador unos segundos atrás', () => {
    const atrasado = new Date(ahora.getTime() - 20_000) // 9:59:40
    const a = armarAviso({ ...llamada({ cadencia: cad({ tareaCreada: { id: 't', title: 'Enviar WhatsApp a María López', due_date: '2026-11-25', due_time: '10:00', channel: 'message' } }) }), ahora: atrasado })
    expect(textos(a)).toEqual(['Se agendó Enviar WhatsApp para ahora.'])
  })
})
