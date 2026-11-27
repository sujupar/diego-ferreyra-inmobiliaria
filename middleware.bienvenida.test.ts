import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { actualizar } = vi.hoisted(() => ({
  actualizar: vi.fn(async () => new Response(null, { status: 307, headers: { location: '/login' } })),
}))
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: actualizar }))

import { middleware } from './middleware'

beforeEach(() => { actualizar.mockClear() })

describe('middleware raíz: video de bienvenida', () => {
  it('/t/<código> pasa sin sesión (lo abre quien pidió la tasación, desde WhatsApp)', async () => {
    const res = await middleware(new NextRequest('https://inmodf.com.ar/t/k7Hq2mXb9T'))
    expect(actualizar).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
  it('/t/paula.vcf también es pública', async () => {
    await middleware(new NextRequest('https://inmodf.com.ar/t/paula.vcf'))
    expect(actualizar).not.toHaveBeenCalled()
  })
  it('"/tasks" (empieza con t) NO se cuela como pública', async () => {
    await middleware(new NextRequest('https://inmodf.com.ar/tasks'))
    expect(actualizar).toHaveBeenCalled()
  })
})
