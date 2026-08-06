// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'

// `AppraisalRequestAdminsEmail` importa `server-only`, que existe solo en el
// bundle de Next.js y no resuelve bajo vitest. Mismo stub que usa
// lib/funnel/create-funnel-lead.test.ts:8.
vi.mock('server-only', () => ({}))

import { renderEmail } from '../lib/email/render'
import { AppraisalRequestAdminsEmail } from './AppraisalRequestAdminsEmail'

const COMPLETO = {
  contactName: 'María Gómez',
  contactEmail: 'maria.gomez@example.com',
  contactPhone: '+54 9 11 5555 4444',
  propertyLocation: 'Av. Cabildo 2000, Belgrano',
  message: 'Quiero vender el departamento este año.',
  requestedAt: '30/07/2026 11:45',
  campaignName: '🟡 CONV: [Tasación Gratuita] | Primer Nivel',
  dealId: '00000000-0000-0000-0000-000000000001',
}

const MINIMO = {
  contactName: 'Juan Pérez',
  contactEmail: null,
  contactPhone: '+54 9 11 3333 2222',
  propertyLocation: null,
  message: null,
  requestedAt: '30/07/2026 12:10',
  campaignName: null,
  dealId: '00000000-0000-0000-0000-000000000002',
}

describe('AppraisalRequestAdminsEmail', () => {
  it('dice "solicitud", aclara que no está agendada, y muestra los datos del lead', async () => {
    const html = await renderEmail(AppraisalRequestAdminsEmail(COMPLETO) as any)
    fs.writeFileSync('/tmp/email-solicitud-completo.html', html) // para inspección visual
    expect(html).toContain('Nueva solicitud de tasación')
    expect(html).toContain('no hay una tasación agendada')
    expect(html).toContain('Av. Cabildo 2000, Belgrano')
    expect(html).toContain('+54 9 11 5555 4444')
    expect(html).toContain('Primer Nivel')
  })

  it('sin ubicación/mensaje/campaña avisa que faltan, sin campos fantasma', async () => {
    const html = await renderEmail(AppraisalRequestAdminsEmail(MINIMO) as any)
    fs.writeFileSync('/tmp/email-solicitud-minimo.html', html)
    expect(html).toContain('no la dejó en el formulario')
    expect(html).toContain('Juan Pérez')
    expect(html).toContain('no hay una tasación agendada')
  })
})
