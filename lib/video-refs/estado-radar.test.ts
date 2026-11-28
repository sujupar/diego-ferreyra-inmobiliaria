import { describe, it, expect } from 'vitest'
import { calcularEstadoRadar, textoAlerta, textoUltima, cuandoCorrio, type FilaCorrida } from './estado-radar'

const AHORA = new Date('2026-11-28T15:00:00Z') // 12:00 en Buenos Aires
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const fila = (o: Partial<FilaCorrida> = {}): FilaCorrida => ({
  inicio: hace(2), estado: 'ok', cuentas_revisadas: 24, reels_mirados: 280, publicadas: 7, mensaje: null, ...o,
})

describe('calcularEstadoRadar', () => {
  it('sin filas -> sin_corridas', () => {
    expect(calcularEstadoRadar(null, null, AHORA)).toEqual({ ultima: null, alerta: 'sin_corridas', buscando: false })
  })
  it('ok hace 2 h -> sin alerta', () => {
    const f = fila()
    const e = calcularEstadoRadar(f, f, AHORA)
    expect(e.alerta).toBeNull()
    expect(e.ultima).toEqual({ inicio: f.inicio, estado: 'ok', cuentas: 24, reels: 280, publicadas: 7, mensaje: null })
  })
  it('ok hace 37 h -> atrasado', () => {
    const f = fila({ inicio: hace(37) })
    expect(calcularEstadoRadar(f, f, AHORA).alerta).toBe('atrasado')
  })
  it('parcial hace 2 h cuenta como al día', () => {
    const f = fila({ estado: 'parcial' })
    expect(calcularEstadoRadar(f, f, AHORA).alerta).toBeNull()
  })
  it('última frenada por instagram -> frenado', () => {
    const ok = fila({ inicio: hace(26) })
    const u = fila({ inicio: hace(2), estado: 'frenada_por_instagram' })
    expect(calcularEstadoRadar(ok, u, AHORA).alerta).toBe('frenado')
  })
  it('última con error -> error', () => {
    const ok = fila({ inicio: hace(26) })
    const u = fila({ estado: 'error', mensaje: 'se cayó' })
    expect(calcularEstadoRadar(ok, u, AHORA).alerta).toBe('error')
  })
  it('sin ok pero con una corrida corriendo -> no alerta de atraso', () => {
    const u = fila({ estado: 'corriendo' })
    expect(calcularEstadoRadar(null, u, AHORA).alerta).toBeNull()
  })
  it('sin ok y corriendo hace 40 h (muerta) -> sin_corridas', () => {
    const u = fila({ estado: 'corriendo', inicio: hace(40) })
    expect(calcularEstadoRadar(null, u, AHORA)).toMatchObject({ alerta: 'sin_corridas', buscando: false })
  })
  it('corriendo hace 1 h: resume desde la última buena, no con ceros, y marca buscando', () => {
    const ok = fila({ inicio: hace(26), reels_mirados: 280 })
    const u = fila({ estado: 'corriendo', inicio: hace(1), reels_mirados: 0, cuentas_revisadas: 0, publicadas: 0 })
    const e = calcularEstadoRadar(ok, u, AHORA)
    expect(e.buscando).toBe(true)
    expect(e.ultima).toMatchObject({ inicio: ok.inicio, reels: 280 })
    expect(textoUltima(e, AHORA)).toContain('buscando ahora')
  })
  it('corriendo hace 1 h sin corridas buenas -> "Buscando ahora…"', () => {
    const e = calcularEstadoRadar(null, fila({ estado: 'corriendo', inicio: hace(1) }), AHORA)
    expect(e).toEqual({ ultima: null, alerta: null, buscando: true })
    expect(textoUltima(e, AHORA)).toBe('Buscando ahora…')
  })
  it('corrida muerta (corriendo hace 5 h): la fecha del atraso es la de la última buena', () => {
    const ok = fila({ inicio: '2026-11-24T11:10:00Z' })
    const u = fila({ estado: 'corriendo', inicio: hace(5) })
    const e = calcularEstadoRadar(ok, u, AHORA)
    expect(e.alerta).toBe('atrasado')
    expect(e.buscando).toBe(false)
    expect(textoAlerta(e, AHORA)).toBe('El radar no corre desde el martes')
  })
})

describe('cuandoCorrio', () => {
  it('hoy / ayer / día de la semana / fecha', () => {
    expect(cuandoCorrio('2026-11-28T11:12:00Z', AHORA)).toBe('hoy 08:12')
    expect(cuandoCorrio('2026-11-27T11:05:00Z', AHORA)).toBe('ayer 08:05')
    expect(cuandoCorrio('2026-11-24T11:10:00Z', AHORA)).toBe('el martes 08:10')
    expect(cuandoCorrio('2026-11-10T11:10:00Z', AHORA)).toMatch(/^el 10 de nov/)
  })
})

describe('textoAlerta', () => {
  it('textos en castellano llano', () => {
    const ultima = { inicio: '2026-11-24T11:10:00Z', estado: 'ok', cuentas: 1, reels: 1, publicadas: 0, mensaje: 'boom' }
    expect(textoAlerta({ ultima, alerta: 'atrasado', buscando: false }, AHORA)).toBe('El radar no corre desde el martes')
    expect(textoAlerta({ ultima: null, alerta: 'sin_corridas', buscando: false }, AHORA)).toBe('El radar todavía no corrió')
    expect(textoAlerta({ ultima, alerta: 'frenado', buscando: false }, AHORA)).toBe('Instagram frenó la búsqueda de hoy')
    expect(textoAlerta({ ultima, alerta: 'error', buscando: false }, AHORA)).toBe('La búsqueda de hoy falló: boom')
    expect(textoAlerta({ ultima: null, alerta: null, buscando: false }, AHORA)).toBeNull()
  })
})
