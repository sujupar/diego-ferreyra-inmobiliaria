import { describe, it, expect } from 'vitest'
import { armarActividadDeFicha } from './actividad-de-ficha'
import type { Actividad } from './tipos'

const fila = (cambios: Partial<Actividad & { client_token: string | null }> = {}): Actividad & { client_token: string | null } => ({
  id: 'act-1',
  contact_id: 'c-1',
  deal_id: 'd-1',
  kind: 'note',
  call_outcome: null,
  body: 'Prefiere que la llamen a la tarde',
  occurred_at: '2026-11-26T12:00:00.000Z',
  callback_at: null,
  created_at: '2026-11-26T12:00:00.000Z',
  updated_at: null,
  created_by: 'asesor-1',
  voided_at: null,
  voided_by: null,
  automatic: false,
  client_token: '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e',
  ...cambios,
})

const asesor = { id: 'asesor-1', role: 'asesor' }
const coordinadora = { id: 'coord-1', role: 'coordinador' }

describe('armarActividadDeFicha', () => {
  it('una nota: título "Nota", sin intento, con su autor y lo que puede hacer quien mira', () => {
    const a = armarActividadDeFicha(fila(), { intento: null, autorNombre: 'Ana Asesora', tareaCreada: null, usuario: asesor })
    expect(a).toMatchObject({
      id: 'act-1',
      titulo: 'Nota',
      intento: null,
      autor: { id: 'asesor-1', nombre: 'Ana Asesora' },
      editada: false,
      tarea_creada: null,
      puede_editar: true,
      puede_anular: true,
    })
  })

  it('no devuelve el client_token: es un dato del guardado, no de la ficha', () => {
    const a = armarActividadDeFicha(fila(), { intento: null, autorNombre: 'Ana', tareaCreada: null, usuario: asesor })
    expect(a).not.toHaveProperty('client_token')
  })

  it('una llamada lleva el número de intento en el título corto', () => {
    const a = armarActividadDeFicha(
      fila({ kind: 'call', call_outcome: 'volver_a_llamar', body: null }),
      { intento: 3, autorNombre: 'Ana', tareaCreada: null, usuario: asesor },
    )
    expect(a.titulo).toBe('Llamada 3 · Volver a llamar')
    expect(a.intento).toBe(3)
    expect(a.puede_editar).toBe(false) // solo las notas se editan
  })

  it('la coordinadora no edita la nota de un asesor pero sí la anula', () => {
    const a = armarActividadDeFicha(fila(), { intento: null, autorNombre: 'Ana', tareaCreada: null, usuario: coordinadora })
    expect(a.puede_editar).toBe(false)
    expect(a.puede_anular).toBe(true)
  })

  it('autor borrado (created_by vacío) → autor null', () => {
    const a = armarActividadDeFicha(fila({ created_by: null }), { intento: null, autorNombre: null, tareaCreada: null, usuario: coordinadora })
    expect(a.autor).toBeNull()
  })

  it('autor sin perfil legible → nombre vacío, no se inventa uno', () => {
    const a = armarActividadDeFicha(fila(), { intento: null, autorNombre: null, tareaCreada: null, usuario: coordinadora })
    expect(a.autor).toEqual({ id: 'asesor-1', nombre: '' })
  })

  it('nota editada → editada verdadero', () => {
    const a = armarActividadDeFicha(fila({ updated_at: '2026-11-26T13:00:00.000Z' }), { intento: null, autorNombre: 'Ana', tareaCreada: null, usuario: asesor })
    expect(a.editada).toBe(true)
  })

  it('pasa la tarea que creó la actividad tal cual', () => {
    const tarea = { id: 't-1', title: 'Llamar a Ana', due_date: '2026-11-27', due_time: '09:00:00' }
    const a = armarActividadDeFicha(
      fila({ kind: 'call', call_outcome: 'no_atendio', body: null }),
      { intento: 1, autorNombre: 'Ana', tareaCreada: tarea, usuario: asesor },
    )
    expect(a.tarea_creada).toEqual(tarea)
  })
})
