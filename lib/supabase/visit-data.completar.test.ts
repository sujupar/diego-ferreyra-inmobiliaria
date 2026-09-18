/**
 * Finalizar la visita solo puede mover un proceso que la tenía PENDIENTE.
 *
 * Hallazgo de la revisión adversarial (2026-09-17): desde que el formulario se
 * puede reabrir en etapas posteriores, una pestaña vieja (o un pedido directo)
 * con `complete:true` hacía RETROCEDER un proceso Captado a "Visita Realizada":
 * `markVisitCompleted` escribía `stage:'visited'` sin mirar la etapa actual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: { filtroEtapas: null as unknown, filasActualizadas: [{ id: 'deal-1' }] as { id: string }[] },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.update = () => q
      q.eq = () => q
      q.in = (_col: string, valores: unknown) => { estado.filtroEtapas = valores; return q }
      q.select = async () => ({ data: estado.filasActualizadas, error: null })
      return q
    },
  }),
}))

import { markVisitCompleted } from './visit-data'

beforeEach(() => { estado.filtroEtapas = null; estado.filasActualizadas = [{ id: 'deal-1' }] })

describe('markVisitCompleted', () => {
  it('solo actualiza si la etapa es Coordinada o No Realizada (en la MISMA sentencia, sin carrera)', async () => {
    await markVisitCompleted('deal-1')
    expect(estado.filtroEtapas).toEqual(['scheduled', 'not_visited'])
  })

  it('dice si movió el proceso', async () => {
    expect(await markVisitCompleted('deal-1')).toBe(true)
  })

  it('un proceso ya avanzado no se toca y lo informa', async () => {
    estado.filasActualizadas = []
    expect(await markVisitCompleted('deal-1')).toBe(false)
  })
})
