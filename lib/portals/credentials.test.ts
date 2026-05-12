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

describe('resolveCredentials', () => {
  it('returns disabled when no env and no DB row enabled', async () => {
    const result = await resolveCredentials('argenprop', {
      env: {},
      supabase: makeSupabase(null),
    })
    expect(result.enabled).toBe(false)
  })

  it('returns enabled for argenprop when env vars present', async () => {
    const result = await resolveCredentials('argenprop', {
      env: { ARGENPROP_API_KEY: 'k', ARGENPROP_CLIENT_CODE: 'c' },
      supabase: makeSupabase(null),
    })
    expect(result.enabled).toBe(true)
    expect(result.apiKey).toBe('k')
    expect(result.clientCode).toBe('c')
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
