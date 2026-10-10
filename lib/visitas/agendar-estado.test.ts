import { describe, it, expect } from 'vitest'
import { estadoInicial, reducirAgendar, pasosVisibles, errorDelPaso, siguientePaso, pasoAnterior, armarPedido, type PropiedadElegida } from './agendar-estado'

const PROP: PropiedadElegida = { id: '33333333-3333-4333-8333-333333333333', address: 'Doblas 248', neighborhood: 'Caballito', foto: null, asesorId: '22222222-2222-4222-8222-222222222222' }
const AHORA = new Date('2026-10-10T15:00:00Z')

describe('pasos de la ventana', () => {
  it('desde la ficha se saltea "Propiedad"; un asesor no ve "Asesor"', () => {
    const e = estadoInicial({ propiedad: PROP })
    expect(pasosVisibles(e, { puedeElegirAsesor: false })).toEqual(['origen', 'persona', 'cuando', 'confirmar'])
    expect(pasosVisibles(estadoInicial({}), { puedeElegirAsesor: true }))
      .toEqual(['propiedad', 'origen', 'persona', 'cuando', 'asesor', 'confirmar'])
  })
  it('empieza en el primer paso visible y avanza/retrocede en orden', () => {
    const e = estadoInicial({ propiedad: PROP })
    expect(e.paso).toBe('origen')
    expect(siguientePaso(e, { puedeElegirAsesor: false })).toBe('persona')
    expect(pasoAnterior({ ...e, paso: 'persona' }, { puedeElegirAsesor: false })).toBe('origen')
    expect(pasoAnterior(e, { puedeElegirAsesor: false })).toBeNull()
  })
})

describe('reglas al elegir', () => {
  it('reiniciar reemplaza TODO el estado (al abrir la ventana desde la ficha)', () => {
    const sucio = reducirAgendar(estadoInicial({}), { tipo: 'notas', texto: 'viejo' })
    const nuevo = estadoInicial({ propiedad: PROP })
    expect(reducirAgendar(sucio, { tipo: 'reiniciar', estado: nuevo })).toEqual(nuevo)
    expect(nuevo.propiedadFija).toBe(true)
  })
  it('elegir propiedad trae su asesor y borra la persona elegida', () => {
    let e = estadoInicial({})
    e = reducirAgendar(e, { tipo: 'elegirPersona', persona: { tipo: 'nueva', nombre: 'A', telefono: '1', email: '' } })
    e = reducirAgendar(e, { tipo: 'elegirPropiedad', propiedad: PROP })
    expect(e.asesorId).toBe(PROP.asesorId)
    expect(e.persona).toBeNull()
  })
  it('cambiar de origen borra la persona (otra lista)', () => {
    let e = reducirAgendar(estadoInicial({ propiedad: PROP }), { tipo: 'elegirOrigen', origen: 'portal' })
    e = reducirAgendar(e, { tipo: 'elegirPersona', persona: { tipo: 'consulta', id: 'c1', nombre: 'Ana', telefono: null, detalle: 'Zonaprop' } })
    e = reducirAgendar(e, { tipo: 'elegirOrigen', origen: 'cartel' })
    expect(e.persona).toBeNull()
  })
})

describe('errorDelPaso', () => {
  const e = estadoInicial({ propiedad: PROP })
  it('origen obligatorio, y "otro" con texto', () => {
    expect(errorDelPaso(e, 'origen')).toBe('Elegí de dónde viene la visita')
    expect(errorDelPaso({ ...e, origen: 'otro', origenDetalle: '' }, 'origen')).toBe('Escribí de dónde vino la visita')
  })
  it('persona de la lista sin teléfono exige completarlo', () => {
    const conPersona = { ...e, origen: 'portal' as const, persona: { tipo: 'consulta' as const, id: 'c', nombre: 'A', telefono: null, detalle: 'ML' } }
    expect(errorDelPaso(conPersona, 'persona')).toBe('Falta el teléfono de la persona')
    expect(errorDelPaso({ ...conPersona, telefonoFaltante: '11 5823 4521' }, 'persona')).toBeNull()
  })
  it('persona de la lista con teléfono guardado de menos de 10 dígitos también exige completarlo', () => {
    const conPersona = { ...e, origen: 'portal' as const, persona: { tipo: 'consulta' as const, id: 'c', nombre: 'A', telefono: '123', detalle: 'ML' } }
    expect(errorDelPaso(conPersona, 'persona')).toBe('Falta el teléfono de la persona')
  })
  it('persona nueva usa la validación de persona', () => {
    expect(errorDelPaso({ ...e, origen: 'cartel', persona: { tipo: 'nueva', nombre: 'S', telefono: '11', email: '' } }, 'persona'))
      .toBe('Escribí el nombre de la persona')
  })
  it('día y hora válidos y en rango', () => {
    expect(errorDelPaso(e, 'cuando', AHORA)).toBe('Elegí el día y la hora')
    expect(errorDelPaso({ ...e, fecha: '2026-02-31', hora: '10:00' }, 'cuando', AHORA)).toBe('Elegí un día y una hora válidos')
    expect(errorDelPaso({ ...e, fecha: '2026-10-12', hora: '11:00' }, 'cuando', AHORA)).toBeNull()
  })
})

describe('armarPedido', () => {
  it('arma exactamente el cuerpo que espera POST /api/visits', () => {
    const e = {
      ...estadoInicial({ propiedad: PROP }), origen: 'portal' as const,
      persona: { tipo: 'consulta' as const, id: '44444444-4444-4444-8444-444444444444', nombre: 'Ana', telefono: null, detalle: 'ML' },
      telefonoFaltante: '1158234521', fecha: '2026-10-12', hora: '11:00', confirmada: true, notas: ' trae a su hija ',
    }
    expect(armarPedido(e)).toEqual({
      propiedadId: PROP.id, origen: 'portal', origenDetalle: null,
      persona: { tipo: 'consulta', id: '44444444-4444-4444-8444-444444444444', telefono: '1158234521' },
      fecha: '2026-10-12', hora: '11:00', asesorId: PROP.asesorId, confirmada: true, notas: 'trae a su hija',
    })
  })
})
