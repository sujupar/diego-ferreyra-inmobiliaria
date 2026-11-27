import { describe, it, expect } from 'vitest'
import { armarPanelVideoBienvenida, fechaDelCambio, type EntradaPanelVideo } from './video-bienvenida'

const tramos = (n: number) => '1'.repeat(n) + '0'.repeat(100 - n)
const AHORA = new Date('2026-12-10T15:00:00Z')

function base(): EntradaPanelVideo {
  return {
    contactos: [
      { id: 'ana', full_name: 'Ana Pérez', email: 'ana@x.com', phone: '1155550001' },
      { id: 'jorge', full_name: 'Jorge García', email: null, phone: '1155550002' },
      { id: 'mario', full_name: 'Mario Álvarez', email: null, phone: '1155550003' },
      { id: 'julian', full_name: 'Julian Parra', email: 'contacto.julianparra@gmail.com', phone: '573107822955' },
      { id: 'viejo', full_name: 'Valeria', email: null, phone: '1155550004' },
    ],
    enlaces: [
      { contact_id: 'ana', enviado_at: '2026-12-01T10:00:00Z', envio_fallido_at: null, aperturas: 2 },
      { contact_id: 'jorge', enviado_at: '2026-12-02T10:00:00Z', envio_fallido_at: null, aperturas: 1 },
      { contact_id: 'mario', enviado_at: '2026-12-03T10:00:00Z', envio_fallido_at: null, aperturas: 0 },
      { contact_id: 'julian', enviado_at: '2026-12-03T10:00:00Z', envio_fallido_at: null, aperturas: 5 },
    ],
    vistas: [
      { contact_id: 'ana', playback_started: true, watched_buckets: tramos(63), duration_s: 810 },
      { contact_id: 'julian', playback_started: true, watched_buckets: tramos(100), duration_s: 810 },
    ],
    procesos: [
      { contact_id: 'ana', origin: 'embudo', stage: 'scheduled', created_at: '2026-12-01T09:59:00Z', scheduled_at: '2026-12-02T12:00:00Z' },
      { contact_id: 'jorge', origin: 'embudo', stage: 'request', created_at: '2026-12-02T09:59:00Z', scheduled_at: null },
      { contact_id: 'mario', origin: 'embudo', stage: 'request', created_at: '2026-12-03T09:59:00Z', scheduled_at: null },
      { contact_id: 'julian', origin: 'embudo', stage: 'scheduled', created_at: '2026-12-03T09:59:00Z', scheduled_at: '2026-12-04T12:00:00Z' },
      { contact_id: 'viejo', origin: 'embudo', stage: 'scheduled', created_at: '2026-11-25T10:00:00Z', scheduled_at: '2026-11-26T10:00:00Z' },
    ],
    llamadas: [
      { contact_id: 'ana', call_outcome: 'no_atendio', occurred_at: '2026-12-01T11:00:00Z' },
      { contact_id: 'ana', call_outcome: 'agendo', occurred_at: '2026-12-01T15:00:00Z' },
      { contact_id: 'jorge', call_outcome: 'numero_equivocado', occurred_at: '2026-12-02T11:00:00Z' },
      { contact_id: 'mario', call_outcome: 'volver_a_llamar', occurred_at: '2026-12-03T11:00:00Z' },
    ],
    cambioDesde: '2026-12-01',
  }
}

describe('panel del video de bienvenida', () => {
  it('cuenta personas, sin datos de prueba: recibieron / abrieron / play / mitad o más', () => {
    const p = armarPanelVideoBienvenida(base(), AHORA)
    expect(p.resumen).toEqual({ recibieron: 3, abrieron: 2, tocaronPlay: 1, mitadOMas: 1, baseChica: true })
  })

  it('un enlace que no llegó (manual sin enviar, o falla tardía de Meta) no suma en "recibieron"', () => {
    const e = base()
    e.enlaces.push({ contact_id: 'viejo', enviado_at: null, envio_fallido_at: null, aperturas: 1 })
    e.enlaces[2] = { ...e.enlaces[2], envio_fallido_at: '2026-12-03T10:05:00Z' }
    const p = armarPanelVideoBienvenida(e, AHORA)
    expect(p.resumen.recibieron).toBe(2)
  })

  it('grupos: vio / abrió sin mirar / no abrió, con atendió y coordinó', () => {
    const p = armarPanelVideoBienvenida(base(), AHORA)
    expect(p.grupos).toEqual([
      { grupo: 'vio', personas: 1, atendio: 1, coordino: 1 },
      { grupo: 'abrio', personas: 1, atendio: 0, coordino: 0 },
      { grupo: 'no_abrio', personas: 1, atendio: 1, coordino: 0 },
    ])
  })

  it('"Número equivocado" y "No atendió" no cuentan como atendió', () => {
    const p = armarPanelVideoBienvenida(base(), AHORA)
    expect(p.personas.find((x) => x.nombre === 'Jorge García')?.atendio).toBe(false)
  })

  it('antes/después: 14 días previos al cambio contra los días desde el cambio', () => {
    const p = armarPanelVideoBienvenida(base(), AHORA)
    expect(p.antesDespues).toEqual({
      antes: { personas: 1, atendio: 0, coordino: 1 },
      despues: { personas: 3, atendio: 2, coordino: 1 },
      desde: '2026-12-01',
    })
  })

  it('sin fecha de cambio todavía, no hay antes/después', () => {
    const p = armarPanelVideoBienvenida({ ...base(), cambioDesde: null }, AHORA)
    expect(p.antesDespues).toBeNull()
  })

  it('lista de personas con lo que hizo cada una, la más nueva primero', () => {
    const p = armarPanelVideoBienvenida(base(), AHORA)
    expect(p.personas.map((x) => x.nombre)).toEqual(['Mario Álvarez', 'Jorge García', 'Ana Pérez'])
    expect(p.personas[2]).toEqual({
      nombre: 'Ana Pérez', enviado: '2026-12-01T10:00:00Z', aperturas: 2, minutos: '8:30', porcentaje: 63, atendio: true, coordino: true,
    })
    expect(p.personas[0]).toMatchObject({ aperturas: 0, minutos: null, porcentaje: null })
  })

  it('una persona con varios procesos cuenta una sola vez', () => {
    const e = base()
    e.procesos.push({ contact_id: 'ana', origin: 'embudo', stage: 'request', created_at: '2026-12-05T10:00:00Z', scheduled_at: null })
    const p = armarPanelVideoBienvenida(e, AHORA)
    expect(p.personas.filter((x) => x.nombre === 'Ana Pérez')).toHaveLength(1)
  })
})

describe('coordinó, con el proceso del envío', () => {
  it('mira ESE proceso aunque haya nacido horas antes de que saliera el WhatsApp', () => {
    const e = base()
    e.procesos.push({ id: 'd-jorge', contact_id: 'jorge', origin: 'embudo', stage: 'scheduled', created_at: '2026-12-01T22:00:00Z', scheduled_at: '2026-12-03T10:00:00Z' })
    e.enlaces[1] = { ...e.enlaces[1], deal_envio: 'd-jorge' }
    const p = armarPanelVideoBienvenida(e, AHORA)
    expect(p.personas.find((x) => x.nombre === 'Jorge García')?.coordino).toBe(true)
  })
})

describe('fecha del cambio', () => {
  it('es el día en Argentina del primer mensaje con video aceptado', () => {
    // 01:30 del 2 de diciembre en UTC = 22:30 del 1 de diciembre en Argentina
    expect(fechaDelCambio([null, '2026-12-03T10:00:00Z', '2026-12-02T01:30:00Z'])).toBe('2026-12-01')
  })
  it('sin envíos todavía, no hay fecha', () => {
    expect(fechaDelCambio([null, null])).toBeNull()
    expect(fechaDelCambio([])).toBeNull()
  })
})
