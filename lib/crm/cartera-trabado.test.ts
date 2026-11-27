// crm-cartera-por-rol, tarea 3.7: "Lo que está trabado" del dueño (design.md D5).
import { describe, it, expect } from 'vitest'
import { calcularTrabado, diasSinMovimiento, textoEspera } from './cartera-trabado'
import type { FilaCartera } from './cartera'
import type { EtapaCRM } from './etapas'

// 2026-12-20 (domingo) 15:00 UTC = 12:00 AR: más de 14 días después del inicio del registro.
const AHORA = new Date('2026-12-20T15:00:00Z')
const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString()
const contacto = (at: string) => ({ at, que: 'llamada' as const, resultado: null })

let n = 0
function fila(p: Partial<FilaCartera> = {}): FilaCartera {
  n += 1
  const etapa: EtapaCRM = p.etapa ?? 'solicitud'
  return {
    id: p.id ?? `d-${n}`,
    contactoId: `c-${n}`,
    nombre: `Persona ${n}`,
    telefono: null,
    email: null,
    propiedad: '',
    direccion: '',
    etapa,
    abierto: !['captada', 'descartado'].includes(etapa),
    origen: 'embudo',
    asesor: { id: 'asesor-1', nombre: 'Tomás Agüero', activo: true },
    creadoEn: ar('2026-12-10', '10:00'),
    cerradoEn: null,
    colega: false,
    anteriorAlRegistro: false,
    ultimoContacto: contacto(ar('2026-12-19', '12:00')),
    proximo: null,
    tasacion: null,
    ...p,
  }
}

describe('calcularTrabado — sin primer contacto', () => {
  it('cuenta solicitudes desde el registro sin contacto, con la base de solicitudes abiertas desde el registro', () => {
    const t = calcularTrabado(
      [
        fila({ id: 'a', ultimoContacto: null, creadoEn: ar('2026-12-18', '10:00') }),
        fila({ id: 'b', ultimoContacto: null, creadoEn: ar('2026-12-15', '10:00') }),
        fila({ id: 'c' }), // con contacto
        fila({ id: 'vieja', ultimoContacto: null, anteriorAlRegistro: true, creadoEn: '2025-09-12T13:00:00Z' }),
        fila({ id: 'vieja-con', anteriorAlRegistro: true, creadoEn: '2025-10-12T13:00:00Z' }),
      ],
      AHORA,
    )
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinContacto.filas.map((f) => f.id)).toEqual(['b', 'a']) // la espera más larga primero
    expect(t.sinContacto.base).toBe(3)
    expect(t.sinContacto.anterioresAlRegistro).toBe(1)
  })
  it('las anteriores al registro cuentan aparte y solo las que no tienen contacto', () => {
    const t = calcularTrabado([fila({ ultimoContacto: null, anteriorAlRegistro: true }), fila({ anteriorAlRegistro: true })], AHORA)
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinContacto).toMatchObject({ base: 0, anterioresAlRegistro: 1 })
    expect(t.sinContacto.filas).toEqual([])
  })
})

describe('calcularTrabado — sin asesor', () => {
  it('base = abiertos en Coordinada, No realizada, Realizada, Entregada y Seguimiento', () => {
    const t = calcularTrabado(
      [
        fila({ etapa: 'coordinada' }),
        fila({ etapa: 'seguimiento', asesor: null }),
        fila({ etapa: 'solicitud', asesor: null }), // no cuenta ni en la base
        fila({ etapa: 'comprador', asesor: null }),
        fila({ etapa: 'descartado', asesor: null }),
      ],
      AHORA,
    )
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinAsesor.base).toBe(2)
    expect(t.sinAsesor.filas).toHaveLength(1)
  })
  it('orden: la etapa más avanzada primero y, dentro, el más viejo', () => {
    const t = calcularTrabado(
      [
        fila({ id: 'coord', etapa: 'coordinada', asesor: null, creadoEn: ar('2026-01-01', '10:00') }),
        fila({ id: 'seg-nuevo', etapa: 'seguimiento', asesor: null, creadoEn: ar('2026-11-01', '10:00') }),
        fila({ id: 'seg-viejo', etapa: 'seguimiento', asesor: null, creadoEn: ar('2026-05-01', '10:00') }),
        fila({ id: 'real', etapa: 'realizada', asesor: null, creadoEn: ar('2025-05-01', '10:00') }),
      ],
      AHORA,
    )
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinAsesor.filas.map((f) => f.id)).toEqual(['seg-viejo', 'seg-nuevo', 'real', 'coord'])
  })
  it('los históricos sin asesor del sistema anterior cuentan (respuesta 4 del dueño)', () => {
    const t = calcularTrabado([fila({ etapa: 'realizada', asesor: null, origen: 'historico', anteriorAlRegistro: true })], AHORA)
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinAsesor.filas).toHaveLength(1)
  })
  it('un asesor dado de baja cuenta como sin asesor', () => {
    const t = calcularTrabado([fila({ etapa: 'entregada', asesor: { id: 'x', nombre: 'Martín', activo: false } })], AHORA)
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinAsesor.filas).toHaveLength(1)
  })
})

describe('calcularTrabado — seguimientos sin movimiento', () => {
  it('base = seguimientos abiertos; de más a menos días', () => {
    const t = calcularTrabado(
      [
        fila({ id: '22', etapa: 'seguimiento', ultimoContacto: contacto(ar('2026-11-28', '12:00')) }),
        fila({ id: '30', etapa: 'seguimiento', ultimoContacto: contacto(ar('2026-11-20', '12:00')) }),
        fila({ id: 'fresco', etapa: 'seguimiento' }),
        fila({ id: 'sin', etapa: 'seguimiento', ultimoContacto: null }), // cuenta desde el inicio del registro
      ],
      AHORA,
    )
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinMovimiento.base).toBe(4)
    expect(t.sinMovimiento.filas.map((f) => f.id)).toEqual(['30', 'sin', '22']) // 'sin' lleva 24 días desde el inicio del registro
  })
  it('diasSinMovimiento: 22 días desde el último contacto', () => {
    expect(diasSinMovimiento(fila({ etapa: 'seguimiento', ultimoContacto: contacto(ar('2026-11-28', '12:00')) }), AHORA)).toBe(22)
  })
  it('diasSinMovimiento: sin contacto, desde el inicio del registro', () => {
    expect(diasSinMovimiento(fila({ etapa: 'seguimiento', ultimoContacto: null }), AHORA)).toBe(24)
  })
  it('diasSinMovimiento: una visita de hace meses cuenta desde el inicio del registro', () => {
    expect(diasSinMovimiento(fila({ etapa: 'seguimiento', ultimoContacto: { at: '2026-07-01T12:00:00Z', que: 'visita', resultado: null } }), AHORA)).toBe(24)
  })
  it('diasSinMovimiento: con el dato en error → null', () => {
    expect(diasSinMovimiento(fila({ ultimoContacto: 'error' }), AHORA)).toBeNull()
  })
})

describe('calcularTrabado — lo general', () => {
  it('sin colegas: un colega no cuenta ni en la base', () => {
    const t = calcularTrabado([fila({ ultimoContacto: null, colega: true }), fila({ etapa: 'seguimiento', asesor: null, colega: true })], AHORA)
    if (t === 'error') throw new Error('no debería fallar')
    expect(t.sinContacto).toMatchObject({ base: 0, filas: [] })
    expect(t.sinAsesor).toMatchObject({ base: 0, filas: [] })
  })
  it('solo abiertos: un cerrado no cuenta', () => {
    const t = calcularTrabado([fila({ etapa: 'descartado', ultimoContacto: null })], AHORA)
    if (t === 'error') throw new Error('no debería fallar')
    expect([t.sinContacto.base, t.sinAsesor.base, t.sinMovimiento.base]).toEqual([0, 0, 0])
  })
  it('cero en todas sin filas', () => {
    expect(calcularTrabado([], AHORA)).toEqual({
      sinContacto: { filas: [], base: 0, anterioresAlRegistro: 0 },
      sinAsesor: { filas: [], base: 0 },
      sinMovimiento: { filas: [], base: 0 },
    })
  })
  it('si alguna fila trae el último contacto en error → "error" (no se cuenta lo que no se sabe)', () => {
    expect(calcularTrabado([fila(), fila({ ultimoContacto: 'error' })], AHORA)).toBe('error')
  })
  it('un colega con el dato en error no hace fallar el bloque (no se cuenta)', () => {
    expect(calcularTrabado([fila({ ultimoContacto: 'error', colega: true })], AHORA)).not.toBe('error')
  })
})

describe('textoEspera', () => {
  it('16 h 20 min de reloj, 1 h 40 min hábiles (entró martes 16:20, ahora miércoles 8:40)', () => {
    expect(textoEspera(ar('2026-11-24', '16:20'), new Date(ar('2026-11-25', '08:40')))).toBe(
      'Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles',
    )
  })
  it('sin diferencia (esperó solo en horario): "Espera hace 28 min"', () => {
    expect(textoEspera(ar('2026-11-25', '10:12'), new Date(ar('2026-11-25', '10:40')))).toBe('Espera hace 28 min')
  })
  it('un fin de semana entero: 0 min hábiles', () => {
    expect(textoEspera(ar('2026-11-28', '10:00'), new Date(ar('2026-11-29', '10:00')))).toBe('Espera hace 1 día de reloj · 0 min hábiles')
  })
  it('una fecha futura (relojes) o ilegible no rompe', () => {
    expect(textoEspera(ar('2026-11-25', '11:00'), new Date(ar('2026-11-25', '10:40')))).toBe('Espera hace 0 min')
    expect(textoEspera('no-es-fecha', AHORA)).toBe('')
  })
})
