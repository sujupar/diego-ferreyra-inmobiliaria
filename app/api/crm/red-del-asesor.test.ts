/**
 * La red no trae nada ajeno (tarea 5.3, spec "La red solo trae lo que cada uno puede ver").
 *
 * Con datos de dos asesores, procesos sin asesor de la coordinación y una persona compartida
 * cuyo proceso MÁS NUEVO es del asesor B, se busca en la respuesta SERIALIZADA del asesor A
 * (el texto que viaja, no los objetos) cualquier id, nombre, título de tarea, dirección o
 * dato de tasación de B o de un proceso sin asesor. Las dos rutas usan el servicio REAL sobre
 * la base simulada, que aplica de verdad los filtros pedidos: si la consulta O el armado dejan
 * de recortar, esto se pone en rojo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baseSimulada } from '@/lib/supabase/cartera.simulada'
import { AJENO_A_A, ASESOR_A, ASESOR_B, C_A, C_COMP, P_A, P_COMP_A, escenario, ultimosDelEscenario } from './datos-de-prueba'

const m = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.cliente }))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({
    id: '00000000-0000-4000-8000-000000000004',
    email: 'ana@ejemplo.com',
    profile: { id: '00000000-0000-4000-8000-000000000004', role: 'asesor', full_name: 'Ana Asesora', is_active: true },
  })),
}))

import { GET as getCartera } from './cartera/route'
import { GET as getContactos } from './contactos/route'

const cartera = (consulta = '') => getCartera(new Request(`http://local/api/crm/cartera${consulta}`) as never)

function sinNadaAjeno(texto: string) {
  const encontrados = AJENO_A_A.filter((x) => texto.includes(x))
  expect(encontrados).toEqual([])
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const base = baseSimulada(escenario(), { rpcs: { crm_ultimos_contactos: ultimosDelEscenario } })
  m.cliente = base.cliente
})

describe('la cartera del asesor A por la red', () => {
  it('el mock de sesión es el asesor A del escenario', () => {
    expect(ASESOR_A).toBe('00000000-0000-4000-8000-000000000004')
  })

  it('trae sus procesos y ningún id, nombre, tarea, dirección ni tasación de B o de un proceso sin asesor', async () => {
    const r = await cartera()
    expect(r.status).toBe(200)
    const texto = await r.text()
    expect(texto).toContain(P_A)
    expect(texto).toContain(P_COMP_A)
    expect(texto).toContain(C_A)
    sinNadaAjeno(texto)
  })

  it.each([`?assigned_to=${ASESOR_B}`, `?asesor=${ASESOR_B}`, `?assigned_to=${ASESOR_B}&asesor=${ASESOR_B}&seg=cerrados`])(
    'con %s en la dirección: la MISMA respuesta, solo lo suyo',
    async (consulta) => {
      const sin = (await (await cartera()).json()) as { filas: { id: string }[] }
      const r = await cartera(consulta)
      expect(r.status).toBe(200)
      const texto = await r.text()
      sinNadaAjeno(texto)
      const con = JSON.parse(texto) as { filas: { id: string }[] }
      expect(con.filas.map((f) => f.id)).toEqual(sin.filas.map((f) => f.id))
    },
  )

  it(`con ?ver_como=<B>: 403 y nada de B`, async () => {
    const r = await cartera(`?ver_como=${ASESOR_B}`)
    expect(r.status).toBe(403)
    sinNadaAjeno(await r.text())
  })
})

describe('Contactos del asesor A por la red', () => {
  it('trae solo sus contactos; en la persona compartida, solo SU proceso (el más nuevo es de B)', async () => {
    const r = await getContactos()
    expect(r.status).toBe(200)
    const texto = await r.text()
    sinNadaAjeno(texto)
    const d = JSON.parse(texto) as { filas: { id: string; proceso: { id: string } | null }[] }
    expect(d.filas.map((f) => f.id).sort()).toEqual([C_A, C_COMP].sort())
    expect(d.filas.find((f) => f.id === C_COMP)?.proceso?.id).toBe(P_COMP_A)
  })

  it('la ruta ni recibe la dirección: ?assigned_to, ?asesor o ?ver_como no pueden llegar', () => {
    expect(getContactos.length).toBe(0)
  })
})
