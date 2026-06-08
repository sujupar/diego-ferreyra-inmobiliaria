import { describe, it, expect } from 'vitest'
import { summarizeLegalDocs } from './legal-docs.types'
import type { LegalDocsState } from './legal-docs.types'

const keys = ['a', 'b', 'c']

describe('summarizeLegalDocs', () => {
  it('todo aprobado => tone ok', () => {
    const docs: LegalDocsState = { a: { status: 'approved' }, b: { status: 'approved' }, c: { status: 'approved' } }
    const s = summarizeLegalDocs(docs, keys)
    expect(s.tone).toBe('ok')
    expect(s.label).toBe('3/3 aprobados')
  })
  it('algún rechazado => tone bad y prioriza revisar', () => {
    const docs: LegalDocsState = { a: { status: 'approved' }, b: { status: 'rejected' }, c: { status: 'pending' } }
    const s = summarizeLegalDocs(docs, keys)
    expect(s.tone).toBe('bad')
    expect(s.label).toBe('1 rechazado · revisar')
  })
  it('faltantes o pendientes sin rechazos => tone warn', () => {
    const docs: LegalDocsState = { a: { status: 'approved' } }
    const s = summarizeLegalDocs(docs, keys)
    expect(s.tone).toBe('warn')
    expect(s.approved).toBe(1)
    expect(s.missing).toBe(2)
    expect(s.label).toBe('1/3 aprobados')
  })
})
