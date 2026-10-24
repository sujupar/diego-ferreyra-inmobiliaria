import { describe, expect, it } from 'vitest'
import { alcanceDelListado, ordenarFilas, type FilaListado } from './listado'

describe('alcanceDelListado (el mismo criterio que la pestaña de la ficha)', () => {
  it('operaciones ven todos', () => {
    for (const r of ['admin', 'dueno', 'coordinador']) expect(alcanceDelListado(r)).toBe('todos')
  })
  it('el asesor ve los de sus propiedades', () => {
    expect(alcanceDelListado('asesor')).toBe('propias')
  })
  it('el abogado y un rol desconocido no ven nada (falla cerrado)', () => {
    expect(alcanceDelListado('abogado')).toBe('ninguno')
    expect(alcanceDelListado('otro')).toBe('ninguno')
  })
})

const fila = (id: string, estado: FilaListado['estado'], hasta: string, faltantes: number, direccion = id): FilaListado =>
  ({ id, propertyId: `p-${id}`, direccion, desde: '2026-10-01', hasta, origen: 'ciclo', estado, faltantes, listoAt: null })

describe('ordenarFilas', () => {
  it('primero los por completar, del período más nuevo al más viejo, y dentro por dirección', () => {
    const r = ordenarFilas([
      fila('a', 'listo', '2026-10-31', 0, 'Zapiola'),
      fila('b', 'borrador', '2026-10-15', 2, 'Bulnes'),
      fila('c', 'borrador', '2026-10-31', 1, 'Moldes'),
      fila('d', 'borrador', '2026-10-31', 4, 'Agüero'),
    ])
    expect(r.map(x => x.id)).toEqual(['d', 'c', 'b', 'a'])
  })
})
