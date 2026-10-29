import { describe, it, expect } from 'vitest'
import { leerFiltrosConsultas, FILTROS_DEFECTO_CONSULTAS, PERIODOS_CONSULTAS } from './filtros'

const HOY = '2026-10-29'
const UUID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'

function leer(qs: string) {
  const r = leerFiltrosConsultas(new URLSearchParams(qs), HOY)
  if (!r.ok) throw new Error(`esperaba ok: ${r.error}`)
  return r.valor
}

describe('leerFiltrosConsultas', () => {
  it('sin período toma los últimos 7 días (no los 30 de visitas)', () => {
    const f = leer('')
    expect(f.desde).toBe('2026-10-23')
    expect(f.hasta).toBe(HOY)
    expect(FILTROS_DEFECTO_CONSULTAS.periodo).toBe('7d')
  })

  it('un período desconocido cae en 7 días, sin error', () => {
    expect(leer('periodo=cualquiera').desde).toBe('2026-10-23')
  })

  it('"personalizado" sin fechas también cae en 7 días', () => {
    expect(leer('periodo=personalizado').desde).toBe('2026-10-23')
  })

  it('hoy: desde y hasta son el mismo día', () => {
    const f = leer('periodo=hoy')
    expect(f).toMatchObject({ desde: HOY, hasta: HOY, etiqueta: 'Hoy' })
    expect(PERIODOS_CONSULTAS).toContain('hoy')
  })

  it('30d y mes los resuelve el período de visitas', () => {
    expect(leer('periodo=30d').desde).toBe('2026-09-30')
    expect(leer('periodo=mes')).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' })
  })

  it('from y to arman un período personalizado', () => {
    expect(leer('from=2026-10-01&to=2026-10-10')).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-10' })
  })

  it('un rango inválido devuelve el error de visitas', () => {
    const r = leerFiltrosConsultas(new URLSearchParams('from=2026-10-10&to=2026-10-01'), HOY)
    expect(r.ok).toBe(false)
  })

  it('propiedad acepta "sin"', () => {
    expect(leer('propiedad=sin').propiedad).toBe('sin')
  })

  it('propiedad que no es uuid → null', () => {
    expect(leer('propiedad=xx').propiedad).toBeNull()
  })

  it('propiedad uuid se conserva', () => {
    expect(leer(`propiedad=${UUID}`).propiedad).toBe(UUID)
  })

  it('asesor acepta uuid o "sin"; otro valor → null', () => {
    expect(leer(`asesor=${UUID}`).asesor).toBe(UUID)
    expect(leer('asesor=sin').asesor).toBe('sin')
    expect(leer('asesor=juan').asesor).toBeNull()
  })

  it('portal y estado solo aceptan los valores del catálogo', () => {
    expect(leer('portal=zonaprop&estado=visito')).toMatchObject({ portal: 'zonaprop', estado: 'visito' })
    expect(leer('portal=facebook&estado=raro')).toMatchObject({ portal: null, estado: null })
  })

  it('telefono=revisar prende el filtro de teléfonos a revisar', () => {
    expect(leer('telefono=revisar').telefonoRevisar).toBe(true)
    expect(leer('').telefonoRevisar).toBe(false)
  })

  it('q se normaliza (NFD → NFC, espacios)', () => {
    const nfd = 'Autónoma'
    expect(leer(`q=${encodeURIComponent(`  ${nfd}   centro `)}`).q).toBe('Autónoma centro')
  })

  it('pagina es entera y al menos 1', () => {
    expect(leer('').pagina).toBe(1)
    expect(leer('pagina=3').pagina).toBe(3)
    expect(leer('pagina=0').pagina).toBe(1)
    expect(leer('pagina=-2').pagina).toBe(1)
    expect(leer('pagina=2.5').pagina).toBe(1)
    expect(leer('pagina=abc').pagina).toBe(1)
  })
})
