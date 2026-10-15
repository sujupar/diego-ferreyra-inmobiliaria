import { describe, it, expect } from 'vitest'
import { estadoInicial, reducir, puedeAvanzar, cuerpoDelPaso, cuerpoFinalDelEstado, alternarEtiqueta, esPasoEncuesta, type EstadoReproductor } from './reproductor'
import { armarEncuestaPublica, type EncuestaPublica } from './publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import type { EncuestaFila, VisitaDeEncuesta } from './tipos'

function publica(e: Partial<EncuestaFila> = {}, v: Partial<VisitaDeEncuesta> = {}, regalo: EncuestaPublica['regalo'] = null): EncuestaPublica {
  const r = armarEncuestaPublica(encuestaConVisitaDePrueba(e, v), { regalo, regaloPorWhatsapp: false, ahora: new Date('2026-10-15T15:00:00Z') })
  if (r.tipo !== 'disponible') throw new Error('la encuesta de prueba tendría que estar disponible')
  return r.encuesta
}
const en = (s: EstadoReproductor, paso: EstadoReproductor['paso']): EstadoReproductor => ({ ...s, paso })

describe('estado inicial', () => {
  it('arranca donde retoma, sin animar (la primera pantalla sale del servidor tal cual)', () => {
    const s = estadoInicial(publica({ liked: true }))
    expect(s).toMatchObject({ paso: 'mas_gusto', animar: false, ocupado: false, error: null, descarga: null })
    expect(s.contacto.cambiarTelefono).toBe(false)
  })
  it('sin teléfono precargado hay que escribirlo; terminada con regalo ya trae la descarga', () => {
    expect(estadoInicial(publica({}, { client_phone: null })).contacto.cambiarTelefono).toBe(true)
    const hecha = estadoInicial(publica({ completed_at: '2026-10-15T14:00:00Z' }, {}, { titulo: 'Guía', portada: null }))
    expect(hecha).toMatchObject({ paso: 'gracias', descarga: `/api/public/encuesta/${TOKEN_DE_PRUEBA}/regalo` })
  })
})

describe('transiciones', () => {
  const s0 = estadoInicial(publica())
  it('empezar va a la primera pregunta y anima desde ahí', () => {
    expect(reducir(s0, { tipo: 'empezar' })).toMatchObject({ paso: 'gusto', animar: true })
  })
  it('guardado → siguiente; error → se queda con el mensaje; atrás → anterior', () => {
    const ocupado = reducir(en(s0, 'gusto'), { tipo: 'ocupado' })
    expect(ocupado.ocupado).toBe(true)
    expect(reducir(ocupado, { tipo: 'avanzar' })).toMatchObject({ paso: 'mas_gusto', ocupado: false })
    expect(reducir(ocupado, { tipo: 'error', mensaje: 'x' })).toMatchObject({ paso: 'gusto', ocupado: false, error: 'x' })
    expect(reducir(en(s0, 'precio'), { tipo: 'atras' }).paso).toBe('menos_gusto')
    expect(reducir(s0, { tipo: 'atras' })).toBe(s0)
  })
  it('ir a un paso con mensaje (el servidor dijo que falta algo) y terminar', () => {
    expect(reducir(en(s0, 'contacto'), { tipo: 'ir_a', paso: 'precio', mensaje: 'Falta responder esta pregunta' }))
      .toMatchObject({ paso: 'precio', error: 'Falta responder esta pregunta' })
    expect(reducir(en(s0, 'contacto'), { tipo: 'terminado', descarga: '/d' })).toMatchObject({ paso: 'gracias', descarga: '/d' })
  })
})

describe('opciones de varias', () => {
  it('"Nada en especial" es exclusiva; sacar "Otra cosa" borra su texto; tope de 8', () => {
    expect(alternarEtiqueta(['ruido'], 'nada')).toEqual(['nada'])
    expect(alternarEtiqueta(['nada'], 'ruido')).toEqual(['ruido'])
    expect(alternarEtiqueta(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'i')).toHaveLength(8)
    let s = en(estadoInicial(publica()), 'menos_gusto')
    s = reducir(s, { tipo: 'alternar', paso: 'menos_gusto', clave: 'otra' })
    s = reducir(s, { tipo: 'escribir_otra', paso: 'menos_gusto', texto: 'El ascensor' })
    expect(s.respuestas.least_liked_other).toBe('El ascensor')
    s = reducir(s, { tipo: 'alternar', paso: 'menos_gusto', clave: 'otra' })
    expect(s.respuestas).toMatchObject({ least_liked_tags: [], least_liked_other: null })
  })
})

describe('oferta', () => {
  const s = en(estadoInicial(publica()), 'oferta')
  it('se escribe agrupada y se lee como número; basura no es monto', () => {
    const a = reducir(s, { tipo: 'escribir_oferta', texto: '1290000' })
    expect([a.ofertaTexto, a.respuestas.offer_amount]).toEqual(['1.290.000', 1290000])
    expect(reducir(s, { tipo: 'escribir_oferta', texto: 'abc' }).respuestas.offer_amount).toBeNull()
  })
  it('atajo y "prefiero no decirlo"', () => {
    expect(reducir(s, { tipo: 'atajo_oferta', monto: 135000 })).toMatchObject({ ofertaTexto: '135.000', respuestas: { offer_amount: 135000, offer_declined: false } })
    expect(reducir(reducir(s, { tipo: 'escribir_oferta', texto: '5' }), { tipo: 'declinar_oferta' }))
      .toMatchObject({ ofertaTexto: '', respuestas: { offer_amount: null, offer_declined: true } })
  })
})

describe('puedeAvanzar y cuerpos', () => {
  const s = estadoInicial(publica())
  it('cada paso exige su respuesta', () => {
    expect(puedeAvanzar(en(s, 'gusto'), true)).toBe(false)
    expect(puedeAvanzar(reducir(en(s, 'gusto'), { tipo: 'elegir_gusto', valor: false }), true)).toBe(true)
    const conOtra = reducir(en(s, 'mas_gusto'), { tipo: 'alternar', paso: 'mas_gusto', clave: 'otra' })
    expect(puedeAvanzar(conOtra, true)).toBe(false)
    expect(puedeAvanzar(reducir(conOtra, { tipo: 'escribir_otra', paso: 'mas_gusto', texto: 'El barrio' }), true)).toBe(true)
  })
  it('contacto: con teléfono precargado alcanza; sin él hay que escribirlo; email mal escrito frena', () => {
    const c = en(s, 'contacto')
    expect(puedeAvanzar(c, true)).toBe(true)
    expect(puedeAvanzar({ ...c, contacto: { ...c.contacto, cambiarTelefono: true } }, true)).toBe(false)
    expect(puedeAvanzar({ ...c, contacto: { ...c.contacto, cambiarTelefono: true, telefono: '11 4444-5555' } }, false)).toBe(true)
    expect(puedeAvanzar({ ...c, contacto: { ...c.contacto, email: 'ana@' } }, true)).toBe(false)
  })
  it('el cuerpo de cada paso es el que valida el servidor', () => {
    expect(cuerpoDelPaso(reducir(en(s, 'precio'), { tipo: 'elegir_precio', valor: 'alto' }))).toEqual({ paso: 'precio', valor: 'alto' })
    expect(cuerpoDelPaso(reducir(en(s, 'oferta'), { tipo: 'declinar_oferta' }))).toEqual({ paso: 'oferta', monto: null, declina: true })
    expect(cuerpoDelPaso(en(s, 'bienvenida'))).toBeNull()
  })
  it('el final manda el teléfono solo si se cambió, y el honeypot tal cual', () => {
    const c = en(s, 'contacto')
    expect(cuerpoFinalDelEstado(c)).toEqual({ telefono: null, email: null, similares: false, empresa: '' })
    expect(cuerpoFinalDelEstado({ ...c, contacto: { cambiarTelefono: true, telefono: ' 11 4444-5555 ', email: ' ana@mail.com ', similares: true, empresa: 'x' } }))
      .toEqual({ telefono: '11 4444-5555', email: 'ana@mail.com', similares: true, empresa: 'x' })
  })
  it('esPasoEncuesta', () => {
    expect(esPasoEncuesta('precio')).toBe(true)
    expect(esPasoEncuesta('borrar')).toBe(false)
  })
})
