import { describe, it, expect } from 'vitest'
import { extractYouTubeId } from './media'

describe('extractYouTubeId', () => {
  it('extrae de youtu.be', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('extrae de watch?v= con params extra', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
  })
  it('extrae de /embed/', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('extrae de /shorts/', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('devuelve null para Matterport', () => {
    expect(extractYouTubeId('https://my.matterport.com/show/?m=abc123')).toBeNull()
  })
  it('devuelve null para vacío/null', () => {
    expect(extractYouTubeId(null)).toBeNull()
    expect(extractYouTubeId('')).toBeNull()
  })
})
