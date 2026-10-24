import { describe, expect, it, vi } from 'vitest'
import { correrCiclo, type DependenciasCiclo, type InformeDelPeriodo } from './ciclo-servicio'
import { FUENTES } from './tipos'

const props = [
  { id: 'p1', titulo: 'Casa', direccion: 'Roque Pérez 3059', status: 'approved', commercialStatus: 'disponible', capturadaEl: '2026-05-01' },
  { id: 'p2', titulo: 'Depto', direccion: 'Entre Ríos 2333', status: 'approved', commercialStatus: 'reservada', capturadaEl: '2026-10-20' },
  { id: 'p3', titulo: '[TEST] Depto', direccion: 'Diaz Velez 3841', status: 'approved', commercialStatus: 'disponible', capturadaEl: null },
  { id: 'p4', titulo: 'Vendida', direccion: 'Moldes 2112', status: 'approved', commercialStatus: 'vendida', capturadaEl: null },
]

function deps(informes: InformeDelPeriodo[] = [], extra: Partial<DependenciasCiclo> = {}): DependenciasCiclo & { informes: InformeDelPeriodo[] } {
  const base: DependenciasCiclo & { informes: InformeDelPeriodo[] } = {
    informes,
    propiedades: vi.fn(async () => props),
    informesDelPeriodo: vi.fn(async () => base.informes),
    crear: vi.fn(async (propertyId: string, desde: string) => {
      base.informes.push({ id: `i-${propertyId}`, propertyId, desde, origen: 'ciclo', estado: 'borrador', creadoEn: '2026-11-01T09:00:00Z', avisadoEn: null, pendientes: [...FUENTES] })
    }),
    refrescar: vi.fn(async (informeId: string, fuente) => {
      const i = base.informes.find(x => x.id === informeId)
      if (i) i.pendientes = i.pendientes.filter(f => f !== fuente)
    }),
    reclamar: vi.fn(async (ids: string[]) => ids),
    crearTarea: vi.fn(async () => {}),
    avisar: vi.fn(async () => ({ ok: true, detalle: 'enviado a 1' })),
    reloj: () => 0,
    ...extra,
  }
  return base
}

describe('correrCiclo', () => {
  it('fuera del 1, 2, 16 y 17 no hace nada y lo dice', async () => {
    const d = deps()
    const r = await correrCiclo(d, new Date('2026-11-05T12:00:00Z'))
    expect(r.motivo).toBe('fuera_de_fecha')
    expect(d.propiedades).not.toHaveBeenCalled()
  })

  it('crea el borrador de cada propiedad del ciclo (sin [TEST] ni vendidas), recortado a la captación', async () => {
    const d = deps()
    await correrCiclo(d, new Date('2026-11-01T12:00:00Z'))
    expect(d.crear).toHaveBeenCalledWith('p1', '2026-10-16', '2026-10-31')
    expect(d.crear).toHaveBeenCalledWith('p2', '2026-10-20', '2026-10-31')
    expect(d.crear).toHaveBeenCalledTimes(2)
  })

  it('no vuelve a crear el informe de una propiedad que ya tiene uno del período (de ciclo o manual)', async () => {
    const d = deps([{ id: 'm', propertyId: 'p1', desde: '2026-10-16', origen: 'manual', estado: 'borrador', creadoEn: 'x', avisadoEn: null, pendientes: [] }])
    await correrCiclo(d, new Date('2026-11-01T12:00:00Z'))
    expect(d.crear).toHaveBeenCalledTimes(1)
    expect(d.crear).toHaveBeenCalledWith('p2', '2026-10-20', '2026-10-31')
  })

  it('trae fuentes hasta agotar el presupuesto y deja el resto para la corrida siguiente', async () => {
    let t = 0
    const d = deps([], { reloj: () => t, refrescar: vi.fn(async () => { t += 3_000 }) })
    const r = await correrCiclo(d, new Date('2026-11-01T12:00:00Z'))
    // Presupuesto 8 s: arranca una fuente con 0, 3 y 6 s gastados; con 9 s ya no arranca otra.
    expect(r.fuentes).toBe(3)
    expect(d.avisar).not.toHaveBeenCalled()
  })

  it('una fuente que lanza no corta la corrida: se cuenta y sigue con la próxima', async () => {
    let n = 0
    const d = deps([], {})
    const original = d.refrescar
    d.refrescar = vi.fn(async (id, f) => { n++; if (n === 1) throw new Error('boom'); return original(id, f) })
    const r = await correrCiclo(d, new Date('2026-11-01T12:00:00Z'))
    expect(r.errores).toEqual([expect.stringContaining('boom')])
    expect(r.fuentes).toBeGreaterThan(1)
  })

  it('con la tanda completa: tarea por propiedad y UN email con todas', async () => {
    const d = deps()
    const r = await correrCiclo(d, new Date('2026-11-01T12:00:00Z'))
    expect(r.avisados).toBe(2)
    expect(d.crearTarea).toHaveBeenCalledTimes(2)
    expect(d.crearTarea).toHaveBeenCalledWith({ propertyId: 'p1', direccion: 'Roque Pérez 3059', informeId: 'i-p1' })
    expect(d.avisar).toHaveBeenCalledTimes(1)
    expect(d.avisar).toHaveBeenCalledWith('del 16 al 31 de octubre de 2026', [
      { id: 'i-p1', direccion: 'Roque Pérez 3059' }, { id: 'i-p2', direccion: 'Entre Ríos 2333' },
    ])
  })

  it('solo avisa lo que esta corrida reclamó (otra corrida a la vez no duplica el email)', async () => {
    const d = deps([], { reclamar: vi.fn(async () => []) })
    const r = await correrCiclo(d, new Date('2026-11-01T12:00:00Z'))
    expect(r.avisados).toBe(0)
    expect(d.crearTarea).not.toHaveBeenCalled()
    expect(d.avisar).not.toHaveBeenCalled()
  })

  it('un email que falla queda en el resultado (las tareas ya están creadas)', async () => {
    const d = deps([], { avisar: vi.fn(async () => ({ ok: false, detalle: 'Resend caído' })) })
    const r = await correrCiclo(d, new Date('2026-11-01T12:00:00Z'))
    expect(d.crearTarea).toHaveBeenCalledTimes(2)
    expect(r.email).toEqual({ ok: false, detalle: 'Resend caído' })
  })

  it('con propiedades elegidas (prueba) usa solo esas, aunque sean [TEST]', async () => {
    const d = deps()
    await correrCiclo(d, new Date('2026-11-01T12:00:00Z'), { propiedades: ['p3'] })
    expect(d.crear).toHaveBeenCalledTimes(1)
    expect(d.crear).toHaveBeenCalledWith('p3', '2026-10-16', '2026-10-31')
  })
})
