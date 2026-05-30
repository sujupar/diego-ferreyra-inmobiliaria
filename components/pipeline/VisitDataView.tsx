// components/pipeline/VisitDataView.tsx
//
// Renderiza de forma AMIGABLE los datos relevados en la visita (deals.visit_data,
// un VisitDataSnapshot { sale, purchase, updated_at }). Reemplaza el JSON crudo
// que se mostraba antes en <pre>{JSON.stringify(...)}</pre>.
//
// Es defensivo a propósito: visit_data es JSONB sin garantía de forma. Soporta:
//   - El snapshot canónico { sale, purchase }.
//   - Un objeto "plano" tipo sale (legacy).
//   - Cualquier otro objeto → fallback genérico humanizando las claves.
// Así garantizamos que NUNCA se muestre JSON crudo, sea cual sea la forma.

import type {
    Quality, Disposition, ConservationState, Orientation, PropertyTypeVenta,
} from '@/types/visit-data.types'

// ── Label maps (los enums de visit_data son en minúscula/snake) ──────────────
const QUALITY_LABELS: Record<Quality, string> = {
    economica: 'Económica',
    buena_economica: 'Buena económica',
    buena: 'Buena',
    muy_buena: 'Muy buena',
    excelente: 'Excelente',
}
const DISPOSITION_LABELS: Record<Disposition, string> = {
    frente: 'Frente',
    contrafrente: 'Contrafrente',
    interno: 'Interno',
    lateral: 'Lateral',
}
const CONSERVATION_LABELS: Record<ConservationState, string> = {
    estado_1: 'Estado 1 — Nuevo',
    estado_1_5: 'Estado 1.5',
    estado_2: 'Estado 2 — Normal',
    estado_2_5: 'Estado 2.5',
    estado_3: 'Estado 3',
    estado_3_5: 'Estado 3.5',
    estado_4: 'Estado 4',
    estado_4_5: 'Estado 4.5',
    estado_5: 'Estado 5 — A refaccionar',
}
const ORIENTATION_LABELS: Record<Orientation, string> = {
    N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste',
    NE: 'Noreste', NO: 'Noroeste', SE: 'Sureste', SO: 'Suroeste',
}
const PROPERTY_TYPE_LABELS: Record<PropertyTypeVenta, string> = {
    departamento: 'Departamento', casa: 'Casa', ph: 'PH', otro: 'Otro',
}

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtNum(v: unknown, suffix = ''): string | null {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    return `${n.toLocaleString('es-AR')}${suffix}`
}
function fmtText(v: unknown): string | null {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s ? s : null
}
function fmtBool(v: unknown): string | null {
    if (typeof v !== 'boolean') return null
    return v ? 'Sí' : 'No'
}
function fmtList(v: unknown): string | null {
    if (!Array.isArray(v) || v.length === 0) return null
    return v.map(String).join(', ')
}
function fmtEnum<T extends string>(map: Record<T, string>, v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null
    return map[v as T] ?? String(v)
}
function fmtMoney(v: unknown, currency?: string | null): string | null {
    const n = fmtNum(v)
    return n ? `${currency || 'USD'} ${n}` : null
}

interface Row { label: string; value: string; wide?: boolean }

// ── Field specs ──────────────────────────────────────────────────────────────
type FieldSpec<T> = { label: string; get: (d: T) => string | null; wide?: boolean }

const SALE_SPEC: FieldSpec<Record<string, unknown>>[] = [
    { label: 'Tipo de propiedad', get: d => {
        const t = fmtEnum(PROPERTY_TYPE_LABELS, d.property_type)
        if (!t) return null
        return d.property_type === 'otro' && d.property_type_other ? `${t} (${String(d.property_type_other)})` : t
    } },
    { label: 'Ambientes', get: d => fmtNum(d.rooms) },
    { label: 'Dormitorios', get: d => fmtNum(d.bedrooms) },
    { label: 'Baños', get: d => fmtNum(d.bathrooms) },
    { label: 'Cocheras', get: d => fmtNum(d.garages) },
    { label: 'M² cubiertos', get: d => fmtNum(d.covered_m2, ' m²') },
    { label: 'M² semicubiertos', get: d => fmtNum(d.semi_covered_m2, ' m²') },
    { label: 'M² descubiertos', get: d => fmtNum(d.uncovered_m2, ' m²') },
    { label: 'M² totales', get: d => fmtNum(d.total_m2, ' m²') },
    { label: 'M² terreno', get: d => fmtNum(d.terrain_m2, ' m²') },
    { label: 'Antigüedad', get: d => fmtNum(d.age_years, ' años') },
    { label: 'Piso', get: d => fmtNum(d.floor) },
    { label: 'Pisos del edificio', get: d => fmtNum(d.total_floors) },
    { label: 'Refaccionado', get: d => fmtBool(d.is_refurbished) },
    { label: 'Orientación', get: d => fmtEnum(ORIENTATION_LABELS, d.orientation) },
    { label: 'Disposición', get: d => fmtEnum(DISPOSITION_LABELS, d.disposition) },
    { label: 'Calidad constructiva', get: d => fmtEnum(QUALITY_LABELS, d.quality) },
    { label: 'Estado de conservación', get: d => fmtEnum(CONSERVATION_LABELS, d.conservation) },
    { label: 'Características', get: d => fmtList(d.construction_features), wide: true },
    { label: 'Puntos fuertes', get: d => fmtList(d.strong_points), wide: true },
    { label: 'Motivo de venta', get: d => fmtText(d.reason_for_sale), wide: true },
    { label: 'Plazo de venta', get: d => fmtText(d.sale_timeframe) },
    { label: 'Notas', get: d => fmtText(d.extra_notes), wide: true },
]

const PURCHASE_SPEC: FieldSpec<Record<string, unknown>>[] = [
    { label: 'Tipo buscado', get: d => {
        const t = fmtEnum(PROPERTY_TYPE_LABELS, d.property_type_target)
        if (!t) return null
        return d.property_type_target === 'otro' && d.property_type_other ? `${t} (${String(d.property_type_other)})` : t
    } },
    { label: 'Barrio buscado', get: d => fmtText(d.neighborhood_target) },
    { label: 'Ambientes', get: d => fmtNum(d.rooms_target) },
    { label: 'Dormitorios', get: d => fmtNum(d.bedrooms_target) },
    { label: 'Baños', get: d => fmtNum(d.bathrooms_target) },
    { label: 'Cocheras', get: d => fmtNum(d.garages_target) },
    { label: 'M² cubiertos', get: d => fmtNum(d.covered_m2_target, ' m²') },
    { label: 'M² totales', get: d => fmtNum(d.total_m2_target, ' m²') },
    { label: 'Antigüedad máx.', get: d => fmtNum(d.age_years_target, ' años') },
    { label: 'Orientación', get: d => fmtEnum(ORIENTATION_LABELS, d.orientation_target) },
    { label: 'Disposición', get: d => fmtEnum(DISPOSITION_LABELS, d.disposition_target) },
    { label: 'Calidad', get: d => fmtEnum(QUALITY_LABELS, d.quality_target) },
    { label: 'Presupuesto', get: d => {
        const cur = (d.budget_currency as string) || 'USD'
        const min = fmtMoney(d.budget_min, cur)
        const max = fmtMoney(d.budget_max, cur)
        if (min && max) return `${min} – ${max}`
        return min || max
    } },
    { label: 'Sellos', get: d => fmtMoney(d.stamps_amount) },
    { label: 'Honorarios', get: d => fmtMoney(d.fees_amount) },
    { label: 'Plazo de compra', get: d => fmtText(d.purchase_timeframe) },
    { label: 'Requisitos', get: d => fmtList(d.required_features), wide: true },
    { label: 'Notas', get: d => fmtText(d.extra_notes), wide: true },
]

function buildRows(data: Record<string, unknown>, spec: FieldSpec<Record<string, unknown>>[]): Row[] {
    const rows: Row[] = []
    for (const f of spec) {
        const value = f.get(data)
        if (value) rows.push({ label: f.label, value, wide: f.wide })
    }
    return rows
}

// Labels amigables para claves conocidas que llegan por el fallback genérico
// (p.ej. buyer_interest con forma GHL: zona/presupuesto_min/...). Evita mostrar
// claves técnicas humanizadas a medias ("Presupuesto min").
const GENERIC_KEY_LABELS: Record<string, string> = {
    zona: 'Zona buscada',
    presupuesto_min: 'Presupuesto mínimo',
    presupuesto_max: 'Presupuesto máximo',
    ambientes_min: 'Ambientes mínimos',
    ambientes: 'Ambientes',
    dormitorios: 'Dormitorios',
    notas: 'Notas',
    observaciones: 'Observaciones',
    barrio: 'Barrio',
    presupuesto: 'Presupuesto',
}

// Humaniza una clave snake_case → "Título legible". Fallback genérico.
function humanizeKey(key: string): string {
    if (GENERIC_KEY_LABELS[key]) return GENERIC_KEY_LABELS[key]
    const cleaned = key.replace(/_/g, ' ').trim()
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}
function genericValue(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'boolean') return v ? 'Sí' : 'No'
    if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('es-AR') : null
    if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : null
    if (typeof v === 'object') return null // evitamos objetos anidados crudos
    return String(v)
}
function buildGenericRows(data: Record<string, unknown>): Row[] {
    const rows: Row[] = []
    for (const [k, v] of Object.entries(data)) {
        if (k === 'updated_at') continue
        const value = genericValue(v)
        if (value) rows.push({ label: humanizeKey(k), value })
    }
    return rows
}

// ── UI ───────────────────────────────────────────────────────────────────────
function RowsGrid({ rows }: { rows: Row[] }) {
    if (rows.length === 0) return null
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {rows.map((r, i) => (
                <div key={`${r.label}-${i}`} className={r.wide ? 'sm:col-span-2' : undefined}>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</span>
                    <p className="text-sm font-medium break-words whitespace-pre-wrap">{r.value}</p>
                </div>
            ))}
        </div>
    )
}

function Section({ title, rows }: { title?: string; rows: Row[] }) {
    if (rows.length === 0) return null
    return (
        <div className="space-y-2">
            {title && <p className="text-sm font-semibold">{title}</p>}
            <RowsGrid rows={rows} />
        </div>
    )
}

/**
 * Render amigable de un snapshot de visit_data (o cualquier objeto). Nunca
 * muestra JSON crudo.
 */
export function VisitDataView({ data }: { data: unknown }) {
    // Robustez: visit_data debería ser JSONB (objeto), pero si por datos legacy
    // llegara como string JSON, lo parseamos en vez de no mostrar nada.
    let parsed: unknown = data
    if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed) } catch { return null }
    }
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>

    const saleObj = obj.sale && typeof obj.sale === 'object' ? (obj.sale as Record<string, unknown>) : null
    const purchaseObj = obj.purchase && typeof obj.purchase === 'object' ? (obj.purchase as Record<string, unknown>) : null

    // Forma canónica { sale, purchase }
    if (saleObj || purchaseObj) {
        const saleRows = saleObj ? buildRows(saleObj, SALE_SPEC) : []
        const purchaseRows = purchaseObj ? buildRows(purchaseObj, PURCHASE_SPEC) : []
        if (saleRows.length === 0 && purchaseRows.length === 0) {
            return <p className="text-sm text-muted-foreground italic">Sin datos relevados.</p>
        }
        return (
            <div className="space-y-4">
                {saleRows.length > 0 && <Section title={purchaseRows.length > 0 ? 'Venta' : undefined} rows={saleRows} />}
                {purchaseRows.length > 0 && <Section title="Búsqueda de compra" rows={purchaseRows} />}
            </div>
        )
    }

    // Objeto "plano" tipo sale (legacy) — si tiene claves conocidas, usamos el spec de venta.
    const looksLikeSale = ['rooms', 'covered_m2', 'quality', 'total_m2', 'bedrooms'].some(k => k in obj)
    const rows = looksLikeSale ? buildRows(obj, SALE_SPEC) : buildGenericRows(obj)
    if (rows.length === 0) return <p className="text-sm text-muted-foreground italic">Sin datos relevados.</p>
    return <RowsGrid rows={rows} />
}
