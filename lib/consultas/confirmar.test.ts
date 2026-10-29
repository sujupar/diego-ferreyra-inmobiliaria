import { describe, it, expect } from 'vitest'
import { enlaceConfirmacion } from './confirmar'

const base = {
  whatsapp: '5491161400496',
  nombre: 'Ana',
  direccion: 'Honduras 4800',
  fecha: '2026-10-30',
  hora: '15:00',
}

function textoDe(url: string): string {
  return decodeURIComponent(url.split('?text=')[1])
}

describe('enlaceConfirmacion', () => {
  it('sin nombre saluda sin espacio sobrante', () => {
    expect(textoDe(enlaceConfirmacion({ ...base, nombre: null }))).toMatch(/^Hola! Te confirmo/)
    expect(textoDe(enlaceConfirmacion({ ...base, nombre: '   ' }))).toMatch(/^Hola! Te confirmo/)
  })

  it('usa solo el primer nombre con mayúscula inicial', () => {
    expect(textoDe(enlaceConfirmacion({ ...base, nombre: 'MARÍA pérez' }))).toMatch(/^Hola María! /)
  })

  it('normaliza nombres descompuestos (NFD)', () => {
    const nfd = 'maría'
    expect(textoDe(enlaceConfirmacion({ ...base, nombre: nfd }))).toMatch(/^Hola María! /)
  })

  it('arma la URL de wa.me con el número solo en dígitos', () => {
    expect(enlaceConfirmacion(base).startsWith('https://wa.me/5491161400496?text=')).toBe(true)
    expect(enlaceConfirmacion({ ...base, whatsapp: '+54 9 11 6140-0496' }).startsWith('https://wa.me/5491161400496?text=')).toBe(true)
  })

  it('codifica saltos de línea y & de la dirección', () => {
    const url = enlaceConfirmacion({ ...base, direccion: 'Calle 1 & 2\nPiso 3' })
    const query = url.split('?text=')[1]
    expect(query).not.toContain('&')
    expect(query).not.toContain('\n')
    expect(query).toContain('%26')
    expect(query).toContain('%0A')
  })

  it('dice la fecha y la hora una sola vez', () => {
    const t = textoDe(enlaceConfirmacion(base))
    expect(t).toBe(
      'Hola Ana! Te confirmo la visita a Honduras 4800 el viernes 30 de octubre a las 15:00. Cualquier cosa me escribís por acá.',
    )
  })

  it('con fecha inválida usa el texto crudo sin tirar', () => {
    const t = textoDe(enlaceConfirmacion({ ...base, fecha: '2026-02-31' }))
    expect(t).toContain('el 2026-02-31 a las 15:00')
  })
})
