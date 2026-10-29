import { describe, expect, it } from 'vitest'
import { esReintentable, esperaParaReintento, estadoDelGuardado, mezclarTrasEscribir, ESPERA_AL_TIPEAR_MS } from './autoguardado'
import type { Manual } from './tipos'

describe('mezclarTrasEscribir (la plataforma escribió los textos mientras Paula cargaba datos)', () => {
  const antes: Manual = { zonaprop: { exposicion: 100 }, textos: { analisisFinal: 'viejo', resumenMetricas: 'viejo' } }
  const servidor: Manual = { zonaprop: { exposicion: 100 }, textos: { analisisFinal: 'NUEVO', resumenMetricas: 'NUEVO' }, redaccion: { generadoEn: 'x', original: {}, revisar: [] } }
  it('sin nada escrito en el medio, queda lo del servidor tal cual', () => {
    expect(mezclarTrasEscribir({ local: antes, confirmadoAntes: antes, servidor })).toEqual({ manual: servidor, hayQueMandar: false })
  })
  it('un número cargado en el medio se conserva (antes se perdía) y hay que mandarlo', () => {
    const local: Manual = { ...antes, zonaprop: { exposicion: 930 } }
    const r = mezclarTrasEscribir({ local, confirmadoAntes: antes, servidor })
    expect(r.hayQueMandar).toBe(true)
    expect(r.manual.zonaprop).toEqual({ exposicion: 930 })
    expect(r.manual.textos).toEqual(servidor.textos)
    expect(r.manual.redaccion).toEqual(servidor.redaccion)
  })
  it('un texto que Paula escribió en el medio gana sobre el de la plataforma; los otros textos son los nuevos', () => {
    const local: Manual = { ...antes, textos: { ...antes.textos, analisisFinal: 'lo de Paula' } }
    const r = mezclarTrasEscribir({ local, confirmadoAntes: antes, servidor })
    expect(r.manual.textos).toEqual({ analisisFinal: 'lo de Paula', resumenMetricas: 'NUEVO' })
    expect(r.hayQueMandar).toBe(true)
  })
})

describe('esReintentable (qué fallos se reintentan solos)', () => {
  it('sin conexión, servidor caído o lento: sí (el dato es bueno, falló el camino)', () => {
    for (const s of [0, 408, 429, 500, 502, 503, 504]) expect(esReintentable(s)).toBe(true)
  })
  it('sesión vencida: sí (al volver a entrar, lo escrito se manda solo; descartarlo perdería el trabajo)', () => {
    expect(esReintentable(401)).toBe(true)
  })
  it('dato inválido, sin permiso, informe inexistente o ya listo: no (insistir no lo arregla)', () => {
    for (const s of [400, 403, 404, 409]) expect(esReintentable(s)).toBe(false)
  })
})

describe('esperaParaReintento', () => {
  it('crece de a poco y se queda en 30 s (sigue reintentando mientras la pantalla esté abierta)', () => {
    expect([0, 1, 2, 3, 4, 10].map(esperaParaReintento)).toEqual([2_000, 5_000, 10_000, 20_000, 30_000, 30_000])
  })
})

describe('estadoDelGuardado (lo que ve Paula)', () => {
  const base = { guardando: 0, escribiendo: 0, fallo: null as string | null, guardadoEn: null as Date | null }
  it('guardando o escribiendo → "Guardando…"', () => {
    expect(estadoDelGuardado({ ...base, guardando: 1 }).tipo).toBe('guardando')
    expect(estadoDelGuardado({ ...base, escribiendo: 1 }).tipo).toBe('guardando')
  })
  it('un fallo que se reintenta → "Sin guardar", con el motivo', () => {
    const e = estadoDelGuardado({ ...base, fallo: 'No hay conexión.' })
    expect(e).toEqual({ tipo: 'sin_guardar', texto: 'Sin guardar — reintentando (No hay conexión.)' })
  })
  it('el fallo manda sobre "guardando": mientras no entre, no se puede decir que está guardado', () => {
    expect(estadoDelGuardado({ ...base, guardando: 1, fallo: 'x' }).tipo).toBe('sin_guardar')
  })
  it('todo guardado → "Guardado" con la hora', () => {
    expect(estadoDelGuardado({ ...base, guardadoEn: new Date('2026-10-24T14:05:00-03:00') }))
      .toEqual({ tipo: 'guardado', texto: 'Guardado 14:05' })
  })
  it('sin cambios todavía → nada que mostrar', () => {
    expect(estadoDelGuardado(base)).toEqual({ tipo: 'nada', texto: '' })
  })
})

describe('ESPERA_AL_TIPEAR_MS', () => {
  it('es corta: guardar mientras se escribe, no al minuto', () => {
    expect(ESPERA_AL_TIPEAR_MS).toBeLessThanOrEqual(2_000)
  })
})

describe('mezclarTrasEscribir y la marca de "datos corregidos"', () => {
  it('la marca que ya estaba antes de escribir no vuelve (el servidor la borró al escribir los textos)', () => {
    const antes: Manual = { ajustesEn: 'x', ajustes: { visitas: { realizadas: 3 } } }
    const servidor: Manual = { ajustes: { visitas: { realizadas: 3 } }, textos: { analisisFinal: 'nuevo' } }
    expect(mezclarTrasEscribir({ local: antes, confirmadoAntes: antes, servidor }).manual.ajustesEn).toBeUndefined()
  })
  it('una corrección hecha MIENTRAS escribía sí queda marcada', () => {
    const antes: Manual = {}
    const local: Manual = { ajustesEn: 'y', ajustes: { visitas: { realizadas: 3 } } }
    const r = mezclarTrasEscribir({ local, confirmadoAntes: antes, servidor: { textos: { analisisFinal: 'nuevo' } } })
    expect(r.manual.ajustesEn).toBe('y')
    expect(r.manual.ajustes).toEqual({ visitas: { realizadas: 3 } })
  })
})
