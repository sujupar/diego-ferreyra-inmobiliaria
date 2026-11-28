import { describe, expect, it, vi } from 'vitest'
import { writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { bajarYSubir, filasParaLimpiar, limpiarRetencion, type FilaRetencion } from './medios'

const AHORA = new Date('2026-11-28T12:00:00Z')
const fila = (o: Partial<FilaRetencion>): FilaRetencion => ({
  id: 'x', video_storage_path: 'radar/a.mp4', oculta: false, no_sirve_at: null,
  estado_uso: 'sin_usar', created_at: '2026-11-01T00:00:00Z', ...o,
})

describe('filasParaLimpiar', () => {
  it('limpia ocultas', () => expect(filasParaLimpiar([fila({ oculta: true })], AHORA)).toHaveLength(1))
  it('limpia las marcadas no sirve', () =>
    expect(filasParaLimpiar([fila({ no_sirve_at: '2026-11-20T00:00:00Z' })], AHORA)).toHaveLength(1))
  it('limpia sin_usar de más de 120 días', () =>
    expect(filasParaLimpiar([fila({ created_at: '2026-07-01T00:00:00Z' })], AHORA)).toHaveLength(1))
  it('conserva sin_usar reciente', () => expect(filasParaLimpiar([fila({})], AHORA)).toHaveLength(0))
  it('conserva una usada aunque sea vieja', () =>
    expect(filasParaLimpiar([fila({ estado_uso: 'usada', created_at: '2026-01-01T00:00:00Z' })], AHORA)).toHaveLength(0))
  it('ignora filas sin video', () =>
    expect(filasParaLimpiar([fila({ oculta: true, video_storage_path: null })], AHORA)).toHaveLength(0))
})

describe('limpiarRetencion', () => {
  it('borra solo el .mp4 del storage y anula la columna', async () => {
    const filas = [
      fila({ id: 'a', oculta: true, video_storage_path: 'radar/AAAAA.mp4' }),
      fila({ id: 'b', video_storage_path: 'radar/BBBBB.mp4' }), // reciente: se conserva
    ]
    const remove = vi.fn().mockResolvedValue({ error: null })
    const inFn = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ in: inFn })
    const sb: any = {
      from: (t: string) =>
        t === 'video_refs'
          ? { select: () => ({ eq: () => ({ not: () => Promise.resolve({ data: filas, error: null }) }) }), update }
          : undefined,
      storage: { from: () => ({ remove }) },
    }
    expect(await limpiarRetencion(sb)).toBe(1)
    expect(remove).toHaveBeenCalledWith(['radar/AAAAA.mp4'])
    expect(update).toHaveBeenCalledWith({ video_storage_path: null })
    expect(inFn).toHaveBeenCalledWith('id', ['a'])
  })
})

describe('bajarYSubir', () => {
  const dir = join(homedir(), '.radar-referencias', 'tmp', 'medios-TESTx1')
  const correr = async (_b: string, args: string[]) => {
    // yt-dlp escribe en -o; ffmpeg, en su último argumento.
    writeFileSync(args.includes('-o') ? args[args.indexOf('-o') + 1] : args[args.length - 1], 'x')
  }
  it('si falla la subida del video, borra el temporal y relanza', async () => {
    const sb: any = { storage: { from: () => ({ upload: async () => ({ error: { message: 'boom' } }) }) } }
    await expect(bajarYSubir('TESTx1', '/dev/null', { correr, sb })).rejects.toThrow(/boom/)
    expect(existsSync(dir)).toBe(false)
  })
  it('camino feliz: conserva video.mp4 y devuelve los paths', async () => {
    const sb: any = { storage: { from: () => ({ upload: async () => ({ error: null }) }) } }
    const r = await bajarYSubir('TESTx1', '/dev/null', { correr, sb })
    expect(r.videoPath).toBe('radar/TESTx1.mp4')
    expect(r.portadaPath).toBe('radar/TESTx1.jpg')
    expect(existsSync(r.mp4Local)).toBe(true)
    const { rmSync } = await import('node:fs')
    rmSync(dir, { recursive: true, force: true })
  })
})
