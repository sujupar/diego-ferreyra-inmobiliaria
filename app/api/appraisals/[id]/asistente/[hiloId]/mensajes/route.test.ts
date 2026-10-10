/**
 * POST /api/appraisals/[id]/asistente/[hiloId]/mensajes
 *
 * Lo que se fija: los candados (abogado y sin acceso → 403), que no se aceptan
 * adjuntos de otra tasación, que el mensaje del asesor se guarda ANTES de llamar
 * al modelo y que un fallo del modelo queda como respuesta `failed` con motivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rutaDeAdjuntoValida, tipoDeAdjunto } from '@/lib/asistente-tasacion/adjuntos'

const { r } = vi.hoisted(() => ({
    r: {
        rol: 'asesor' as string,
        acceso: true,
        guardados: [] as Record<string, unknown>[],
        responder: vi.fn(),
    },
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ storage: { from: () => ({}) } }) }))
vi.mock('@/lib/auth/require-role', () => ({
    requireAuth: vi.fn(async () => ({ id: 'yo', email: 'yo@local', profile: { id: 'yo', role: r.rol } })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessAppraisal: vi.fn(async () => r.acceso) }))
vi.mock('@/lib/asistente-tasacion/repositorio', () => ({
    BUCKET_ADJUNTOS: 'appraisal-chat',
    hiloDeTasacion: vi.fn(async () => ({ id: 'h1', appraisal_id: 't1', title: 'Nueva conversación' })),
    guardarMensaje: vi.fn(async (_sb: unknown, m: Record<string, unknown>) => { r.guardados.push(m); return { id: `m${r.guardados.length}`, adjuntos: [], texto: '', ...m } }),
    actualizarHilo: vi.fn(async () => undefined),
    cargarTasacion: vi.fn(async () => ({ fila: { neighborhood_slug: null, market_period: null }, sujeto: {}, normales: [] })),
    otrasDelBarrio: vi.fn(async () => []),
    listarMensajes: vi.fn(async () => []),
    mensajeDeHilo: vi.fn(async () => null),
}))
vi.mock('@/lib/asistente-tasacion/responder', () => ({ responder: (...a: unknown[]) => r.responder(...a) }))

import { POST } from './route'

const params = Promise.resolve({ id: 't1', hiloId: 'h1' })
const pedido = (body: unknown) => new Request('http://local/x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
    r.rol = 'asesor'; r.acceso = true; r.guardados.length = 0
    r.responder.mockReset()
    r.responder.mockResolvedValue({ bloques: [{ tipo: 'resumen', texto: 'ok' }], propuesta: null, model: 'gpt-4.1' })
})

describe('candados', () => {
    it('el abogado no usa el asistente', async () => {
        r.rol = 'abogado'
        expect((await POST(pedido({ texto: 'hola' }), { params })).status).toBe(403)
    })
    it('sin acceso a la tasación, 403', async () => {
        r.acceso = false
        expect((await POST(pedido({ texto: 'hola' }), { params })).status).toBe(403)
    })
    it('un adjunto con ruta de OTRA tasación se rechaza', async () => {
        const res = await POST(pedido({ texto: 'mirá', adjuntos: [{ path: 'otra/h1/x.png', tipo: 'imagen', nombre: 'x.png', tamano: 10 }] }), { params })
        expect(res.status).toBe(400)
        expect(r.guardados).toHaveLength(0)
    })
    it('un mensaje vacío sin adjuntos se rechaza', async () => {
        expect((await POST(pedido({ texto: '   ', adjuntos: [] }), { params })).status).toBe(400)
    })
})

describe('flujo', () => {
    it('guarda el mensaje del asesor y después la respuesta', async () => {
        const res = await POST(pedido({ texto: '¿Cómo llegó al precio?' }), { params })
        expect(res.status).toBe(200)
        expect(r.guardados.map(m => m.role)).toEqual(['user', 'assistant'])
        expect(r.guardados[1].status).toBe('ok')
    })
    it('si el modelo falla, el mensaje del asesor queda y la respuesta lleva el motivo', async () => {
        r.responder.mockRejectedValue(new Error('El asistente tardó demasiado en responder.'))
        const res = await POST(pedido({ texto: 'hola' }), { params })
        expect(res.status).toBe(200)
        expect(r.guardados[0].role).toBe('user')
        expect(r.guardados[1]).toMatchObject({ role: 'assistant', status: 'failed', error: 'El asistente tardó demasiado en responder.' })
    })
})

describe('adjuntos', () => {
    it('acepta solo rutas dentro de la carpeta de esta tasación y este hilo', () => {
        expect(rutaDeAdjuntoValida('t1/h1/abc-x.png', 't1', 'h1')).toBe(true)
        expect(rutaDeAdjuntoValida('t1/h2/abc-x.png', 't1', 'h1')).toBe(false)
        expect(rutaDeAdjuntoValida('t1/h1/../../t2/h9/x.png', 't1', 'h1')).toBe(false)
        expect(rutaDeAdjuntoValida('t1/h1/', 't1', 'h1')).toBe(false)
    })
    it('solo imágenes y PDF', () => {
        expect(tipoDeAdjunto('image/png')).toBe('imagen')
        expect(tipoDeAdjunto('application/pdf')).toBe('pdf')
        expect(tipoDeAdjunto('text/html')).toBeNull()
    })
})
