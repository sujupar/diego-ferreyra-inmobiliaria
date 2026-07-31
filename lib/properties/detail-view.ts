/**
 * Helpers PUROS de la ficha de propiedad (/properties/[id]).
 *
 * Viven fuera de los componentes a propósito: Turbopack no arranca en esta
 * carpeta (bug con el acento de "Gestión" en el path absoluto), así que la
 * única verificación barata y confiable de esta lógica es vitest sobre
 * funciones sin React.
 */

export type TabKey = 'propiedad' | 'multimedia' | 'documentacion' | 'difusion' | 'historial'

export const TAB_LABELS: Record<TabKey, string> = {
  propiedad: 'Propiedad',
  multimedia: 'Multimedia',
  documentacion: 'Documentación',
  difusion: 'Difusión',
  historial: 'Historial',
}

/* ---------------------------------- datos --------------------------------- */

export interface KeyStat { key: string; label: string; value: string }

export interface KeyStatsInput {
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  total_area?: number | null
  floor?: number | null
  age?: number | null
  expensas?: number | null
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
})

export function formatMoney(amount: number, currency: string): string {
  const safe = currency === 'ARS' ? 'ARS' : 'USD'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: safe, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

/** Datos clave de la cabecera. Omite lo que no está cargado — sin huecos vacíos. */
export function buildKeyStats(p: KeyStatsInput): KeyStat[] {
  const out: KeyStat[] = []
  const push = (key: string, label: string, value: string | null) => {
    if (value) out.push({ key, label, value })
  }
  push('rooms', 'Ambientes', p.rooms ? String(p.rooms) : null)
  push('bedrooms', 'Dormitorios', p.bedrooms ? String(p.bedrooms) : null)
  push('bathrooms', 'Baños', p.bathrooms ? String(p.bathrooms) : null)
  push('garages', 'Cocheras', p.garages ? String(p.garages) : null)
  push('covered_area', 'Cubierta', p.covered_area ? `${p.covered_area} m²` : null)
  push('total_area', 'Total', p.total_area ? `${p.total_area} m²` : null)
  // El piso 0 es Planta Baja: no se puede filtrar por falsy.
  push('floor', 'Piso', p.floor == null ? null : p.floor === 0 ? 'PB' : `${p.floor}º`)
  push('age', 'Antigüedad', p.age ? `${p.age} año${p.age === 1 ? '' : 's'}` : null)
  push('expensas', 'Expensas', p.expensas ? ARS.format(p.expensas) : null)
  return out
}

/* --------------------------------- galería -------------------------------- */

/**
 * Distribución del mosaico según cuántas fotos hay, para que nunca quede un
 * hueco gris. El contenedor tiene alto fijo; las imágenes van con `h-full`.
 */
export function heroLayout(count: number): { grid: string; cover: string; thumbs: number } {
  if (count <= 1) return { grid: 'grid-cols-1', cover: '', thumbs: 0 }
  if (count === 2) return { grid: 'grid-cols-2', cover: '', thumbs: 1 }
  if (count === 3) return { grid: 'grid-cols-3 grid-rows-2', cover: 'col-span-2 row-span-2', thumbs: 2 }
  // Con 4 fotos exactas, el mosaico "portada grande + 4 chicas" dejaría una
  // celda vacía: van las 4 parejas en 2×2.
  if (count === 4) return { grid: 'grid-cols-2 grid-rows-2', cover: '', thumbs: 3 }
  return { grid: 'grid-cols-4 grid-rows-2', cover: 'col-span-2 row-span-2', thumbs: 4 }
}

/* -------------------------------- pestañas -------------------------------- */

export function visibleTabs(input: { role: string | null | undefined; status: string }): TabKey[] {
  const isAbogado = input.role === 'abogado'
  const tabs: TabKey[] = ['propiedad']
  if (!isAbogado) tabs.push('multimedia')
  tabs.push('documentacion')
  if (!isAbogado && input.status === 'approved') tabs.push('difusion')
  tabs.push('historial')
  return tabs
}

/** La pestaña de la URL, o la primera visible si ese valor no corresponde. */
export function resolveTab(param: string | null | undefined, visible: TabKey[]): TabKey {
  const candidate = (param ?? '') as TabKey
  return visible.includes(candidate) ? candidate : visible[0]
}

/* ------------------------------ próximo paso ------------------------------ */

export interface GhlCheckInput {
  address?: string | null
  neighborhood?: string | null
  asking_price?: number | null
  commission_percentage?: number | null
  covered_area?: number | null
  total_area?: number | null
  photos?: string[] | null
}

const isPlaceholder = (v?: string | null) =>
  !v || v.startsWith('[PENDIENTE') || v.startsWith('[Importado GHL')

export function ghlMissingFields(p: GhlCheckInput): string[] {
  const missing: string[] = []
  if (isPlaceholder(p.address)) missing.push('dirección')
  if (isPlaceholder(p.neighborhood)) missing.push('barrio')
  if (!p.asking_price || p.asking_price <= 0) missing.push('precio de venta')
  if (!p.commission_percentage) missing.push('comisión')
  if (!p.covered_area) missing.push('m² cubiertos')
  if (!p.total_area) missing.push('m² totales')
  if (!Array.isArray(p.photos) || p.photos.length === 0) missing.push('fotos')
  return missing
}

export type NextStepTone = 'info' | 'warn' | 'danger' | 'neutral'

export type NextStepAction =
  | { kind: 'tab'; tab: TabKey; label: string }
  | { kind: 'submit-review'; label: string }

export interface NextStep {
  id: string
  tone: NextStepTone
  title: string
  text: string
  action: NextStepAction | null
}

export interface NextStepInput {
  role: string | null | undefined
  status: string
  legalStatus: string
  legalNotes: string | null
  photosCount: number
  documentsCount: number
  ghlImported: boolean
  ghlMissing: string[]
  importSource: string | null
  legalDocsPending: boolean
  originPending: boolean
}

/**
 * UN solo bloque de aviso, por prioridad, en lugar de los cinco banners
 * sueltos de la versión anterior. Devuelve null cuando no hay nada pendiente.
 */
export function nextStep(i: NextStepInput): NextStep | null {
  const isAbogado = i.role === 'abogado'

  if (i.status === 'descartada') {
    return {
      id: 'descartada', tone: 'neutral', title: 'Propiedad descartada',
      text: 'Quedó fuera del flujo activo. Podés restaurarla a borrador desde el pie de la página.',
      action: null,
    }
  }

  if (i.legalStatus === 'rejected') {
    return {
      id: 'legal-rejected', tone: 'danger', title: 'Documentación rechazada',
      text: i.legalNotes || 'El abogado rechazó la documentación. Revisá las observaciones y volvé a enviarla.',
      action: { kind: 'tab', tab: 'documentacion', label: 'Ver observaciones' },
    }
  }

  if (i.ghlImported && i.ghlMissing.length > 0) {
    return {
      id: 'ghl', tone: 'warn', title: 'Propiedad importada desde GHL',
      text: `Faltan completar: ${i.ghlMissing.join(', ')}.`,
      action: null,
    }
  }

  if (i.importSource === 'csv_precaptada' || i.legalDocsPending || i.originPending) {
    const pendientes: string[] = []
    if (i.legalDocsPending) pendientes.push('subir los archivos de la documentación legal')
    if (i.originPending) pendientes.push('asignar el origen del lead')
    return {
      id: 'precaptada', tone: 'warn', title: 'Propiedad captada importada',
      text: pendientes.length
        ? `Queda pendiente: ${pendientes.join(' y ')}.`
        : 'Fue subida en bloque; revisá que los datos estén completos.',
      action: i.legalDocsPending
        ? { kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' }
        : null,
    }
  }

  if (i.status === 'pending_review' && i.legalStatus !== 'approved') {
    return isAbogado
      ? {
          id: 'legal-todo', tone: 'info', title: 'Revisión legal pendiente',
          text: 'Revisá la documentación y aprobá o rechazá la propiedad.',
          action: { kind: 'tab', tab: 'documentacion', label: 'Revisar documentación' },
        }
      : {
          id: 'legal-waiting', tone: 'info', title: 'En revisión legal',
          text: 'La documentación fue enviada al abogado. Te avisamos cuando la revise.',
          action: null,
        }
  }

  if (i.legalStatus === 'approved' && i.photosCount === 0) {
    return {
      id: 'photos', tone: 'warn', title: 'Fotos pendientes',
      text: 'La revisión legal fue aprobada. Subí las fotos para completar la captación.',
      action: isAbogado ? null : { kind: 'tab', tab: 'multimedia', label: 'Subir fotos' },
    }
  }

  if ((i.status === 'pending_docs' || i.status === 'pending_photos') && !isAbogado) {
    return i.documentsCount > 0
      ? {
          id: 'submit', tone: 'info', title: 'Lista para revisión legal',
          text: 'Ya hay documentación cargada. Enviala al abogado para que la revise.',
          action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
        }
      : {
          id: 'docs', tone: 'warn', title: 'Falta la documentación',
          text: 'Subí los documentos obligatorios para poder enviar la propiedad a revisión legal.',
          action: { kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' },
        }
  }

  return null
}

/* -------------------------------- etiquetas ------------------------------- */

export function operationLabel(op: string | null | undefined): string {
  switch ((op ?? 'venta').toLowerCase().trim()) {
    case 'alquiler': return 'en alquiler'
    case 'alquiler_temporario':
    case 'alquiler temporario': return 'en alquiler temporario'
    default: return 'en venta'
  }
}

const TYPE_LABELS: Record<string, string> = {
  ph: 'PH', casa: 'Casa', departamento: 'Departamento', local: 'Local',
  oficina: 'Oficina', terreno: 'Terreno', cochera: 'Cochera', galpon: 'Galpón',
}

export function propertyTypeLabel(t: string | null | undefined): string {
  const s = (t ?? '').trim().toLowerCase()
  if (!s) return 'Propiedad'
  return TYPE_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1)
}
