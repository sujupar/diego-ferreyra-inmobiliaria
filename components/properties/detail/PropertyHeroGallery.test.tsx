// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PropertyHeroGallery } from './PropertyHeroGallery'

const photos = Array.from({ length: 22 }, (_, i) => `https://x/${i}.jpg`)

describe('PropertyHeroGallery', () => {
  it('muestra los chips con el material disponible', () => {
    render(<PropertyHeroGallery photos={photos} address="Rivadavia 4820" plansCount={2} hasVideo hasTour />)
    expect(screen.getByText('22 fotos')).toBeInTheDocument()
    expect(screen.getByText('2 planos')).toBeInTheDocument()
    expect(screen.getByText('Video')).toBeInTheDocument()
    expect(screen.getByText('Recorrido 360°')).toBeInTheDocument()
  })

  it('no muestra chips de material que no existe', () => {
    render(<PropertyHeroGallery photos={['https://x/0.jpg']} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText('1 foto')).toBeInTheDocument()
    expect(screen.queryByText('Video')).not.toBeInTheDocument()
    expect(screen.queryByText(/plano/)).not.toBeInTheDocument()
  })

  it('indica cuántas fotos quedan fuera del mosaico', () => {
    render(<PropertyHeroGallery photos={photos} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText('+17')).toBeInTheDocument()
  })

  it('abre el visor al hacer clic en una foto y cierra con ESC', async () => {
    const user = userEvent.setup()
    render(<PropertyHeroGallery photos={photos} address="Rivadavia 4820" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ver foto 1/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin fotos muestra el panel de marca con el botón para subirlas', async () => {
    const onSubirFotos = vi.fn()
    const user = userEvent.setup()
    render(<PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} onSubirFotos={onSubirFotos} />)

    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /subir fotos/i }))
    expect(onSubirFotos).toHaveBeenCalledTimes(1)
  })

  it('mientras sube, el botón muestra el progreso y no se puede volver a tocar', () => {
    render(
      <PropertyHeroGallery
        photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false}
        onSubirFotos={() => {}} subiendoFotos progresoSubida={40}
      />
    )
    const boton = screen.getByRole('button', { name: /subiendo/i })
    expect(boton).toBeDisabled()
    expect(boton).toHaveTextContent('40%')
  })

  it('sin fotos y sin permiso de multimedia (abogado) no ofrece subirlas', () => {
    render(<PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subir fotos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sacar foto/i })).not.toBeInTheDocument()
  })

  it('sin fotos ofrece SACAR una, que es lo que se necesita parado en la propiedad', async () => {
    const onSacarFoto = vi.fn()
    const user = userEvent.setup()
    render(
      <PropertyHeroGallery
        photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false}
        onSubirFotos={() => {}} onSacarFoto={onSacarFoto}
      />
    )

    const boton = screen.getByRole('button', { name: /sacar foto/i })
    // Solo en el teléfono: en escritorio `capture` no abre ninguna cámara útil.
    expect(boton.className).toContain('md:hidden')
    await user.click(boton)
    expect(onSacarFoto).toHaveBeenCalledTimes(1)
  })
})

/**
 * El visor navegaba SOLO con el teclado (`ArrowLeft`/`ArrowRight`), que en un
 * teléfono no existe, y las dos flechas de texto caen ENCIMA de la foto. El
 * gesto que todo el mundo prueba primero no hacía nada.
 */
describe('PropertyHeroGallery — deslizar en el visor', () => {
  function abrirVisor() {
    render(<PropertyHeroGallery photos={photos} address="Rivadavia 4820" plansCount={0} hasVideo={false} hasTour={false} />)
    fireEvent.click(screen.getByRole('button', { name: /ver foto 1/i }))
    return screen.getByTestId('visor-portada')
  }

  it('deslizar hacia la izquierda pasa a la foto siguiente', () => {
    const visor = abrirVisor()
    expect(screen.getByText(`1 / ${photos.length}`)).toBeInTheDocument()

    fireEvent.touchStart(visor, { touches: [{ clientX: 320, clientY: 300 }] })
    fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 120, clientY: 310 }] })

    expect(screen.getByText(`2 / ${photos.length}`)).toBeInTheDocument()
  })

  it('deslizar no cierra el visor; un toque sobre el fondo sí', () => {
    const visor = abrirVisor()

    fireEvent.touchStart(visor, { touches: [{ clientX: 320, clientY: 300 }] })
    fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 120, clientY: 300 }] })
    fireEvent.click(visor) // el clic sintético que emite el navegador al soltar
    expect(screen.getByTestId('visor-portada')).toBeInTheDocument()

    fireEvent.click(visor)
    expect(screen.queryByTestId('visor-portada')).not.toBeInTheDocument()
  })

  /**
   * El botón solo sirve si la ficha lo cablea, y eso son DOS cosas que van
   * juntas: pasarle `onSacarFoto` y montar el `<input capture>` FUERA de las
   * pestañas (adentro se desmonta y el `.click()` cae sobre `null` — es el bug
   * documentado en `use-subir-fotos.ts`). La ficha es una pantalla con `fetch`
   * y navegación: renderizarla en un test costaría más de lo que protege, así
   * que se leen las dos líneas.
   */
  it('la ficha cablea la cámara: le pasa el callback Y monta el input fuera de las pestañas', () => {
    const pagina = readFileSync(resolve(__dirname, '../../../app/(dashboard)/properties/[id]/page.tsx'), 'utf8')

    expect(pagina).toContain('onSacarFoto={isAbogado ? undefined : subidaDeFotos.abrirCamara}')
    expect(pagina).toContain('<input {...subidaDeFotos.inputPropsCamara} />')
    // Fuera de las pestañas = antes del bloque que las dibuja.
    expect(pagina.indexOf('inputPropsCamara')).toBeLessThan(pagina.indexOf('<PropertyTabsNav'))
  })

  it('un arrastre vertical no salta de foto (es scroll, o intención de cerrar)', () => {
    const visor = abrirVisor()

    fireEvent.touchStart(visor, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 140, clientY: 400 }] })

    expect(screen.getByText(`1 / ${photos.length}`)).toBeInTheDocument()
  })
})
