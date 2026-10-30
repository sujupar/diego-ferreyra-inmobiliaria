/**
 * Muestras de audio mono → WAV PCM de 16 bits. Es lo que se manda a transcribir:
 * a 16 kHz pesa ~32 KB por segundo (un video de 3 minutos ≈ 5,8 MB), muy lejos
 * del video original de 100-200 MB que no hace falta mandar a ningún lado.
 */
export function codificarWav(muestras: Float32Array, frecuencia: number): Blob {
  const datos = muestras.length * 2
  const buf = new ArrayBuffer(44 + datos)
  const v = new DataView(buf)
  const escribir = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i))
  }

  escribir(0, 'RIFF')
  v.setUint32(4, 36 + datos, true)
  escribir(8, 'WAVE')
  escribir(12, 'fmt ')
  v.setUint32(16, 16, true) // tamaño del bloque fmt
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, frecuencia, true)
  v.setUint32(28, frecuencia * 2, true) // bytes por segundo
  v.setUint16(32, 2, true) // bytes por muestra
  v.setUint16(34, 16, true) // bits por muestra
  escribir(36, 'data')
  v.setUint32(40, datos, true)

  for (let i = 0; i < muestras.length; i++) {
    const s = Math.max(-1, Math.min(1, muestras[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}
