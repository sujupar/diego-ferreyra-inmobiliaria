/**
 * El paquete de contexto que recibe el asistente en CADA mensaje: todo lo que
 * sabe de la tasación, armado por el código desde la base.
 *
 * Reglas: nunca incluye `property_images` (son base64 enormes: CLAUDE.md, caída
 * del 2026-10-10); las descripciones van recortadas; el total tiene un tope
 * para que la llamada quepa en el tiempo de Netlify.
 */
import type { ValuationProperty, ValuationResult } from '../valuation/calculator'
import { formatCurrency } from '../valuation/utils'
import { explicarCalculo } from './explicar-calculo'

export const MAX_CONTEXTO = 24_000
const MAX_DESCRIPCION = 700

export interface OtraTasacion {
    titulo: string; barrio: string | null; fecha: string
    publicacion: number; superficie: number; precioM2: number
}

export interface EntradaContexto {
    tasacion: { titulo: string; ubicacion: string; barrio: string | null; fecha: string; tasadorEnUso: 'calculator' | 'ai' }
    sujeto: ValuationProperty
    comparables: ValuationProperty[]
    /** El resultado del tasador EN USO. */
    resultado: ValuationResult
    ia?: { publicationPrice: number; resumen: string; correcciones: string[] }
    informe?: { textos: Record<string, string>; preciosAMano?: { publicationPrice?: number; saleValue?: number; noSaleZonePrice?: number } }
    mercado?: string
    otras: OtraTasacion[]
}

const limpio = (t: string | undefined, max: number) => {
    const s = (t ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return s.length > max ? `${s.slice(0, max)}…` : s
}

function ficha(p: ValuationProperty): string {
    const f = p.features
    const datos: [string, unknown][] = [
        ['cubierta m²', f.coveredArea], ['semicubierta m²', f.semiCoveredArea], ['descubierta m²', f.uncoveredArea],
        ['piso', f.floor], ['antigüedad', f.age], ['ambientes', f.rooms], ['calidad', f.quality],
        ['estado', f.conservationState], ['disposición', f.disposition], ['ubicación (coef.)', f.locationCoefficient],
    ]
    return datos.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ') || 'sin datos cargados'
}

export function armarContexto(e: EntradaContexto): string {
    const moneda = e.resultado.currency || 'USD'
    const usd = (n: number) => formatCurrency(n, moneda)
    const x = explicarCalculo(e.resultado)
    const s: string[] = []

    s.push(`# Tasación\n${e.tasacion.titulo} — ${e.tasacion.ubicacion}${e.tasacion.barrio ? ` (barrio: ${e.tasacion.barrio})` : ''}. Fecha: ${e.tasacion.fecha}. Tasador en uso: ${e.tasacion.tasadorEnUso === 'ai' ? 'Tasador IA' : 'clásico'}.`)
    s.push(`# Propiedad tasada\n${ficha(e.sujeto)}\nDescripción: ${limpio(e.sujeto.description, MAX_DESCRIPCION) || '—'}`)
    s.push(`# Resultado\nPrecio de publicación ${usd(e.resultado.publicationPrice)} · Zona de No Venta ${usd(e.resultado.noSaleZonePrice)} · Valor de venta ${usd(e.resultado.saleValue)} · Dinero en mano ${usd(e.resultado.moneyInHand)} · Valor por m² ${usd(e.resultado.subjectPriceM2)}`)
    s.push(`# Cálculo paso a paso (números exactos; citá SOLO estos)\n${x.pasos.map((p, i) => `${i + 1}. ${p.titulo}: ${p.texto}`).join('\n')}`)
    s.push(`# Tabla de comparables\n${x.tablaComparables.columnas.join(' | ')}\n${x.tablaComparables.filas.map(f => f.join(' | ')).join('\n')}`)
    s.push(`# Comparables (datos y coeficientes)\n${e.comparables.map((c, i) => `${i + 1}. ${c.title || `Comparable ${i + 1}`} — ${c.location ?? ''} · ${ficha(c)} · coeficientes: ${x.coeficientesPorComparable[i] ?? '—'}\n   ${limpio(c.description, 300)}`).join('\n')}`)
    if (e.ia) {
        const dif = ((e.ia.publicationPrice / e.resultado.publicationPrice - 1) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })
        s.push(`# Tasador IA (segunda opinión, mismo método)\nPrecio de publicación ${usd(e.ia.publicationPrice)} (${dif} % vs. el resultado en uso). Interpretación: ${limpio(e.ia.resumen, 600)}${e.ia.correcciones.length ? `\nCuentas del modelo corregidas por la tabla: ${e.ia.correcciones.slice(0, 12).join('; ')}` : ''}`)
    }
    if (e.informe) {
        const pm = e.informe.preciosAMano
        const manos = [
            pm?.publicationPrice ? `Precio de publicación cargado a mano: ${usd(pm.publicationPrice)}` : '',
            pm?.saleValue ? `Valor de venta cargado a mano: ${usd(pm.saleValue)}` : '',
            pm?.noSaleZonePrice ? `Zona de No Venta cargada a mano: ${usd(pm.noSaleZonePrice)}` : '',
        ].filter(Boolean)
        const textos = Object.entries(e.informe.textos).map(([k, v]) => `${k}: ${limpio(v, 500)}`)
        if (manos.length || textos.length) s.push(`# Informe entregado\n${[...manos, ...textos].join('\n')}`)
    }
    if (e.mercado) s.push(`# Mercado (datos congelados de la tasación)\n${limpio(e.mercado, 1200)}`)
    if (e.otras.length) {
        s.push(`# Otras tasaciones de la plataforma en el barrio (últimos 12 meses)\n${e.otras.slice(0, 15).map(o => `${limpio(o.titulo, 60)} · ${o.fecha} · ${usd(o.publicacion)} · ${o.superficie} m² · ${usd(o.precioM2)}/m²`).join('\n')}`)
    }
    const todo = s.join('\n\n')
    return todo.length > MAX_CONTEXTO ? `${todo.slice(0, MAX_CONTEXTO - 1)}…` : todo
}
