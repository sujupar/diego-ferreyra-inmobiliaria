import { describe, it, expect, vi } from 'vitest'
import { parseWebhook } from './suppressions'

vi.mock('server-only', () => ({}))

describe('parseWebhook', () => {
  it('extrae type y email de un payload unsubscribe (form-encoded)', () => {
    const form = new URLSearchParams('type=unsubscribe&data[email]=a%40b.com')
    expect(parseWebhook(form)).toEqual({ type: 'unsubscribe', email: 'a@b.com' })
  })
  it('cleaned (rebote) también', () => {
    const form = new URLSearchParams('type=cleaned&data[email]=x%40y.com')
    expect(parseWebhook(form)).toEqual({ type: 'cleaned', email: 'x@y.com' })
  })
  it('sin email → email null', () => {
    expect(parseWebhook(new URLSearchParams('type=profile'))).toEqual({ type: 'profile', email: null })
  })
})
