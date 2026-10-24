/**
 * El listado `/informes` (para Paula): todos los informes, con los por completar primero. Puro.
 * Quién ve qué es el MISMO criterio de la pestaña de la ficha (`acceso.ts`): operaciones todos, el asesor los de
 * sus propiedades, el abogado ninguno.
 */
export type AlcanceListado = 'todos' | 'propias' | 'ninguno'

export function alcanceDelListado(rol: string): AlcanceListado {
  if (rol === 'admin' || rol === 'dueno' || rol === 'coordinador') return 'todos'
  if (rol === 'asesor') return 'propias'
  return 'ninguno'
}

export interface FilaListado {
  id: string
  propertyId: string
  direccion: string
  desde: string
  hasta: string
  origen: 'ciclo' | 'manual'
  estado: 'borrador' | 'listo'
  /** Cuántas cosas faltan para poder marcarlo listo (0 en uno listo). */
  faltantes: number
  listoAt: string | null
}

export function ordenarFilas(filas: FilaListado[]): FilaListado[] {
  return [...filas].sort((a, b) =>
    (a.estado === b.estado ? 0 : a.estado === 'borrador' ? -1 : 1)
    || b.hasta.localeCompare(a.hasta)
    || a.direccion.localeCompare(b.direccion, 'es'))
}
