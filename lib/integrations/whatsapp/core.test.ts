import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildTemplatePayload } from './core'

afterEach(() => vi.unstubAllEnvs())

describe('buildTemplatePayload', () => {
  it('arma el body con los parámetros en orden', () => {
    const p = buildTemplatePayload({ to: '5491122334455', templateName: 't', languageCode: 'es_AR', bodyParams: ['a', 'b'] })
    expect(p.template.components[0]).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }],
    })
  })

  it('agrega el botón URL cuando se pasa urlButtonParam', () => {
    const p = buildTemplatePayload({ to: '54911', templateName: 't', languageCode: 'es_AR', bodyParams: ['a'], urlButtonParam: 'Abc23Xyz99' })
    expect(p.template.components[1]).toEqual({
      type: 'button', sub_type: 'url', index: '0',
      parameters: [{ type: 'text', text: 'Abc23Xyz99' }],
    })
  })

  it('sin urlButtonParam no agrega componentes de botón', () => {
    const p = buildTemplatePayload({ to: '54911', templateName: 't', languageCode: 'es_AR', bodyParams: ['a'] })
    expect(p.template.components).toHaveLength(1)
  })
})
