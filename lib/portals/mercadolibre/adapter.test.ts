import { describe, it, expect } from 'vitest'
import { esDescripcionInexistente } from './adapter'
import { PortalAdapterError } from '../types'

/**
 * `leerAviso` necesita distinguir "este ítem no tiene descripción" (404 real)
 * de cualquier otro fallo del GET (red, auth, 5xx) — un fallo transitorio leído
 * como "vacío" podría hacer que una edición posterior pise una descripción real
 * que simplemente no se pudo leer. `original` es el detalle crudo que arma
 * `fetchConTraduccion` (client.ts): `` `ML ${status} ${path}: ${text}` ``.
 */
describe('esDescripcionInexistente', () => {
  it('un 404 real (sin descripción) → true', () => {
    const err = new PortalAdapterError(
      'MercadoLibre rechazó el aviso (error 404).',
      'mercadolibre', 'unknown', false,
      'ML 404 /items/MLA123/description: {"message":"Resource not found","error":"not_found","status":404}',
    )
    expect(esDescripcionInexistente(err)).toBe(true)
  })

  it('un 500 (caída de ML) → false, no se lee como "sin descripción"', () => {
    const err = new PortalAdapterError(
      'MercadoLibre tuvo un problema de su lado. Reintentá en unos minutos.',
      'mercadolibre', 'unknown', true,
      'ML 500 /items/MLA123/description: Internal Server Error',
    )
    expect(esDescripcionInexistente(err)).toBe(false)
  })

  it('un error de red sin PortalAdapterError → false', () => {
    expect(esDescripcionInexistente(new TypeError('fetch failed'))).toBe(false)
  })

  it('un 401 (credenciales) → false', () => {
    const err = new PortalAdapterError(
      'MercadoLibre rechazó las credenciales. Hay que volver a conectar la cuenta.',
      'mercadolibre', 'auth', false,
      'ML 401 /items/MLA123/description: {"message":"invalid_token"}',
    )
    expect(esDescripcionInexistente(err)).toBe(false)
  })
})
