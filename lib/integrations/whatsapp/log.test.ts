import { describe, it, expect } from 'vitest'
import { mapMetaStatus } from './log'

describe('mapMetaStatus', () => {
  it('normaliza los estados documentados de Meta (trim + minúsculas)', () => {
    expect(mapMetaStatus('sent')).toBe('sent')
    expect(mapMetaStatus('DELIVERED')).toBe('delivered')
    expect(mapMetaStatus('  Read ')).toBe('read')
    expect(mapMetaStatus('Failed')).toBe('failed')
  })

  it('deja pasar tal cual un estado desconocido (Meta agrega estados sin avisar)', () => {
    expect(mapMetaStatus('warning')).toBe('warning')
    expect(mapMetaStatus('deleted')).toBe('deleted')
    // ni siquiera se normaliza mayúsculas/espacios de lo desconocido: se
    // preserva exactamente lo que mandó Meta, para no perder información rara.
    expect(mapMetaStatus('  Some-New-Status ')).toBe('  Some-New-Status ')
  })
})
