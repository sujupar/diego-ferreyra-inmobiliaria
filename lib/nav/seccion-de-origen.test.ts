// crm-cartera-por-rol, tarea 3.10 (design.md D11): la ficha abierta desde el CRM se ve
// como parte del CRM en la barra superior y en el menú.
import { describe, it, expect } from 'vitest'
import { seccionDeOrigen } from './seccion-de-origen'
import { activeHrefAmong, getNavSections, navHrefs, titleForPath } from './sections'

const FICHA = '/contacts/7a636d2f-be56-4492-80ed-3bf23ba90e39'
const grupos = getNavSections('coordinador')
const titulo = (pathname: string, volver: string | null) => titleForPath(grupos, seccionDeOrigen(pathname, volver)).title
const activo = (pathname: string, volver: string | null) => activeHrefAmong(navHrefs(grupos), seccionDeOrigen(pathname, volver))

describe('seccionDeOrigen', () => {
  it('ficha con volver hacia /crm → la sección es el CRM', () => {
    expect(seccionDeOrigen(FICHA, '/crm?etapa=seguimiento')).toBe('/crm')
    expect(titulo(FICHA, '/crm?etapa=seguimiento')).toBe('CRM')
    expect(activo(FICHA, '/crm')).toBe('/crm')
  })
  it('ficha con volver hacia /contacts → Contactos', () => {
    expect(seccionDeOrigen(FICHA, '/contacts?seg=cerrados')).toBe('/contacts')
    expect(titulo(FICHA, '/contacts?seg=cerrados')).toBe('Contactos')
    expect(activo(FICHA, '/contacts')).toBe('/contacts')
  })
  it('ficha sin volver → como hoy (Contactos)', () => {
    expect(seccionDeOrigen(FICHA, null)).toBe(FICHA)
    expect(titulo(FICHA, null)).toBe('Contactos')
    expect(activo(FICHA, null)).toBe('/contacts')
  })
  it.each(['//otro.com', 'https://otro.com', '/crmx', '/pipeline/abc', '/contacts/otra-ficha', 'javascript:alert(1)'])(
    'ficha con un volver inválido (%s) → como hoy',
    (volver) => {
      expect(seccionDeOrigen(FICHA, volver)).toBe(FICHA)
      expect(titulo(FICHA, volver)).toBe('Contactos')
    },
  )
  it('en cualquier otra ruta no cambia nada, aunque traiga volver', () => {
    for (const ruta of ['/crm', '/contacts', '/inicio', '/pipeline/abc', '/contacts/new', '/contacts/abc/editar']) {
      expect(seccionDeOrigen(ruta, '/crm')).toBe(ruta)
    }
  })
  it('el alta de contacto (/contacts/new) no es una ficha', () => {
    expect(seccionDeOrigen('/contacts/new', '/crm')).toBe('/contacts/new')
  })
})
