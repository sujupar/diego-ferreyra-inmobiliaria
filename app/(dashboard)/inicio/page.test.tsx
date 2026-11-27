// @vitest-environment happy-dom
// La página decide qué Inicio ve cada rol (crm-inicio, D3/D5) y le pasa al cliente solo un string.
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const m = vi.hoisted(() => ({ role: 'coordinador', props: [] as unknown[] }))
vi.mock('@/lib/auth/require-role', () => ({ requireAuth: async () => ({ id: 'u1', profile: { role: m.role, is_active: true } }) }))
vi.mock('@/lib/supabase/inicio', () => ({
  rolDelInicio: (r: string) => ({ coordinador: 'coordinacion', asesor: 'asesor', admin: 'dueno', dueno: 'dueno' } as Record<string, string>)[r] ?? null,
}))
vi.mock('@/components/inicio/Inicio', () => ({ Inicio: (p: unknown) => { m.props.push(p); return <p>nuevo</p> } }))
vi.mock('@/components/inicio/InicioClasico', () => ({ InicioClasico: () => <p>clásico</p> }))

import InicioPage from './page'

describe('página del Inicio', () => {
  it.each([
    ['coordinador', 'nuevo'],
    ['asesor', 'nuevo'],
    ['admin', 'nuevo'],
    ['dueno', 'nuevo'],
    ['abogado', 'clásico'],
  ])('%s → Inicio %s', async (role, cual) => {
    m.role = role
    m.props.length = 0
    const { container } = render(await InicioPage())
    expect(container.textContent).toBe(cual)
    if (cual === 'nuevo') expect(m.props).toEqual([{ rolUsuario: role }])
  })
})
