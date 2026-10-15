// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { PropertyDetailModal, type DetailProperty } from './PropertyDetailModal'

/**
 * Revisión final, grupo K: el botón "Agendar visita" del modal del listado se
 * mostraba SIEMPRE (abogado, asesor en propiedad ajena, propiedad vendida) y el
 * servidor recién lo frenaba al enviar. Ahora sigue la misma regla que la ficha
 * (`puedeAgendarDesdeElListado`, lib/visitas/acceso.ts), y mientras falte un dato
 * para decidir (la fila del listado no trae commercial_status) no se muestra.
 */
const YO = '11111111-1111-4111-8111-111111111111'
const OTRO = '22222222-2222-4222-8222-222222222222'

const BASE: DetailProperty = {
  id: '33333333-3333-4333-8333-333333333333', address: 'Doblas 248', neighborhood: 'Caballito', city: 'CABA',
  property_type: 'Departamento', asking_price: 220000, currency: 'USD', status: 'approved', photos: [],
  assigned_to: YO, commercial_status: 'disponible',
}

function pintar(property: DetailProperty, rol: string | null, usuario: string | undefined = YO) {
  render(<PropertyDetailModal property={property} open onOpenChange={vi.fn()} currentUserId={usuario} rol={rol} onScheduleVisit={vi.fn()} />)
}
const boton = () => screen.queryByRole('button', { name: /Agendar visita/ })

describe('PropertyDetailModal — botón "Agendar visita"', () => {
  it('el asesor dueño de una propiedad captada y disponible lo ve', () => {
    pintar(BASE, 'asesor')
    expect(boton()).toBeInTheDocument()
  })
  it('el abogado no lo ve', () => {
    pintar(BASE, 'abogado')
    expect(boton()).not.toBeInTheDocument()
  })
  it('un asesor en una propiedad ajena no lo ve', () => {
    pintar({ ...BASE, assigned_to: OTRO }, 'asesor')
    expect(boton()).not.toBeInTheDocument()
  })
  it('un coordinador lo ve en una propiedad ajena', () => {
    pintar({ ...BASE, assigned_to: OTRO }, 'coordinador')
    expect(boton()).toBeInTheDocument()
  })
  it('en una propiedad vendida nadie lo ve', () => {
    pintar({ ...BASE, commercial_status: 'vendida' }, 'admin')
    expect(boton()).not.toBeInTheDocument()
  })
  it('con la fila del listado (sin commercial_status todavía) no se muestra hasta saberlo', () => {
    const filaDelListado: DetailProperty = { ...BASE }
    delete filaDelListado.commercial_status
    pintar(filaDelListado, 'admin')
    expect(boton()).not.toBeInTheDocument()
  })
  it('con un rol que no es del catálogo o sin rol no se muestra', () => {
    pintar(BASE, '')
    expect(boton()).not.toBeInTheDocument()
  })
})
