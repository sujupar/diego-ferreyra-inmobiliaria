import { describe, expect, it } from 'vitest'
import { codificarWav } from './wav'

async function vista(b: Blob): Promise<DataView> {
  return new DataView(await b.arrayBuffer())
}
const texto = (v: DataView, desde: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(desde + i)))

describe('codificarWav', () => {
  it('16000 muestras a 16 kHz pesan 44 + 32000 bytes con header RIFF/WAVE', async () => {
    const b = codificarWav(new Float32Array(16000), 16000)
    expect(b.size).toBe(44 + 32000)
    expect(b.type).toBe('audio/wav')
    const v = await vista(b)
    expect(texto(v, 0, 4)).toBe('RIFF')
    expect(texto(v, 8, 4)).toBe('WAVE')
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint16(22, true)).toBe(1) // mono
    expect(v.getUint16(34, true)).toBe(16) // bits
    expect(v.getUint32(40, true)).toBe(32000) // tamaño de datos
  })

  it('1.0 → 32767 y −1.0 → −32768', async () => {
    const v = await vista(codificarWav(new Float32Array([1, -1, 0]), 16000))
    expect(v.getInt16(44, true)).toBe(32767)
    expect(v.getInt16(46, true)).toBe(-32768)
    expect(v.getInt16(48, true)).toBe(0)
  })

  it('valores fuera de rango se recortan', async () => {
    const v = await vista(codificarWav(new Float32Array([3, -7]), 16000))
    expect(v.getInt16(44, true)).toBe(32767)
    expect(v.getInt16(46, true)).toBe(-32768)
  })
})
