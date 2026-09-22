import { describe, it, expect } from 'vitest'
import { esVideoDeLaPropiedad } from './video-propio'

const BASE = 'https://mncsnastmcjdjxrehdep.supabase.co'
const PROP = '11111111-2222-3333-4444-555555555555'
const BUENA = `${BASE}/storage/v1/object/public/property-files/properties/${PROP}/reels/abc.mp4`

describe('esVideoDeLaPropiedad', () => {
  it('acepta el video subido a esta propiedad', () => {
    expect(esVideoDeLaPropiedad(BUENA, PROP, BASE)).toBe(true)
  })

  it('funciona aunque la dirección venga con barra final', () => {
    // Sin normalizar la barra, el prefijo no coincide NUNCA y se rompen TODAS
    // las subidas sin que nadie entienda por qué. Ya pasó en este proyecto.
    expect(esVideoDeLaPropiedad(BUENA, PROP, `${BASE}/`)).toBe(true)
    expect(esVideoDeLaPropiedad(BUENA, PROP, `${BASE}///`)).toBe(true)
  })

  it('RECHAZA un video de cualquier otro sitio', () => {
    // El agujero que esto cierra: el cron le pasa esta URL a Instagram para que
    // la descargue y la PUBLIQUE en la cuenta de la empresa.
    expect(esVideoDeLaPropiedad('https://atacante.com/video.mp4', PROP, BASE)).toBe(false)
  })

  it('RECHAZA una URL que solo CONTIENE la nuestra', () => {
    // Por esto se compara por prefijo y no con `includes`: es la misma lección
    // que dejó el acortador de enlaces con `wa.me.evil.com`.
    const tramposa = `https://atacante.com/?x=${BUENA}`
    expect(esVideoDeLaPropiedad(tramposa, PROP, BASE)).toBe(false)
  })

  it('RECHAZA el video de OTRA propiedad', () => {
    const otra = '99999999-8888-7777-6666-555555555555'
    expect(esVideoDeLaPropiedad(BUENA, otra, BASE)).toBe(false)
  })

  it('RECHAZA otra carpeta de la misma propiedad', () => {
    // Las fotos y los planos de la propiedad no son videos publicables.
    const foto = `${BASE}/storage/v1/object/public/property-files/properties/${PROP}/photos/x.mp4`
    expect(esVideoDeLaPropiedad(foto, PROP, BASE)).toBe(false)
  })

  it('RECHAZA otro bucket del mismo proyecto', () => {
    const otroBucket = `${BASE}/storage/v1/object/public/social-carousels/properties/${PROP}/reels/x.mp4`
    expect(esVideoDeLaPropiedad(otroBucket, PROP, BASE)).toBe(false)
  })

  it('falla cerrado sin la dirección del almacenamiento', () => {
    // "No puedo verificar" nunca puede significar "dejalo pasar".
    expect(esVideoDeLaPropiedad(BUENA, PROP, undefined)).toBe(false)
    expect(esVideoDeLaPropiedad(BUENA, PROP, '')).toBe(false)
  })

  it('falla cerrado con datos vacíos', () => {
    expect(esVideoDeLaPropiedad('', PROP, BASE)).toBe(false)
    expect(esVideoDeLaPropiedad(BUENA, '', BASE)).toBe(false)
  })

  it('RECHAZA http aunque el resto coincida', () => {
    expect(esVideoDeLaPropiedad(BUENA.replace('https://', 'http://'), PROP, BASE)).toBe(false)
  })
})
