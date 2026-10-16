import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { armarEncuestaPublica, fotoParaEncuesta, HOSTS_EXACTOS, SUFIJOS_DE_HOSTS } from './publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const extra = { regalo: null, regaloPorWhatsapp: false, ahora: AHORA }

describe('fotoParaEncuesta', () => {
  it('la primera https de un host que next/image acepta', () => {
    expect(fotoParaEncuesta(['data:image/png;base64,xx', 'http://img.zonaprop.com.ar/a.jpg', 'https://imgar.zonaprop.com.ar/a.jpg']))
      .toBe('https://imgar.zonaprop.com.ar/a.jpg')
  })
  it('compara el host EXACTO (un dominio que solo contiene el nombre no pasa)', () => {
    expect(fotoParaEncuesta(['https://zonaprop.com.ar.evil.com/a.jpg', 'https://evilmlstatic.com/a.jpg'])).toBeNull()
    expect(fotoParaEncuesta('no es lista')).toBeNull()
  })
  it('los hosts permitidos son los de images.remotePatterns de next.config.ts (si no, la foto rompe)', () => {
    const config = readFileSync('next.config.ts', 'utf8')
    for (const h of HOSTS_EXACTOS) expect(config).toContain(`hostname: '${h}'`)
    for (const s of SUFIJOS_DE_HOSTS) expect(config).toContain(`hostname: '**${s}'`)
  })
})

describe('armarEncuestaPublica', () => {
  it('disponible: solo lo necesario, sin apellido, teléfono completo ni email', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba({ contact_email: 'mariana@mail.com' }), extra)
    expect(r.tipo).toBe('disponible')
    if (r.tipo !== 'disponible') return
    expect(r.encuesta).toMatchObject({
      token: TOKEN_DE_PRUEBA, nombre: 'Mariana', direccion: 'Doblas 248', barrio: 'Caballito',
      precio: 150000, moneda: 'USD', telefonoEnmascarado: '11 ••••-4521', pasoInicial: 'bienvenida',
      completa: false, regalo: null, regaloPorWhatsapp: false,
    })
    const json = JSON.stringify(r)
    expect(json).not.toContain('Gómez')
    expect(json).not.toContain('58234521')
    expect(json).not.toContain('mariana@mail.com')
    expect(json).not.toContain('22222222-2222-4222-8222-222222222222')
  })
  it('retoma donde quedó (criterio 21)', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba({ liked: true, most_liked_tags: ['luz'] }), extra)
    expect(r.tipo === 'disponible' && r.encuesta.pasoInicial).toBe('menos_gusto')
  })
  it('link inexistente o visita reabierta → no disponible; vencido → vencida', () => {
    expect(armarEncuestaPublica(null, extra)).toEqual({ tipo: 'no_disponible' })
    expect(armarEncuestaPublica(encuestaConVisitaDePrueba({}, { status: 'scheduled' }), extra)).toEqual({ tipo: 'no_disponible' })
    expect(armarEncuestaPublica(encuestaConVisitaDePrueba({ expires_at: '2026-10-01T00:00:00Z' }), extra)).toEqual({ tipo: 'vencida' })
  })
  it('terminada: gracias aunque el link ya haya vencido (lo ganado no se quita)', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba({ completed_at: '2026-10-02T00:00:00Z', expires_at: '2026-10-01T00:00:00Z', contact_email: 'a@b.co' }), extra)
    expect(r.tipo === 'disponible' && r.encuesta).toMatchObject({ completa: true, pasoInicial: 'gracias', emailDejado: true })
  })
  it('sin precio publicado no inventa uno; ARS se respeta; sin propiedad no rompe', () => {
    // `!`: el constructor de pruebas SIEMPRE arma la propiedad; una guarda acá no probaría nada.
    const sinPrecio = armarEncuestaPublica(encuestaConVisitaDePrueba({}, { propiedad: { ...encuestaConVisitaDePrueba().visita.propiedad!, asking_price: 0, currency: 'ARS' } }), extra)
    expect(sinPrecio.tipo === 'disponible' && sinPrecio.encuesta).toMatchObject({ precio: null, moneda: 'ARS' })
    const sinProp = armarEncuestaPublica(encuestaConVisitaDePrueba({}, { propiedad: null }), extra)
    expect(sinProp.tipo === 'disponible' && sinProp.encuesta.direccion).toBe('la propiedad')
  })
  it('el regalo y la promesa de WhatsApp vienen de afuera, tal cual', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba(), { regalo: { titulo: 'Guía de Caballito', portada: null }, regaloPorWhatsapp: true, ahora: AHORA })
    expect(r.tipo === 'disponible' && r.encuesta).toMatchObject({ regalo: { titulo: 'Guía de Caballito', portada: null }, regaloPorWhatsapp: true })
  })
})
