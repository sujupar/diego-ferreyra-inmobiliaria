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
  const args = armarArgsClaude({ system: 'SOS UN FILTRO', modelo: 'sonnet' })
  const valorDe = (flag: string) => args[args.indexOf(flag) + 1]

  it('corre en modo print con salida JSON y el modelo pedido', () => {
    expect(args).toContain('-p')
    expect(valorDe('--output-format')).toBe('json')
    expect(valorDe('--model')).toBe('sonnet')
  })
  it('reemplaza el system prompt de Claude Code por el nuestro', () => {
    expect(valorDe('--system-prompt')).toBe('SOS UN FILTRO')
  })
  it('solo permite la herramienta Read', () => {
    expect(valorDe('--allowedTools')).toBe('Read')
    expect(valorDe('--tools')).toBe('Read')
  })
  it('corre aislado: sin settings, MCP, skills ni sesión guardada', () => {
    expect(valorDe('--setting-sources')).toBe('')
    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--disable-slash-commands')
    expect(args).toContain('--no-session-persistence')
  })
  it('nunca saltea permisos ni usa --bare (pide API key)', () => {
    expect(args).not.toContain('--dangerously-skip-permissions')
    expect(args).not.toContain('--bare')
  })
})
