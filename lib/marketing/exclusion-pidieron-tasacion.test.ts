import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ETAPAS_CON_TASACION,
  armarListaDeExclusion,
  decidirReemplazo,
  esContactoDePrueba,
  filaParaMeta,
} from './exclusion-pidieron-tasacion'

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

describe('esContactoDePrueba', () => {
  it('marca los contactos de Julián por nombre o por email', () => {
    expect(esContactoDePrueba({ fullName: 'Julián Parra', email: null, phoneNorm: null })).toBe(true)
    expect(esContactoDePrueba({ fullName: 'X', email: 'contacto.julianparra@gmail.com', phoneNorm: null })).toBe(true)
  })
  it('marca [TEST y las cuentas @passmail.com', () => {
    expect(esContactoDePrueba({ fullName: '[TEST QA] Ana', email: null, phoneNorm: null })).toBe(true)
    expect(esContactoDePrueba({ fullName: 'Ana', email: 'coord@passmail.com', phoneNorm: null })).toBe(true)
  })
  it('reconoce el nombre de Julián aunque venga con la tilde descompuesta (NFD)', () => {
    expect(esContactoDePrueba({ fullName: 'Julián Parra', email: null, phoneNorm: null })).toBe(true)
  })
  it('no marca a una persona real', () => {
    expect(esContactoDePrueba({ fullName: 'Ana Gómez', email: 'ana@gmail.com', phoneNorm: '1155550000' })).toBe(false)
  })
})

describe('filaParaMeta', () => {
  it('cifra el email en minúsculas y el teléfono como 549 + 10 dígitos', () => {
    expect(filaParaMeta({ fullName: 'Ana', email: '  Ana@Gmail.COM ', phoneNorm: '1155550000' }))
      .toEqual([sha('ana@gmail.com'), sha('5491155550000')])
  })
  it('deja vacío el dato que no sirve y conserva el otro', () => {
    expect(filaParaMeta({ fullName: 'Ana', email: 'no-es-un-email', phoneNorm: '1155550000' }))
      .toEqual(['', sha('5491155550000')])
    expect(filaParaMeta({ fullName: 'Ana', email: 'ana@gmail.com', phoneNorm: '44652269' }))
      .toEqual([sha('ana@gmail.com'), ''])
  })
  it('devuelve null si no hay ningún dato usable', () => {
    expect(filaParaMeta({ fullName: 'Ana', email: null, phoneNorm: null })).toBeNull()
    expect(filaParaMeta({ fullName: 'Ana', email: '', phoneNorm: 'abc' })).toBeNull()
  })
})

describe('armarListaDeExclusion', () => {
  const ana = { fullName: 'Ana', email: 'ana@gmail.com', phoneNorm: '1155550000' }
  it('saca las pruebas y los contactos sin datos', () => {
    const lista = armarListaDeExclusion([ana, { fullName: '[TEST] x', email: 'x@y.com', phoneNorm: null }, { fullName: 'B', email: null, phoneNorm: null }])
    expect(lista).toHaveLength(1)
  })
  it('no repite a la misma persona aunque tenga varios procesos', () => {
    expect(armarListaDeExclusion([ana, { ...ana, email: 'ANA@gmail.com' }])).toHaveLength(1)
  })
  it('con la lista vacía devuelve vacío', () => {
    expect(armarListaDeExclusion([])).toEqual([])
  })
})

describe('decidirReemplazo', () => {
  it('no reemplaza con 0 personas', () => {
    expect(decidirReemplazo(0, null)).toEqual({ reemplazar: false, motivo: expect.stringContaining('0 personas') })
  })
  it('no reemplaza si cae por debajo del 80 % de la corrida anterior', () => {
    const d = decidirReemplazo(300, 400)
    expect(d.reemplazar).toBe(false)
    if (!d.reemplazar) expect(d.motivo).toContain('400')
  })
  it('reemplaza justo en el 80 % y cuando crece', () => {
    expect(decidirReemplazo(320, 400).reemplazar).toBe(true)
    expect(decidirReemplazo(420, 400).reemplazar).toBe(true)
  })
  it('reemplaza en la primera corrida (sin anterior)', () => {
    expect(decidirReemplazo(393, null).reemplazar).toBe(true)
  })
})

it('las etapas con tasación son las de "coordinada" en adelante', () => {
  expect([...ETAPAS_CON_TASACION]).toEqual(['scheduled', 'not_visited', 'visited', 'appraisal_sent', 'followup', 'captured'])
})
