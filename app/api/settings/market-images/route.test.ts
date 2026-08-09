/**
 * `/api/settings/market-images` no tenía guard EXPLÍCITO.
 *
 * A diferencia de las otras cuatro, esta usa el cliente con cookies y la tabla
 * `market_image_settings` tiene RLS admin-only, así que la fuga real era chica
 * (etiquetas por defecto + URLs públicas del bucket). Aun así el arreglo es
 * defensa en profundidad: que la ruta no dependa SOLO de que alguien no se
 * olvide de la RLS.
 *
 * Lo delicado acá es no romper a los llamadores legítimos, que son DOS y
 * necesitan permisos distintos:
 *   - `GET`  ← `/settings` Y `PDFPreviewModal` (pantallas de tasación, las usa
 *     un ASESOR). Por eso el GET lleva `requireAuth` y no `settings.manage`:
 *     pedir el permiso de configuración le cortaría la vista previa del PDF.
 *   - `PUT`  ← solo `/settings`, que ya está detrás de `settings.manage`.
 * De ahí que los dos verbos lleven guards distintos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, escrituras, RedirectDeNext } = vi.hoisted(() => {
  class RedirectDeNext extends Error {
    digest: string
    constructor(destino: string) {
      super('NEXT_REDIRECT')
      this.digest = `NEXT_REDIRECT;replace;${destino};307;`
    }
  }
  return {
    estado: { autenticado: true, role: 'admin' as string },
    escrituras: { upserts: [] as Array<Record<string, unknown>> },
    RedirectDeNext,
  }
})

vi.mock('@/lib/auth/require-role', async () => {
  const { hasPermission } = await vi.importActual<typeof import('@/lib/auth/roles')>('@/lib/auth/roles')
  return {
    requireAuth: async () => {
      if (!estado.autenticado) throw new RedirectDeNext('/login')
      return { id: 'u1', profile: { id: 'u1', role: estado.role } }
    },
    requirePermission: async (permiso: never) => {
      if (!estado.autenticado) throw new RedirectDeNext('/login')
      if (!hasPermission(estado.role as never, permiso)) throw new RedirectDeNext('/')
      return { id: 'u1', profile: { id: 'u1', role: estado.role } }
    },
  }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      // Un no-privilegiado ve 0 filas por la RLS admin-only: eso ya pasaba
      // antes del guard y sigue pasando igual.
      select: () => Promise.resolve({
        data: ['admin', 'dueno'].includes(estado.role)
          ? [{ id: 'stock-departamentos', label: 'Etiqueta personalizada', description: 'desc' }]
          : [],
        error: null,
      }),
      upsert: (fila: Record<string, unknown>) => {
        escrituras.upserts.push(fila)
        return Promise.resolve({ error: null })
      },
    }),
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [{ name: 'stock-departamentos.png' }], error: null }),
        getPublicUrl: (nombre: string) => ({
          data: { publicUrl: `https://storage.local/market-images/${nombre}` },
        }),
      }),
    },
  }),
}))

import { GET, PUT } from './route'

function guardar(cuerpo: Record<string, unknown> = { id: 'stock-departamentos', label: 'Nueva etiqueta' }) {
  return PUT(new Request('http://local/api/settings/market-images', {
    method: 'PUT',
    body: JSON.stringify(cuerpo),
  }))
}

beforeEach(() => {
  escrituras.upserts = []
  estado.autenticado = true
  estado.role = 'admin'
})

describe('GET /api/settings/market-images — sin sesión', () => {
  beforeEach(() => { estado.autenticado = false })

  it('NO devuelve los slots: corta con el redirect a /login', async () => {
    await expect(GET()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/login;307;' })
  })
})

describe('GET /api/settings/market-images — los llamadores legítimos NO se rompen', () => {
  // Este bloque es el que protege a `PDFPreviewModal`.
  it.each(['asesor', 'coordinador', 'abogado'])(
    'un %s con sesión sigue recibiendo los 4 slots (vista previa del PDF intacta)',
    async (role) => {
      estado.role = role
      const res = await GET()
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.slots).toHaveLength(4)
      expect(body.slots.map((s: { id: string }) => s.id)).toEqual([
        'stock-departamentos', 'escrituras-caba', 'datos-barrio', 'tipos-propiedades',
      ])
      // Cae a las etiquetas por defecto porque la RLS le devuelve 0 filas —
      // exactamente lo mismo que pasaba antes del guard.
      expect(body.slots[0].label).toBe('Stock de Departamentos en venta en CABA')
      expect(body.slots[0].currentPath).toBe(
        'https://storage.local/market-images/stock-departamentos.png',
      )
    },
  )

  it.each(['admin', 'dueno'])('un %s sigue viendo su etiqueta personalizada', async (role) => {
    estado.role = role
    const res = await GET()
    const body = await res.json()
    expect(body.slots[0].label).toBe('Etiqueta personalizada')
  })
})

describe('PUT /api/settings/market-images — sin sesión', () => {
  beforeEach(() => { estado.autenticado = false })

  it('NO escribe: cero upserts', async () => {
    await guardar().catch(() => {})
    expect(escrituras.upserts).toEqual([])
  })

  it('corta con el redirect, no con un {success:true}', async () => {
    await expect(guardar()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/login;307;' })
  })
})

describe('PUT /api/settings/market-images — con sesión pero SIN settings.manage', () => {
  it.each(['asesor', 'coordinador', 'abogado'])(
    'un %s puede LEER pero no puede guardar: redirect a / y cero upserts',
    async (role) => {
      estado.role = role
      await expect(guardar()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/;307;' })
      expect(escrituras.upserts).toEqual([])
    },
  )
})

describe('PUT /api/settings/market-images — con settings.manage', () => {
  it.each(['admin', 'dueno'])('un %s sigue guardando igual que antes', async (role) => {
    estado.role = role
    const res = await guardar({ id: 'datos-barrio', label: 'Datos del barrio', description: 'x' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(escrituras.upserts).toHaveLength(1)
    expect(escrituras.upserts[0]).toMatchObject({
      id: 'datos-barrio',
      label: 'Datos del barrio',
      description: 'x',
    })
  })

  it('la validación de campos sigue viva (400, sin escribir)', async () => {
    estado.role = 'admin'
    const res = await guardar({ id: 'datos-barrio' })
    expect(res.status).toBe(400)
    expect(escrituras.upserts).toEqual([])
  })
})
