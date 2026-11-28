import { describe, expect, it } from 'vitest'
import { filasParaLimpiar, type FilaRetencion } from './medios'

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
