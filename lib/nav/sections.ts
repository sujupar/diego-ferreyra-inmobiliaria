import type { LucideIcon } from 'lucide-react'
import {
  ListChecks, Inbox, Flag, Columns3, Contact, CalendarCheck, ClipboardList,
  Building2, Megaphone, BarChart3, Filter, Settings, Wrench, UserCog,
} from 'lucide-react'
import type { Role } from '@/types/auth.types'
import { hasPermission, hasAnyPermission, type Permission } from '@/lib/auth/roles'

/** Hoy el único contador de la navegación es el de leads nuevos del Inbox. */
export type NavBadge = 'inbox'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badge?: NavBadge
}

export interface NavCollapsible {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export type NavEntry = NavItem | NavCollapsible

export interface NavGroup {
  /** `null` = grupo sin encabezado (sus ítems se dibujan sueltos arriba de todo). */
  label: string | null
  entries: NavEntry[]
}

export function isCollapsible(e: NavEntry): e is NavCollapsible {
  return 'items' in e
}

const PENDIENTES: NavItem = { href: '/tasks', label: 'Pendientes', icon: ListChecks }
const INBOX: NavItem = { href: '/inbox', label: 'Inbox', icon: Inbox, badge: 'inbox' }
const AVISOS: NavItem = { href: '/avisos', label: 'Avisos por identificar', icon: Flag }
const CRM: NavItem = { href: '/crm', label: 'CRM', icon: Columns3 }
const VISITAS: NavItem = { href: '/visits', label: 'Visitas', icon: CalendarCheck }
const REDES: NavItem = { href: '/redes-sociales', label: 'Redes sociales', icon: Megaphone }
const CONTACTOS: NavItem = { href: '/contacts', label: 'Contactos', icon: Contact }
const LISTADO: NavItem = { href: '/properties', label: 'Listado', icon: Building2 }
const NUEVA_PROPIEDAD: NavItem = { href: '/properties/new', label: 'Nueva', icon: Building2 }

const COORDINAR: NavItem = { href: '/pipeline/new', label: 'Coordinar', icon: ClipboardList }
const NUEVA_TASACION: NavItem = { href: '/appraisal/new', label: 'Nueva tasación', icon: ClipboardList }
const HISTORIAL: NavItem = { href: '/appraisals', label: 'Historial', icon: ClipboardList }
const REVISION_LEGAL: NavItem = { href: '/properties/review', label: 'Revisión legal', icon: Building2 }

/**
 * El menú de cada rol. Las condiciones de permiso son EXACTAMENTE las que había en
 * `app/(dashboard)/layout.tsx` antes de este módulo; los tests de este archivo las
 * fijan. Si hace falta cambiar quién ve qué, se cambia acá y se actualiza el test —
 * nunca al revés.
 */
export function getNavSections(role: Role): NavGroup[] {
  const can = (p: Permission) => hasPermission(role, p)

  if (role === 'abogado') {
    return [{ label: null, entries: [PENDIENTES, REVISION_LEGAL, HISTORIAL] }]
  }

  if (role === 'asesor') {
    return [
      { label: null, entries: [PENDIENTES] },
      { label: 'Mi día', entries: [INBOX, CRM, VISITAS, { ...CONTACTOS, label: 'Mis contactos' }] },
      {
        label: 'Captación',
        entries: [
          { label: 'Tasaciones', icon: ClipboardList, items: [COORDINAR, NUEVA_TASACION, HISTORIAL] },
          { href: '/properties', label: 'Mis propiedades', icon: Building2 },
        ],
      },
      { label: 'Marketing', entries: [REDES] },
    ]
  }

  if (role === 'coordinador') {
    return [
      { label: null, entries: [PENDIENTES] },
      {
        label: 'Captación',
        entries: [
          { label: 'Tasaciones', icon: ClipboardList, items: [COORDINAR, HISTORIAL] },
          { label: 'Propiedades', icon: Building2, items: [LISTADO, NUEVA_PROPIEDAD] },
        ],
      },
      { label: 'Comercial', entries: [INBOX, AVISOS, CRM, CONTACTOS, VISITAS] },
      { label: 'Marketing', entries: [REDES] },
    ]
  }

  // admin, dueno y los roles heredados (agent, viewer) — igual que el `default:`
  // del switch anterior. Los guardas por permiso hacen el resto del filtrado.
  const marketing: NavItem[] = [REDES]
  if (can('metrics.view')) {
    marketing.push(
      { href: '/metrics', label: 'Métricas', icon: BarChart3 },
      { href: '/embudos', label: 'Embudos', icon: Filter },
    )
  }

  const groups: NavGroup[] = [
    { label: null, entries: [PENDIENTES] },
    {
      label: 'Captación',
      entries: [
        { label: 'Tasaciones', icon: ClipboardList, items: [COORDINAR, NUEVA_TASACION, HISTORIAL] },
        {
          label: 'Propiedades',
          icon: Building2,
          items: [LISTADO, NUEVA_PROPIEDAD, ...(can('properties.review') ? [REVISION_LEGAL] : [])],
        },
      ],
    },
    { label: 'Comercial', entries: [INBOX, AVISOS, CRM, CONTACTOS, VISITAS] },
    { label: 'Marketing', entries: marketing },
  ]

  if (hasAnyPermission(role, ['settings.manage', 'users.manage'])) {
    const admin: NavEntry[] = []
    if (can('settings.manage')) {
      admin.push({
        label: 'Configuración',
        icon: Settings,
        items: [
          { href: '/settings', label: 'General', icon: Settings },
          { href: '/settings/notifications', label: 'Notificaciones', icon: Settings },
          { href: '/settings/portals', label: 'Portales', icon: Settings },
        ],
      })
      admin.push({
        label: 'Herramientas',
        icon: Wrench,
        items: [
          { href: '/admin/pipeline-test', label: 'Probar el sistema', icon: Wrench },
          { href: '/admin/email-test', label: 'Test de emails', icon: Wrench },
          { href: '/admin/ai-agent', label: 'Probar el agente IA', icon: Wrench },
          { href: '/admin/ai-usage', label: 'Costo del agente IA', icon: Wrench },
        ],
      })
    }
    if (can('users.manage')) admin.push({ href: '/users', label: 'Usuarios', icon: UserCog })
    groups.push({ label: 'Administración', entries: admin })
  }

  return groups
}

/** Todas las rutas alcanzables desde el menú, aplanadas y en orden de aparición. */
export function navHrefs(groups: NavGroup[]): string[] {
  const out: string[] = []
  for (const g of groups) {
    for (const e of g.entries) {
      if (isCollapsible(e)) out.push(...e.items.map(i => i.href))
      else out.push(e.href)
    }
  }
  return out
}

/**
 * De un conjunto de HERMANOS (los ítems sueltos de un grupo, o los ítems de un
 * desplegable — nunca mezclando ambos niveles a la vez), cuál href es "el
 * activo" para `pathname`. Gana la coincidencia más larga: exacta >
 * prefijo más largo > prefijo más corto. `null` si ninguno matchea.
 *
 * Mismo criterio que usa `titleForPath` más abajo (exacto vs. prefijo,
 * `Number.MAX_SAFE_INTEGER` para el exacto), acotado a un solo nivel de
 * hermanos. Existe para que el consumidor (`AppSidebar`) NO evalúe cada
 * hermano por separado sin comparar entre ellos — eso fue un bug real: en
 * `/properties/new`, tanto `/properties` (prefijo) como `/properties/new`
 * (exacto) "matcheaban" de forma independiente y los dos quedaban con
 * `aria-current`. Acá gana uno solo.
 */
export function activeHrefAmong(hrefs: string[], pathname: string): string | null {
  let mejor: { href: string; largo: number } | null = null
  for (const href of hrefs) {
    const exacto = pathname === href
    const prefijo = pathname.startsWith(href + '/')
    if (!exacto && !prefijo) continue
    const largo = exacto ? Number.MAX_SAFE_INTEGER : href.length
    if (!mejor || largo > mejor.largo) mejor = { href, largo }
  }
  return mejor ? mejor.href : null
}

/**
 * Qué mostrar en la barra superior para una ruta. Prefiere la coincidencia exacta;
 * si no hay, gana el prefijo MÁS LARGO — así `/properties/review` no se lo come
 * `/properties`, y `/properties/abc-123` (ficha de propiedad, que no está en el
 * menú) cae razonablemente en "Propiedades · Listado".
 */
export function titleForPath(
  groups: NavGroup[],
  pathname: string,
): { section: string | null; title: string } {
  // Se juntan candidatos y se elige al final, en vez de ir pisando un `let`
  // desde adentro de una función: TypeScript no estrecha bien una variable que
  // se asigna dentro de una closure y tira "'mejor' is possibly null".
  const candidatos: { section: string | null; title: string; largo: number }[] = []

  const considerar = (item: NavItem, section: string | null) => {
    const exacto = pathname === item.href
    const prefijo = pathname.startsWith(item.href + '/')
    if (!exacto && !prefijo) return
    candidatos.push({
      section,
      title: item.label,
      largo: exacto ? Number.MAX_SAFE_INTEGER : item.href.length,
    })
  }

  for (const g of groups) {
    for (const e of g.entries) {
      if (isCollapsible(e)) for (const i of e.items) considerar(i, e.label)
      else considerar(e, null)
    }
  }

  if (candidatos.length === 0) return { section: null, title: 'Diego Ferreyra Inmobiliaria' }
  const mejor = candidatos.reduce((a, b) => (b.largo > a.largo ? b : a))
  return { section: mejor.section, title: mejor.title }
}
