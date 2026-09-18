import { describe, it, expect } from 'vitest'
import { PLANTILLA_SIN_BOTON, elegirPlantillaDelAviso } from './plantilla-del-aviso'
import { CUERPOS_DE_PLANTILLA, cantidadDeVariables } from '../whatsapp/cuerpos'

describe('elegirPlantillaDelAviso', () => {
  it('con link al chat, sale la plantilla con botón y el botón lleva el código', () => {
    expect(elegirPlantillaDelAviso('consulta_portal_v2', 'Kx7mQ2p')).toEqual({
      templateName: 'consulta_portal_v2',
      urlButtonParam: 'Kx7mQ2p',
    })
  })

  it('SIN link al chat, sale la gemela sin botón — la #407 que Meta rechazó con 131008', () => {
    expect(elegirPlantillaDelAviso('consulta_portal_v2', undefined)).toEqual({
      templateName: 'consulta_portal_util',
    })
  })

  it('un código vacío o nulo cuenta como que no hay link', () => {
    for (const nada of [null, '', '   ']) {
      expect(elegirPlantillaDelAviso('consulta_portal_v2', nada)).toEqual({
        templateName: 'consulta_portal_util',
      })
    }
  })

  it('una plantilla sin botón nunca recibe botón: Meta rechazaría el envío entero', () => {
    expect(elegirPlantillaDelAviso('consulta_portal_util', 'Kx7mQ2p')).toEqual({
      templateName: 'consulta_portal_util',
    })
  })

  it('la alarma de sequía, que no tiene link, sale sin botón aunque la configurada tenga', () => {
    // La alarma no arma link corto: nunca tiene código. Con la v2 configurada
    // en Netlify, hoy fallaría igual que la #407.
    expect(elegirPlantillaDelAviso('consulta_portal_v2')).toEqual({
      templateName: 'consulta_portal_util',
    })
  })

  it('una plantilla desconocida se manda tal cual, sin inventarle botón', () => {
    expect(elegirPlantillaDelAviso('otra_plantilla', 'Kx7mQ2p')).toEqual({ templateName: 'otra_plantilla' })
  })
})

describe('PLANTILLA_SIN_BOTON', () => {
  // Lo que hace SEGURO el cambio de plantilla: la gemela recibe los mismos 10
  // datos. Si tuviera otra cantidad, Meta rechazaría el envío de reemplazo y
  // estaríamos igual que antes. (Que los textos sean idénticos se verificó
  // contra la API de Meta el 2026-09-17; el registro local no tiene la v2.)
  it('toda gemela sin botón está aprobada y espera los mismos 10 datos del aviso', () => {
    for (const gemela of Object.values(PLANTILLA_SIN_BOTON)) {
      const cuerpo = CUERPOS_DE_PLANTILLA[gemela]
      expect(cuerpo, `falta el cuerpo aprobado de ${gemela}`).toBeTruthy()
      expect(cantidadDeVariables(cuerpo)).toBe(10)
    }
  })

  it('una gemela no puede tener botón a su vez: no habría a dónde caer', () => {
    for (const gemela of Object.values(PLANTILLA_SIN_BOTON)) {
      expect(Object.keys(PLANTILLA_SIN_BOTON)).not.toContain(gemela)
    }
  })
})
