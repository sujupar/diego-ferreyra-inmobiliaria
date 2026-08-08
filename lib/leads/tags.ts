/**
 * Etiquetas de colores para leads (`lead_tags` / `lead_tag_assignments`,
 * migración `20260801000001_lead_tags_y_estado.sql`). Distinto del ESTADO del
 * embudo (`./pipeline-state.ts`): acá hay VARIAS por persona y las pone el
 * equipo a mano; el estado es UNO solo y se mueve con los hechos.
 *
 * El catálogo de etiquetas (qué etiquetas existen, sus nombres) vive en la
 * tabla `lead_tags` — a propósito NO se hardcodea acá ninguna lista de
 * nombres/slugs, para que agregar una etiqueta nueva sea agregar una fila en
 * la base, no tocar código. Lo único fijo en este archivo es el mapeo de
 * COLOR (un token chico y estable: 'red', 'amber', ...) a clases Tailwind —
 * eso es un detalle de presentación, no el catálogo de negocio.
 *
 * `lead_tags` / `lead_tag_assignments` NO están en `types/database.types.ts`
 * (el CLI de Supabase no conecta acá — ver CLAUDE.md § Supabase). Los tipos
 * de abajo son shapes manuales que reflejan la migración; quien consulte la
 * base (la API de otra tarea) usa un cliente SIN el genérico `<Database>` +
 * cast, mismo patrón que `lib/integrations/whatsapp/log.ts`.
 */

/** Fila del catálogo `lead_tags`. */
export interface LeadTag {
  id: string
  slug: string
  label: string
  /** Token de color, ej. 'red' | 'amber' | 'slate' — ver `TAG_COLOR_CLASSES`. */
  color: string
  sortOrder: number
  isActive: boolean
}

/** Fila de `lead_tag_assignments` — qué etiqueta tiene qué lead. */
export interface LeadTagAssignment {
  leadId: string
  tagId: string
  assignedBy: string | null
  assignedAt: string
}

export interface TagColorClasses {
  /** Fondo + texto del chip, con variante dark. */
  bg: string
  text: string
  border: string
  /** Pastilla/punto sólido chico (ej. contador, indicador). */
  dot: string
}

/**
 * Paleta de colores sembrada en `lead_tags.color` (migración
 * `20260801000001`, sección 6 — 12 etiquetas). Mismo criterio visual que
 * `app/(dashboard)/crm/_components/crm-stages.ts` (`badgeBg`/`badgeText` con
 * variante dark — se partió de `crm/page.tsx` en la Task 11).
 *
 * Clases escritas LITERALES (no `bg-${color}-100` interpolado) porque
 * Tailwind v4 arma su CSS escaneando el código en busca de nombres de clase
 * completos — una clase armada en runtime por interpolación nunca aparece en
 * el output.
 */
const TAG_COLOR_CLASSES: Record<string, TagColorClasses> = {
  red: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  slate: { bg: 'bg-slate-100 dark:bg-slate-800/60', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700', dot: 'bg-slate-500' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-900/50', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800', dot: 'bg-cyan-500' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800', dot: 'bg-yellow-500' },
  teal: { bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800', dot: 'bg-teal-500' },
  zinc: { bg: 'bg-zinc-100 dark:bg-zinc-800/60', text: 'text-zinc-700 dark:text-zinc-300', border: 'border-zinc-200 dark:border-zinc-700', dot: 'bg-zinc-500' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/50', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-500' },
}

/** Fallback si algún día aparece en la base un color sin mapear acá — nunca revienta la UI. */
const FALLBACK_COLOR_CLASSES: TagColorClasses = TAG_COLOR_CLASSES.slate

/** Mapea `lead_tags.color` (texto libre en la base) a clases Tailwind. Nunca lanza. */
export function colorForTag(color: string): TagColorClasses {
  return TAG_COLOR_CLASSES[color] ?? FALLBACK_COLOR_CLASSES
}

// ---------------------------------------------------------------------------
// Avatares: iniciales + color estable derivado del nombre completo.
// ---------------------------------------------------------------------------

/**
 * Paleta de avatares — deliberadamente DISTINTA de `TAG_COLOR_CLASSES`: un
 * avatar es un círculo sólido (fondo fuerte + texto blanco), un chip de
 * etiqueta es fondo pastel + texto de color. Mezclar las dos paletas
 * acoplaría dos conceptos de presentación que no tienen por qué coincidir.
 */
const AVATAR_PALETTE: ReadonlyArray<{ bg: string; text: string }> = [
  { bg: 'bg-red-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-amber-500', text: 'text-white' },
  { bg: 'bg-lime-600', text: 'text-white' },
  { bg: 'bg-emerald-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-violet-500', text: 'text-white' },
  { bg: 'bg-fuchsia-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
]

/**
 * Hash de string determinístico (FNV-1a de 32 bits). Se usa el NOMBRE
 * COMPLETO (no solo la primera palabra) para que dos personas cuyo nombre
 * empieza igual ("Juan Pérez" / "Juan Gómez") caigan en buckets distintos —
 * si solo mirara "Juan", ambas serían siempre del mismo color. Se probó
 * primero con djb2 (`hash*33 + c`) y ese PAR EXACTO colisionaba (bucket 3 en
 * los dos, paleta de 12) — FNV-1a difunde mejor sufijos cortos que solo
 * difieren al final del string, que es justo el caso de nombre+apellido
 * compartiendo el nombre de pila.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) // FNV prime
  }
  return hash >>> 0 // a unsigned 32-bit
}

export interface InitialsAndColor {
  /** Hasta 2 letras mayúsculas: primera + última palabra del nombre. */
  initials: string
  bg: string
  text: string
}

/**
 * Iniciales (máx. 2 letras) + color estable para el avatar circular de un
 * contacto. La MISMA persona (mismo nombre completo) siempre da el mismo
 * color — es una función pura del string, sin estado ni random. Nunca lanza:
 * nombre vacío/undefined cae al placeholder '?'.
 */
export function initialsAndColor(fullName: string | null | undefined): InitialsAndColor {
  const clean = (fullName ?? '').trim()
  const parts = clean.split(/\s+/).filter(Boolean)

  const initials =
    parts.length === 0
      ? '?'
      : parts.length === 1
        ? parts[0].slice(0, 1).toUpperCase()
        : (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase()

  const seed = clean || '?'
  const idx = hashString(seed) % AVATAR_PALETTE.length
  const { bg, text } = AVATAR_PALETTE[idx]
  return { initials, bg, text }
}

// ---------------------------------------------------------------------------
// Re-export del estado del embudo: el brief de esta tarea (task-1) pide
// `nextStateFor` como export de este módulo, pero la implementación real
// vive en `./pipeline-state.ts` junto con TODO lo demás de la máquina de
// estados (avance, historial, "nunca retrocede solo") — mantenerla en un
// solo lugar evita que las dos tareas terminen con dos versiones de la misma
// función que se desincronizan. Acá solo se re-exporta para que el import
// `from '@/lib/leads/tags'` siga funcionando como lo describe el brief.
// ---------------------------------------------------------------------------
export {
  nextStateFor,
  PIPELINE_STATES,
  PIPELINE_STATE_LABELS,
  isPipelineState,
  type PipelineState,
  type PipelineEvent,
} from './pipeline-state'
