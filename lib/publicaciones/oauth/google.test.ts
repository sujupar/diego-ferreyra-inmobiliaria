import { describe, expect, it } from 'vitest'
import { canalDeYoutube, canjearCodigoGoogle, ConexionVencida, refrescarGoogle, urlDeAutorizacionGoogle } from './google'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })
const AHORA = new Date('2026-11-04T15:00:00Z')
const conf = { clientId: 'CID', clientSecret: 'SEC', redirectUri: 'https://inmodf.com.ar/api/oauth/google/callback' }

function falso(r: Response) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    return r
  }) as typeof fetch
  return { f, llamadas }
}

describe('urlDeAutorizacionGoogle', () => {
  it('pide SOLO subir videos y leer el canal, sin vencimiento (offline) y con el estado firmado', () => {
    const u = new URL(urlDeAutorizacionGoogle(conf, 'EST'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('state')).toBe('EST')
    expect(u.searchParams.get('redirect_uri')).toBe(conf.redirectUri)
    expect(u.searchParams.get('response_type')).toBe('code')
  })
})

describe('canjearCodigoGoogle', () => {
  it('guarda la llave, la de renovación y cuándo vence', async () => {
    const { f, llamadas } = falso(json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3599, scope: 's' }))
    const t = await canjearCodigoGoogle(conf, 'CODIGO', AHORA, f)
    expect(t).toEqual({ access_token: 'AT', refresh_token: 'RT', expira_en: new Date(AHORA.getTime() + 3599_000).toISOString(), scope: 's' })
    const cuerpo = new URLSearchParams(String(llamadas[0].init?.body))
    expect(cuerpo.get('grant_type')).toBe('authorization_code')
    expect(cuerpo.get('code')).toBe('CODIGO')
  })

  it('sin llave de renovación no sirve (habría que reconectar cada hora)', async () => {
    const { f } = falso(json({ access_token: 'AT', expires_in: 3599 }))
    await expect(canjearCodigoGoogle(conf, 'C', AHORA, f)).rejects.toThrow(/renov/)
  })

  it('un código rechazado da un error legible', async () => {
    const { f } = falso(json({ error: 'invalid_grant' }, 400))
    await expect(canjearCodigoGoogle(conf, 'C', AHORA, f)).rejects.toThrow(/Google/)
  })
})

describe('refrescarGoogle', () => {
  it('devuelve una llave nueva', async () => {
    const { f } = falso(json({ access_token: 'AT2', expires_in: 3600 }))
    expect(await refrescarGoogle(conf, 'RT', AHORA, f)).toEqual({ access_token: 'AT2', expira_en: new Date(AHORA.getTime() + 3600_000).toISOString() })
  })

  it('un permiso revocado se distingue: hay que volver a conectar', async () => {
    const { f } = falso(json({ error: 'invalid_grant' }, 400))
    const e = await refrescarGoogle(conf, 'RT', AHORA, f).catch((x) => x)
    expect(e).toBeInstanceOf(ConexionVencida)
    // El publicador lo reconoce por el nombre (así no depende de importar la clase).
    expect(e.name).toBe('ConexionVencida')
  })
})

describe('canalDeYoutube', () => {
  it('lee el nombre del canal', async () => {
    const { f, llamadas } = falso(json({ items: [{ id: 'UC1', snippet: { title: 'Diego Ferreyra' } }] }))
    expect(await canalDeYoutube('AT', f)).toEqual({ id: 'UC1', titulo: 'Diego Ferreyra' })
    expect(new Headers(llamadas[0].init?.headers).get('authorization')).toBe('Bearer AT')
  })

  it('una cuenta sin canal lo dice', async () => {
    const { f } = falso(json({ items: [] }))
    await expect(canalDeYoutube('AT', f)).rejects.toThrow(/canal/)
  })
})
