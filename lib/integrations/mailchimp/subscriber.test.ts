import { describe, it, expect, vi } from 'vitest'

// `server-only` no existe fuera del build de Next.js
vi.mock('server-only', () => ({}))

import { subscriberHash, mergeFieldsFor } from './subscriber'

describe('subscriberHash', () => {
  it('es el MD5 del email en minúsculas (contrato Mailchimp)', () => {
    // md5("prudence.mcvankab@example.com") — ejemplo oficial de los docs de Mailchimp
    expect(subscriberHash('Prudence.McVankab@example.com')).toBe('54bd5ff2362f848a29fc96b38167ca48')
  })
  it('normaliza espacios y mayúsculas', () => {
    expect(subscriberHash('  A@B.COM ')).toBe(subscriberHash('a@b.com'))
  })
})

describe('mergeFieldsFor', () => {
  it('deriva FNAME del primer nombre y setea CRM_STAGE', () => {
    expect(mergeFieldsFor('Juan Pérez García', 'request')).toEqual({ FNAME: 'Juan', CRM_STAGE: 'request' })
  })
  it('FNAME vacío si no hay nombre', () => {
    expect(mergeFieldsFor(null, 'visited')).toEqual({ FNAME: '', CRM_STAGE: 'visited' })
  })
})
