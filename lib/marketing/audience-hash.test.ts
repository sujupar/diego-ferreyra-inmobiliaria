import { describe, it, expect } from 'vitest'
import { CUSTOMER_LIST_SCHEMA, hashContactRow } from './audience-hash'
import { createHash } from 'node:crypto'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

describe('hashContactRow', () => {
  it('schema fijo EMAIL,PHONE,FN,LN,CT,COUNTRY', () => {
    expect(CUSTOMER_LIST_SCHEMA).toEqual(['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'COUNTRY'])
  })
  it('hashea email lower+trim, phone normalizado AR, nombre split, country ar', () => {
    const row = hashContactRow({ fullName: 'Juan Pérez', email: ' Juan@Mail.com ', phone: '011 15-1234-5678', city: 'CABA' })
    expect(row).toEqual([
      sha('juan@mail.com'),
      sha('5491112345678'),
      sha('juan'),
      sha('pérez'),
      sha('caba'),
      sha('ar'),
    ])
  })
  it('campos faltantes → cadena vacía en esa posición', () => {
    const row = hashContactRow({ fullName: 'Ana', email: null, phone: null })
    expect(row[0]).toBe('') // email
    expect(row[1]).toBe('') // phone
    expect(row[2]).toBe(sha('ana'))
  })
})
