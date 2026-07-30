import { describe, it, expect } from 'vitest'
import { parseDataUrl } from './migrate-base64-photos'

// Pura lógica de decodificación — sin red, sin DB. El resto del script
// (backup, upload a Storage, update de la fila) se verificó manualmente
// contra la base real en dry-run y --commit (ver task-7-8-report.md).
describe('parseDataUrl', () => {
  it('decodifica un data URL png válido', () => {
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const r = parseDataUrl(`data:image/png;base64,${tinyPngBase64}`)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mime).toBe('image/png')
      expect(r.ext).toBe('png')
      expect(r.buffer.length).toBeGreaterThan(0)
    }
  })

  it('mapea image/jpeg a extensión jpg', () => {
    const r = parseDataUrl('data:image/jpeg;base64,/9k=')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ext).toBe('jpg')
  })

  it('rechaza un valor que no matchea el formato data:<mime>;base64,<payload>', () => {
    const r = parseDataUrl('https://example.com/foto.png')
    expect(r.ok).toBe(false)
  })

  it('rechaza un mime no soportado (no queda como foto corrupta silenciosa)', () => {
    const r = parseDataUrl('data:application/pdf;base64,JVBERi0xLjQK')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/mime no soportado/)
  })

  it('rechaza un payload con caracteres inválidos (base64 corrupto)', () => {
    const r = parseDataUrl('data:image/png;base64,esto-no-es-base64-!!!@@@')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/inválidos/)
  })

  it('rechaza un payload vacío', () => {
    const r = parseDataUrl('data:image/png;base64,')
    expect(r.ok).toBe(false)
  })
})
