/**
 * D4: un asesor capta una propiedad, adjunta los planos y en "Asesor que la
 * muestra" elige al OTRO asesor —que es lo que el formulario pide—. La
 * propiedad se creaba con `assigned_to` = el otro, y la subida moría con 403 y
 * un mensaje de recuperación falso ("subilos desde la ficha": misma ruta).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserWithProfile } from '@/types/auth.types'

const { estado } = vi.hoisted(() => ({
  estado: {
    /** Lo que devuelve el guard genérico. */
    accesoGenerico: false,
    /** Fila de `properties` que ve la consulta de `created_by`. */
    fila: null as { created_by: string | null } | null,
    lecturas: 0,
  },
}))

vi.mock('@/lib/auth/entity-access', () => ({
  canAccessProperty: vi.fn(async () => estado.accesoGenerico),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => { estado.lecturas++; return { data: estado.fila, error: null } },
        }),
      }),
    }),
  }),
}))

import { puedeGestionarMedia } from './acceso-media'

const asesor = { id: 'asesor-1', profile: { role: 'asesor' } } as unknown as UserWithProfile

beforeEach(() => {
  estado.accesoGenerico = false
  estado.fila = null
  estado.lecturas = 0
})

describe('puedeGestionarMedia', () => {
  it('el asesor ASIGNADO pasa por el guard de siempre, sin consulta extra', async () => {
    estado.accesoGenerico = true
    expect(await puedeGestionarMedia(asesor, 'p1')).toBe(true)
    expect(estado.lecturas).toBe(0)
  })

  it('el asesor que la CAPTÓ puede subir su material aunque la muestre otro', async () => {
    estado.accesoGenerico = false
    estado.fila = { created_by: 'asesor-1' }
    expect(await puedeGestionarMedia(asesor, 'p1')).toBe(true)
  })

  it('un asesor ajeno (ni asignado ni creador) sigue sin poder', async () => {
    estado.accesoGenerico = false
    estado.fila = { created_by: 'otro-asesor' }
    expect(await puedeGestionarMedia(asesor, 'p1')).toBe(false)
  })

  it('falla cerrado si la propiedad no existe o la lectura no devuelve nada', async () => {
    estado.accesoGenerico = false
    estado.fila = null
    expect(await puedeGestionarMedia(asesor, 'p1')).toBe(false)
  })

  it('sin creador cargado no habilita a nadie', async () => {
    estado.accesoGenerico = false
    estado.fila = { created_by: null }
    expect(await puedeGestionarMedia(asesor, 'p1')).toBe(false)
  })
})
