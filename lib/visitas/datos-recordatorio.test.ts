import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Paso { metodo: string; args: unknown[] }
interface Llamada { tabla: string; pasos: Paso[] }
interface Respuesta { data: unknown; error: { message: string } | null; count?: number | null }

const { registro } = vi.hoisted(() => {
  const registro: { llamadas: Llamada[]; responder: (l: Llamada) => Respuesta } = {
    llamadas: [],
    responder: () => ({ data: [], error: null }),
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
            return (resolver: (r: Respuesta) => unknown, rechazar: (e: unknown) => unknown) =>
              Promise.resolve().then(() => registro.responder(llamada)).then(resolver, rechazar)
          }
          return (...args: unknown[]) => { llamada.pasos.push({ metodo: String(prop), args }); return cadena }
        },
      })
      return cadena
    },
  }),
}))

import { visitasParaRecordar, reservarRecordatorio, liberarRecordatorio } from './datos'

const ID = '66666666-6666-4666-8666-666666666666'
const pasos = (l: Llamada, metodo: string) => l.pasos.filter(p => p.metodo === metodo).map(p => p.args)

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  registro.llamadas = []
  registro.responder = () => ({ data: [], error: null })
})

describe('datos del recordatorio', () => {
  it('lee solo confirmadas, sin aviso, dentro de la ventana, y aplana asesor y dirección', async () => {
    registro.responder = () => ({ data: [{ id: ID, scheduled_at: '2026-10-15T12:00:00+00:00', status: 'scheduled', reminder_sent_at: null,
      client_name: 'Sofía', property: { address: 'Doblas 248' }, advisor: { full_name: 'Lucas', email: 'lucas@inmodf.com.ar' } }], error: null })
    const r = await visitasParaRecordar({ desde: 'D', hasta: 'H' })
    const l = registro.llamadas[0]
    expect(pasos(l, 'eq')).toEqual([['status', 'scheduled']])
    expect(pasos(l, 'is')).toEqual([['reminder_sent_at', null]])
    expect(pasos(l, 'gte')).toEqual([['scheduled_at', 'D']])
    expect(pasos(l, 'lte')).toEqual([['scheduled_at', 'H']])
    expect(r).toEqual([{ id: ID, scheduled_at: '2026-10-15T12:00:00+00:00', status: 'scheduled', reminder_sent_at: null,
      client_name: 'Sofía', direccion: 'Doblas 248', asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' } }])
  })
  it('reservar es atómico: solo si sigue sin aviso y confirmada; devuelve la marca o null', async () => {
    registro.responder = () => ({ data: { id: ID }, error: null })
    const marca = await reservarRecordatorio(ID, new Date('2026-10-15T15:00:00.000Z'))
    expect(marca).toBe('2026-10-15T15:00:00.000Z')
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ reminder_sent_at: '2026-10-15T15:00:00.000Z' }]])
    expect(pasos(l, 'eq')).toEqual([['id', ID], ['status', 'scheduled']])
    expect(pasos(l, 'is')).toEqual([['reminder_sent_at', null]])
    registro.responder = () => ({ data: null, error: null })
    expect(await reservarRecordatorio(ID, new Date())).toBeNull()
  })
  it('liberar solo borra SU marca (otra corrida pudo haber escrito otra)', async () => {
    await liberarRecordatorio(ID, '2026-10-15T15:00:00.000Z')
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ reminder_sent_at: null }]])
    expect(pasos(l, 'eq')).toEqual([['id', ID], ['reminder_sent_at', '2026-10-15T15:00:00.000Z']])
  })
})
