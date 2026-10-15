/**
 * Pruebas de `cron-secreto.ts` (grupo A de la revisión final E2):
 * `scripts/apply-cron-visit-reminders-pg.ts` armaba el SQL con
 * `sql.replaceAll('__SECRETO__', secreto)` — con reemplazo de tipo STRING, el motor
 * interpreta patrones especiales (`$&`, `$$`, `$'`...) dentro del VALOR, así que un
 * secreto que contenga alguno de esos corrompe el SQL generado (p. ej. `$&` se
 * reemplaza por el propio texto matcheado, `__SECRETO__`, en vez del secreto real).
 */
import { describe, expect, it } from 'vitest'
import { reemplazarPlaceholder, validarSecretoCron, validarSitioHttps } from './cron-secreto'

describe('validarSecretoCron', () => {
  it('acepta un secreto alfanumérico con guiones y guion bajo', () => {
    expect(() => validarSecretoCron('abc123_-XYZ')).not.toThrow()
  })

  it('rechaza un secreto vacío', () => {
    expect(() => validarSecretoCron('')).toThrow()
  })

  it('rechaza un secreto con espacios', () => {
    expect(() => validarSecretoCron('abc 123')).toThrow()
  })

  it('rechaza un secreto con comilla simple (inyección SQL)', () => {
    expect(() => validarSecretoCron("abc'; DROP TABLE cron_config; --")).toThrow()
  })

  it('rechaza un secreto con patrón especial de reemplazo ($&, $$, etc.)', () => {
    expect(() => validarSecretoCron('abc$&def')).toThrow()
    expect(() => validarSecretoCron('abc$$def')).toThrow()
  })

  it('el mensaje de error NUNCA incluye el secreto', () => {
    const secretoSensible = 'topsecret-no-imprimir'
    try {
      validarSecretoCron(`${secretoSensible} con espacio`)
      throw new Error('tenía que tirar')
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e)
      expect(mensaje).not.toContain(secretoSensible)
    }
  })
})

describe('validarSitioHttps', () => {
  it('acepta un host simple', () => {
    expect(() => validarSitioHttps('inmodf.com.ar')).not.toThrow()
  })

  it('acepta un host con subdominio', () => {
    expect(() => validarSitioHttps('deploy-preview-12--inmobiliariadiegoferreyra.netlify.app')).not.toThrow()
  })

  it('rechaza vacío', () => {
    expect(() => validarSitioHttps('')).toThrow()
  })

  it('rechaza un host con esquema incluido', () => {
    expect(() => validarSitioHttps('https://inmodf.com.ar')).toThrow()
  })

  it('rechaza un host con path', () => {
    expect(() => validarSitioHttps('inmodf.com.ar/algo')).toThrow()
  })

  it('rechaza un host con espacios o comillas', () => {
    expect(() => validarSitioHttps('inmodf.com.ar; DROP TABLE x')).toThrow()
    expect(() => validarSitioHttps("inmodf.com.ar'")).toThrow()
  })
})

describe('reemplazarPlaceholder', () => {
  it('reemplaza una ocurrencia simple', () => {
    expect(reemplazarPlaceholder('SELECT __X__;', '__X__', 'valor')).toBe('SELECT valor;')
  })

  it('reemplaza TODAS las ocurrencias', () => {
    expect(reemplazarPlaceholder('__X__ y __X__', '__X__', 'v')).toBe('v y v')
  })

  it('NO interpreta patrones especiales de reemplazo dentro del valor ($&)', () => {
    // Con replaceAll(string, string) nativo, "$&" se expande al texto matcheado
    // (el propio placeholder) — reemplazarPlaceholder NO debe hacer eso.
    expect(reemplazarPlaceholder('pre __X__ post', '__X__', 'a$&b')).toBe('pre a$&b post')
  })

  it('NO interpreta $$ dentro del valor', () => {
    expect(reemplazarPlaceholder('__X__', '__X__', 'a$$b')).toBe('a$$b')
  })
})
