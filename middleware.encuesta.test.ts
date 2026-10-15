import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { actualizar } = vi.hoisted(() => ({
  actualizar: vi.fn(async () => new Response(null, { status: 307, headers: { location: '/login' } })),
}))
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: actualizar }))

import { middleware } from './middleware'

beforeEach(() => { actualizar.mockClear() })

describe('middleware raíz', () => {
  it('/encuesta/<token> pasa sin sesión (la abre un comprador desde WhatsApp)', async () => {
    const res = await middleware(new NextRequest('https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y'))
    expect(actualizar).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
  it('"/encuestas" (otra ruta que empieza igual) NO se cuela como pública', async () => {
    await middleware(new NextRequest('https://inmodf.com.ar/encuestas'))
    expect(actualizar).toHaveBeenCalled()
  })
  it('una página privada sigue pasando por la sesión', async () => {
    await middleware(new NextRequest('https://inmodf.com.ar/visits'))
    expect(actualizar).toHaveBeenCalled()
  })
})
