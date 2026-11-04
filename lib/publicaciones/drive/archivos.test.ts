import { describe, expect, it } from 'vitest'
import { clasificarArchivo } from './archivos'

const base = { id: 'x1', name: 'video.mp4', mimeType: 'video/mp4', size: '52428800' }

describe('clasificarArchivo', () => {
  it('un MP4 de 50 MB es apto', () => {
    expect(clasificarArchivo(base)).toEqual({ id: 'x1', nombre: 'video.mp4', tamano: 52428800, tipo: 'video/mp4', apto: true, motivo: null })
  })

  it('un MOV es apto y conserva su tipo', () => {
    expect(clasificarArchivo({ ...base, name: 'toma.MOV', mimeType: 'video/quicktime' })).toMatchObject({ apto: true, tipo: 'video/quicktime' })
  })

  it('otro formato de video no es apto y dice por qué', () => {
    expect(clasificarArchivo({ ...base, name: 'clip.webm', mimeType: 'video/webm' })).toMatchObject({
      apto: false,
      motivo: 'Formato no compatible (solo MP4 o MOV)',
    })
  })

  it('más de 200 MB no es apto', () => {
    expect(clasificarArchivo({ ...base, size: String(209_715_201) })).toMatchObject({ apto: false, motivo: 'Pesa más de 200 MB' })
  })

  it('exactamente 200 MB sí es apto', () => {
    expect(clasificarArchivo({ ...base, size: String(209_715_200) }).apto).toBe(true)
  })

  it('vacío o sin tamaño no es apto', () => {
    expect(clasificarArchivo({ ...base, size: '0' })).toMatchObject({ apto: false, motivo: 'El archivo está vacío' })
    expect(clasificarArchivo({ ...base, size: undefined })).toMatchObject({ apto: false, motivo: 'Drive no informa su tamaño' })
  })

  it('el nombre se normaliza (tildes de macOS) y se recorta a 255', () => {
    const nfd = 'Ubicación.mp4'
    expect(clasificarArchivo({ ...base, name: nfd }).nombre).toBe('Ubicación.mp4')
    expect(clasificarArchivo({ ...base, name: `${'a'.repeat(300)}.mp4` }).nombre).toHaveLength(255)
  })

  it('sin nombre usa uno genérico', () => {
    expect(clasificarArchivo({ ...base, name: '   ' }).nombre).toBe('video-de-drive.mp4')
  })
})
