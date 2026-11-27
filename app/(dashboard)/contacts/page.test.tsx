// crm-cartera-por-rol, tarea 6.5: la página de Contactos como componente de servidor.
// Reemplaza las 13 pruebas de la pantalla vieja (`'use client'` con `/api/contacts` y
// `/api/auth/me`). La identidad que fallaba cerrada ahora la decide el servidor (acá y en
// `app/api/crm/contactos/route.test.ts`); el resto quedó en
// `components/crm/cartera/ContactosLista.test.tsx`. Tabla vieja → nueva en el PR.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

const m = vi.hoisted(() => ({
  usuario: null as null | { id: string; profile: { role: string; is_active: boolean } },
  cargar: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({ getUser: async () => m.usuario }))
vi.mock('@/lib/supabase/cartera', () => ({ cargarContactos: m.cargar }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import ContactosPage from './page'
import { ContactosLista } from '@/components/crm/cartera/ContactosLista'
import { SinAccesoLista } from '@/components/crm/cartera/SinAcceso'

const DATOS = { filas: [], asesores: [], fuentes: { ultimoContacto: 'ok', tareas: 'ok' }, truncado: false, generadoEn: '2026-12-02T13:40:00.000Z' }

async function abrir(): Promise<ReactElement<Record<string, unknown>>> {
  const el = await ContactosPage()
  if (!isValidElement<Record<string, unknown>>(el)) throw new Error('la página no devolvió un elemento')
  return el
}

beforeEach(() => {
  m.usuario = { id: 'u-1', profile: { role: 'coordinador', is_active: true } }
  m.cargar.mockReset()
  m.cargar.mockResolvedValue(DATOS)
})

describe('/contacts', () => {
  it('el abogado va a /properties/review sin leer nada (antes veía la pantalla vacía)', async () => {
    m.usuario = { id: 'x', profile: { role: 'abogado', is_active: true } }
    await expect(abrir()).rejects.toThrow('REDIRECT:/properties/review')
    expect(m.cargar).not.toHaveBeenCalled()
  })

  it('un rol sin Contactos o desactivado: "No tenés acceso a Contactos" sin leer nada', async () => {
    m.usuario = { id: 'x', profile: { role: 'viewer', is_active: true } }
    let el = await abrir()
    expect(el.type).toBe(SinAccesoLista)
    expect(el.props.titulo).toBe('No tenés acceso a Contactos')
    m.usuario = { id: 'x', profile: { role: 'asesor', is_active: false } }
    el = await abrir()
    expect(el.type).toBe(SinAccesoLista)
    expect(m.cargar).not.toHaveBeenCalled()
  })

  it('la coordinación ve a todos: datos planos y sin "propios"', async () => {
    const el = await abrir()
    expect(el.type).toBe(ContactosLista)
    expect(m.cargar).toHaveBeenCalledWith({ id: 'u-1', role: 'coordinador' }, expect.any(Date))
    expect(el.props.propios).toBe(false)
    for (const v of Object.values(el.props)) expect(typeof v).not.toBe('function')
    expect(JSON.parse(JSON.stringify(el.props.inicial))).toEqual(el.props.inicial)
  })

  it('el asesor: el servicio arma solo sus contactos (regla de la ficha) y la pantalla va como "propios"', async () => {
    m.usuario = { id: 'a-1', profile: { role: 'asesor', is_active: true } }
    const el = await abrir()
    expect(m.cargar).toHaveBeenCalledWith({ id: 'a-1', role: 'asesor' }, expect.any(Date))
    expect(el.props.propios).toBe(true)
  })

  it('si la lectura falla, la pantalla recibe null (dice que no se pudo, con "Reintentar")', async () => {
    m.cargar.mockRejectedValue(new Error('base caída'))
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = await abrir()
    expect(el.type).toBe(ContactosLista)
    expect(el.props.inicial).toBeNull()
    consola.mockRestore()
  })
})
