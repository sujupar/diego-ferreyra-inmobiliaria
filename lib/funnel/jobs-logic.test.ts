import { describe, it, expect } from 'vitest'
import {
  TIPOS_DE_TRABAJO,
  construirTrabajos,
  ordenarTrabajos,
  siguienteIntento,
  ESPERAS_SEGUNDOS,
  ESPERA_LIMITE_SEGUNDOS,
  type DatosDelEnvio,
} from './jobs-logic'

const ENVIO: DatosDelEnvio = {
  funnel: 'tasacion',
  contactId: 'contacto-1',
  dealId: 'deal-1',
  nombre: 'Ana Pérez',
  email: 'ana@ejemplo.com',
  phone: '+5491133445566',
  propertyLocation: 'Palermo',
  anonId: 'anon-1',
  eventId: 'evt-1',
  eventSourceUrl: 'https://inmobiliariadiegoferreyra.com/tasacion-directa',
  eventTimeUnixSeconds: 1_770_000_000,
  fbp: 'fb.1.2.3',
  fbc: null,
  ip: '200.10.20.30',
  userAgent: 'Mozilla/5.0',
}

describe('construirTrabajos', () => {
  it('arma SIEMPRE un aviso por etapa, uno de cada tipo', () => {
    const t = construirTrabajos(ENVIO)
    expect(t).toHaveLength(TIPOS_DE_TRABAJO.length)
    expect(t.map((x) => x.kind).sort()).toEqual([...TIPOS_DE_TRABAJO].sort())
  })

  it('los arma también cuando ya se sabe que alguno no va a hacer nada', () => {
    // Sin sesión anónima y sin event_id del Píxel: los trabajos existen igual y
    // van a terminar en 'skipped'. Es información, no ruido — mirando la cola se
    // ve qué pasó con cada aviso de cada lead.
    const t = construirTrabajos({ ...ENVIO, anonId: null, eventId: null })
    expect(t).toHaveLength(TIPOS_DE_TRABAJO.length)
    expect(t.find((x) => x.kind === 'anon_stitch')!.payload.anonId).toBeNull()
    expect(t.find((x) => x.kind === 'capi')!.payload.eventId).toBeNull()
  })

  it('el primer WhatsApp al cliente lleva el teléfono y va con la máxima prioridad', () => {
    // Es el único aviso que espera una persona de afuera, y el que ABRE la
    // ventana de 24 h con la que después se coordina la visita.
    const wa = construirTrabajos(ENVIO).find((x) => x.kind === 'whatsapp')!
    expect(wa.payload.phone).toBe(ENVIO.phone)
    expect(wa.payload.nombre).toBe(ENVIO.nombre)
    expect(wa.payload.funnel).toBe(ENVIO.funnel)

    const orden = ordenarTrabajos(
      construirTrabajos(ENVIO).map((t, i) => ({ id: `id-${i}`, kind: t.kind, created_at: '2026-08-13T10:00:00Z' })),
    )
    expect(orden[0].kind).toBe('whatsapp')
  })

  it('el trabajo de Meta lleva la hora REAL de la conversión y el mismo event_id del Píxel', () => {
    const capi = construirTrabajos(ENVIO).find((x) => x.kind === 'capi')!.payload
    expect(capi.eventTimeUnixSeconds).toBe(1_770_000_000)
    expect(capi.eventId).toBe('evt-1')
    expect(capi.contentName).toBe('Tasación Directa')
    // La IP y el user-agent viajan en claro porque Meta los usa para el match.
    expect(capi.ip).toBe('200.10.20.30')
    expect(capi.userAgent).toBe('Mozilla/5.0')
  })

  it('la clase gratuita cambia el nombre del contenido', () => {
    const capi = construirTrabajos({ ...ENVIO, funnel: 'clase' }).find((x) => x.kind === 'capi')!.payload
    expect(capi.contentName).toBe('Clase Gratuita')
  })

  it('cada trabajo lleva solo lo que necesita', () => {
    const t = construirTrabajos(ENVIO)
    expect(t.find((x) => x.kind === 'mailchimp')!.payload).toEqual({ dealId: 'deal-1' })
    expect(t.find((x) => x.kind === 'notify')!.payload).toEqual({ funnel: 'tasacion', dealId: 'deal-1' })
    expect(t.find((x) => x.kind === 'anon_stitch')!.payload).toEqual({ anonId: 'anon-1', contactId: 'contacto-1' })
  })
})

describe('ordenarTrabajos', () => {
  it('atiende primero al envío más viejo', () => {
    const orden = ordenarTrabajos([
      { id: 'b', kind: 'notify', created_at: '2026-08-08T12:00:00Z' },
      { id: 'a', kind: 'notify', created_at: '2026-08-08T11:00:00Z' },
    ])
    expect(orden.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('dentro de un mismo envío, primero lo que hace que una persona se entere', () => {
    const t = '2026-08-08T12:00:00Z'
    const orden = ordenarTrabajos([
      { id: '1', kind: 'mailchimp', created_at: t },
      { id: '2', kind: 'capi', created_at: t },
      { id: '3', kind: 'notify', created_at: t },
      { id: '4', kind: 'anon_stitch', created_at: t },
      { id: '5', kind: 'coordinator_task', created_at: t },
    ])
    expect(orden.map((x) => x.kind)).toEqual([
      'notify',
      'coordinator_task',
      'capi',
      'anon_stitch',
      'mailchimp',
    ])
  })

  it('no muta la lista original', () => {
    const original = [
      { id: '1', kind: 'mailchimp' as const, created_at: '2026-08-08T12:00:00Z' },
      { id: '2', kind: 'notify' as const, created_at: '2026-08-08T12:00:00Z' },
    ]
    ordenarTrabajos(original)
    expect(original.map((x) => x.kind)).toEqual(['mailchimp', 'notify'])
  })
})

describe('siguienteIntento', () => {
  const AHORA = Date.parse('2026-08-08T12:00:00.000Z')

  it('el primer fallo se reintenta en 30 segundos', () => {
    expect(siguienteIntento(1, 5, AHORA)).toEqual({
      status: 'pending',
      next_attempt_at: new Date(AHORA + 30_000).toISOString(),
    })
  })

  it('la espera crece con cada intento', () => {
    const esperas = [1, 2, 3, 4].map((i) => {
      const r = siguienteIntento(i, 5, AHORA)
      return (Date.parse(r.next_attempt_at!) - AHORA) / 1000
    })
    expect(esperas).toEqual([...ESPERAS_SEGUNDOS].slice(0, 4))
    expect(esperas).toEqual([...esperas].sort((a, b) => a - b))
  })

  it('al agotar los intentos queda en failed y sin próxima fecha', () => {
    expect(siguienteIntento(5, 5, AHORA)).toEqual({ status: 'failed', next_attempt_at: null })
    expect(siguienteIntento(9, 5, AHORA)).toEqual({ status: 'failed', next_attempt_at: null })
  })

  it('un límite de volumen de Meta usa la espera LARGA, no la escalera', () => {
    // El tier de WhatsApp (250/1K/10K conversaciones por día) recién cede
    // dentro de la ventana de 24 h: reintentar en 30 s quemaba los 5 intentos
    // en ~7,6 h y el lead quedaba failed para siempre. Con 4 h entre intentos,
    // los 5 cubren ~20 h — el cupo se renueva antes de agotarlos.
    const r = siguienteIntento(1, 5, AHORA, ESPERA_LIMITE_SEGUNDOS)
    expect(r.status).toBe('pending')
    expect(Date.parse(r.next_attempt_at!) - AHORA).toBe(ESPERA_LIMITE_SEGUNDOS * 1000)
    // Y el agotamiento sigue mandando: la espera fija no revive un trabajo muerto.
    expect(siguienteIntento(5, 5, AHORA, ESPERA_LIMITE_SEGUNDOS)).toEqual({
      status: 'failed',
      next_attempt_at: null,
    })
  })

  it('si el tope fuera mayor que la escalera, repite la última espera en vez de romperse', () => {
    const r = siguienteIntento(8, 10, AHORA)
    expect(r.status).toBe('pending')
    expect((Date.parse(r.next_attempt_at!) - AHORA) / 1000).toBe(ESPERAS_SEGUNDOS[ESPERAS_SEGUNDOS.length - 1])
  })
})
