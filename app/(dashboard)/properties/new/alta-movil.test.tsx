// @vitest-environment happy-dom
/**
 * Alta de propiedad en un teléfono. Lo que fijan estos tests no se puede mirar
 * sin navegador, y los tres son cosas que el asesor sufre parado en la vereda:
 * poder sacar la foto del plano en el momento, poder sacar una foto heredada
 * que no quiere, y no tener que cambiar de teclado en cada campo numérico.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewPropertyPage from '@/app/(dashboard)/properties/new/page'

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
    useSearchParams: () => new URLSearchParams(''),
}))

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })))
})

async function montar() {
    const r = render(<NewPropertyPage />)
    await screen.findByRole('heading', { name: 'Captar Propiedad' })
    return r
}

describe('Captar propiedad — piso de celular', () => {
    it('el selector de planos ofrece la cámara: acepta tipos MIME, no solo extensiones', async () => {
        const { container } = await montar()
        const archivo = container.querySelector('input[type="file"]') as HTMLInputElement

        const accept = archivo.getAttribute('accept') ?? ''
        // iOS resuelve mal un `accept` que solo tiene extensiones: abre el
        // explorador de Archivos y ni ofrece "Sacar foto".
        expect(accept).toContain('image/*')
        expect(accept).toContain('application/pdf')
        // Las extensiones se conservan porque son las que entiende Android.
        expect(accept).toContain('.heic')
    })

    it('los campos de plata y metros piden el teclado con separador decimal', async () => {
        const { container } = await montar()
        const precio = container.querySelector('input[inputmode="decimal"]')

        expect(precio).not.toBeNull()
        expect(container.querySelectorAll('input[inputmode="decimal"]').length).toBeGreaterThanOrEqual(4)
    })

    it('ambientes, dormitorios, baños, cocheras y antigüedad piden solo dígitos', async () => {
        const { container } = await montar()
        expect(container.querySelectorAll('input[inputmode="numeric"]').length).toBe(5)
    })

    it('el piso NO fuerza teclado numérico: hay subsuelos y falta el signo menos', async () => {
        const { container } = await montar()
        const etiqueta = Array.from(container.querySelectorAll('label'))
            .find(l => l.textContent?.trim() === 'Piso')
        const campo = etiqueta?.parentElement?.querySelector('input')

        expect(campo).not.toBeNull()
        expect(campo!.getAttribute('inputmode')).toBeNull()
    })

    it('los desplegables crudos tienen alto de dedo en celular', async () => {
        const { container } = await montar()
        const selects = container.querySelectorAll('select')

        expect(selects.length).toBe(5)
        for (const s of selects) expect(s.className).toContain('max-md:min-h-11')
    })
})
