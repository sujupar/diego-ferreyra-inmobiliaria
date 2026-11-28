import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }))

import { PaginaVideo } from './PaginaVideo'

const base = { codigo: 'k7Hq2mXb9T', titular: 'Ana, lo que vale tu propiedad no es lo que te queda al venderla', medir: true, segundosPrevios: 0 }

describe('página del video de bienvenida (lo que sale del servidor)', () => {
  it('muestra logo, titular con el nombre, subtítulo, video y el botón de WhatsApp', () => {
    const html = renderToStaticMarkup(<PaginaVideo {...base} />)
    expect(html).toContain('Diego Ferreyra, Martillero Público')
    expect(html).toContain('Ana, lo que vale tu propiedad no es lo que te queda al venderla')
    expect(html).toContain('USD 16.606 más en mano')
    expect(html).toContain('aria-label="Reproducir video"')
    expect(html).toContain('Escribinos por WhatsApp')
  })

  it('el valor de la tasación se ve siempre, y las referencias en el orden de los miedos', () => {
    const t = (key: string, clientName: string) => ({ key, clientName, location: 'CABA', title: 't', resultBadge: null, quote: 'q', videoUrl: 'v.mp4', posterUrl: 'p.jpg', isVertical: true })
    const html = renderToStaticMarkup(<PaginaVideo {...base} testimonios={[t('federico', 'Federico'), t('otro', 'Otro'), t('claudia', 'Claudia')]} />)
    expect(html).toContain('Lo que te llevás de la tasación')
    expect(html).toContain('Cuánto te queda en mano')
    expect(html).toContain('Propietarios que ya pasaron por esto')
    expect(html.indexOf('Claudia')).toBeLessThan(html.indexOf('Federico'))
    expect(html).not.toContain('Otro')
  })

  it('sin testimonios, la sección de referencias no aparece', () => {
    expect(renderToStaticMarkup(<PaginaVideo {...base} />)).not.toContain('Propietarios que ya pasaron por esto')
  })

  it('al entrar, "Qué pasa ahora" todavía NO está (aparece a los 30 s de video)', () => {
    const html = renderToStaticMarkup(<PaginaVideo {...base} />)
    expect(html).not.toContain('Qué pasa ahora')
    expect(html).not.toContain('+54 9 11 2292-6434')
  })

  it('si ya había visto 30 s o más en otra visita, el bloque está desde el principio', () => {
    const html = renderToStaticMarkup(<PaginaVideo {...base} segundosPrevios={45} />)
    expect(html).toContain('Qué pasa ahora')
    expect(html).toContain('+54 9 11 2292-6434')
    expect(html).toContain('href="/t/paula.vcf"')
  })

  it('para el equipo: aviso de que no se mide y el bloque a la vista', () => {
    const html = renderToStaticMarkup(<PaginaVideo {...base} medir={false} />)
    expect(html).toContain('Vista del equipo: esta visita no se mide.')
    expect(html).toContain('Qué pasa ahora')
  })

  it('no muestra cuánto dura el video ni ningún formulario', () => {
    const html = renderToStaticMarkup(<PaginaVideo {...base} segundosPrevios={45} />)
    expect(html).not.toMatch(/\b\d{1,2}:\d{2}\b/)
    expect(html).not.toMatch(/<(form|input|textarea|select)\b/)
  })
})
