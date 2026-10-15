import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { leerMock } = vi.hoisted(() => ({ leerMock: vi.fn() }))
vi.mock('@/lib/visitas/encuesta/publica-servidor', () => ({ leerEncuestaPublica: leerMock }))
vi.mock('next/image', () => ({ default: (p: { src: string; alt: string }) => createElement('img', { src: p.src, alt: p.alt }) }))

import PaginaEncuesta, { metadata } from './page'
import { armarEncuestaPublica } from '@/lib/visitas/encuesta/publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
async function html(token = TOKEN_DE_PRUEBA): Promise<string> {
  return renderToStaticMarkup(await PaginaEncuesta({ params: Promise.resolve({ token }) }))
}

beforeEach(() => {
  leerMock.mockReset().mockResolvedValue(armarEncuestaPublica(encuestaConVisitaDePrueba(), { regalo: { titulo: 'Guía de Caballito', portada: null }, regaloPorWhatsapp: false, ahora: AHORA }))
})

describe('/encuesta/[token]', () => {
  it('la bienvenida sale armada del servidor, visible (sin opacity:0 ni animación) y sin datos de más', async () => {
    const h = await html()
    expect(h).toContain('Mariana, este regalo es tuyo.')
    expect(h).toContain('Te lleva menos de un minuto.')
    expect(h).toContain('Doblas 248')
    expect(h).not.toMatch(/opacity:\s*0[;"]/)
    expect(h).not.toContain('encuesta-entra')
    expect(h).not.toContain('Gómez')
    expect(h).not.toContain('58234521')
    expect(h).toContain('<main')
  })
  it('vencido o inventado: página amable que no revela nada', async () => {
    leerMock.mockResolvedValue({ tipo: 'vencida' })
    const v = await html()
    expect(v).toContain('Este link venció')
    expect(v).not.toContain('Doblas')
    leerMock.mockResolvedValue({ tipo: 'no_disponible' })
    expect(await html('x')).toContain('Este link no está disponible')
  })
  it('si la base falla, una página de error amable (no la pantalla de error de Next)', async () => {
    leerMock.mockRejectedValue(new Error('boom'))
    expect(await html()).toContain('No pudimos abrir la encuesta')
  })
  it('fuera de los buscadores', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
