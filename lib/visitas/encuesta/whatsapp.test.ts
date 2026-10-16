import { describe, it, expect, vi, beforeEach } from 'vitest'

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn() }))
vi.mock('@/lib/integrations/whatsapp/meta-cloud', () => ({ sendWhatsappTemplate: enviar }))

import { mandarPlantilla, TIMEOUT_WHATSAPP_MS } from './whatsapp'
import { armarEnvioEncuesta, armarEnvioRegalo } from './plantillas'

const TOKEN = 'Ab3xK9pQ2rTz8LmN4vWq1Y'
// armarEnvio* devuelve null solo con una plantilla fuera del catálogo; acá son las conocidas.
const encuesta = armarEnvioEncuesta('encuesta_visita_v1', { nombre: 'Mariana', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })!
const regalo = armarEnvioRegalo('regalo_visita_v1', { nombre: 'Mariana', direccion: 'Doblas 248' })!
const destino = { telefono: '5491158234521', leadId: 'lead-1', propertyId: 'prop-1', sentBy: 'user-1' }

beforeEach(() => { enviar.mockReset(); enviar.mockResolvedValue({ ok: true, skipped: false, messageId: 'wamid.1' }) })

describe('mandarPlantilla', () => {
  it('la encuesta: origen, idioma, botón con el token, techo de 8 s y el texto que recibe la persona', async () => {
    expect(await mandarPlantilla(encuesta, destino)).toEqual({ ok: true, modoPrueba: false, messageId: 'wamid.1' })
    expect(enviar).toHaveBeenCalledWith({
      origen: 'encuesta_visita', to: '5491158234521', templateName: 'encuesta_visita_v1', languageCode: 'es_AR',
      bodyParams: ['Mariana', 'Doblas 248', '14/10', TOKEN], urlButtonParam: TOKEN,
      timeoutMs: TIMEOUT_WHATSAPP_MS, leadId: 'lead-1', propertyId: 'prop-1', sentBy: 'user-1', bodyText: encuesta.bodyText,
    })
  })
  it('el regalo lleva el PDF en el encabezado y NO manda dato de botón', async () => {
    await mandarPlantilla(regalo, { ...destino, documento: { link: 'https://firmada/pdf', nombre: 'Guía.pdf' } })
    const llamada = enviar.mock.calls[0][0]
    expect(llamada.headerMedia).toEqual({ type: 'document', link: 'https://firmada/pdf', filename: 'Guía.pdf' })
    expect(llamada).not.toHaveProperty('urlButtonParam')
  })
  it('plantilla con encabezado sin documento (o al revés) NO sale: Meta la rechazaría entera', async () => {
    expect(await mandarPlantilla(regalo, destino)).toEqual({ ok: false, error: 'La plantilla necesita el PDF y no vino', codigo: null })
    expect(await mandarPlantilla(encuesta, { ...destino, documento: { link: 'x', nombre: 'y' } }))
      .toEqual({ ok: false, error: 'La plantilla no lleva documento', codigo: null })
    expect(enviar).not.toHaveBeenCalled()
  })
  it('modo prueba y rechazo de Meta se distinguen', async () => {
    enviar.mockResolvedValueOnce({ ok: true, skipped: true })
    expect(await mandarPlantilla(encuesta, destino)).toEqual({ ok: true, modoPrueba: true, messageId: null })
    enviar.mockResolvedValueOnce({ ok: false, skipped: false, error: 'Template not found', errorCode: 132001 })
    expect(await mandarPlantilla(encuesta, destino)).toEqual({ ok: false, error: 'Template not found', codigo: 132001 })
  })
})
