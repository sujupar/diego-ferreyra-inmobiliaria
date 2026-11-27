// crm-cartera-por-rol, tareas 6.2 y 6.4: la página del CRM como componente de servidor.
// Reemplaza las 23 pruebas de la pantalla vieja (`'use client'` con `/api/deals`): lo que
// protegían quedó acá, en la ruta (`app/api/crm/cartera/route.test.ts`), en `vistaPara` y
// `leerFiltrosCartera` (lib/crm) y en `components/crm/cartera/*.test.tsx`. La tabla vieja
// → nueva está en el PR (tarea 6.4).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

const m = vi.hoisted(() => ({
  usuario: null as null | { id: string; profile: { role: string; is_active: boolean } },
  cargar: vi.fn(),
  opciones: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({ getUser: async () => m.usuario }))
vi.mock('@/lib/supabase/cartera', () => ({ cargarCartera: m.cargar, leerOpcionesVerComo: m.opciones }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import CRMPage from './page'
import { CarteraCRM } from '@/components/crm/cartera/CarteraCRM'
import { SinAccesoLista } from '@/components/crm/cartera/SinAcceso'

const DUENO = '00000000-0000-4000-8000-000000000001'
const ASESOR = '00000000-0000-4000-8000-000000000004'
const OTRA = '00000000-0000-4000-8000-000000000005'

function datos(mirando = false) {
  return {
    vista: { tipo: mirando ? 'asesor' : 'dueno', persona: mirando ? { id: OTRA, nombre: 'Florencia Ledesma', rol: 'asesor' } : null, mirando },
    filas: [],
    asesores: [],
    opcionesVerComo: mirando ? null : [{ id: OTRA, etiqueta: 'Florencia Ledesma · asesor' }],
    fuentes: { ultimoContacto: 'ok', tareas: 'ok' },
    truncado: false,
    generadoEn: '2026-12-02T13:40:00.000Z',
  }
}

async function abrir(sp: Record<string, string> = {}): Promise<ReactElement<Record<string, unknown>>> {
  const el = await CRMPage({ searchParams: Promise.resolve(sp) })
  if (!isValidElement<Record<string, unknown>>(el)) throw new Error('la página no devolvió un elemento')
  return el
}

beforeEach(() => {
  m.usuario = { id: DUENO, profile: { role: 'dueno', is_active: true } }
  m.cargar.mockReset()
  m.opciones.mockReset()
  m.cargar.mockImplementation(async (p: { verComo: string | null }) => ({ ok: true, datos: datos(!!p.verComo) }))
  m.opciones.mockResolvedValue([{ id: OTRA, etiqueta: 'Florencia Ledesma · asesor' }])
})

describe('/crm — quién entra', () => {
  it('el abogado va a /properties/review sin leer nada', async () => {
    m.usuario = { id: 'x', profile: { role: 'abogado', is_active: true } }
    await expect(abrir()).rejects.toThrow('REDIRECT:/properties/review')
    expect(m.cargar).not.toHaveBeenCalled()
  })

  it('un rol sin vista ve "No tenés acceso al CRM" y ningún dato', async () => {
    m.usuario = { id: 'x', profile: { role: 'viewer', is_active: true } }
    m.cargar.mockResolvedValue({ ok: false, motivo: 'sin_vista' })
    const el = await abrir()
    expect(el.type).toBe(SinAccesoLista)
    expect(el.props.titulo).toBe('No tenés acceso al CRM')
  })

  it('un usuario desactivado tampoco recibe datos', async () => {
    m.usuario = { id: 'x', profile: { role: 'asesor', is_active: false } }
    const el = await abrir()
    expect(el.type).toBe(SinAccesoLista)
    expect(m.cargar).not.toHaveBeenCalled()
  })
})

describe('/crm — la vista la decide el servidor', () => {
  it('pasa a CarteraCRM solo datos planos: lo que armó el servicio, el rol y las opciones', async () => {
    const el = await abrir()
    expect(el.type).toBe(CarteraCRM)
    expect(m.cargar).toHaveBeenCalledWith({ quien: { id: DUENO, role: 'dueno' }, verComo: null }, expect.any(Date))
    expect(el.props.rol).toBe('dueno')
    expect(el.props.opcionesVerComo).toEqual([{ id: OTRA, etiqueta: 'Florencia Ledesma · asesor' }])
    for (const v of Object.values(el.props)) expect(typeof v).not.toBe('function')
    expect(JSON.parse(JSON.stringify(el.props.inicial))).toEqual(el.props.inicial)
  })

  it('un asesor con ?ver= de otra persona: se ignora, vista propia sin leer nada de la otra', async () => {
    m.usuario = { id: ASESOR, profile: { role: 'asesor', is_active: true } }
    const el = await abrir({ ver: OTRA })
    expect(m.cargar).toHaveBeenCalledTimes(1)
    expect(m.cargar).toHaveBeenCalledWith({ quien: { id: ASESOR, role: 'asesor' }, verComo: null }, expect.any(Date))
    expect(el.props.avisoInicial).toBeNull()
    expect(el.props.opcionesVerComo).toBeNull()
    expect(m.opciones).not.toHaveBeenCalled()
  })

  it('un asesor con ?asesor=<otro>: el servicio no recibe ese parámetro (ninguno ensancha la vista)', async () => {
    m.usuario = { id: ASESOR, profile: { role: 'asesor', is_active: true } }
    await abrir({ asesor: OTRA, assigned_to: OTRA })
    expect(m.cargar).toHaveBeenCalledWith({ quien: { id: ASESOR, role: 'asesor' }, verComo: null }, expect.any(Date))
  })

  it('el dueño con un "ver" inválido: su propia vista con "Esa persona no tiene una vista del CRM."', async () => {
    m.cargar.mockImplementation(async (p: { verComo: string | null }) =>
      p.verComo ? { ok: false, motivo: 'persona_invalida' } : { ok: true, datos: datos(false) },
    )
    const el = await abrir({ ver: 'no-es-un-uuid' })
    expect(m.cargar).toHaveBeenLastCalledWith({ quien: { id: DUENO, role: 'dueno' }, verComo: null }, expect.any(Date))
    expect(el.props.avisoInicial).toBe('Esa persona no tiene una vista del CRM.')
    expect((el.props.inicial as { vista: { mirando: boolean } }).vista.mirando).toBe(false)
  })

  it('el dueño que recarga mirando a otra persona: datos de esa persona y las opciones de su vista propia', async () => {
    const el = await abrir({ ver: OTRA })
    expect(m.cargar).toHaveBeenCalledWith({ quien: { id: DUENO, role: 'dueno' }, verComo: OTRA }, expect.any(Date))
    expect((el.props.inicial as { vista: { mirando: boolean } }).vista.mirando).toBe(true)
    expect(m.opciones).toHaveBeenCalledTimes(1)
    expect(el.props.opcionesVerComo).toEqual([{ id: OTRA, etiqueta: 'Florencia Ledesma · asesor' }])
  })

  it('si la lectura falla, la pantalla recibe null (muestra el error con "Reintentar")', async () => {
    m.cargar.mockRejectedValue(new Error('base caída'))
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = await abrir()
    expect(el.type).toBe(CarteraCRM)
    expect(el.props.inicial).toBeNull()
    errorConsola.mockRestore()
  })
})

describe('/crm — marcadores de la pantalla vieja', () => {
  it('origin/from/to se traducen con un redirect antes de leer nada', async () => {
    await expect(abrir({ origin: 'referido', from: '2026-11-01', to: '2026-11-25' })).rejects.toThrow(
      'REDIRECT:/crm?origen=referido&desde=2026-11-01&hasta=2026-11-25&entro=rango',
    )
    expect(m.cargar).not.toHaveBeenCalled()
  })

  it('una etapa cerrada sin segmento suma seg=cerrados; la dirección nueva no se redirige', async () => {
    await expect(abrir({ etapa: 'descartado' })).rejects.toThrow('REDIRECT:/crm?etapa=descartado&seg=cerrados')
    const el = await abrir({ etapa: 'seguimiento', asesor: OTRA })
    expect(el.type).toBe(CarteraCRM)
  })
})
