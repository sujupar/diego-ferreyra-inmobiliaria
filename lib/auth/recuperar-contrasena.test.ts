import { describe, it, expect } from 'vitest'
import {
  normalizarEmail,
  construirEnlaceRestablecer,
  validarNuevaContrasena,
  superaLimiteDeEnvios,
  mensajeEnlaceInvalido,
  esTokenConForma,
  LIMITE_ENVIOS,
  VENTANA_LIMITE_MS,
} from './recuperar-contrasena'

describe('normalizarEmail', () => {
  it('pasa a minúsculas y saca los espacios de las puntas', () => {
    expect(normalizarEmail('  FerrDiego32@Gmail.com ')).toBe('ferrdiego32@gmail.com')
  })

  it('devuelve null si no parece un email', () => {
    expect(normalizarEmail('diego')).toBeNull()
    expect(normalizarEmail('')).toBeNull()
    expect(normalizarEmail('a@b')).toBeNull()
  })

  it('devuelve null si es larguísimo (no se manda a Supabase basura de 10 KB)', () => {
    expect(normalizarEmail(`${'a'.repeat(300)}@gmail.com`)).toBeNull()
  })
})

describe('construirEnlaceRestablecer', () => {
  it('arma el enlace a la pantalla de restablecer con el token', () => {
    expect(construirEnlaceRestablecer('https://inmodf.com.ar', 'abc123')).toBe(
      'https://inmodf.com.ar/restablecer-contrasena?token_hash=abc123&type=recovery',
    )
  })

  it('tolera la barra final en la URL base', () => {
    expect(construirEnlaceRestablecer('https://inmodf.com.ar//', 'abc')).toBe(
      'https://inmodf.com.ar/restablecer-contrasena?token_hash=abc&type=recovery',
    )
  })

  it('codifica el token (nunca se pega crudo en la URL)', () => {
    expect(construirEnlaceRestablecer('https://inmodf.com.ar', 'a&b=c')).toContain('token_hash=a%26b%3Dc')
  })

  it('cae al dominio de producción si la base viene vacía', () => {
    expect(construirEnlaceRestablecer('', 'abc')).toBe(
      'https://inmodf.com.ar/restablecer-contrasena?token_hash=abc&type=recovery',
    )
  })

  it('rechaza una base que no sea https (el token no puede viajar a otro lado)', () => {
    expect(construirEnlaceRestablecer('http://inmodf.com.ar', 'abc')).toBe(
      'https://inmodf.com.ar/restablecer-contrasena?token_hash=abc&type=recovery',
    )
    expect(construirEnlaceRestablecer('javascript:alert(1)', 'abc')).toBe(
      'https://inmodf.com.ar/restablecer-contrasena?token_hash=abc&type=recovery',
    )
  })
})

describe('validarNuevaContrasena', () => {
  it('acepta una contraseña válida repetida igual', () => {
    expect(validarNuevaContrasena('casaDiego2026', 'casaDiego2026')).toBeNull()
  })

  it('pide al menos 8 caracteres', () => {
    expect(validarNuevaContrasena('corta1', 'corta1')).toMatch(/8 caracteres/)
  })

  it('avisa si las dos no coinciden', () => {
    expect(validarNuevaContrasena('casaDiego2026', 'casaDiego2025')).toMatch(/no coinciden/)
  })

  it('no acepta solo espacios', () => {
    expect(validarNuevaContrasena('         ', '         ')).toMatch(/espacios/)
  })

  it('no acepta más de 72 caracteres (el resto se ignoraría en silencio)', () => {
    const larga = 'a'.repeat(73)
    expect(validarNuevaContrasena(larga, larga)).toMatch(/72/)
  })

  it('cuenta caracteres con tilde como uno solo, venga como venga escrito', () => {
    // "contraseñá" en NFD son más unidades que caracteres visibles.
    const nfd = 'añoñoño1'.normalize('NFD')
    expect(validarNuevaContrasena(nfd, nfd)).toBeNull()
  })

  it('compara las dos versiones aunque una venga con tildes descompuestas', () => {
    const nfc = 'contraseña1'.normalize('NFC')
    const nfd = 'contraseña1'.normalize('NFD')
    expect(validarNuevaContrasena(nfc, nfd)).toBeNull()
  })
})

describe('superaLimiteDeEnvios', () => {
  it(`deja pasar hasta ${LIMITE_ENVIOS - 1} envíos recientes`, () => {
    expect(superaLimiteDeEnvios(LIMITE_ENVIOS - 1)).toBe(false)
    expect(superaLimiteDeEnvios(0)).toBe(false)
  })

  it(`frena desde el envío número ${LIMITE_ENVIOS + 1} dentro de la ventana`, () => {
    expect(superaLimiteDeEnvios(LIMITE_ENVIOS)).toBe(true)
    expect(superaLimiteDeEnvios(LIMITE_ENVIOS + 5)).toBe(true)
  })

  it('la ventana es de 15 minutos', () => {
    expect(VENTANA_LIMITE_MS).toBe(15 * 60 * 1000)
  })
})

describe('esTokenConForma', () => {
  it('acepta un token hexadecimal como los que genera Supabase', () => {
    expect(esTokenConForma('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c')).toBe(true)
  })

  it('rechaza vacío, nulo o con caracteres raros', () => {
    expect(esTokenConForma(null)).toBe(false)
    expect(esTokenConForma('')).toBe(false)
    expect(esTokenConForma('abc<script>')).toBe(false)
    expect(esTokenConForma('a'.repeat(300))).toBe(false)
  })
})

describe('mensajeEnlaceInvalido', () => {
  it('traduce el error de Supabase de enlace vencido a castellano', () => {
    expect(mensajeEnlaceInvalido('Email link is invalid or has expired')).toBe('Este enlace venció o ya se usó.')
    expect(mensajeEnlaceInvalido('Token has expired or is invalid')).toBe('Este enlace venció o ya se usó.')
  })

  it('devuelve null si el error es otro (red, servidor) para no confundir a la persona', () => {
    expect(mensajeEnlaceInvalido('Failed to fetch')).toBeNull()
  })
})
