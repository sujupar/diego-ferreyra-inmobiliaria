import { describe, it, expect } from 'vitest'
import { resolvePropertiesListSort, SORTABLE_PROPERTY_LIST_COLUMNS } from './properties'

// Hallazgo #7 (revisión adversarial 2026-07-31): la vista tabla de propiedades
// ordenaba en memoria SOLO la página cargada. El fix mueve el orden al
// servidor; esta función resuelve qué columna/dirección le llega a Postgres,
// y nunca debe dejar pasar un nombre de columna arbitrario.
describe('resolvePropertiesListSort', () => {
  it('sin sort, cae al default created_at desc', () => {
    expect(resolvePropertiesListSort(undefined)).toEqual({ column: 'created_at', ascending: false })
    expect(resolvePropertiesListSort(null)).toEqual({ column: 'created_at', ascending: false })
  })

  it('acepta cualquier columna del whitelist', () => {
    for (const key of SORTABLE_PROPERTY_LIST_COLUMNS) {
      expect(resolvePropertiesListSort({ key, dir: 'asc' })).toEqual({ column: key, ascending: true })
      expect(resolvePropertiesListSort({ key, dir: 'desc' })).toEqual({ column: key, ascending: false })
    }
  })

  it('una key fuera del whitelist cae al default (nunca pasa un nombre arbitrario a .order())', () => {
    expect(resolvePropertiesListSort({ key: 'photos', dir: 'asc' })).toEqual({ column: 'created_at', ascending: false })
    expect(resolvePropertiesListSort({ key: "id; drop table properties;--", dir: 'asc' })).toEqual({
      column: 'created_at',
      ascending: false,
    })
  })

  it('dir inválido/ausente con key válida se toma como descendente', () => {
    // @ts-expect-error - probando un dir fuera del tipo
    expect(resolvePropertiesListSort({ key: 'asking_price', dir: 'sideways' })).toEqual({
      column: 'asking_price',
      ascending: false,
    })
  })
})
