import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }))

import { PaginaVideo } from './PaginaVideo'

const base = { codigo: 'k7Hq2mXb9T', titular: 'Ana, antes de tu tasación mirá este caso', medir: true, segundosPrevios: 0 }

describe('página del video de bienvenida (lo que sale del servidor)', () => {
  it('muestra logo, titular con el nombre, subtítulo, video y el botón de WhatsApp', () => {
    const html = renderToStaticMarkup(<PaginaVideo {...base} />)
    expect(html).toContain('Diego Ferreyra, Martillero Público')
    expect(html).toContain('Ana, antes de tu tasación mirá este caso')
    expect(html).toContain('USD 16.606 más en mano')
    expect(html).toContain('aria-label="Reproducir video"')
    expect(html).toContain('Escribinos por WhatsApp')
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
