// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { StepFields } from './StepFields'
import type { MlAttributesResponse, MlDraft, MlPreviewProperty } from '../types'

/**
 * El paso "Campos" es donde falló la publicación en vivo el 2026-08-06: no
 * mostró ningún campo, marcó "Completitud 100%" y dejó avanzar hasta Publicar,
 * donde MercadoLibre rechazó el aviso. La causa de fondo (la categoría) está
 * arreglada en el mapa; estos tests cubren la SEGUNDA falla, la que convirtió
 * un error claro en un misterio: una lista vacía leída como "está todo bien".
 */

const property: MlPreviewProperty = {
  id: 'p1', title: 'Depto en Palermo', description: 'x'.repeat(120),
  photos: ['https://x/1.jpg'], asking_price: 180000, currency: 'USD',
  address: 'Honduras 5000', neighborhood: 'Palermo', city: 'CABA', province: 'CABA',
  rooms: 3, bedrooms: 2, bathrooms: 1, covered_area: 70, total_area: 80,
  latitude: -34.58, longitude: -58.43, video_url: null, tour_3d_url: null,
}

const draft: MlDraft = {
  photos: property.photos, videoUrl: null, tour3dUrl: null, mediaChoice: 'none',
  mlAttributes: {}, listingType: 'free', title: property.title!, description: property.description!,
  askingPrice: property.asking_price, latitude: property.latitude, longitude: property.longitude,
  address: property.address,
}

function renderStep(over: {
  attrs?: MlAttributesResponse | null
  attrsError?: string | null
  mlAttributes?: MlDraft['mlAttributes']
} = {}) {
  const onValidityChange = vi.fn()
  render(
    <StepFields
      property={property}
      attrs={over.attrs ?? null}
      attrsError={over.attrsError ?? null}
      draft={{ ...draft, mlAttributes: over.mlAttributes ?? {} }}
      onChange={() => {}}
      onValidityChange={onValidityChange}
    />,
  )
  return { onValidityChange }
}

function attrsCon(required: { id: string; name: string }[]): MlAttributesResponse {
  return {
    categoryId: 'MLA401686',
    required: required.map(r => ({ ...r, valueType: 'string' as const, required: true })),
    recommended: [],
    prefill: {},
    listingTypes: [{ id: 'silver', label: 'Plata' }],
    listingTypeSelected: 'silver',
    mediaChoice: 'none',
  }
}

describe('StepFields — sin campos NO es "todo listo"', () => {
  it('si no se pudieron traer los campos, bloquea el paso', () => {
    const { onValidityChange } = renderStep({ attrs: null })
    expect(onValidityChange).toHaveBeenCalledWith(false)
    expect(onValidityChange).not.toHaveBeenCalledWith(true)
  })

  it('muestra el motivo real del error, no una frase genérica tranquilizadora', () => {
    renderStep({
      attrs: null,
      attrsError: 'MercadoLibre no devolvió ningún campo para la categoría MLA1472.',
    })
    expect(screen.getByText(/MLA1472/)).toBeInTheDocument()
    // La frase vieja prometía algo falso: que igual se iba a publicar.
    expect(screen.queryByText(/se publicará con los datos básicos/i)).not.toBeInTheDocument()
  })

  it('sin campos NO muestra "Completitud 100%"', () => {
    renderStep({ attrs: null })
    expect(screen.queryByText(/Completitud/)).not.toBeInTheDocument()
  })

  it('una categoría que devuelve cero campos también bloquea', () => {
    // Es el síntoma exacto de haber preguntado por una categoría padre: ML
    // responde 200 con una lista vacía, que para él no es un error.
    const { onValidityChange } = renderStep({ attrs: attrsCon([]) })
    expect(onValidityChange).toHaveBeenCalledWith(false)
    expect(onValidityChange).not.toHaveBeenCalledWith(true)
  })
})

describe('StepFields — con campos reales', () => {
  it('bloquea mientras falte un obligatorio y habilita cuando están todos', () => {
    const campos = [{ id: 'ROOMS', name: 'Ambientes' }, { id: 'BEDROOMS', name: 'Dormitorios' }]

    const parcial = renderStep({ attrs: attrsCon(campos), mlAttributes: { ROOMS: { value_name: '3' } } })
    expect(parcial.onValidityChange).toHaveBeenCalledWith(false)
    expect(parcial.onValidityChange).not.toHaveBeenCalledWith(true)

    const completo = renderStep({
      attrs: attrsCon(campos),
      mlAttributes: { ROOMS: { value_name: '3' }, BEDROOMS: { value_name: '2' } },
    })
    expect(completo.onValidityChange).toHaveBeenCalledWith(true)
  })

  it('muestra los campos obligatorios y el porcentaje real', () => {
    renderStep({
      attrs: attrsCon([{ id: 'ROOMS', name: 'Ambientes' }, { id: 'BEDROOMS', name: 'Dormitorios' }]),
      mlAttributes: { ROOMS: { value_name: '3' } },
    })
    expect(screen.getByText('Ambientes')).toBeInTheDocument()
    expect(screen.getByText('Dormitorios')).toBeInTheDocument()
    expect(screen.getByText(/Completitud 50%/)).toBeInTheDocument()
  })
})
