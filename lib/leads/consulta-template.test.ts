import { describe, it, expect } from 'vitest'
import {
  elegirPlantilla,
  parametrosDelCuerpo,
  CUERPO_CON_MATERIAL,
  CUERPO_SIN_MATERIAL,
} from './consulta-template'

describe('elegirPlantilla', () => {
  it('con plano, manda el plano', () => {
    const e = elegirPlantilla({ plans: ['https://s/plano.pdf'], video_file_url: null, photos: [] })
    expect(e.plantilla).toBe('consulta_plano')
    expect(e.header).toEqual({ tipo: 'document', link: 'https://s/plano.pdf' })
    expect(e.queMando).toBe('el plano')
  })

  it('con plano Y video: va el plano, el video queda ofrecido para después', () => {
    const e = elegirPlantilla({ plans: ['https://s/plano.pdf'], video_file_url: 'https://s/v.mp4', photos: ['https://s/1.jpg'] })
    expect(e.plantilla).toBe('consulta_plano')
    expect(e.pendiente).toEqual(['video', 'fotos'])
  })

  it('sin plano y con video, manda el video', () => {
    const e = elegirPlantilla({ plans: [], video_file_url: 'https://s/v.mp4', photos: ['https://s/1.jpg'] })
    expect(e.plantilla).toBe('consulta_video')
    expect(e.header).toEqual({ tipo: 'video', link: 'https://s/v.mp4' })
    expect(e.pendiente).toEqual(['fotos'])
  })

  it('sin nada, la plantilla simple y sin encabezado', () => {
    const e = elegirPlantilla({ plans: null, video_file_url: null, photos: null })
    expect(e.plantilla).toBe('consulta_simple')
    expect(e.header).toBeNull()
    expect(e.pendiente).toEqual([])
  })

  it('sin plano ni video pero CON fotos: sigue siendo la simple, y ofrece las fotos', () => {
    const e = elegirPlantilla({ plans: [], video_file_url: null, photos: ['https://s/1.jpg'] })
    expect(e.plantilla).toBe('consulta_simple')
    expect(e.pendiente).toEqual(['fotos'])
  })

  it('un array de planos vacío o con basura no cuenta como plano', () => {
    expect(elegirPlantilla({ plans: ['  '], video_file_url: null }).plantilla).toBe('consulta_simple')
  })

  it('un video en blanco tampoco', () => {
    expect(elegirPlantilla({ plans: [], video_file_url: '   ' }).plantilla).toBe('consulta_simple')
  })
})

describe('parametrosDelCuerpo', () => {
  const datos = { nombre: 'Julián Parra', propiedad: 'la casa de Lares de Canning' }

  it('con material van TRES variables, en orden', () => {
    const e = elegirPlantilla({ plans: [], video_file_url: 'https://s/v.mp4' })
    expect(parametrosDelCuerpo(e, datos)).toEqual(['Julián', 'un video', 'la casa de Lares de Canning'])
  })

  it('SIN material van DOS: pasarle tres a una plantilla de dos hace que Meta rechace el envío', () => {
    const e = elegirPlantilla({ plans: [], video_file_url: null })
    expect(parametrosDelCuerpo(e, datos)).toEqual(['Julián', 'la casa de Lares de Canning'])
  })

  it('usa solo el nombre de pila', () => {
    const e = elegirPlantilla({ plans: [], video_file_url: 'https://s/v.mp4' })
    expect(parametrosDelCuerpo(e, { ...datos, nombre: 'María Sol Fernández' })[0]).toBe('María')
  })

  it('un nombre vacío no deja el saludo colgado', () => {
    const e = elegirPlantilla({ plans: [], video_file_url: 'https://s/v.mp4' })
    expect(parametrosDelCuerpo(e, { ...datos, nombre: '   ' })[0]).toBe('Hola')
  })
})

describe('los cuerpos', () => {
  it('el de con material tiene {{1}}, {{2}} y {{3}}', () => {
    for (const v of ['{{1}}', '{{2}}', '{{3}}']) expect(CUERPO_CON_MATERIAL).toContain(v)
  })

  it('el de SIN material tiene {{1}} y {{2}} — numeradas de corrido, sin saltos', () => {
    expect(CUERPO_SIN_MATERIAL).toContain('{{1}}')
    expect(CUERPO_SIN_MATERIAL).toContain('{{2}}')
    expect(CUERPO_SIN_MATERIAL).not.toContain('{{3}}')
  })

  it('los dos mencionan la consulta: es lo que sostiene la clasificación de Utilidad', () => {
    expect(CUERPO_CON_MATERIAL).toMatch(/consulta que dejaste recién/)
    expect(CUERPO_SIN_MATERIAL).toMatch(/consulta que dejaste recién/)
  })

  it('los dos preguntan cómo ayudar, y ninguno tiene botones ni links', () => {
    for (const c of [CUERPO_CON_MATERIAL, CUERPO_SIN_MATERIAL]) {
      expect(c).toMatch(/cómo te puedo ayudar/)
      expect(c).not.toMatch(/https?:\/\//)
    }
  })
})
