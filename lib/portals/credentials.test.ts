import { describe, it, expect } from 'vitest'
import { resolveCredentials } from './credentials'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

function makeSupabase(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>
}

function fakeSupabase(row: Record<string, unknown> | null) {
  return {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle: async () => ({ data: row, error: null }),
      }
    },
  } as never
}

describe('resolveCredentials', () => {
  it('returns disabled when no env and no DB row enabled', async () => {
    const result = await resolveCredentials('argenprop', {
      env: {},
      supabase: makeSupabase(null),
    })
    expect(result.enabled).toBe(false)
  })

  it('returns enabled for argenprop when API REST env vars present', async () => {
    const result = await resolveCredentials('argenprop', {
      env: {
        ARGENPROP_TOKEN_CRM: 'tok',
        ARGENPROP_USR: 'u@api.com',
        ARGENPROP_PSD: 'p',
        ARGENPROP_ID_ANUNCIANTE: '281022',
      },
      supabase: makeSupabase(null),
    })
    expect(result.enabled).toBe(true)
    expect(result.ap?.usr).toBe('u@api.com')
  })

  it('returns enabled when DB row enabled=true', async () => {
    const result = await resolveCredentials('argenprop', {
      env: {},
      supabase: makeSupabase({ enabled: true, access_token: null, refresh_token: null, expires_at: null, metadata: {} }),
    })
    expect(result.enabled).toBe(true)
  })

  it('mercadolibre needs access_token even with env vars', async () => {
    const result = await resolveCredentials('mercadolibre', {
      env: { ML_APP_ID: 'x', ML_SECRET_KEY: 'y' },
      supabase: makeSupabase(null),
    })
    expect(result.enabled).toBe(false) // sin access_token aún
  })

  it('mercadolibre enabled when env + access_token both present', async () => {
    const result = await resolveCredentials('mercadolibre', {
      env: { ML_APP_ID: 'x', ML_SECRET_KEY: 'y' },
      supabase: makeSupabase({
        enabled: true,
        access_token: 'tok',
        refresh_token: 'ref',
        expires_at: null,
        metadata: {},
      }),
    })
    expect(result.enabled).toBe(true)
    expect(result.accessToken).toBe('tok')
  })
})

describe('resolveCredentials argenprop (API REST)', () => {
  it('enabled=true cuando tokenCrm+usr+psd+idAnunciante están en env', async () => {
    const creds = await resolveCredentials('argenprop', {
      env: {
        ARGENPROP_API_BASE: 'https://integradores.api.sosiva451.com',
        ARGENPROP_TOKEN_CRM: '3072955a',
        ARGENPROP_USR: 'u@api.com',
        ARGENPROP_PSD: 'p',
        ARGENPROP_ID_ANUNCIANTE: '281022',
      },
      supabase: fakeSupabase({ portal: 'argenprop', enabled: false, metadata: {} }),
    })
    expect(creds.enabled).toBe(true)
    expect(creds.ap?.usr).toBe('u@api.com')
    expect(creds.ap?.tokenCrm).toBe('3072955a')
    expect(creds.ap?.idAnunciante).toBe(281022)
    expect(creds.ap?.apiBase).toContain('sosiva451')
  })

  it('default apiBase cuando no se pasa', async () => {
    const creds = await resolveCredentials('argenprop', {
      env: { ARGENPROP_TOKEN_CRM: 't', ARGENPROP_USR: 'u', ARGENPROP_PSD: 'p', ARGENPROP_ID_ANUNCIANTE: '1' },
      supabase: fakeSupabase(null),
    })
    expect(creds.ap?.apiBase).toBe('https://integradores.api.sosiva451.com')
  })

  it('enabled=false si falta idAnunciante', async () => {
    const creds = await resolveCredentials('argenprop', {
      env: { ARGENPROP_TOKEN_CRM: 't', ARGENPROP_USR: 'u@api.com', ARGENPROP_PSD: 'p' },
      supabase: fakeSupabase(null),
    })
    expect(creds.enabled).toBe(false)
  })
})
