import { describe, expect, it } from 'vitest'
import { cambiosDeReintento, clasificarError, esperaDeReintento, motivoEnPantalla, puedeSalir } from './maquina'

const AHORA = new Date('2026-10-30T15:00:00Z')
const envio = { estado: 'programado' as const, proximo_intento: null as string | null, ultimo_error: null as string | null }
const video = { pausado: false, programado_para: '2026-10-30T14:00:00Z' as string | null }

describe('puedeSalir', () => {
  it('sale cuando todo está en orden y ya es la hora', () => {
    expect(puedeSalir(envio, video, 'confirmada', true, AHORA)).toEqual({ sale: true })
  })

  it('con la publicación automática apagada no sale', () => {
    expect(puedeSalir(envio, video, 'confirmada', false, AHORA)).toEqual({ sale: false, motivo: 'apagado' })
  })

  it('un video pausado no sale', () => {
    expect(puedeSalir(envio, { ...video, pausado: true }, 'confirmada', true, AHORA)).toEqual({ sale: false, motivo: 'pausado' })
  })

  it('una tanda en borrador no sale', () => {
    expect(puedeSalir(envio, video, 'borrador', true, AHORA)).toEqual({ sale: false, motivo: 'borrador' })
  })

  it('antes de la hora no sale', () => {
    expect(
      puedeSalir(envio, { ...video, programado_para: '2026-10-30T16:00:00Z' }, 'confirmada', true, AHORA),
    ).toEqual({ sale: false, motivo: 'antes_de_hora' })
  })

  it('esperando un reintento no sale', () => {
    expect(
      puedeSalir({ ...envio, proximo_intento: '2026-10-30T15:05:00Z' }, video, 'confirmada', true, AHORA),
    ).toEqual({ sale: false, motivo: 'esperando_reintento' })
  })

  it('un envío publicado, cancelado o fallido ya terminó', () => {
    for (const estado of ['publicado', 'cancelado', 'fallido'] as const) {
      expect(puedeSalir({ ...envio, estado }, video, 'confirmada', true, AHORA)).toEqual({ sale: false, motivo: 'terminado' })
    }
  })

  it('un envío en curso con la reserva vencida vuelve a salir (la función murió a mitad)', () => {
    expect(
      puedeSalir({ ...envio, estado: 'en_curso', proximo_intento: '2026-10-30T14:50:00Z' }, video, 'confirmada', true, AHORA),
    ).toEqual({ sale: true })
  })
})

describe('esperaDeReintento', () => {
  it('espera 1, 2, 5, 15 y 30 minutos y después no reintenta más', () => {
    expect([1, 2, 3, 4, 5].map(esperaDeReintento)).toEqual([1, 2, 5, 15, 30].map((m) => m * 60_000))
    expect(esperaDeReintento(6)).toBeNull()
  })
})

describe('clasificarError', () => {
  it('límite de velocidad de Meta es transitorio', () => {
    for (const code of [4, 17, 32, 613]) {
      expect(clasificarError({ code, httpStatus: 400, message: 'x' }).transitorio).toBe(true)
    }
  })

  it('un error del servidor de Meta es transitorio', () => {
    expect(clasificarError({ httpStatus: 503, message: 'x' }).transitorio).toBe(true)
  })

  it('una red caída es transitoria', () => {
    expect(clasificarError(new TypeError('fetch failed')).transitorio).toBe(true)
  })

  it('un video rechazado es definitivo y el motivo se lee en castellano', () => {
    const r = clasificarError({ code: 100, httpStatus: 400, message: 'Instagram 400: The video file is invalid' })
    expect(r.transitorio).toBe(false)
    expect(r.mensaje).toMatch(/^Meta rechazó la publicación/)
  })

  it('un error de nuestra base no se muestra como rechazo de Meta y se reintenta', () => {
    const r = clasificarError(new Error('DB: connection reset'))
    expect(r.transitorio).toBe(true)
    expect(r.mensaje).not.toMatch(/Meta/)
  })

  it('un error propio (sin códigos de Meta) dice qué pasó sin culpar a Meta', () => {
    const r = clasificarError(new Error('Facebook no confirmó la publicación del reel.'))
    expect(r.transitorio).toBe(false)
    expect(r.mensaje).toBe('No se pudo publicar: Facebook no confirmó la publicación del reel.')
  })

  it('un permiso vencido se explica para el administrador', () => {
    expect(clasificarError({ code: 190, httpStatus: 401, message: 'x' }).mensaje).toMatch(/administrador/)
  })
})

describe('cambiosDeReintento', () => {
  it('conserva la etapa y los identificadores y deja la marca de reintento (así primero se le pregunta a Meta)', () => {
    expect(cambiosDeReintento({ etapa: 'contenedor', ids_externos: { creation_id: 'c1' } })).toEqual({
      estado: 'en_curso',
      etapa: 'contenedor',
      ids_externos: { creation_id: 'c1', reintento: true },
      intentos: 0,
      proximo_intento: null,
      ultimo_error: null,
    })
  })

  it('un envío que nunca arrancó vuelve a programado', () => {
    expect(cambiosDeReintento({ etapa: null, ids_externos: {} })).toMatchObject({ estado: 'programado', etapa: null, ids_externos: { reintento: true } })
  })
})

describe('motivoEnPantalla', () => {
  it('con el interruptor apagado y la hora pasada dice que está esperando', () => {
    expect(motivoEnPantalla(envio, video, false, AHORA)).toBe('Esperando: publicación automática apagada')
  })

  it('un envío a medio camino con el interruptor apagado también dice que está esperando (no "Publicando")', () => {
    expect(motivoEnPantalla({ ...envio, estado: 'en_curso' }, video, false, AHORA)).toBe('Esperando: publicación automática apagada')
  })

  it('antes de la hora no dice nada', () => {
    expect(motivoEnPantalla(envio, { ...video, programado_para: '2026-10-31T00:00:00Z' }, false, AHORA)).toBeNull()
  })

  it('un envío que reintenta muestra el motivo', () => {
    expect(
      motivoEnPantalla({ ...envio, proximo_intento: '2026-10-30T15:05:00Z', ultimo_error: 'Meta no respondió bien.' }, video, true, AHORA),
    ).toBe('Reintenta solo: Meta no respondió bien.')
  })

  it('un envío fallido muestra su motivo', () => {
    expect(motivoEnPantalla({ ...envio, estado: 'fallido', ultimo_error: 'Meta rechazó la publicación: X' }, video, true, AHORA)).toBe(
      'Meta rechazó la publicación: X',
    )
  })
})
