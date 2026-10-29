import { describe, it, expect } from 'vitest'
import {
  pasoInicial, pasoTrasPropiedad, modoTelefono, textoSinTelefono, ordenarCercanasPrimero,
  leerTelefonoIngresado, leerConexion, tituloListo,
} from './agendar-desde-consulta'
import { leerTelefono } from './telefono'
import type { ConsultaEnBandeja } from './tipos'

function c(p: Partial<ConsultaEnBandeja> = {}): ConsultaEnBandeja {
  const telefono = p.telefono === undefined ? '541161400496' : p.telefono
  return {
    id: 'c-1', tipo: 'portal', numero: 640, recibida_at: '2026-10-29T12:24:00Z', canal: 'whatsapp',
    portal: 'zonaprop', nombre: 'Martina Gómez', telefono, email: null, mensaje: null,
    property_id: 'p-1', assigned_to: null, asesor_propiedad: null, aviso_codigo: null, aviso_url: null,
    aviso_direccion: null, aviso_titulo: null, utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(telefono), repetidas: 1, accion: 'agendar',
    propiedad: { address: 'Entre Ríos 2333', neighborhood: 'Martínez' }, asesor_nombre: null,
    ...p,
  }
}

describe('pasoInicial / pasoTrasPropiedad', () => {
  it('sin propiedad, primero se elige la propiedad', () => {
    expect(pasoInicial(c({ property_id: null, propiedad: null }))).toBe('elegir_propiedad')
  })
  it('con propiedad y teléfono que sirve, directo a agendar', () => {
    expect(pasoInicial(c())).toBe('agendar')
  })
  it('con propiedad y teléfono a revisar, primero el teléfono', () => {
    expect(pasoInicial(c({ telefono: '4941-0027' }))).toBe('telefono')
  })
  it('después de elegir la propiedad: el teléfono si no sirve, si no agendar', () => {
    expect(pasoTrasPropiedad(c({ property_id: null, telefono: null }))).toBe('telefono')
    expect(pasoTrasPropiedad(c({ property_id: null }))).toBe('agendar')
  })
})

describe('modoTelefono / textoSinTelefono', () => {
  it('sin teléfono se pide; con uno mal escrito se revisa', () => {
    expect(modoTelefono(c({ telefono: null }))).toBe('pedir')
    expect(modoTelefono(c({ telefono: '   ' }))).toBe('pedir')
    expect(modoTelefono(c({ telefono: '4941-0027' }))).toBe('revisar')
  })
  it('MercadoLibre explica que el portal no lo comparte', () => {
    expect(textoSinTelefono('mercadolibre')).toBe('MercadoLibre no comparte el contacto. Pedile el celular por el chat del portal.')
    expect(textoSinTelefono('zonaprop')).toBe('No dejó teléfono.')
  })
})

describe('ordenarCercanasPrimero', () => {
  const props = [
    { id: '1', neighborhood: 'Coghlan' },
    { id: '2', neighborhood: 'Boedo' },
    { id: '3', neighborhood: null },
    { id: '4', neighborhood: 'boedo' },
  ]
  it('las del barrio que nombra el aviso van primero, sin importar tildes ni mayúsculas', () => {
    const r = ordenarCercanasPrimero(props, ['Departamento 3 ambientes — BOEDO', null])
    expect(r.cercanas.map((p) => p.id)).toEqual(['2', '4'])
    expect(r.resto.map((p) => p.id)).toEqual(['1', '3'])
    expect(r.barrios).toEqual(['Boedo'])
  })
  it('tildes en forma NFD en el aviso y compuestas en el barrio también coinciden', () => {
    const r = ordenarCercanasPrimero([{ id: 'n', neighborhood: 'Núñez' }], ['Casa en Núñez'])
    expect(r.cercanas.map((p) => p.id)).toEqual(['n'])
  })
  it('sin texto del aviso no hay cercanas y el orden queda igual', () => {
    const r = ordenarCercanasPrimero(props, [null, '  '])
    expect(r.cercanas).toEqual([])
    expect(r.resto.map((p) => p.id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('leerTelefonoIngresado', () => {
  it('con las dos partes arma el celular argentino', () => {
    const r = leerTelefonoIngresado({ extranjero: false, caracteristica: '11', numero: '4941-0027', libre: '' })
    expect(r.ok && r.canonico).toBe('+5491149410027')
  })
  it('sin característica no sirve', () => {
    expect(leerTelefonoIngresado({ extranjero: false, caracteristica: '', numero: '4941-0027', libre: '' }).ok).toBe(false)
  })
  it('un número de otro país solo se acepta escrito con +', () => {
    expect(leerTelefonoIngresado({ extranjero: true, caracteristica: '', numero: '', libre: '59899123456' }).ok).toBe(false)
    const r = leerTelefonoIngresado({ extranjero: true, caracteristica: '', numero: '', libre: '+598 99 123 456' })
    expect(r.ok && r.whatsapp).toBe('59899123456')
  })
})

describe('leerConexion', () => {
  it('200 con los dos datos', async () => {
    const r = await leerConexion(new Response(JSON.stringify({ actualizadas: 3, recordado: true }), { status: 200 }))
    expect(r).toEqual({ ok: true, actualizadas: 3, recordado: true })
  })
  it('error con mensaje del servidor', async () => {
    const r = await leerConexion(new Response(JSON.stringify({ error: 'No tenés permiso' }), { status: 403 }))
    expect(r).toEqual({ ok: false, error: 'No tenés permiso' })
  })
  it('HTML de un 504: mensaje legible', async () => {
    const r = await leerConexion(new Response('<HTML>', { status: 504 }))
    expect(r).toEqual({ ok: false, error: 'El servidor tardó demasiado. Probá de nuevo.' })
  })
  it('200 sin la forma esperada no es un éxito', async () => {
    const r = await leerConexion(new Response('{}', { status: 200 }))
    expect(r.ok).toBe(false)
  })
})

describe('tituloListo', () => {
  it('día largo con número y hora', () => {
    expect(tituloListo('2026-10-29', '17:00')).toBe('jueves 29 · 17:00')
  })
  it('fecha inválida: solo la hora', () => {
    expect(tituloListo('xx', '17:00')).toBe('17:00')
  })
})
