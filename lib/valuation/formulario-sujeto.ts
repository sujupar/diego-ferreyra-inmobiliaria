/**
 * Del formulario del asistente ("Propiedad a Tasar") a las features que usa el
 * cálculo. Vive acá, y no dentro del componente, porque la auditoría del
 * 2026-10-03 (B2) encontró que el asistente PEDÍA la superficie semicubierta y
 * la sumaba al 50 % en el "Superficie Total" que veía el asesor, pero al
 * terminar armaba las features SIN ella: el precio salía de una superficie
 * menor que la mostrada. Al ser una función pura, eso queda cubierto por test.
 */
import type { PropertyFeatures } from '@/lib/scraper/types'
import type { ConservationStateType, DispositionType, QualityType } from './rules'
import { calculateHomogenizedSurface } from './calculator'

/** Un campo numérico del formulario: vacío es '' (el input no tiene valor). */
type Numero = number | ''

export interface FormularioSujeto {
    coveredArea: Numero
    semiCoveredArea: Numero
    uncoveredArea: Numero
    totalArea: Numero
    rooms: Numero
    bedrooms: Numero
    bathrooms: Numero
    garages: Numero
    floor: Numero
    totalFloors: Numero
    age: Numero
    disposition: DispositionType | ''
    quality: QualityType | ''
    conservationState: ConservationStateType | ''
}

/** Positivo o null: un 0 en una superficie o en ambientes es "no cargado". */
const positivoONulo = (v: Numero): number | null => (Number(v) > 0 ? Number(v) : null)

/** Vacío = null; 0 es un valor real (planta baja, a estrenar). */
const realONulo = (v: Numero): number | null => (v === '' ? null : Number(v))

/** Superficie homologada del formulario: la MISMA fórmula que usa el cálculo. */
export function superficieDelFormulario(form: Pick<FormularioSujeto, 'coveredArea' | 'semiCoveredArea' | 'uncoveredArea'>): number {
    return calculateHomogenizedSurface({
        coveredArea: Number(form.coveredArea) || 0,
        semiCoveredArea: Number(form.semiCoveredArea) || 0,
        uncoveredArea: Number(form.uncoveredArea) || 0,
    })
}

export function featuresDelFormulario(form: FormularioSujeto): PropertyFeatures {
    const homologada = superficieDelFormulario(form)
    return {
        coveredArea: positivoONulo(form.coveredArea),
        semiCoveredArea: positivoONulo(form.semiCoveredArea),
        uncoveredArea: positivoONulo(form.uncoveredArea),
        // El asistente siempre mostró como "Superficie Total" la homologada; se
        // guarda esa, igual que antes, pero calculada con la fórmula única.
        totalArea: homologada > 0 ? homologada : null,
        rooms: positivoONulo(form.rooms),
        bedrooms: positivoONulo(form.bedrooms),
        bathrooms: positivoONulo(form.bathrooms),
        garages: positivoONulo(form.garages),
        // Piso 0 (planta baja) y antigüedad 0 (a estrenar) son valores REALES:
        // con `Number(x) || null` se guardaban como vacío y el Tasador IA los
        // tomaba como "no cargados" (podía inventarlos).
        floor: realONulo(form.floor),
        totalFloors: positivoONulo(form.totalFloors),
        expenses: null,
        orientation: null,
        disposal: null,
        condition: null,
        age: realONulo(form.age),
        disposition: form.disposition || undefined,
        quality: form.quality || undefined,
        conservationState: form.conservationState || undefined,
    }
}
