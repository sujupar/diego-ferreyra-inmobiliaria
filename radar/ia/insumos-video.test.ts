import { describe, it, expect } from 'vitest'
import {
  argsAudio, argsFrame, argsWhisper, extraerFrames, limpiarTranscripcion, tiemposFrames, transcribir,
  type Ejecutar,
} from './insumos-video'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('tiemposFrames', () => {
  it('el primero cae a 0,5 s (el gancho) y quedan parejos hasta el final', () => {
    const t = tiemposFrames(30, 8)
    expect(t).toHaveLength(8)
    expect(t[0]).toBe(0.5)
    expect(t[7]).toBeCloseTo(29.5)
    const pasos = t.slice(1).map((v, i) => v - t[i])
    for (const p of pasos) expect(p).toBeCloseTo(pasos[0])
  })
  it('video muy corto: no se pasa del final y no repite', () => {
    const t = tiemposFrames(1, 8)
    expect(t[0]).toBeLessThanOrEqual(0.5)
    expect(Math.max(...t)).toBeLessThan(1)
  })
  it('n = 1 da solo el del gancho', () => {
    expect(tiemposFrames(30, 1)).toEqual([0.5])
  })
  it('duración inválida tira', () => {
    expect(() => tiemposFrames(0, 8)).toThrow()
    expect(() => tiemposFrames(Number.NaN, 8)).toThrow()
  })
})

describe('argumentos', () => {
  it('frame: busca antes del -i, 1 cuadro, máximo 720 px del lado largo', () => {
    const a = argsFrame('/v.mp4', 0.5, '/d/frame-01.jpg')
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'))
    expect(a).toContain('0.500')
    expect(a.join(' ')).toContain('-frames:v 1')
    expect(a.join(' ')).toContain('720')
    expect(a[a.length - 1]).toBe('/d/frame-01.jpg')
  })
  it('audio: wav 16 kHz mono sin video', () => {
    const a = argsAudio('/v.mp4', '/d/audio.wav').join(' ')
    expect(a).toContain('-ar 16000')
    expect(a).toContain('-ac 1')
    expect(a).toContain('-vn')
  })
  it('whisper: español, texto plano, sin marcas de tiempo', () => {
    const a = argsWhisper('/m.bin', '/d/audio.wav', '/d/transcripcion').join(' ')
    expect(a).toContain('-m /m.bin')
    expect(a).toContain('-l es')
    expect(a).toContain('-otxt')
    expect(a).toContain('-nt')
    expect(a).toContain('-of /d/transcripcion')
    expect(a).toContain('-f /d/audio.wav')
  })
})

describe('limpiarTranscripcion', () => {
  it('saca marcas de no-habla y junta espacios', () => {
    expect(limpiarTranscripcion(' [Música]\n Hola,  mirá esto \n(risas)\n')).toBe('Hola, mirá esto')
  })
  it('solo música = vacío', () => {
    expect(limpiarTranscripcion('[BLANK_AUDIO]\n[Música]\n')).toBe('')
  })
})

function carpeta() {
  return mkdtempSync(join(tmpdir(), 'insumos-test-'))
}

describe('extraerFrames (con un ejecutor doble)', () => {
  it('pide la duración y saca n cuadros con nombres frame-01…', async () => {
    const dir = carpeta()
    const llamadas: string[][] = []
    const ejecutar: Ejecutar = async (bin, args) => {
      llamadas.push([bin, ...args])
      if (bin.endsWith('ffprobe')) return '20.0\n'
      writeFileSync(args[args.length - 1], 'jpg')
      return ''
    }
    try {
      const frames = await extraerFrames('/v.mp4', dir, 3, { ejecutar })
      expect(frames).toEqual([join(dir, 'frame-01.jpg'), join(dir, 'frame-02.jpg'), join(dir, 'frame-03.jpg')])
      expect(llamadas.filter((l) => l[0].endsWith('ffmpeg'))).toHaveLength(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('transcribir (con un ejecutor doble)', () => {
  it('sin pista de audio devuelve vacío sin llamar a whisper', async () => {
    const llamadas: string[] = []
    const ejecutar: Ejecutar = async (bin) => {
      llamadas.push(bin)
      return ''
    }
    expect(await transcribir('/v.mp4', '/no/importa', { ejecutar })).toBe('')
    expect(llamadas.some((b) => b.includes('whisper'))).toBe(false)
  })
  it('con audio: lee el .txt de whisper, lo limpia y borra el wav', async () => {
    const dir = carpeta()
    const ejecutar: Ejecutar = async (bin, args) => {
      if (bin.endsWith('ffprobe')) return 'audio\n'
      if (bin.includes('whisper')) {
        const of = args[args.indexOf('-of') + 1]
        writeFileSync(`${of}.txt`, '[Música]\n Hola, mirá.\n')
        return ''
      }
      writeFileSync(args[args.length - 1], 'wav')
      return ''
    }
    try {
      expect(await transcribir('/v.mp4', dir, { ejecutar })).toBe('Hola, mirá.')
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
