import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Paso { metodo: string; args: unknown[] }
interface Llamada { tabla: string; pasos: Paso[] }
interface Respuesta { data: unknown; error: { message: string } | null }

const { registro } = vi.hoisted(() => {
  const registro = {
    llamadas: [] as Llamada[],
    responder: (_l: Llamada): Respuesta => ({ data: null, error: null }),
    rpcs: [] as Array<{ nombre: string; args: unknown }>,
    rpcRespuesta: { data: true, error: null } as Respuesta,
    storage: [] as Array<{ bucket: string; metodo: string; args: unknown[] }>,
    storageRespuesta: (_metodo: string): Respuesta => ({ data: { signedUrl: 'https://firmada', token: 'tk', path: 'p' }, error: null }),
  }
  return { registro }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const llamada: Llamada = { tabla, pasos: [] }
      registro.llamadas.push(llamada)
      const cadena: object = new Proxy({}, {
        get(_o, prop) {
          if (prop === 'then') {
            return (ok: (r: Respuesta) => unknown, mal: (e: unknown) => unknown) =>
              Promise.resolve().then(() => registro.responder(llamada)).then(ok, mal)
          }
          return (...args: unknown[]) => { llamada.pasos.push({ metodo: String(prop), args }); return cadena }
        },
      })
      return cadena
    },
    rpc: async (nombre: string, args: unknown) => { registro.rpcs.push({ nombre, args }); return registro.rpcRespuesta },
    storage: {
      from: (bucket: string) => new Proxy({}, {
        get: (_o, metodo) => async (...args: unknown[]) => {
          registro.storage.push({ bucket, metodo: String(metodo), args })
          return registro.storageRespuesta(String(metodo))
        },
      }),
    },
  }),
}))

import * as datos from './datos'
import { encuestaDePrueba } from '@/test/visitas/encuesta-de-prueba'

const pasos = (l: Llamada, metodo: string) => l.pasos.filter(p => p.metodo === metodo).map(p => p.args)
const FILA = encuestaDePrueba()
const AHORA = new Date('2026-10-15T15:00:00Z')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  registro.llamadas = []; registro.rpcs = []; registro.storage = []
  registro.responder = () => ({ data: FILA, error: null })
  registro.rpcRespuesta = { data: true, error: null }
  registro.storageRespuesta = () => ({ data: { signedUrl: 'https://firmada', token: 'tk', path: 'p' }, error: null })
})

describe('ajustes', () => {
  it('lee la fila única', async () => {
    registro.responder = () => ({ data: { envio_automatico: true, solo_con_regalo: false, regalo_por_whatsapp: false, telefonos_prueba: ['5491158234521'] }, error: null })
    expect(await datos.leerAjustesEncuesta()).toEqual({ envio_automatico: true, solo_con_regalo: false, regalo_por_whatsapp: false, telefonos_prueba: ['5491158234521'] })
    expect(pasos(registro.llamadas[0], 'eq')).toEqual([['id', true]])
  })
  it('un error o una fila rara NO lanza: devuelve null (fail-closed)', async () => {
    registro.responder = () => ({ data: null, error: { message: 'boom' } })
    expect(await datos.leerAjustesEncuesta()).toBeNull()
    registro.responder = () => ({ data: { envio_automatico: 'si', solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: [] }, error: null })
    expect(await datos.leerAjustesEncuesta()).toBeNull()
  })
})

describe('encuesta', () => {
  it('asegurar: upsert que no pisa (UNIQUE visit_id) y relectura', async () => {
    const r = await datos.asegurarEncuesta({ visitId: FILA.visit_id, token: FILA.token, expiresAt: FILA.expires_at, actorId: null })
    expect(pasos(registro.llamadas[0], 'upsert')).toEqual([[
      { visit_id: FILA.visit_id, token: FILA.token, expires_at: FILA.expires_at, created_by: null },
      { onConflict: 'visit_id', ignoreDuplicates: true },
    ]])
    expect(pasos(registro.llamadas[1], 'eq')).toEqual([['visit_id', FILA.visit_id]])
    expect(r.token).toBe(FILA.token)
  })
  it('lee con la visita y la propiedad anidadas, aplanadas campo por campo', async () => {
    registro.responder = () => ({
      data: { ...FILA, visita: { id: FILA.visit_id, property_id: 'p1', client_name: 'Mariana', client_phone: null,
        scheduled_at: '2026-10-14T13:30:00+00:00', status: 'completed', advisor_id: null, lead_id: null,
        propiedad: { id: 'p1', address: 'Doblas 248', neighborhood: null, photos: [], asking_price: '150000', currency: 'USD',
          property_type: 'departamento', amenities: [], garages: 1, floor: 3, expensas: null } } },
      error: null,
    })
    const r = await datos.leerEncuestaConVisita({ token: FILA.token })
    expect(pasos(registro.llamadas[0], 'eq')).toEqual([['token', FILA.token]])
    expect(r?.visita.propiedad?.asking_price).toBe(150000)
    expect(r?.visita.status).toBe('completed')
  })
  it('un estado de envío desconocido falla ruidoso (nunca un dato a medias)', async () => {
    registro.responder = () => ({ data: { ...FILA, send_status: 'mandada' }, error: null })
    await expect(datos.leerEncuestaDeVisita(FILA.visit_id)).rejects.toThrow('estado de envío desconocido')
  })
  it('guardar un paso solo si no está terminada ni vencida', async () => {
    registro.responder = () => ({ data: { id: FILA.id }, error: null })
    expect(await datos.guardarPaso(FILA.id, { liked: true, last_step: 'gusto' }, AHORA)).toBe(true)
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ liked: true, last_step: 'gusto' }]])
    expect(pasos(l, 'is')).toEqual([['completed_at', null]])
    expect(pasos(l, 'gt')).toEqual([['expires_at', AHORA.toISOString()]])
    registro.responder = () => ({ data: null, error: null })
    expect(await datos.guardarPaso(FILA.id, { liked: true, last_step: 'gusto' }, AHORA)).toBe(false)
  })
  it('completar es una reserva atómica (completed_at IS NULL): la segunda vez no devuelve nada', async () => {
    const contacto = { contact_phone: '5491158234521', contact_email: null, wants_similar: true }
    expect((await datos.completarEncuesta(FILA.id, contacto, AHORA))?.id).toBe(FILA.id)
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ ...contacto, completed_at: AHORA.toISOString() }]])
    expect(pasos(l, 'is')).toEqual([['completed_at', null]])
    registro.responder = () => ({ data: null, error: null })
    expect(await datos.completarEncuesta(FILA.id, contacto, AHORA)).toBeNull()
  })
  it('registrarUso llama a la función con el tope', async () => {
    expect(await datos.registrarUso(FILA.token, 'abierta')).toBe(true)
    expect(registro.rpcs).toEqual([{ nombre: 'visit_survey_registrar', args: { p_token: FILA.token, p_tipo: 'abierta', p_max: datos.MAX_ESCRITURAS_POR_LINK } }])
    registro.rpcRespuesta = { data: false, error: null }
    expect(await datos.registrarUso(FILA.token, 'escritura')).toBe(false)
  })
  it('reservarEnvio: UPDATE condicional (candado libre o vencido), devuelve si lo tomó', async () => {
    registro.responder = () => ({ data: [{ id: FILA.id }], error: null })
    expect(await datos.reservarEnvio(FILA.id, 30)).toBe(true)
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')[0][0]).toHaveProperty('send_lock_until')
    expect(pasos(l, 'eq')).toEqual([['id', FILA.id]])
    expect(pasos(l, 'or')[0][0]).toMatch(/^send_lock_until\.is\.null,send_lock_until\.lt\."\d{4}-\d{2}-\d{2}T/)
    registro.responder = () => ({ data: [], error: null })
    expect(await datos.reservarEnvio(FILA.id, 30)).toBe(false)
  })
  it('liberarEnvio limpia el candado y no lanza si falla', async () => {
    await datos.liberarEnvio(FILA.id)
    expect(pasos(registro.llamadas[0], 'update')).toEqual([[{ send_lock_until: null }]])
    registro.responder = () => ({ data: null, error: { message: 'boom' } })
    await expect(datos.liberarEnvio(FILA.id)).resolves.toBeUndefined()
  })
})

describe('avisos', () => {
  it('reservar pasa de pendiente a enviando solo en encuestas terminadas', async () => {
    registro.responder = () => ({ data: { id: FILA.id }, error: null })
    expect(await datos.reservarAviso(FILA.id, 'equipo')).toBe(true)
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')[0][0]).toMatchObject({ team_notice_status: 'enviando' })
    expect(pasos(l, 'eq')).toEqual([['id', FILA.id], ['team_notice_status', 'pendiente']])
    expect(pasos(l, 'not')).toEqual([['completed_at', 'is', null]])
  })
  it('cerrar solo toca una reserva propia (estado enviando)', async () => {
    await datos.cerrarAviso(FILA.id, 'regalo_whatsapp', 'enviado', { waMessageId: 'wamid.9' })
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ gift_whatsapp_status: 'enviado', gift_wa_message_id: 'wamid.9' }]])
    expect(pasos(l, 'eq')).toEqual([['id', FILA.id], ['gift_whatsapp_status', 'enviando']])
  })
  it('pendientes: terminadas en la ventana, con intentos bajo el tope, algún canal pendiente', async () => {
    registro.responder = () => ({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    const ids = await datos.encuestasConAvisosPendientes({ desde: '2026-10-08T15:00:00.000Z', hasta: '2026-10-15T14:58:00.000Z' }, 3)
    const l = registro.llamadas[0]
    expect(ids).toEqual(['a', 'b'])
    expect(pasos(l, 'gte')).toEqual([['completed_at', '2026-10-08T15:00:00.000Z']])
    expect(pasos(l, 'lte')).toEqual([['completed_at', '2026-10-15T14:58:00.000Z']])
    expect(pasos(l, 'lt')).toEqual([['notice_attempts', 3]])
    expect(pasos(l, 'or')).toEqual([['team_notice_status.eq.pendiente,gift_whatsapp_status.eq.pendiente,gift_email_status.eq.pendiente']])
  })
})

describe('Storage', () => {
  it('firma una descarga en el bucket privado con el nombre del archivo', async () => {
    expect(await datos.urlFirmada('properties/x/regalo-y.pdf', 600, 'Guía.pdf')).toBe('https://firmada')
    expect(registro.storage).toEqual([{ bucket: 'visit-survey-gifts', metodo: 'createSignedUrl', args: ['properties/x/regalo-y.pdf', 600, { download: 'Guía.pdf' }] }])
  })
  it('una firma que falla devuelve null (no lanza)', async () => {
    registro.storageRespuesta = () => ({ data: null, error: { message: 'Object not found' } })
    expect(await datos.urlFirmada('x', 60)).toBeNull()
    expect(await datos.existeArchivo('x')).toBe(false)
  })
  it('infoArchivo lee tamaño y mimetype REALES listando la carpeta, nunca lo declarado', async () => {
    registro.storageRespuesta = (metodo) => metodo === 'list'
      ? { data: [{ name: 'regalo-y.pdf', metadata: { size: 12345, mimetype: 'application/pdf' } }], error: null }
      : { data: null, error: null }
    expect(await datos.infoArchivo('properties/x/regalo-y.pdf')).toEqual({ bytes: 12345, mimetype: 'application/pdf' })
    expect(registro.storage.at(-1)).toEqual({ bucket: 'visit-survey-gifts', metodo: 'list', args: ['properties/x', { search: 'regalo-y.pdf' }] })
  })
  it('infoArchivo: sin el archivo en la lista (no subió), metadata incompleta, o un error: null', async () => {
    registro.storageRespuesta = () => ({ data: [], error: null })
    expect(await datos.infoArchivo('properties/x/regalo-y.pdf')).toBeNull()
    registro.storageRespuesta = () => ({ data: [{ name: 'regalo-y.pdf', metadata: {} }], error: null })
    expect(await datos.infoArchivo('properties/x/regalo-y.pdf')).toBeNull()
    registro.storageRespuesta = () => ({ data: null, error: { message: 'boom' } })
    expect(await datos.infoArchivo('properties/x/regalo-y.pdf')).toBeNull()
  })
})
