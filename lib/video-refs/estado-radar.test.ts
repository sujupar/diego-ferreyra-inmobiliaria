import { describe, it, expect } from 'vitest'
import { calcularEstadoRadar, textoAlerta, cuandoCorrio, type FilaCorrida } from './estado-radar'

const AHORA = new Date('2026-11-28T15:00:00Z') // 12:00 en Buenos Aires
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const fila = (o: Partial<FilaCorrida> = {}): FilaCorrida => ({
  inicio: hace(2), estado: 'ok', cuentas_revisadas: 24, reels_mirados: 280, publicadas: 7, mensaje: null, ...o,
})

describe('calcularEstadoRadar', () => {
  it('sin filas -> sin_corridas', () => {
    expect(calcularEstadoRadar(null, null, AHORA)).toEqual({ ultima: null, alerta: 'sin_corridas' })
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
  it('sin ok y última vieja -> atrasado', () => {
    const u = fila({ estado: 'corriendo', inicio: hace(40) })
    expect(calcularEstadoRadar(null, u, AHORA).alerta).toBe('atrasado')
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
    expect(textoAlerta({ ultima, alerta: 'atrasado' }, AHORA)).toBe('El radar no corre desde el martes')
    expect(textoAlerta({ ultima: null, alerta: 'sin_corridas' }, AHORA)).toBe('El radar todavía no corrió')
    expect(textoAlerta({ ultima, alerta: 'frenado' }, AHORA)).toBe('Instagram frenó la búsqueda de hoy')
    expect(textoAlerta({ ultima, alerta: 'error' }, AHORA)).toBe('La búsqueda de hoy falló: boom')
    expect(textoAlerta({ ultima: null, alerta: null }, AHORA)).toBeNull()
  })
})
