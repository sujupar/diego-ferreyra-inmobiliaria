import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildTemplatePayload, buildMediaPayload } from './core'

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

describe('buildMediaPayload', () => {
  it('arma un mensaje de imagen con link y caption', () => {
    const p = buildMediaPayload({ to: '5491122334455', mediaType: 'image', link: 'https://x.com/a.jpg', caption: 'Portada' })
    expect(p).toEqual({
      messaging_product: 'whatsapp', to: '5491122334455', type: 'image',
      image: { link: 'https://x.com/a.jpg', caption: 'Portada' },
    })
  })

  it('arma un mensaje de video sin caption (no agrega la clave si no se pasa)', () => {
    const p = buildMediaPayload({ to: '5491122334455', mediaType: 'video', link: 'https://x.com/a.mp4' })
    expect(p.video).toEqual({ link: 'https://x.com/a.mp4' })
    expect(p.video).not.toHaveProperty('caption')
  })

  it('arma un mensaje de documento con filename', () => {
    const p = buildMediaPayload({ to: '5491122334455', mediaType: 'document', link: 'https://x.com/a.pdf', filename: 'plano.pdf' })
    expect(p.document).toEqual({ link: 'https://x.com/a.pdf', filename: 'plano.pdf' })
  })

  it('image/video NUNCA llevan filename aunque se pase por error', () => {
    const p = buildMediaPayload({ to: '54911', mediaType: 'image', link: 'https://x.com/a.jpg', filename: 'no-deberia-estar.pdf' })
    expect(p.image).not.toHaveProperty('filename')
  })
})
