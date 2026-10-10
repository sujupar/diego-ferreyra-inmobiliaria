import { describe, it, expect } from 'vitest'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas, puedeVerVisita, asesorParaLaVisita } from './acceso'

const YO = '11111111-1111-4111-8111-111111111111'
const OTRO = '22222222-2222-4222-8222-222222222222'

describe('permisos de visitas', () => {
  it('gestionan admin, dueño, coordinador y asesor; el abogado no', () => {
    expect(['admin', 'dueno', 'coordinador', 'asesor'].every(r => puedeGestionarVisitas(r as never))).toBe(true)
    expect(puedeGestionarVisitas('abogado')).toBe(false)
  })
  it('un rol desconocido cae del lado seguro', () => {
    expect(puedeGestionarVisitas('inventado' as never)).toBe(false)
    expect(puedeVerTodasLasVisitas('inventado' as never)).toBe(false)
  })
  it('el asesor ve solo las suyas (asignadas o creadas por él)', () => {
    expect(puedeVerVisita('asesor', YO, { advisor_id: YO, created_by: OTRO })).toBe(true)
    expect(puedeVerVisita('asesor', YO, { advisor_id: OTRO, created_by: YO })).toBe(true)
    expect(puedeVerVisita('asesor', YO, { advisor_id: OTRO, created_by: OTRO })).toBe(false)
    expect(puedeVerVisita('coordinador', YO, { advisor_id: OTRO, created_by: OTRO })).toBe(true)
    expect(puedeVerVisita('abogado', YO, { advisor_id: YO, created_by: YO })).toBe(false)
  })
})

describe('asesorParaLaVisita', () => {
  it('un asesor queda SIEMPRE a su nombre, pida lo que pida', () => {
    expect(asesorParaLaVisita('asesor', YO, OTRO)).toEqual({ ok: true, asesorId: YO, esPropio: true })
    expect(asesorParaLaVisita('asesor', YO, null)).toEqual({ ok: true, asesorId: YO, esPropio: true })
  })
  it('quien ve todo tiene que elegir el asesor', () => {
    expect(asesorParaLaVisita('coordinador', YO, OTRO)).toEqual({ ok: true, asesorId: OTRO, esPropio: false })
    expect(asesorParaLaVisita('admin', YO, ' ')).toEqual({ ok: false, error: 'Elegí el asesor que va a mostrar la propiedad' })
  })
})
