export interface CanonicalNeighborhood {
    slug: string
    name: string                 // nombre visible = EXACTO el del JSON de Bryn
    zonapropSlug: string         // slug de la URL de Zonaprop (default = slug)
    isGeneral?: boolean
}

export const GENERAL_SLUG = 'general'

/** Normaliza un nombre de barrio a slug: NFD sin acentos, kebab-case. */
export function normalizeBarrio(name: string): string {
    return name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

const N = (name: string, zonapropSlug?: string): CanonicalNeighborhood => ({
    slug: normalizeBarrio(name), name, zonapropSlug: zonapropSlug || normalizeBarrio(name),
})

/** Los 48 barrios oficiales de CABA — nombres EXACTOS del JSON de Bryn (fuente
 *  autoritativa de matching). zonapropSlug se corrige en Task 6 si el verificador
 *  de slugs encuentra 404s (ej. San Nicolás suele ser "centro-microcentro"). */
export const CABA_BARRIOS: CanonicalNeighborhood[] = [
    N('Agronomía'), N('Almagro'), N('Balvanera'), N('Barracas'), N('Belgrano'),
    N('Boedo'), N('Caballito'), N('Chacarita'), N('Coghlan'), N('Colegiales'),
    N('Constitución'), N('Flores'), N('Floresta'), N('La Boca'), N('La Paternal'),
    N('Liniers'), N('Mataderos'), N('Monserrat'), N('Monte Castro'), N('Nueva Pompeya'),
    N('Núñez'), N('Palermo'), N('Parque Avellaneda'), N('Parque Chacabuco'), N('Parque Chas'),
    N('Parque Patricios'), N('Puerto Madero'), N('Recoleta'), N('Retiro'), N('Saavedra'),
    N('San Cristóbal'), N('San Nicolás'), N('San Telmo'), N('Vélez Sarsfield'), N('Versalles'),
    N('Villa Crespo'), N('Villa del Parque'), N('Villa Devoto'), N('Villa General Mitre'),
    N('Villa Lugano'), N('Villa Luro'), N('Villa Ortúzar'), N('Villa Pueyrredón'), N('Villa Real'),
    N('Villa Riachuelo'), N('Villa Santa Rita'), N('Villa Soldati'), N('Villa Urquiza'),
    { slug: GENERAL_SLUG, name: 'CABA', zonapropSlug: '', isGeneral: true },
]

export const ALL_CABA_SLUGS: string[] = CABA_BARRIOS.filter(b => !b.isGeneral).map(b => b.slug)

const bySlug = new Map(CABA_BARRIOS.map(b => [b.slug, b]))

export function findBySlug(slug: string | null | undefined): CanonicalNeighborhood | undefined {
    if (!slug) return undefined
    return bySlug.get(slug)
}

/** Mapea texto libre legacy ("Palermo", "NUÑEZ ", "villa crespo") al catálogo. */
export function findByText(text: string | null | undefined): CanonicalNeighborhood | undefined {
    if (!text || !text.trim()) return undefined
    return bySlug.get(normalizeBarrio(text))
}
