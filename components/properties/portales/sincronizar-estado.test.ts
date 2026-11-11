import { describe, it, expect } from 'vitest'
import {
  parsearFilas, filasAMostrar, lineaDiferencia, textoAccion, lineasFranja, interpretarRespuesta, leerCuerpo, esAccionable,
} from './sincronizar-estado'

const ap = {
  portal: 'argenprop', accion: 'republicar', externalUrl: 'https://ap/1',
  diferencias: [{ campo: 'tipo', antes: 'Departamento', despues: 'Casa' }],
}
const ml = {
  portal: 'mercadolibre', accion: 'actualizar',
  diferencias: [{ campo: 'precio', antes: 'USD 79.000', despues: 'USD 85.000' }],
}

describe('parsearFilas / filasAMostrar', () => {
  it('lee diferencias y errores, ignora basura', () => {
    const f = parsearFilas({ portales: [ap, { portal: 'mercadolibre', error: 'No responde' }, { portal: 'x' }, 7] })
    expect(f).toHaveLength(2)
    expect(f[1]).toEqual({ tipo: 'error', portal: 'mercadolibre', error: 'No responde' })
  })
  it('forma inválida → vacío', () => {
    expect(parsearFilas(null)).toEqual([])
    expect(parsearFilas({ portales: 'x' })).toEqual([])
  })
  it('oculta las filas sin diferencias y deja los errores', () => {
    const f = parsearFilas({ portales: [{ portal: 'argenprop', accion: 'nada', diferencias: [] }, { portal: 'mercadolibre', error: 'x' }] })
    expect(filasAMostrar(f)).toHaveLength(1)
    expect(esAccionable(f[1])).toBe(false)
  })
})

describe('textos', () => {
  it('línea de diferencia', () => {
    expect(lineaDiferencia({ campo: 'tipo', antes: 'Departamento', despues: 'Casa' })).toBe('Tipo: Departamento → Casa')
    expect(lineaDiferencia({ campo: 'operacion', antes: 'Venta', despues: 'Alquiler' })).toBe('Operación: Venta → Alquiler')
  })
  it('AP republicar avisa del cambio de número', () => {
    const [fila] = parsearFilas({ portales: [ap] })
    if (fila.tipo !== 'diferencias') throw new Error('x')
    const t = textoAccion(fila)
    expect(t).toContain('volver a publicar como Casa')
    expect(t).toContain('el link viejo deja de andar')
  })
  it('ML actualiza el mismo aviso / el precio', () => {
    const [p] = parsearFilas({ portales: [ml] })
    const [t] = parsearFilas({ portales: [{ ...ml, diferencias: [{ campo: 'tipo', antes: 'A', despues: 'B' }] }] })
    if (p.tipo !== 'diferencias' || t.tipo !== 'diferencias') throw new Error('x')
    expect(textoAccion(p)).toBe('Se actualiza el precio del aviso.')
    expect(textoAccion(t)).toBe('Se actualiza el mismo aviso.')
  })
})

describe('franja', () => {
  it('una línea por portal con la primera diferencia', () => {
    const l = lineasFranja(parsearFilas({ portales: [ap, ml, { portal: 'argenprop', error: 'x' }] }))
    expect(l).toHaveLength(2)
    expect(l[0].texto).toBe('El aviso de Argenprop figura como Departamento y la ficha dice Casa (el tipo)')
    expect(l[1].texto).toContain('MercadoLibre')
  })
})

describe('interpretarRespuesta', () => {
  it('ok', () => {
    expect(interpretarRespuesta(200, { ok: true, externalUrl: 'u' })).toEqual({ tipo: 'ok', externalUrl: 'u', mensaje: null })
  })
  it('plan B', () => {
    expect(interpretarRespuesta(409, { error: 'e', planBDisponible: true }).tipo).toBe('planB')
  })
  it('409 sin plan B y 502 son errores con el motivo', () => {
    expect(interpretarRespuesta(409, { error: 'Ya se está actualizando…' })).toEqual({ tipo: 'error', mensaje: 'Ya se está actualizando…' })
    expect(interpretarRespuesta(502, null).tipo).toBe('error')
  })
  it('HTML de 504 → mensaje claro', () => {
    expect(leerCuerpo(504, '<html>')).toEqual({ error: 'El portal tardó demasiado. Probá de nuevo.' })
  })
})
