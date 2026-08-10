import { describe, it, expect } from 'vitest'
import { getNavSections, navHrefs } from './sections'
import { itemsBarraInferior, destinoActivo, MAXIMO_DESTINOS } from './bottom-bar'
import type { Role } from '@/types/auth.types'

const ROLES: Role[] = ['admin', 'dueno', 'coordinador', 'asesor', 'abogado']

describe('itemsBarraInferior — nunca ofrece una pantalla que el rol no tiene', () => {
  // Esta es LA propiedad que justifica derivar la barra del menú en vez de
  // escribir una lista a mano: una barra con rutas propias se desincroniza el
  // día que alguien toca los permisos, y el síntoma es un botón que lleva a
  // "no tenés permiso".
  it.each(ROLES)('rol %s: todo lo que muestra está en su menú', role => {
    const groups = getNavSections(role)
    const permitidos = navHrefs(groups)
    for (const item of itemsBarraInferior(groups)) {
      expect(permitidos, `${item.href} no está en el menú de ${role}`).toContain(item.href)
    }
  })

  it.each(ROLES)('rol %s: nunca más de %i destinos (el lugar que queda es para "Menú")', role => {
    expect(itemsBarraInferior(getNavSections(role)).length).toBeLessThanOrEqual(MAXIMO_DESTINOS)
  })

  it.each(ROLES)('rol %s: sin repetidos', role => {
    const hrefs = itemsBarraInferior(getNavSections(role)).map(i => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it.each(ROLES)('rol %s: cada destino tiene etiqueta e ícono', role => {
    for (const item of itemsBarraInferior(getNavSections(role))) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.icon).toBeTruthy()
    }
  })
})

describe('itemsBarraInferior — qué le toca a cada rol', () => {
  it('asesor: lo que hace todo el día con el teléfono en la mano', () => {
    expect(itemsBarraInferior(getNavSections('asesor')).map(i => i.href)).toEqual([
      '/inicio',
      '/tasks',
      '/inbox',
      '/crm',
    ])
  })

  it('coordinador y admin llegan a los mismos cuatro', () => {
    expect(itemsBarraInferior(getNavSections('coordinador')).map(i => i.href)).toEqual([
      '/inicio', '/tasks', '/inbox', '/crm',
    ])
    expect(itemsBarraInferior(getNavSections('admin')).map(i => i.href)).toEqual([
      '/inicio', '/tasks', '/inbox', '/crm',
    ])
  })

  it('el abogado tiene dos pantallas y la barra muestra esas dos, no cuatro inventadas', () => {
    const items = itemsBarraInferior(getNavSections('abogado'))
    expect(items.map(i => i.href)).toEqual(['/tasks', '/properties/review'])
    // Y sobre todo: NADA del CRM comercial, que es lo que el abogado no ve.
    expect(items.map(i => i.href)).not.toContain('/crm')
    expect(items.map(i => i.href)).not.toContain('/inbox')
  })

  it('el Inbox conserva su contador: la barra usa el ítem del menú, no una copia', () => {
    const inbox = itemsBarraInferior(getNavSections('asesor')).find(i => i.href === '/inbox')
    expect(inbox?.badge).toBe('inbox')
  })
})

describe('destinoActivo — uno solo encendido', () => {
  const items = itemsBarraInferior(getNavSections('asesor'))

  it('coincidencia exacta', () => {
    expect(destinoActivo(items, '/inbox')).toBe('/inbox')
  })

  it('una pantalla de adentro enciende su sección', () => {
    expect(destinoActivo(items, '/crm/algo')).toBe('/crm')
  })

  it('fuera de los cuatro, ninguno', () => {
    expect(destinoActivo(items, '/redes-sociales')).toBeNull()
  })

  it('gana el más específico, nunca los dos a la vez', () => {
    const conAmbos = itemsBarraInferior(getNavSections('abogado'))
    expect(conAmbos.map(i => i.href)).toContain('/properties/review')
    // Con `/properties` y `/properties/review` juntos, el prefijo corto no
    // puede robarle el encendido al largo.
    expect(destinoActivo(
      [{ href: '/properties', label: 'Propiedades', icon: conAmbos[0].icon },
       { href: '/properties/review', label: 'Revisión legal', icon: conAmbos[0].icon }],
      '/properties/review',
    )).toBe('/properties/review')
  })

  it('un prefijo a medias no cuenta (`/tasksomething` no es `/tasks`)', () => {
    expect(destinoActivo(items, '/tasksomething')).toBeNull()
  })
})
