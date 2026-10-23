import { describe, expect, it } from 'vitest'
import * as cheerio from 'cheerio'
import { extractMercadoLibre } from './mercadoLibreExtractor'

// Estructura REAL de una ficha de ML (MLA-2073595273, bajada el 2026-10-22): la tabla de características viene con
// el nombre en <th> y el valor en <td>, y la segunda línea del precio repite el PRECIO, no las expensas.
const fila = (nombre: string, valor: string) => `<tr class="andes-table__row ui-vpp-striped-specs__row">
  <th class="andes-table__header ui-vpp-striped-specs__row__column--id" scope="row"><div class="andes-table__header__container">${nombre}</div></th>
  <td class="andes-table__column ui-vpp-striped-specs__row__column"><span class="andes-table__column--value">${valor}</span></td></tr>`

const ficha = `<html><body>
  <h1 class="ui-pdp-title">Venta Departamento 2 Ambientes Con Patio</h1>
  <div class="ui-pdp-price__second-line"><span class="andes-money-amount__currency-symbol">US$</span><span class="andes-money-amount__fraction">95.000</span></div>
  <div class="ui-vpp-striped-specs"><table class="andes-table"><tbody>
  ${fila('Superficie total', '60 m²')}${fila('Superficie cubierta', '46 m²')}${fila('Ambientes', '2')}${fila('Dormitorios', '1')}
  ${fila('Baños', '1')}${fila('Disposición', 'Contrafrente')}${fila('Orientación', 'Oeste')}${fila('Antigüedad', '45 años')}
  ${fila('Expensas', '165.000 ARS')}
  </tbody></table></div></body></html>`

describe('extractMercadoLibre: tabla de características de la ficha actual', () => {
  const f = extractMercadoLibre(cheerio.load(ficha), 'https://departamento.mercadolibre.com.ar/MLA-2073595273-x').features

  it('lee superficies, ambientes, dormitorios y baños del <th>/<td>', () => {
    expect(f).toMatchObject({ totalArea: 60, coveredArea: 46, rooms: 2, bedrooms: 1, bathrooms: 1 })
  })

  it('lee disposición, orientación y antigüedad', () => {
    expect(f).toMatchObject({ disposal: 'Contrafrente', orientation: 'Oeste', age: 45 })
  })

  it('las expensas salen de su fila, nunca del precio de la segunda línea', () => {
    expect(f.expenses).toBe(165000)
  })
})
