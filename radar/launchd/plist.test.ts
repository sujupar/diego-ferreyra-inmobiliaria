import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extraerEnvRadar, parseRama, renderPlist, validarRama } from './plist'

const tpl = readFileSync(join(__dirname, 'ar.inmodf.radar-referencias.plist.tpl'), 'utf8')

describe('renderPlist', () => {
  const xml = renderPlist(tpl, { home: '/Users/apple' })
  it('resuelve todos los marcadores', () => expect(xml).not.toMatch(/\{\{/))
  it('programa las 8:00 sin correr al cargar', () => {
    expect(xml).toMatch(/<key>Hour<\/key>\s*<integer>8<\/integer>/)
    expect(xml).toMatch(/<key>Minute<\/key>\s*<integer>0<\/integer>/)
    expect(xml).toMatch(/<key>RunAtLoad<\/key>\s*<false\/>/)
  })
  it('el PATH incluye homebrew y ~/.local/bin', () => {
    expect(xml).toContain('/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Users/apple/.local/bin')
    expect(xml).toContain('<string>/Users/apple</string>')
  })
  it('apunta al script y al log del clon propio', () => {
    expect(xml).toContain('/Users/apple/.radar-referencias/app/radar/correr-diario.sh')
    expect(xml).toContain('/Users/apple/.radar-referencias/logs/launchd.log')
  })
  it('escapa XML en el home', () => expect(renderPlist(tpl, { home: '/Users/a&b' })).toContain('/Users/a&amp;b'))
})

describe('parseRama', () => {
  it('main por defecto', () => expect(parseRama([])).toBe('main'))
  it('--rama X y --rama=X', () => {
    expect(parseRama(['--rama', 'feat/x'])).toBe('feat/x')
    expect(parseRama(['--rama=feat/x'])).toBe('feat/x')
  })
  it('rechaza vacío y nombres raros', () => {
    expect(() => parseRama(['--rama'])).toThrow()
    expect(() => validarRama('a;rm -rf')).toThrow()
    expect(() => validarRama('-x')).toThrow()
  })
})

describe('extraerEnvRadar', () => {
  it('copia solo las dos claves', () => {
    const r = extraerEnvRadar('A=1\nNEXT_PUBLIC_SUPABASE_URL=https://x\nSUPABASE_SERVICE_ROLE_KEY=k\nOTRA=secreta\n')
    expect(r).toBe('NEXT_PUBLIC_SUPABASE_URL=https://x\nSUPABASE_SERVICE_ROLE_KEY=k\n')
  })
  it('null si falta una', () => expect(extraerEnvRadar('NEXT_PUBLIC_SUPABASE_URL=u\n')).toBeNull())
})
