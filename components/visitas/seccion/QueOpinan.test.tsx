// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueOpinan } from './QueOpinan'
import type { OpinionPropiedad } from '@/lib/visitas/opiniones'

const OPINION: OpinionPropiedad = {
  propertyId: 'p1', direccion: 'Doblas 248', respuestas: 3,
  leGusto: { valor: 67, base: 3, orientativo: true }, precio: { correcto: 1, alto: 2, bajo: 0 },
  ofertaMediana: { valor: 135000, base: 2, orientativo: true }, moneda: 'USD', diferencia: { valor: -10, base: 2, orientativo: true },
  masGusto: [{ clave: 'luz', etiqueta: 'La luz', cantidad: 2 }], menosGusto: [{ clave: 'ruido', etiqueta: 'El ruido', cantidad: 1 }],
  comentarios: ['No le gustó: <b>El ascensor</b>'],
}

describe('QueOpinan', () => {
  it('sin respuestas: "Sin datos", nunca 0', () => {
    render(<QueOpinan opiniones={[]} modo="seccion" />)
    expect(screen.getByText('Sin datos — todavía nadie respondió la encuesta')).toBeInTheDocument()
  })
  it('sección: por propiedad, con su base y la oferta contra el publicado', () => {
    render(<QueOpinan opiniones={[OPINION]} modo="seccion" />)
    expect(screen.getByText('Doblas 248')).toBeInTheDocument()
    expect(screen.getByText('3 respuestas')).toBeInTheDocument()
    expect(screen.getByText('Les gustó: 67 % (de 3 · orientativo)')).toBeInTheDocument()
    expect(screen.getByText('Precio: 1 correcto · 2 alto · 0 bajo')).toBeInTheDocument()
    expect(screen.getByText('Oferta mediana: US$ 135.000 (10 % debajo del publicado · de 2)')).toBeInTheDocument()
  })
  it('propiedad: también lo que más y menos gustó y los comentarios, como texto', () => {
    const { container } = render(<QueOpinan opiniones={[OPINION]} modo="propiedad" />)
    expect(screen.getByText('La luz (2)')).toBeInTheDocument()
    expect(screen.getByText('El ruido (1)')).toBeInTheDocument()
    expect(screen.getByText('No le gustó: <b>El ascensor</b>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })
  it('sin ofertas en la moneda publicada lo dice', () => {
    render(<QueOpinan opiniones={[{ ...OPINION, ofertaMediana: { valor: null, base: 0, orientativo: false }, diferencia: { valor: null, base: 0, orientativo: false } }]} modo="seccion" />)
    expect(screen.getByText('Oferta mediana: sin ofertas en la moneda publicada')).toBeInTheDocument()
  })
})
