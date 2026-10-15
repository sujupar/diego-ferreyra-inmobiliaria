import { describe, it, expect } from 'vitest'
import { pasoSiguiente, pasoAnterior, pasoParaRetomar, primerPasoSinResponder, avance, pasoRespondido } from './pasos'
import { RESPUESTAS_VACIAS, type RespuestasEncuesta } from './tipos'

const r = (c: Partial<RespuestasEncuesta> = {}): RespuestasEncuesta => ({ ...RESPUESTAS_VACIAS, ...c })

describe('orden de los pasos', () => {
  it('avanza en orden y se queda en "gracias"', () => {
    expect(pasoSiguiente('bienvenida')).toBe('gusto')
    expect(pasoSiguiente('oferta')).toBe('contacto')
    expect(pasoSiguiente('contacto')).toBe('gracias')
    expect(pasoSiguiente('gracias')).toBe('gracias')
  })
  it('atrás existe salvo en la bienvenida y en gracias', () => {
    expect(pasoAnterior('bienvenida')).toBeNull()
    expect(pasoAnterior('gusto')).toBe('bienvenida')
    expect(pasoAnterior('contacto')).toBe('oferta')
    expect(pasoAnterior('gracias')).toBeNull()
  })
  it('avance va de 0 a 1 sin decir cuántos pasos hay', () => {
    expect(avance('bienvenida')).toBe(0)
    expect(avance('gracias')).toBe(1)
    expect(avance('precio')).toBeGreaterThan(avance('gusto'))
  })
})

describe('qué cuenta como respondido', () => {
  it('"más gustó" con solo "Otra cosa" escrita cuenta; vacío no', () => {
    expect(pasoRespondido('mas_gusto', r({ most_liked_tags: ['otra'], most_liked_other: 'El barrio' }))).toBe(true)
    expect(pasoRespondido('mas_gusto', r())).toBe(false)
  })
  it('la oferta cuenta con monto o con "Prefiero no decirlo"', () => {
    expect(pasoRespondido('oferta', r({ offer_amount: 120000 }))).toBe(true)
    expect(pasoRespondido('oferta', r({ offer_declined: true }))).toBe(true)
    expect(pasoRespondido('oferta', r({ offer_declined: false }))).toBe(false)
  })
  it('"no me gustó" (false) es una respuesta, no un vacío', () => {
    expect(pasoRespondido('gusto', r({ liked: false }))).toBe(true)
  })
})

describe('retomar (criterio 21)', () => {
  it('sin nada respondido arranca en la bienvenida', () => {
    expect(pasoParaRetomar(r(), false)).toBe('bienvenida')
  })
  it('con 1 y 2 respondidas retoma en la 3', () => {
    expect(pasoParaRetomar(r({ liked: true, most_liked_tags: ['luz'] }), false)).toBe('menos_gusto')
  })
  it('si falta una del medio, vuelve a esa', () => {
    expect(primerPasoSinResponder(r({ liked: true, least_liked_tags: ['ruido'], price_opinion: 'alto' }))).toBe('mas_gusto')
  })
  it('todo respondido pero sin terminar → contacto; terminada → gracias', () => {
    const todo = r({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto', offer_declined: true })
    expect(pasoParaRetomar(todo, false)).toBe('contacto')
    expect(pasoParaRetomar(r(), true)).toBe('gracias')
  })
})
