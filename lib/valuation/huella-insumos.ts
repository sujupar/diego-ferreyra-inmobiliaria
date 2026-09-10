/**
 * Huella de los insumos OBJETIVOS de una tasación (precios, superficies,
 * descripciones, ubicación, piso, antigüedad, tasas, parte del propietario).
 * NO incluye lo que cada tasador decide (calidad, estado, disposición,
 * coeficiente de ubicación): eso es justamente lo que diferencia al clásico
 * de la IA.
 *
 * Si la huella actual de la tasación ≠ la guardada en el snapshot IA, la
 * tarjeta IA avisa "Desactualizada". Corre en servidor y en navegador, por eso
 * el hash es propio (cyrb53) y no `node:crypto`.
 */
import type { ExpenseRates } from './calculator'

export interface PropiedadParaHuella {
  price?: number | null
  currency?: string | null
  location?: string
  description?: string
  features: {
    coveredArea?: number | null
    semiCoveredArea?: number | null
    uncoveredArea?: number | null
    totalArea?: number | null
    floor?: number | null
    age?: number | null
    publishedDate?: string | null
  }
}

export interface InsumosParaHuella {
  subject: PropiedadParaHuella
  comparables: PropiedadParaHuella[]
  expenseRates?: ExpenseRates
  ownerSharePercent?: number
}

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const s = (v: string | null | undefined) => (v ?? '').trim()

function canonica(p: PropiedadParaHuella): unknown[] {
  const f = p.features ?? {}
  return [
    n(p.price), s(p.currency), s(p.location), s(p.description),
    n(f.coveredArea), n(f.semiCoveredArea), n(f.uncoveredArea), n(f.totalArea),
    n(f.floor), n(f.age), s(f.publishedDate),
  ]
}

/** cyrb53 — hash de 53 bits, público y determinístico. */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export function huellaDeInsumos(i: InsumosParaHuella): string {
  const r = i.expenseRates ?? {}
  const payload = [
    canonica(i.subject),
    i.comparables.map(canonica),
    [n(r.saleDiscountPercent), n(r.deedDiscountPercent), n(r.stampsPercent), n(r.deedExpensesPercent), n(r.agencyFeesPercent)],
    n(i.ownerSharePercent),
  ]
  return cyrb53(JSON.stringify(payload))
}
