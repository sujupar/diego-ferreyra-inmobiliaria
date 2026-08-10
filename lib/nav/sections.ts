import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, ListChecks, Inbox, Flag, Columns3, Contact, CalendarCheck, ClipboardList,
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

const INICIO: NavItem = { href: '/inicio', label: 'Inicio', icon: LayoutDashboard }
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
    // SIN Tasaciones, a propósito. El abogado no tiene ni un permiso
    // `appraisal.*`, y desde que se cerró `/api/appraisals` —podía LEER los
    // datos del cliente y la valuación de todas, editarlas, crearlas y
    // borrarlas— ese ítem lleva a una pantalla que solo dice "no tenés
    // permiso". Un botón que existe únicamente para negarse es peor que no
    // tenerlo.
    //
    // Si algún día necesita ver la tasación de la propiedad que está revisando,
    // la respuesta NO es devolver este ítem —que lo manda al listado completo—
    // sino darle lectura acotada a ESA tasación desde la ficha de la propiedad.
    return [{ label: null, entries: [PENDIENTES, REVISION_LEGAL] }]
  }

  if (role === 'asesor') {
    return [
      { label: null, entries: [INICIO, PENDIENTES] },
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
      { label: null, entries: [INICIO, PENDIENTES] },
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
    { label: null, entries: [INICIO, PENDIENTES] },
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
 * Rutas fuera del menú (no aparecen en `getNavSections` de ningún rol) que
 * igual merecen un título propio en vez de caer en el nombre de la empresa.
 * ÚNICO lugar donde se define esto — si mañana aparece otra ruta huérfana
 * (p. ej. otro `/algo/[id]` sin entrada de menú), se agrega ACÁ, no con un
 * `if (pathname.startsWith(...))` suelto en otro archivo.
 *
 * `prefix` matchea exacto o como prefijo de segmento (mismo criterio que los
 * ítems del menú). Nunca compite con el menú: solo se consulta cuando NINGÚN
 * ítem matcheó ni exacto ni por prefijo.
 */
const EXTRA_TITLES: { prefix: string; title: string }[] = [
  // /mi-perfil: accesible para todos los roles desde el menú de usuario, pero
  // no vive en `getNavSections` (no es parte de la navegación principal).
  { prefix: '/mi-perfil', title: 'Mi perfil' },
  // /pipeline/[id]: ficha de UN deal del CRM. Se llega desde /crm, /tasks y la
  // ficha de contacto — nunca desde un ítem de menú con ese href (el único
  // href que empieza con /pipeline en el menú es /pipeline/new, que matchea
  // antes por ser exacto). "CRM" es honesto: es la misma área que el ítem CRM.
  { prefix: '/pipeline', title: 'CRM' },
  // /scheduled-appraisals/[id]: una tasación agendada pendiente de captar,
  // enlazada desde Inicio. No hay listado propio en el menú; pertenece al
  // área de Tasaciones (mismo nombre que usa el desplegable Tasaciones).
  { prefix: '/scheduled-appraisals', title: 'Tasaciones' },
  // /properties/[id]: para casi todos los roles esto lo resuelve el menú
  // (/properties está adentro del desplegable "Propiedades"). El ABOGADO es la
  // excepción: su menú solo tiene /properties/review, que no matchea la ficha de
  // una propiedad ni exacto ni por prefijo, así que la barra le mostraba el
  // nombre de la empresa justo en la pantalla donde hace todo su trabajo (entra
  // desde Revisión legal). Va último porque EXTRA_TITLES solo se consulta cuando
  // NINGÚN ítem del menú matchea: a los demás roles no les cambia nada.
  { prefix: '/properties', title: 'Propiedades' },
]

/**
 * Qué mostrar en la barra superior para una ruta. Prefiere la coincidencia
 * exacta con un ítem del menú.
 *
 * Si no hay exacta, gana el prefijo MÁS LARGO entre los ítems — pero el título
 * que se muestra para un prefijo depende de dónde vive el ítem:
 *
 * - Ítem SUELTO (sin desplegable, ej. CRM, Contactos, Redes sociales): su
 *   etiqueta ya nombra TODA el área, no una pantalla específica dentro de
 *   ella — mostrarla para cualquier subruta (`/contacts/<id>`) es honesto.
 * - Ítem de un DESPLEGABLE (ej. Propiedades → Listado/Nueva/Revisión legal):
 *   los hermanos son pantallas DISTINTAS entre sí. Afirmar el hermano
 *   específico para una subruta que no es esa pantalla sería mentir —es
 *   exactamente el bug de `/properties/<id>` mostrando "Propiedades · Listado"
 *   cuando en realidad es la ficha de una propiedad, no el listado—. Por eso
 *   una coincidencia por PREFIJO (no exacta) de un ítem de desplegable se
 *   degrada al nombre del desplegable a secas (sin ítem específico, sin
 *   `section` separada — ya es lo más específico que se puede afirmar sin
 *   mentir).
 *
 * Si ningún ítem del menú matchea ni exacto ni por prefijo, se prueba
 * `EXTRA_TITLES` (rutas huérfanas con título propio) antes de caer en el
 * nombre de la empresa como último recurso.
 */
export function titleForPath(
  groups: NavGroup[],
  pathname: string,
): { section: string | null; title: string } {
  // Se juntan candidatos y se elige al final, en vez de ir pisando un `let`
  // desde adentro de una función: TypeScript no estrecha bien una variable que
  // se asigna dentro de una closure y tira "'mejor' is possibly null".
  const candidatos: { section: string | null; title: string; largo: number }[] = []

  const considerar = (item: NavItem, section: string | null, desplegable: string | null) => {
    const exacto = pathname === item.href
    const prefijo = pathname.startsWith(item.href + '/')
    if (!exacto && !prefijo) return
    if (exacto) {
      candidatos.push({ section, title: item.label, largo: Number.MAX_SAFE_INTEGER })
      return
    }
    if (desplegable) {
      // Prefijo dentro de un desplegable: degradar al nombre del grupo (ver
      // comentario de la función) — nunca al ítem hermano específico.
      candidatos.push({ section: null, title: desplegable, largo: item.href.length })
    } else {
      candidatos.push({ section, title: item.label, largo: item.href.length })
    }
  }

  for (const g of groups) {
    for (const e of g.entries) {
      if (isCollapsible(e)) for (const i of e.items) considerar(i, e.label, e.label)
      else considerar(e, null, null)
    }
  }

  if (candidatos.length > 0) {
    const mejor = candidatos.reduce((a, b) => (b.largo > a.largo ? b : a))
    return { section: mejor.section, title: mejor.title }
  }

  const extra = EXTRA_TITLES.find(e => pathname === e.prefix || pathname.startsWith(e.prefix + '/'))
  if (extra) return { section: null, title: extra.title }

  return { section: null, title: 'Diego Ferreyra Inmobiliaria' }
}
