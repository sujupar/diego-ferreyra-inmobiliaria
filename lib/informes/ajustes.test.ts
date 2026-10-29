import { describe, expect, it } from 'vitest'
import { aplicarAjustes, hayAjustes, textosDesactualizados } from './ajustes'
import type { Fuentes } from './tipos'

const ok = <T,>(datos: T) => ({ estado: 'ok' as const, actualizadoEn: 'x', datos, error: null })
const sinDatos = { estado: 'sin_datos' as const, actualizadoEn: 'x', datos: null, error: 'sin datos' }
const conError = { estado: 'error' as const, actualizadoEn: 'x', datos: null, error: 'Meta no respondió' }
const fichaVacia = { respuestas: 0, leGusto: { si: 0, no: 0 }, precio: { correcto: 0, alto: 0, bajo: 0 }, ofertas: [], moneda: null, masGusto: [], menosGusto: [], comentariosMenosGusto: [] }

const fuentes: Fuentes = {
  consultas: ok({ total: 3, porPortal: { zonaprop: 2, argenprop: 1, mercadolibre: 0, redes: 0, otros: 0 } }),
  visitas: ok({ realizadas: 0, ficha: fichaVacia }),
  reserva: ok({ reservada: false, fecha: null }),
  mercadolibre: sinDatos,
  meta: conError,
  instagram: ok({ reels: [
    { permalink: 'https://ig/1', publicadoEn: 'x', reproducciones: 100, alcance: 80, meGusta: 5, comentarios: 2, guardados: 1, compartidos: 0 },
    { permalink: 'https://ig/2', publicadoEn: 'x', reproducciones: 50, alcance: 40, meGusta: 3, comentarios: 1, guardados: 0, compartidos: 0 },
  ] }),
}

describe('aplicarAjustes (lo cargado a mano gana sobre lo que trajo la plataforma)', () => {
  it('sin ajustes devuelve lo automático tal cual (los informes viejos no cambian)', () => {
    expect(aplicarAjustes(fuentes, undefined)).toBe(fuentes)
    expect(aplicarAjustes(fuentes, {})).toEqual(fuentes)
  })

  it('visitas en 0 corregidas a 3: el dato vale y la fuente queda marcada como cargada a mano', () => {
    const f = aplicarAjustes(fuentes, { visitas: { realizadas: 3 } })
    expect(f.visitas).toMatchObject({ estado: 'ok', aMano: true, datos: { realizadas: 3 } })
    // La ficha de visitas sale de la encuesta: no se toca.
    expect(f.visitas?.datos?.ficha).toEqual(fichaVacia)
  })

  it('consultas: se corrige un portal y el total es la suma', () => {
    const f = aplicarAjustes(fuentes, { consultas: { mercadolibre: 4 } })
    expect(f.consultas?.datos).toEqual({ total: 7, porPortal: { zonaprop: 2, argenprop: 1, mercadolibre: 4, redes: 0, otros: 0 } })
  })

  it('una fuente con error o sin datos, corregida a mano, cuenta como dato (sale en el PDF)', () => {
    const f = aplicarAjustes(fuentes, { meta: { alcance: 5000, impresiones: 9000 }, mercadolibre: { visitas: 40, interesados: 2 } })
    expect(f.meta).toMatchObject({ estado: 'ok', aMano: true, error: null, datos: { alcance: 5000, impresiones: 9000, resultados: 0, campanas: 1 } })
    expect(f.mercadolibre).toMatchObject({ estado: 'ok', aMano: true, datos: { visitas: 40, avisos: [], contactos: { interesados: 2, preguntas: 0 } } })
  })

  it('reserva: se puede marcar reservada con fecha', () => {
    const f = aplicarAjustes(fuentes, { reserva: { reservada: true, fecha: '2026-10-19' } })
    expect(f.reserva?.datos).toEqual({ reservada: true, fecha: '2026-10-19' })
  })

  it('instagram: los totales cargados a mano reemplazan a los reels (lo que no se cargó, sale de la suma automática)', () => {
    const f = aplicarAjustes(fuentes, { instagram: { reproducciones: 1000 } })
    expect(f.instagram?.datos?.reels).toEqual([{ permalink: null, publicadoEn: null, reproducciones: 1000, alcance: 120, meGusta: 8, comentarios: 3, guardados: 1, compartidos: 0 }])
    // Los textos no pueden decir "1 reel" si había 2: la cantidad real viaja aparte.
    expect(f.instagram?.datos?.cantidadReels).toBe(2)
  })

  it('un ajuste vacío (todos los campos borrados) no cambia nada: es "volver al automático"', () => {
    expect(aplicarAjustes(fuentes, { visitas: {} }).visitas).toBe(fuentes.visitas)
  })
})

describe('hayAjustes y textosDesactualizados', () => {
  it('hayAjustes dice si una fuente tiene algo cargado a mano', () => {
    expect(hayAjustes({ visitas: { realizadas: 3 } }, 'visitas')).toBe(true)
    expect(hayAjustes({ visitas: {} }, 'visitas')).toBe(false)
    expect(hayAjustes(undefined, 'meta')).toBe(false)
  })
  it('avisa "Volver a escribir" si hay textos escritos y una corrección posterior (al escribir, el servidor borra la marca)', () => {
    const redaccion = { generadoEn: '2026-10-29T11:00:00Z', original: {}, revisar: [] }
    // No compara horas: el reloj del navegador y el del servidor pueden no coincidir.
    expect(textosDesactualizados({ ajustesEn: '2026-10-29T10:00:00Z', redaccion })).toBe(true)
    expect(textosDesactualizados({ redaccion })).toBe(false)
    expect(textosDesactualizados({ ajustesEn: '2026-10-29T12:00:00Z' })).toBe(false)
  })
})
