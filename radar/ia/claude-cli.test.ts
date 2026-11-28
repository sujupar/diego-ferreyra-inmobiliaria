import { describe, it, expect } from 'vitest'
import { armarArgsClaude, extraerResultado } from './claude-cli'

const sobre = (extra: Record<string, unknown>) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...extra })

describe('extraerResultado', () => {
  it('devuelve el JSON plano del result', () => {
    expect(extraerResultado(sobre({ result: '{"a":1}' }))).toBe('{"a":1}')
  })
  it('saca los cercos ```json … ```', () => {
    expect(extraerResultado(sobre({ result: '```json\n{"a":{"b":2}}\n```' }))).toBe('{"a":{"b":2}}')
  })
  it('recorta el texto de antes y de después del objeto', () => {
    const r = extraerResultado(sobre({ result: 'Acá va: {"a":"tiene } adentro","b":[1]} ¡listo! {no}' }))
    expect(JSON.parse(r)).toEqual({ a: 'tiene } adentro', b: [1] })
  })
  it('tira con el mensaje si is_error', () => {
    expect(() => extraerResultado(sobre({ is_error: true, result: 'Credit balance is too low' }))).toThrow(
      /Credit balance is too low/,
    )
  })
  it('tira si la salida no es JSON', () => {
    expect(() => extraerResultado('Error: algo explotó')).toThrow()
  })
  it('tira si falta result', () => {
    expect(() => extraerResultado(sobre({}))).toThrow()
  })
  it('tira si el result no trae ningún objeto JSON', () => {
    expect(() => extraerResultado(sobre({ result: 'No puedo ayudarte con eso.' }))).toThrow()
  })
})

describe('armarArgsClaude', () => {
  const args = armarArgsClaude({ system: 'SOS UN FILTRO', modelo: 'sonnet', conImagenes: true })
  const sinImg = armarArgsClaude({ system: 'SOS UN FILTRO', modelo: 'sonnet', conImagenes: false })
  const valorDe = (a: string[], flag: string) => a[a.indexOf(flag) + 1]

  it('corre en modo print con salida JSON y el modelo pedido', () => {
    expect(args).toContain('-p')
    expect(valorDe(args, '--output-format')).toBe('json')
    expect(valorDe(args, '--model')).toBe('sonnet')
  })
  it('reemplaza el system prompt de Claude Code por el nuestro, con el aviso de datos no confiables', () => {
    const sys = valorDe(args, '--system-prompt')
    expect(sys.startsWith('SOS UN FILTRO')).toBe(true)
    expect(sys).toMatch(/datos.*nunca instrucciones/i)
  })
  it('con imágenes: Read solo sobre ./imagen-*.jpg y todo lo demás denegado sin preguntar', () => {
    expect(valorDe(args, '--tools')).toBe('Read')
    expect(valorDe(args, '--allowedTools')).toBe('Read(./imagen-*.jpg)')
    expect(args.filter((x, i) => args[i - 1] === '--allowedTools')).toEqual(['Read(./imagen-*.jpg)'])
    expect(valorDe(args, '--permission-mode')).toBe('dontAsk')
  })
  it('sin imágenes: ninguna herramienta', () => {
    expect(valorDe(sinImg, '--tools')).toBe('')
    expect(sinImg).not.toContain('--allowedTools')
    expect(valorDe(sinImg, '--permission-mode')).toBe('dontAsk')
  })
  it('corre aislado: sin settings, MCP, skills ni sesión guardada', () => {
    for (const a of [args, sinImg]) {
      expect(valorDe(a, '--setting-sources')).toBe('')
      expect(a).toContain('--strict-mcp-config')
      expect(a).toContain('--disable-slash-commands')
      expect(a).toContain('--no-session-persistence')
    }
  })
  it('nunca saltea permisos ni usa --bare (pide API key)', () => {
    for (const a of [args, sinImg]) {
      expect(a).not.toContain('--dangerously-skip-permissions')
      expect(a).not.toContain('--bare')
      expect(a).not.toContain('bypassPermissions')
    }
  })
})
