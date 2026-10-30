import { describe, expect, it } from 'vitest'
import {
  altaVideosSchema,
  detectarDuplicados,
  esRutaPropia,
  patchTandaSchema,
  patchVideoSchema,
  transicionPermitida,
} from './validacion'

const T = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'

describe('esRutaPropia', () => {
  it('acepta el prefijo exacto de la tanda y el video', () => {
    expect(esRutaPropia(`tandas/${T}/${V}/video.mp4`, T, V)).toBe(true)
  })

  it('rechaza otra tanda', () => {
    expect(esRutaPropia(`tandas/otra/${V}/video.mp4`, T, V)).toBe(false)
  })

  it('rechaza ".."', () => {
    expect(esRutaPropia(`tandas/${T}/${V}/../../otra/video.mp4`, T, V)).toBe(false)
  })

  it('rechaza un video cuyo id empieza igual pero es otro', () => {
    expect(esRutaPropia(`tandas/${T}/${V}2/video.mp4`, T, V)).toBe(false)
  })

  it('rechaza un nombre que no es de los tres archivos', () => {
    expect(esRutaPropia(`tandas/${T}/${V}/otro.exe`, T, V)).toBe(false)
  })
})

describe('altaVideosSchema', () => {
  it('rechaza un archivo de 210 MB', () => {
    const r = altaVideosSchema.safeParse({ archivos: [{ nombre: 'a.mp4', tamano: 210 * 1024 * 1024, tipo: 'video/mp4' }] })
    expect(r.success).toBe(false)
  })

  it('acepta un mov de 50 MB', () => {
    const r = altaVideosSchema.safeParse({ archivos: [{ nombre: 'a.mov', tamano: 50 * 1024 * 1024, tipo: 'video/quicktime' }] })
    expect(r.success).toBe(true)
  })

  it('rechaza una lista vacía', () => {
    expect(altaVideosSchema.safeParse({ archivos: [] }).success).toBe(false)
  })
})

describe('patchVideoSchema', () => {
  it('rechaza un campo desconocido', () => {
    expect(patchVideoSchema.safeParse({ estado: 'publicado' }).success).toBe(false)
  })

  it('acepta descripción y redes', () => {
    expect(patchVideoSchema.safeParse({ descripcion: 'hola', redes: ['instagram'] }).success).toBe(true)
  })

  it('rechaza una red desconocida', () => {
    expect(patchVideoSchema.safeParse({ redes: ['myspace'] }).success).toBe(false)
  })

  it('rechaza una descripción de más de 2.200 caracteres', () => {
    expect(patchVideoSchema.safeParse({ descripcion: 'a'.repeat(2201) }).success).toBe(false)
  })

  it('no deja poner a mano la etapa listo ni error', () => {
    expect(patchVideoSchema.safeParse({ etapa: 'transcribiendo' }).success).toBe(true)
    expect(patchVideoSchema.safeParse({ etapa: 'listo' }).success).toBe(false)
    expect(patchVideoSchema.safeParse({ etapa: 'error' }).success).toBe(false)
  })
})

describe('transicionPermitida', () => {
  it('el navegador avanza subiendo → extrayendo → transcribiendo', () => {
    expect(transicionPermitida('subiendo', 'extrayendo', null)).toBe(true)
    expect(transicionPermitida('extrayendo', 'transcribiendo', null)).toBe(true)
  })

  it('no se puede saltar etapas ni volver atrás', () => {
    expect(transicionPermitida('subiendo', 'transcribiendo', null)).toBe(false)
    expect(transicionPermitida('listo', 'extrayendo', null)).toBe(false)
  })

  it('reintentar desde error solo vuelve a la etapa que falló', () => {
    expect(transicionPermitida('error', 'describiendo', 'describiendo')).toBe(true)
    expect(transicionPermitida('error', 'transcribiendo', 'describiendo')).toBe(false)
  })

  it('un video en error de subida puede volver a subirse', () => {
    expect(transicionPermitida('error', 'subiendo', 'subiendo')).toBe(true)
  })
})

describe('patchTandaSchema', () => {
  it('acepta un ritmo válido', () => {
    expect(patchTandaSchema.safeParse({ ritmo: { tipo: 'por_dia', cantidad: 2 }, inicio: '2026-10-30' }).success).toBe(true)
  })

  it('rechaza una cantidad por día de 4 fuera de "a mi manera"', () => {
    expect(patchTandaSchema.safeParse({ ritmo: { tipo: 'por_dia', cantidad: 4 } }).success).toBe(false)
  })

  it('rechaza un horario inválido en "a mi manera"', () => {
    expect(
      patchTandaSchema.safeParse({ ritmo: { tipo: 'personalizado', porDia: 1, dias: [1], horarios: ['25:00'] } }).success,
    ).toBe(false)
  })
})

describe('detectarDuplicados', () => {
  it('marca mismo nombre y tamaño, deja pasar mismo nombre con otro tamaño', () => {
    const r = detectarDuplicados(
      [{ nombre_archivo: 'video1.mp4', tamano_bytes: 1000 }],
      [
        { nombre: 'video1.mp4', tamano: 1000 },
        { nombre: 'video1.mp4', tamano: 2000 },
      ],
    )
    expect(r.repetidos).toEqual(['video1.mp4'])
    expect(r.nuevos).toEqual([{ nombre: 'video1.mp4', tamano: 2000 }])
  })

  it('el mismo archivo elegido dos veces en la misma selección entra una sola vez', () => {
    const r = detectarDuplicados([], [
      { nombre: 'a.mp4', tamano: 5 },
      { nombre: 'a.mp4', tamano: 5 },
    ])
    expect(r.nuevos).toHaveLength(1)
    expect(r.repetidos).toEqual(['a.mp4'])
  })
})
