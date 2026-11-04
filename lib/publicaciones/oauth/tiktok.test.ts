import { describe, expect, it } from 'vitest'
import { ConexionVencida } from './google'
import { canjearCodigoTiktok, refrescarTiktok, urlDeAutorizacionTiktok, usuarioDeTiktok } from './tiktok'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })
const AHORA = new Date('2026-11-04T15:00:00Z')
const conf = { clientKey: 'CK', clientSecret: 'CS', redirectUri: 'https://inmodf.com.ar/api/oauth/tiktok/callback' }

function falso(r: Response) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    return r
  }) as typeof fetch
  return { f, llamadas }
}

describe('urlDeAutorizacionTiktok', () => {
  it('pide subir borradores y el perfil básico, con el estado firmado', () => {
    const u = new URL(urlDeAutorizacionTiktok(conf, 'EST'))
    expect(u.origin + u.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(u.searchParams.get('client_key')).toBe('CK')
    expect(u.searchParams.get('scope')).toBe('user.info.basic,video.upload')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('state')).toBe('EST')
    expect(u.searchParams.get('redirect_uri')).toBe(conf.redirectUri)
  })
})

describe('canjearCodigoTiktok', () => {
  it('guarda las llaves, el usuario y cuándo vencen', async () => {
    const { f, llamadas } = falso(
      json({ access_token: 'AT', refresh_token: 'RT', expires_in: 86400, refresh_expires_in: 31536000, open_id: 'OID', scope: 'video.upload' }),
    )
    expect(await canjearCodigoTiktok(conf, 'COD', AHORA, f)).toEqual({
      access_token: 'AT',
      refresh_token: 'RT',
      expira_en: new Date(AHORA.getTime() + 86400_000).toISOString(),
      refresh_expira_en: new Date(AHORA.getTime() + 31536000_000).toISOString(),
      open_id: 'OID',
      scope: 'video.upload',
    })
    const cuerpo = new URLSearchParams(String(llamadas[0].init?.body))
    expect(cuerpo.get('client_key')).toBe('CK')
    expect(cuerpo.get('grant_type')).toBe('authorization_code')
  })

  it('un permiso sin "subir video" no sirve y se dice', async () => {
    const { f } = falso(json({ access_token: 'AT', refresh_token: 'RT', expires_in: 1, open_id: 'O', scope: 'user.info.basic' }))
    await expect(canjearCodigoTiktok(conf, 'C', AHORA, f)).rejects.toThrow(/subir/)
  })

  it('un error de TikTok (que viene con 200) se reconoce', async () => {
    const { f } = falso(json({ error: 'invalid_request', error_description: 'Code expired' }))
    await expect(canjearCodigoTiktok(conf, 'C', AHORA, f)).rejects.toThrow(/TikTok/)
  })
})

describe('refrescarTiktok', () => {
  it('devuelve llaves nuevas (TikTok también renueva la de renovación)', async () => {
    const { f } = falso(json({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 86400, refresh_expires_in: 100, open_id: 'OID' }))
    const t = await refrescarTiktok(conf, 'RT', AHORA, f)
    expect(t).toMatchObject({ access_token: 'AT2', refresh_token: 'RT2' })
  })

  it('una llave de renovación vencida pide reconectar', async () => {
    const { f } = falso(json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired' }))
    await expect(refrescarTiktok(conf, 'RT', AHORA, f)).rejects.toBeInstanceOf(ConexionVencida)
  })
})

describe('usuarioDeTiktok', () => {
  it('lee el nombre visible', async () => {
    const { f } = falso(json({ data: { user: { display_name: 'Diego Ferreyra' } }, error: { code: 'ok' } }))
    expect(await usuarioDeTiktok('AT', f)).toBe('Diego Ferreyra')
  })
})
