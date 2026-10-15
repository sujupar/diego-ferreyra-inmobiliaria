/**
 * Puerta y comportamiento del recordatorio "¿se realizó?": auth DUAL (validar contra un
 * solo secreto deja el job en 403 en silencio para siempre), una sola vez por visita,
 * un fallo de email libera la reserva, y la corrida SIEMPRE dice qué hizo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VisitaParaRecordar } from '@/lib/visitas/tipos'

const estado = vi.hoisted(() => ({
  secretoEnLaBase: 'secreto-de-la-base' as string | null,
  errorCronConfig: null as { message: string } | null,
  visitas: [] as VisitaParaRecordar[],
  reservas: new Map<string, string | null>(),
  resultadoEmail: { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] as string[] },
  enviados: [] as string[],
  liberadas: [] as Array<[string, string]>,
  falla: null as Error | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => (estado.errorCronConfig
        ? { data: null, error: estado.errorCronConfig }
        : estado.secretoEnLaBase === null ? { data: null, error: null } : { data: { value: estado.secretoEnLaBase }, error: null }),
    }) }) }),
  }),
}))
vi.mock('@/lib/visitas/datos', () => ({
  visitasParaRecordar: async () => { if (estado.falla) throw estado.falla; return estado.visitas },
  reservarRecordatorio: async (id: string, ahora: Date) => (estado.reservas.has(id) ? estado.reservas.get(id) ?? null : ahora.toISOString()),
  liberarRecordatorio: async (id: string, marca: string) => { estado.liberadas.push([id, marca]) },
}))
vi.mock('@/lib/email/notifications/visit-reminder-advisor', () => ({
  enviarRecordatorioDeVisita: async (d: { visitaId: string }) => { estado.enviados.push(d.visitaId); return estado.resultadoEmail },
}))
const { barrerMock } = vi.hoisted(() => ({ barrerMock: vi.fn() }))
vi.mock('@/lib/visitas/encuesta/avisos-servicio', () => ({ barrerAvisosPendientes: barrerMock }))

import { POST, GET } from './route'

const AHORA = new Date('2026-10-15T15:00:00.000Z')
const visita = (id: string, cambios: Partial<VisitaParaRecordar> = {}): VisitaParaRecordar => ({
  id, scheduled_at: '2026-10-15T12:00:00.000Z', status: 'scheduled', reminder_sent_at: null, client_name: 'Sofía',
  direccion: 'Doblas 248', asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar', activo: true }, ...cambios,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pedido = (secreto?: string, url = 'https://app.test/api/cron/visit-reminders') => new Request(url, { method: 'POST', headers: secreto ? { 'x-cron-secret': secreto } : {} }) as any

beforeEach(() => {
  estado.secretoEnLaBase = 'secreto-de-la-base'
  estado.errorCronConfig = null
  estado.visitas = []; estado.reservas = new Map(); estado.enviados = []; estado.liberadas = []; estado.falla = null
  estado.resultadoEmail = { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] }
  delete process.env.CRON_SECRET
  // Sin estas dos, `autorizado` ni intenta leer cron_config (la ruta no adivina credenciales).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA)
  barrerMock.mockReset().mockResolvedValue({ revisadas: 1, canalesEnviados: 2, sinTiempo: 0 })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('cron del recordatorio "¿se realizó?"', () => {
  it('ping responde sin auth y sin leer nada', async () => {
    const r = await GET(pedido(undefined, 'https://app.test/api/cron/visit-reminders?ping=1'))
    expect(await r.json()).toEqual({ ok: true, route: 'visit-reminders', auth: 'db+env' })
  })
  it('sin secreto, o con el marcador del repo: 403', async () => {
    expect((await POST(pedido())).status).toBe(403)
    estado.secretoEnLaBase = '__SECRETO__'
    expect((await POST(pedido('__SECRETO__'))).status).toBe(403)
  })
  it('acepta el de la variable de entorno y el de cron_config', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    expect((await POST(pedido('secreto-de-netlify'))).status).toBe(200)
    expect((await POST(pedido('secreto-de-la-base'))).status).toBe(200)
  })
  it('secreto incorrecto (ni el de env ni el de la base, con largo distinto de los dos): 403', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    expect((await POST(pedido('otra-cosa-cualquiera-mas-corta'))).status).toBe(403)
  })
  it('si falla la lectura de cron_config, 403 (nunca lanza) y lo deja anotado en el log', async () => {
    estado.errorCronConfig = { message: 'conexión rechazada' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(pedido('secreto-de-la-base'))).status).toBe(403)
    expect(spy).toHaveBeenCalledWith('[cron/visit-reminders] no se pudo leer cron_config', 'conexión rechazada')
  })
  it('manda a las que corresponden, saltea las demás con su motivo, y lo dice', async () => {
    estado.visitas = [visita('a'), visita('b', { asesor: null })]
    const r = await POST(pedido('secreto-de-la-base'))
    const cuerpo = await r.json()
    expect(estado.enviados).toEqual(['a'])
    expect(cuerpo).toMatchObject({ ok: true, revisadas: 2, enviadas: 1, fallidas: 0, salteadas: [{ id: 'b', motivo: 'sin_asesor' }], pendientesPorTiempo: 0 })
    expect(cuerpo.ventana).toEqual({ desde: '2026-10-13T15:00:00.000Z', hasta: '2026-10-15T14:00:00.000Z' })
  })
  it('si otra corrida ya la reservó, no manda (una sola vez)', async () => {
    estado.visitas = [visita('a')]
    estado.reservas.set('a', null)
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(estado.enviados).toEqual([])
    expect(cuerpo.salteadas).toEqual([{ id: 'a', motivo: 'reservada_por_otra_corrida' }])
  })
  it('si el email falla por un motivo cualquiera, libera la reserva para reintentar la próxima hora', async () => {
    estado.visitas = [visita('a')]
    estado.resultadoEmail = { ok: false, sent: 0, skipped: 0, failed: 1, errors: ['Network error'] }
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(cuerpo).toMatchObject({ enviadas: 0, fallidas: 1, vencidas: 0 })
    expect(estado.liberadas).toEqual([['a', AHORA.toISOString()]])
  })
  it('ok:false con failed:0 (falta RESEND_API_KEY) también es un fallo', async () => {
    estado.visitas = [visita('a')]
    estado.resultadoEmail = { ok: false, sent: 0, skipped: 0, failed: 0, errors: ['RESEND_API_KEY not set'] }
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(cuerpo.fallidas).toBe(1)
    expect(estado.liberadas).toHaveLength(1)
  })
  it('si el envío VENCE, Resend pudo haberlo mandado igual: NO libera (se prefiere perder a duplicar) y lo cuenta aparte', async () => {
    estado.visitas = [visita('a')]
    estado.resultadoEmail = { ok: false, sent: 0, skipped: 0, failed: 1, errors: ['Tiempo de espera agotado: Resend no respondió en 8000 ms'] }
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(cuerpo).toMatchObject({ enviadas: 0, fallidas: 1, vencidas: 1 })
    expect(estado.liberadas).toEqual([])
  })
  it('si se acaba el presupuesto de tiempo, deja el resto para la próxima corrida y lo cuenta', async () => {
    estado.visitas = [visita('a'), visita('b')]
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(11_000)
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(estado.enviados).toEqual(['a'])
    expect(cuerpo.pendientesPorTiempo).toBe(1)
  })
  it('sin nada para avisar, deja el motivo escrito (nunca un return mudo)', async () => {
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(cuerpo).toMatchObject({ ok: true, revisadas: 0, enviadas: 0 })
    expect(cuerpo.motivo).toBe('No hay visitas confirmadas de las últimas 48 h que hayan pasado sin resultado ni aviso.')
  })
  it('si la base falla, 500 con ok:false', async () => {
    estado.falla = new Error('visitas para recordar: boom')
    const r = await POST(pedido('secreto-de-la-base'))
    expect(r.status).toBe(500)
    expect(await r.json()).toMatchObject({ ok: false, error: 'visitas para recordar: boom' })
  })
  it('barre los avisos de encuestas pendientes y lo cuenta en la respuesta', async () => {
    const body = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(barrerMock).toHaveBeenCalledWith({ inicio: expect.any(Number), ahora: expect.any(Date) })
    expect(body.encuestas).toEqual({ revisadas: 1, canalesEnviados: 2, sinTiempo: 0 })
  })
  it('si el barrido falla, el recordatorio responde igual y dice qué falló', async () => {
    barrerMock.mockRejectedValue(new Error('boom'))
    const res = await POST(pedido('secreto-de-la-base'))
    expect(res.status).toBe(200)
    expect((await res.json()).encuestas).toEqual({ error: 'boom' })
  })
})
