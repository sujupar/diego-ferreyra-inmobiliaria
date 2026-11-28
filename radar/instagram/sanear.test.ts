import { describe, expect, it } from 'vitest'
import { sanearMuestra } from './sanear'

describe('sanearMuestra', () => {
  it('saca las claves de la cuenta que mira y reemplaza los secretos', () => {
    const crudo = {
      data: {
        xdt_viewer: { user: { id: '999888777' } },
        user: { username: 'cuenta', follower_count: 10, friendship_status: { following: true }, has_liked: true },
        nota: 'id 999888777 y token abcdSECRETO',
      },
    }
    const texto = sanearMuestra(crudo, [['999888777', '<VIEWER_ID>'], ['abcdSECRETO', '<SESSIONID>']])
    expect(texto).not.toContain('999888777')
    expect(texto).not.toContain('abcdSECRETO')
    expect(texto).not.toContain('friendship_status')
    expect(texto).not.toContain('has_liked')
    expect(texto).not.toContain('xdt_viewer')
    expect(JSON.parse(texto).data.user.follower_count).toBe(10)
  })

  it('recorta arrays largos', () => {
    const texto = sanearMuestra({ items: Array.from({ length: 40 }, (_, i) => i) }, [])
    expect(JSON.parse(texto).items).toHaveLength(12)
  })
})
