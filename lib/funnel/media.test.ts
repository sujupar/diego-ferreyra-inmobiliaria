import { describe, it, expect, beforeEach } from 'vitest'
import { funnelMediaUrl } from './media'

describe('funnelMediaUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mncsnastmcjdjxrehdep.supabase.co'
  })

  it('arma la URL pública del bucket funnel-media', () => {
    expect(funnelMediaUrl('web/tasacion-hero-web.mp4')).toBe(
      'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/tasacion-hero-web.mp4',
    )
  })

  it('tolera un slash inicial en el path', () => {
    expect(funnelMediaUrl('/raw/x.png')).toBe(
      'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/x.png',
    )
  })

  it('normaliza un trailing slash en el SUPABASE_URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mncsnastmcjdjxrehdep.supabase.co/'
    expect(funnelMediaUrl('raw/x.png')).toBe(
      'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/x.png',
    )
  })
})
