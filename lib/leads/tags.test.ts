import { describe, it, expect } from 'vitest'
import { colorForTag, initialsAndColor, nextStateFor } from './tags'

describe('colorForTag', () => {
  it('devuelve clases distintas para cada color sembrado en el catálogo', () => {
    const colores = [
      'red', 'amber', 'slate', 'orange', 'violet', 'emerald',
      'blue', 'cyan', 'yellow', 'teal', 'zinc', 'indigo',
    ]
    const vistos = new Set<string>()
    for (const c of colores) {
      const classes = colorForTag(c)
      expect(classes.bg).toContain(c)
      expect(classes.text).toContain(c)
      vistos.add(classes.bg)
    }
    // 12 colores → 12 combinaciones de clase distintas (nadie pisa a otro).
    expect(vistos.size).toBe(colores.length)
  })

  it('un color no mapeado cae a un fallback sobrio, no revienta', () => {
    expect(() => colorForTag('un-color-que-no-existe')).not.toThrow()
    const classes = colorForTag('un-color-que-no-existe')
    expect(classes.bg).toBeTruthy()
    expect(classes.text).toBeTruthy()
  })
})

describe('initialsAndColor', () => {
  it('nombre y apellido → 2 iniciales', () => {
    expect(initialsAndColor('Juan Pérez').initials).toBe('JP')
  })

  it('un solo nombre → 1 inicial', () => {
    expect(initialsAndColor('Julián').initials).toBe('J')
  })

  it('nombre con varios términos → primera + última palabra (no la del medio)', () => {
    expect(initialsAndColor('Juan Carlos Pérez').initials).toBe('JP')
  })

  it('espacios extra y minúsculas no rompen las iniciales', () => {
    expect(initialsAndColor('  juan   perez  ').initials).toBe('JP')
  })

  it('nombre vacío o ausente no lanza y da un placeholder', () => {
    expect(() => initialsAndColor('')).not.toThrow()
    expect(initialsAndColor('').initials).toBe('?')
    expect(initialsAndColor(null).initials).toBe('?')
    expect(initialsAndColor(undefined).initials).toBe('?')
  })

  it('la MISMA persona (mismo nombre completo) siempre da el mismo color', () => {
    const a = initialsAndColor('Julián Parra')
    const b = initialsAndColor('Julián Parra')
    expect(a.bg).toBe(b.bg)
    expect(a.text).toBe(b.text)
  })

  it('dos nombres que EMPIEZAN IGUAL no caen siempre en el mismo color (usa el nombre completo, no solo el primer término)', () => {
    const juanPerez = initialsAndColor('Juan Pérez')
    const juanGomez = initialsAndColor('Juan Gómez')
    // Ambos comparten "Juan" como primer término; si el color solo dependiera
    // de esa palabra, darían siempre el mismo bg. Con el nombre completo, no.
    expect(juanPerez.bg).not.toBe(juanGomez.bg)
  })

  it('nombres distintos con las MISMAS iniciales pueden (y en este caso deben) tener colores distintos', () => {
    const juanPerez = initialsAndColor('Juan Pérez') // JP
    const julianParra = initialsAndColor('Julián Parra') // JP también
    expect(juanPerez.initials).toBe('JP')
    expect(julianParra.initials).toBe('JP')
    expect(juanPerez.bg).not.toBe(julianParra.bg)
  })
})

describe('re-export de nextStateFor (mismo módulo que ./pipeline-state, sin duplicar lógica)', () => {
  it('sigue siendo la máquina de estados real', () => {
    expect(nextStateFor('nuevo', 'first_outbound_message')).toBe('contactado')
    expect(nextStateFor('visito', 'first_outbound_message')).toBeNull()
  })
})
