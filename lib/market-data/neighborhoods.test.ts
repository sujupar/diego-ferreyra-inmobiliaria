import { describe, it, expect } from 'vitest'
import { CABA_BARRIOS, ALL_CABA_SLUGS, GENERAL_SLUG, normalizeBarrio, findBySlug, findByText } from './neighborhoods'

describe('catálogo canónico de barrios CABA', () => {
    it('tiene exactamente 48 barrios (sin contar General)', () => {
        expect(CABA_BARRIOS.filter(b => b.slug !== GENERAL_SLUG)).toHaveLength(48)
        expect(ALL_CABA_SLUGS).toHaveLength(48)
    })
    it('slugs únicos y normalizados (sin acentos, kebab-case)', () => {
        const slugs = CABA_BARRIOS.map(b => b.slug)
        expect(new Set(slugs).size).toBe(slugs.length)
        for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
    })
    it('normalizeBarrio matchea los nombres del JSON de Bryn', () => {
        expect(normalizeBarrio('Núñez')).toBe('nunez')
        expect(normalizeBarrio('Villa Ortúzar')).toBe('villa-ortuzar')
        expect(normalizeBarrio('La Paternal')).toBe('la-paternal')
        expect(normalizeBarrio('Vélez Sarsfield')).toBe('velez-sarsfield')
    })
    it('findBySlug resuelve nombre visible', () => {
        expect(findBySlug('puerto-madero')?.name).toBe('Puerto Madero')
        expect(findBySlug('general')?.isGeneral).toBe(true)
        expect(findBySlug('no-existe')).toBeUndefined()
    })
    it('findByText mapea texto libre legacy (con typos de acentos y case)', () => {
        expect(findByText('palermo')?.slug).toBe('palermo')
        expect(findByText('NUÑEZ')?.slug).toBe('nunez')
        expect(findByText('  Villa Crespo ')?.slug).toBe('villa-crespo')
        expect(findByText('Barrio inventado')).toBeUndefined()
        expect(findByText('')).toBeUndefined()
    })
})
