import { describe, it, expect } from 'vitest'
import { matchLocalizacion } from './catalog'

/**
 * El matcher es lo único con lógica en la resolución de localización — el
 * resto son GETs cacheados. Los nombres vienen de la API real (probe en vivo
 * 2026-08-06): las provincias/partidos usan `Nombre`, los partidos llevan el
 * prefijo "Partido de ".
 */

const items = [
  { Id: 'PARTIDO_107', Nombre: 'Partido de Roque Pérez' },
  { Id: 'PARTIDO_1', Nombre: 'Partido de 25 de Mayo' },
  { Id: 'BARRIO_20', Nombre: 'Palermo' },
  { Id: 'BARRIO_21', Nombre: 'Palermo Chico' },
  { Id: 'PROVINCIA_1', Nombre: 'Buenos Aires' },
]

describe('matchLocalizacion', () => {
  it('matchea sin tildes ni mayúsculas y sin el prefijo "Partido de"', () => {
    expect(matchLocalizacion(items, 'roque perez')?.Id).toBe('PARTIDO_107')
    expect(matchLocalizacion(items, 'ROQUE PÉREZ')?.Id).toBe('PARTIDO_107')
  })

  it('prefiere el match exacto sobre el contenido ("Palermo" no se lo roba "Palermo Chico")', () => {
    expect(matchLocalizacion(items, 'Palermo')?.Id).toBe('BARRIO_20')
  })

  it('input más específico cae al contenido más largo ("Palermo Soho" → Palermo)', () => {
    expect(matchLocalizacion(items, 'Palermo Soho')?.Id).toBe('BARRIO_20')
  })

  it('provincia exacta', () => {
    expect(matchLocalizacion(items, 'buenos aires')?.Id).toBe('PROVINCIA_1')
  })

  it('sin match devuelve null, nunca un parecido dudoso', () => {
    expect(matchLocalizacion(items, 'Bariloche')).toBeNull()
    expect(matchLocalizacion(items, '')).toBeNull()
  })

  it('acepta items con Descripcion en vez de Nombre (catálogo de categorías)', () => {
    expect(matchLocalizacion([{ Id: 'X_1', Descripcion: 'Roque Pérez' }], 'roque perez')?.Id).toBe('X_1')
  })
})
