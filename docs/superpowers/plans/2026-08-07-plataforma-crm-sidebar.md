# Rediseño CRM de la plataforma — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el menú superior por un menú lateral estilo CRM con submenús, unificar tablas y filtros, y agregar tarjetas de número más una pantalla de Inicio — sin alterar ninguna funcionalidad existente.

**Architecture:** El menú por rol sale de `app/(dashboard)/layout.tsx` a un módulo puro y testeado (`lib/nav/sections.ts`). El caparazón usa el componente `sidebar` de shadcn copiado al repo y normalizado a la convención de imports del proyecto (`radix-ui` bundleado, no paquetes `@radix-ui/*` sueltos). Las 39 pantallas heredan el marco sin que se les toque el contenido. Después se unifican tablas y filtros pantalla por pantalla, y por último se agregan las tarjetas de número y el Inicio.

**Tech Stack:** Next.js 16.0.10 (App Router, RSC), React 19.2.1, TypeScript 5, Tailwind CSS 4, shadcn/ui new-york, `radix-ui` 1.4.3 (bundleado), lucide-react, Vitest 4 + @testing-library/react + happy-dom.

**Spec:** `docs/superpowers/specs/2026-08-07-plataforma-crm-sidebar-design.md`

## Global Constraints

- **Cero dependencias nuevas.** `package.json` no puede cambiar. Verificación obligatoria: `git diff --exit-code package.json package-lock.json`.
- **Ninguna ruta desaparece ni cambia de dirección.**
- **Ningún permiso cambia.** Las comprobaciones siguen siendo `hasPermission` / `hasAnyPermission` de `lib/auth/roles`, con exactamente las mismas condiciones que hoy.
- **Los roles heredados `agent` y `viewer` conservan el menú base** (hoy caen en el `default:` del switch de `layout.tsx:65`). Cambiar eso los dejaría sin navegación.
- **`dueno` sigue viendo "Nueva Tasación"** aunque no tenga `appraisal.create` — así está hoy (`layout.tsx:73`) y no se corrige acá.
- **El contador del Inbox conserva su comportamiento:** `fetch('/api/leads/count')` al montar y cada 60 s, con `try/catch` silencioso. Es el ÚNICO contador; no se agregan otros en Fase 1.
- **Los carteles de MODO PRUEBA y de suplantación** van arriba de todo, a ancho completo, fuera del sidebar.
- **No se toca** `components/appraisal/ValuationReport.tsx`, `components/pdf/`, el bloque `.landing-root` de `globals.css`, `app/api/`, migraciones ni Netlify Functions.
- **Modo oscuro:** la plataforma es light-only (nada activa `.dark`). Los tokens `.dark` quedan como están; no se les agrega mantenimiento.
- **Idioma:** todo el texto de interfaz y los nombres de los tests, en español, con acentos correctos.
- **Commits:** `git add` solo de los archivos de la tarea. **Nunca `git add -A`** — hay trabajo sin commitear de otra sesión en esta misma carpeta.
- **Verificación local:** Turbopack revienta en esta carpeta por el acento de "Gestión". `next build` y `next dev` a secas NO sirven. Usar `npx next dev --webpack` (primer arranque ~4 min) y `npx tsc --noEmit`.

---

# FASE 1 — El caparazón

Al terminar la Fase 1 la plataforma tiene menú lateral funcionando en las 39 pantallas, sin que ninguna pantalla haya cambiado por dentro.

---

### Task 1: El menú por rol como módulo puro

Saca la lógica de navegación del layout a un archivo propio con tests. Es el seguro de "ninguna funcionalidad afectada": hoy esa lógica no tiene ni un test.

**Files:**
- Create: `lib/nav/sections.ts`
- Test: `lib/nav/sections.test.ts`

**Interfaces:**
- Consumes: `Role` de `@/types/auth.types`; `hasPermission`, `hasAnyPermission`, `Permission` de `@/lib/auth/roles`; `LucideIcon` de `lucide-react`.
- Produces:
  - `type NavBadge = 'inbox'`
  - `interface NavItem { href: string; label: string; icon: LucideIcon; badge?: NavBadge }`
  - `interface NavCollapsible { label: string; icon: LucideIcon; items: NavItem[] }`
  - `type NavEntry = NavItem | NavCollapsible`
  - `interface NavGroup { label: string | null; entries: NavEntry[] }`
  - `function isCollapsible(e: NavEntry): e is NavCollapsible`
  - `function getNavSections(role: Role): NavGroup[]`
  - `function navHrefs(groups: NavGroup[]): string[]`
  - `function titleForPath(groups: NavGroup[], pathname: string): { section: string | null; title: string }`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/nav/sections.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getNavSections, navHrefs, titleForPath, isCollapsible } from './sections'

describe('getNavSections — permisos del menú', () => {
  it('el abogado ve exactamente sus 3 pantallas y ninguna más', () => {
    const hrefs = navHrefs(getNavSections('abogado'))
    expect(hrefs).toEqual(['/tasks', '/properties/review', '/appraisals'])
  })

  it('el abogado no lleva títulos de grupo (con 3 ítems, agrupar es ruido)', () => {
    const groups = getNavSections('abogado')
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBeNull()
  })

  it('el asesor ve las mismas 10 rutas que hoy', () => {
    const hrefs = navHrefs(getNavSections('asesor'))
    expect(hrefs.sort()).toEqual([
      '/appraisal/new', '/appraisals', '/contacts', '/crm', '/inbox',
      '/pipeline/new', '/properties', '/redes-sociales', '/tasks', '/visits',
    ])
  })

  it('el asesor no ve administración, métricas ni avisos', () => {
    const hrefs = navHrefs(getNavSections('asesor'))
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).not.toContain('/users')
    expect(hrefs).not.toContain('/metrics')
    expect(hrefs).not.toContain('/avisos')
    expect(hrefs).not.toContain('/properties/review')
  })

  it('el coordinador ve avisos pero NO "Nueva tasación" ni administración', () => {
    const hrefs = navHrefs(getNavSections('coordinador'))
    expect(hrefs).toContain('/avisos')
    expect(hrefs).toContain('/properties/new')
    expect(hrefs).not.toContain('/appraisal/new')
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).not.toContain('/users')
  })

  it('el admin ve todo, incluida la revisión legal y las herramientas', () => {
    const hrefs = navHrefs(getNavSections('admin'))
    for (const h of [
      '/properties/review', '/metrics', '/embudos', '/users',
      '/settings', '/settings/notifications', '/settings/portals',
      '/admin/pipeline-test', '/admin/email-test', '/admin/ai-agent', '/admin/ai-usage',
    ]) expect(hrefs).toContain(h)
  })

  it('el dueño NO ve revisión legal (no tiene properties.review) pero sí métricas y usuarios', () => {
    const hrefs = navHrefs(getNavSections('dueno'))
    expect(hrefs).not.toContain('/properties/review')
    expect(hrefs).toContain('/metrics')
    expect(hrefs).toContain('/users')
  })

  it('el dueño sigue viendo "Nueva tasación" aunque no tenga appraisal.create (así está hoy)', () => {
    expect(navHrefs(getNavSections('dueno'))).toContain('/appraisal/new')
  })

  // Los roles heredados caen en el `default:` del switch de hoy. Si se quedaran
  // sin menú, un usuario legacy no podría navegar la plataforma.
  it.each(['agent', 'viewer'] as const)('el rol heredado %s conserva el menú base sin nada de administración', role => {
    const hrefs = navHrefs(getNavSections(role))
    expect(hrefs).toContain('/tasks')
    expect(hrefs).toContain('/inbox')
    expect(hrefs).toContain('/properties')
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).not.toContain('/users')
    expect(hrefs).not.toContain('/metrics')
    expect(hrefs).not.toContain('/properties/review')
  })

  it.each(['admin', 'dueno', 'coordinador', 'asesor', 'abogado', 'agent', 'viewer'] as const)(
    'el menú de %s no repite ninguna ruta',
    role => {
      const hrefs = navHrefs(getNavSections(role))
      expect(new Set(hrefs).size).toBe(hrefs.length)
    },
  )

  it('solo el Inbox lleva contador', () => {
    for (const role of ['admin', 'coordinador', 'asesor'] as const) {
      const conBadge: string[] = []
      for (const g of getNavSections(role)) {
        for (const e of g.entries) {
          if (isCollapsible(e)) {
            for (const i of e.items) if (i.badge) conBadge.push(i.href)
          } else if (e.badge) conBadge.push(e.href)
        }
      }
      expect(conBadge).toEqual(['/inbox'])
    }
  })

  it('toda entrada desplegable tiene al menos un hijo visible', () => {
    for (const role of ['admin', 'dueno', 'coordinador', 'asesor', 'abogado'] as const) {
      for (const g of getNavSections(role)) {
        for (const e of g.entries) {
          if (isCollapsible(e)) expect(e.items.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('titleForPath', () => {
  const admin = getNavSections('admin')

  it('acierta la ruta exacta', () => {
    expect(titleForPath(admin, '/properties/new')).toEqual({ section: 'Propiedades', title: 'Nueva' })
  })

  it('una subruta cae en el prefijo más largo', () => {
    expect(titleForPath(admin, '/properties/abc-123')).toEqual({ section: 'Propiedades', title: 'Listado' })
  })

  it('un ítem suelto no tiene sección', () => {
    expect(titleForPath(admin, '/crm')).toEqual({ section: null, title: 'CRM' })
  })

  it('una ruta desconocida cae en el nombre de la casa', () => {
    expect(titleForPath(admin, '/mi-perfil')).toEqual({ section: null, title: 'Diego Ferreyra Inmobiliaria' })
  })

  it('/properties/review gana sobre /properties por ser el prefijo más largo', () => {
    expect(titleForPath(admin, '/properties/review')).toEqual({ section: 'Propiedades', title: 'Revisión legal' })
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run lib/nav/sections.test.ts`
Expected: FAIL — `Failed to resolve import "./sections"`

- [ ] **Step 3: Escribir el módulo**

Crear `lib/nav/sections.ts`:

```ts
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
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run lib/nav/sections.test.ts`
Expected: PASS — 17 tests en verde.

Si falla el de "el asesor ve las mismas 10 rutas", comparar contra `layout.tsx:30-44` antes de tocar el test: el test describe el comportamiento de HOY y es la referencia, no el código nuevo.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/nav/sections.ts lib/nav/sections.test.ts
git commit -m "feat(nav): el menú por rol como módulo puro y testeado

Saca getNavSections de layout.tsx a lib/nav/. Mismos permisos, mismas rutas
— los tests los fijan, incluidos los roles heredados agent/viewer que caían
en el default del switch."
```

---

### Task 2: Las primitivas del sidebar, sin sumar dependencias

Trae el componente `sidebar` de shadcn y lo normaliza a la convención del repo. **El riesgo de esta tarea es que la CLI de shadcn agregue paquetes `@radix-ui/*` sueltos al `package.json`** — el proyecto usa el bundle `radix-ui`, y la restricción global es cero dependencias nuevas.

**Files:**
- Create: `components/ui/sidebar.tsx`, `components/ui/sheet.tsx`, `components/ui/tooltip.tsx`, `components/ui/skeleton.tsx`, `hooks/use-mobile.ts`
- Test: `components/ui/sidebar.test.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils`; `Button` de `@/components/ui/button`; `Separator` de `@/components/ui/separator`.
- Produces: `SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuBadge`, `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton`, `SidebarTrigger`, `SidebarInset`, `useSidebar` — todos desde `@/components/ui/sidebar`.

- [ ] **Step 1: Traer los componentes**

Run:
```bash
npx shadcn@latest add sidebar --yes
```

- [ ] **Step 2: Confirmar que NO se agregaron dependencias**

Run: `git diff --stat package.json package-lock.json`

Si aparecen cambios (típicamente `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-slot`), revertirlos y reinstalar el árbol original:

```bash
git checkout -- package.json package-lock.json
npm ci
```

- [ ] **Step 3: Normalizar los imports a la convención del repo**

En `sheet.tsx` y `tooltip.tsx`, reemplazar los imports sueltos por el bundle, igual que hace `components/ui/collapsible.tsx:4`:

```ts
// ANTES
import * as SheetPrimitive from "@radix-ui/react-dialog"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

// DESPUÉS
import { Dialog as SheetPrimitive } from "radix-ui"
import { Tooltip as TooltipPrimitive } from "radix-ui"
```

Run: `grep -rn "@radix-ui/" components/ui/sidebar.tsx components/ui/sheet.tsx components/ui/tooltip.tsx components/ui/skeleton.tsx`
Expected: sin resultados.

- [ ] **Step 4: Verificar que no pisó componentes existentes**

Run: `git status --short components/ui/`
Expected: solo archivos nuevos (`??`). Si aparece `M` sobre `button.tsx`, `input.tsx` o `separator.tsx`, revertir esos: `git checkout -- components/ui/button.tsx` (etc.). La CLI no debe modificar lo que ya funciona.

- [ ] **Step 5: Escribir el test de humo**

Crear `components/ui/sidebar.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from './sidebar'

describe('primitivas del sidebar', () => {
  it('monta y dibuja un grupo con su ítem', () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Captación</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/properties">Propiedades</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    )

    expect(screen.getByText('Captación')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Propiedades' })).toHaveAttribute('href', '/properties')
  })
})
```

- [ ] **Step 6: Correr el test**

Run: `npx vitest run components/ui/sidebar.test.tsx`
Expected: PASS.

Si falla con `matchMedia is not a function`, agregar al principio del test (happy-dom no implementa `matchMedia`, que `use-mobile.ts` usa):

```tsx
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
})
```

- [ ] **Step 7: Verificar tipos y commitear**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add components/ui/sidebar.tsx components/ui/sheet.tsx components/ui/tooltip.tsx components/ui/skeleton.tsx components/ui/sidebar.test.tsx hooks/use-mobile.ts
git commit -m "feat(ui): primitivas del sidebar de shadcn, sin dependencias nuevas

Imports normalizados al bundle radix-ui, como collapsible.tsx y tabs.tsx.
package.json sin cambios."
```

---

### Task 3: El menú lateral armado

**Files:**
- Create: `components/nav/AppSidebar.tsx`
- Test: `components/nav/AppSidebar.test.tsx`

**Interfaces:**
- Consumes: `getNavSections`, `navHrefs`, `isCollapsible`, tipos `NavGroup`/`NavItem`/`NavEntry` de `@/lib/nav/sections`; primitivas de `@/components/ui/sidebar`; `Collapsible` de `@/components/ui/collapsible`; `usePathname` de `next/navigation`.
- Produces: `export function AppSidebar({ groups, logoUrl }: { groups: NavGroup[]; logoUrl: string })` — client component.

- [ ] **Step 1: Escribir el test que falla**

Crear `components/nav/AppSidebar.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { getNavSections } from '@/lib/nav/sections'

let rutaActual = '/properties'
vi.mock('next/navigation', () => ({ usePathname: () => rutaActual }))

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
})

const montar = (role: Parameters<typeof getNavSections>[0]) =>
  render(
    <SidebarProvider>
      <AppSidebar groups={getNavSections(role)} logoUrl="/logo.png" />
    </SidebarProvider>,
  )

beforeEach(() => {
  rutaActual = '/properties'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ new: 7 }) }))
})

describe('AppSidebar', () => {
  it('dibuja los títulos de grupo como texto, no como botones', () => {
    montar('admin')
    expect(screen.getByText('Captación')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Captación' })).not.toBeInTheDocument()
  })

  it('marca la pantalla actual con aria-current', () => {
    rutaActual = '/crm'
    montar('admin')
    expect(screen.getByRole('link', { name: /CRM/ })).toHaveAttribute('aria-current', 'page')
  })

  it('una subruta también marca a su ítem del menú', () => {
    rutaActual = '/properties/abc-123'
    montar('admin')
    expect(screen.getByRole('link', { name: /Listado/ })).toHaveAttribute('aria-current', 'page')
  })

  it('el desplegable que contiene la pantalla actual arranca abierto', () => {
    rutaActual = '/properties/new'
    montar('admin')
    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('el desplegable que NO contiene la pantalla actual arranca cerrado', () => {
    rutaActual = '/crm'
    montar('admin')
    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('pide el contador del Inbox y lo anuncia con contexto', async () => {
    montar('admin')
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/leads/count'))
    expect(await screen.findByLabelText('7 sin leer')).toBeInTheDocument()
  })

  it('si el contador falla, el menú se dibuja igual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')))
    montar('admin')
    expect(screen.getByRole('link', { name: /Inbox/ })).toBeInTheDocument()
  })

  it('el abogado no pide el contador: no tiene Inbox', () => {
    montar('abogado')
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run components/nav/AppSidebar.test.tsx`
Expected: FAIL — `Failed to resolve import "./AppSidebar"`

- [ ] **Step 3: Escribir el componente**

Crear `components/nav/AppSidebar.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { isCollapsible, navHrefs, type NavGroup, type NavItem } from '@/lib/nav/sections'

/** La ruta activa es la exacta o cualquier subruta suya (`/properties/abc-1`). */
function estaActiva(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function ItemLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge: number }) {
  const activa = estaActiva(item.href, pathname)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={activa} tooltip={item.label}>
        <Link href={item.href} aria-current={activa ? 'page' : undefined}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {item.badge === 'inbox' && badge > 0 && (
        <SidebarMenuBadge aria-label={`${badge} sin leer`}>{badge}</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}

export function AppSidebar({ groups, logoUrl }: { groups: NavGroup[]; logoUrl: string }) {
  const pathname = usePathname()
  const tieneInbox = navHrefs(groups).includes('/inbox')
  const [inboxCount, setInboxCount] = useState(0)

  // Mismo comportamiento que el DashboardNav anterior: al montar y cada 60 s,
  // con try/catch silencioso. Si el contador falla, el menú tiene que funcionar igual.
  useEffect(() => {
    if (!tieneInbox) return
    let activo = true
    async function cargar() {
      try {
        const res = await fetch('/api/leads/count')
        if (!res.ok) return
        const { new: count } = await res.json()
        if (activo) setInboxCount(count ?? 0)
      } catch {
        // best-effort
      }
    }
    cargar()
    const handle = setInterval(cargar, 60_000)
    return () => {
      activo = false
      clearInterval(handle)
    }
  }, [tieneInbox])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5">
          <img src={logoUrl} alt="Diego Ferreyra Inmobiliaria" className="h-7 w-auto object-contain" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g, i) => (
          <SidebarGroup key={g.label ?? `sin-titulo-${i}`}>
            {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.entries.map(entry => {
                  if (!isCollapsible(entry)) {
                    return (
                      <ItemLink key={entry.href} item={entry} pathname={pathname} badge={inboxCount} />
                    )
                  }
                  const abierto = entry.items.some(i => estaActiva(i.href, pathname))
                  return (
                    <Collapsible key={entry.label} asChild defaultOpen={abierto} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={entry.label}>
                            <entry.icon />
                            <span>{entry.label}</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {entry.items.map(sub => {
                              const activa = estaActiva(sub.href, pathname)
                              return (
                                <SidebarMenuSubItem key={sub.href}>
                                  <SidebarMenuSubButton asChild isActive={activa}>
                                    <Link href={sub.href} aria-current={activa ? 'page' : undefined}>
                                      <span>{sub.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
```

El menú de usuario NO va acá: va en la barra superior a la derecha (Task 4), como está hoy.

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run components/nav/AppSidebar.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add components/nav/AppSidebar.tsx components/nav/AppSidebar.test.tsx
git commit -m "feat(nav): el menú lateral armado, con submenús y contador del Inbox

El desplegable que contiene la pantalla actual arranca abierto. El contador
conserva el comportamiento del DashboardNav: cada 60 s y silencioso si falla."
```

---

### Task 4: La barra superior

**Files:**
- Create: `components/dashboard/Topbar.tsx`
- Test: `components/dashboard/Topbar.test.tsx`

**Interfaces:**
- Consumes: `titleForPath` y tipo `NavGroup` de `@/lib/nav/sections`; `SidebarTrigger` de `@/components/ui/sidebar`; `usePathname` de `next/navigation`.
- Produces: `export function Topbar({ groups, children }: { groups: NavGroup[]; children?: React.ReactNode })` — client component. `children` es el slot de la derecha (ahí va el `<UserMenu>`, que se renderiza en el servidor y baja como children).

- [ ] **Step 1: Escribir el test que falla**

Crear `components/dashboard/Topbar.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Topbar } from './Topbar'
import { getNavSections } from '@/lib/nav/sections'

let rutaActual = '/crm'
vi.mock('next/navigation', () => ({ usePathname: () => rutaActual }))

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
})

const montar = () =>
  render(
    <SidebarProvider>
      <Topbar groups={getNavSections('admin')}><span>menú de usuario</span></Topbar>
    </SidebarProvider>,
  )

describe('Topbar', () => {
  it('muestra el nombre de la pantalla actual como encabezado', () => {
    rutaActual = '/crm'
    montar()
    expect(screen.getByRole('heading', { name: 'CRM' })).toBeInTheDocument()
  })

  it('muestra la sección arriba del título cuando el ítem cuelga de un desplegable', () => {
    rutaActual = '/properties/new'
    montar()
    expect(screen.getByText('Propiedades')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nueva' })).toBeInTheDocument()
  })

  it('tiene el botón para abrir y cerrar el menú', () => {
    montar()
    expect(screen.getByRole('button', { name: /men[úu]/i })).toBeInTheDocument()
  })

  it('renderiza lo que le pasen a la derecha', () => {
    montar()
    expect(screen.getByText('menú de usuario')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run components/dashboard/Topbar.test.tsx`
Expected: FAIL — `Failed to resolve import "./Topbar"`

- [ ] **Step 3: Escribir el componente**

Crear `components/dashboard/Topbar.tsx`:

```tsx
'use client'

import { usePathname } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { titleForPath, type NavGroup } from '@/lib/nav/sections'

export function Topbar({ groups, children }: { groups: NavGroup[]; children?: React.ReactNode }) {
  const pathname = usePathname()
  const { section, title } = titleForPath(groups, pathname)

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0">
        {section && <div className="eyebrow truncate">{section}</div>}
        <h1 className="truncate text-sm font-semibold leading-tight">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run components/dashboard/Topbar.test.tsx`
Expected: PASS — 4 tests.

Si el test del botón falla porque el `SidebarTrigger` de shadcn trae el texto accesible en inglés ("Toggle Sidebar"), traducirlo en `components/ui/sidebar.tsx` a `"Abrir o cerrar el menú"` — la interfaz va en español.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/Topbar.tsx components/dashboard/Topbar.test.tsx
git commit -m "feat(nav): barra superior con el nombre de la pantalla actual

El título sale del menú, así que ninguna pantalla tiene que cambiar."
```

---

### Task 5: Armar el marco y jubilar el menú de arriba

**Files:**
- Modify: `app/(dashboard)/layout.tsx` (reescritura del marco; `getNavSections` ahora se importa)
- Modify: `app/globals.css` (fondo del área de contenido)
- Delete: `app/(dashboard)/DashboardNav.tsx`, `components/nav/NavDropdown.tsx`

**Interfaces:**
- Consumes: `getNavSections` de `@/lib/nav/sections`; `AppSidebar` de `@/components/nav/AppSidebar`; `Topbar` de `@/components/dashboard/Topbar`; `SidebarProvider`, `SidebarInset` de `@/components/ui/sidebar`.
- Produces: nada nuevo. Las 39 pantallas siguen recibiendo `children` igual que antes.

- [ ] **Step 1: Confirmar que nadie más usa lo que se va a borrar**

Run: `grep -rn "DashboardNav\|NavDropdown\|MobileNav" app components --include="*.tsx" | grep -v "^app/(dashboard)/DashboardNav.tsx\|^components/nav/NavDropdown.tsx"`
Expected: solo la línea de `app/(dashboard)/layout.tsx`. Si aparece otra, detenerse y avisar antes de borrar nada.

- [ ] **Step 2: Reescribir el layout**

Reemplazar el cuerpo de `app/(dashboard)/layout.tsx`. Se elimina la función local `getNavSections` (líneas 19-103) y la interfaz `NavSection` (13-17), que ahora viven en `lib/nav/sections.ts`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUser, isImpersonating } from '@/lib/auth/get-user'
import { hasPermission } from '@/lib/auth/roles'
import { UserMenu } from '@/components/auth/UserMenu'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'
import { NavigationProgress } from '@/components/dashboard/NavigationProgress'
import { getNotificationSettings } from '@/lib/email/settings'
import { getNavSections } from '@/lib/nav/sections'
import { AppSidebar } from '@/components/nav/AppSidebar'
import { Topbar } from '@/components/dashboard/Topbar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

const LOGO_URL =
  'https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [user, impersonating, notifSettings, cookieStore] = await Promise.all([
        getUser(),
        isImpersonating(),
        // Soft-fail: si la tabla no existe (env nuevo), no rompemos el layout.
        getNotificationSettings().catch(() => null),
        cookies(),
    ])
    if (!user) redirect('/login')
    const navGroups = getNavSections(user.profile.role)
    const testModeActive = !!notifSettings?.test_mode_enabled
    // Se lee en el servidor para que el menú se dibuje ya colapsado o abierto,
    // sin parpadeo en la primera pintura.
    const sidebarAbierto = cookieStore.get('sidebar_state')?.value !== 'false'

    return (
        <div className="min-h-screen flex flex-col">
            <NavigationProgress />
            {testModeActive && (
                <div className="bg-amber-500 text-amber-950 text-sm px-4 py-2 text-center font-medium border-b border-amber-600">
                    ⚠️ MODO PRUEBA ACTIVO — Todos los emails se redirigen a{' '}
                    <span className="font-mono">{notifSettings?.test_recipient_email || 'destinatario configurado'}</span>.{' '}
                    {hasPermission(user.profile.role, 'settings.manage') && (
                        <Link href="/admin/email-test" className="underline">Desactivar</Link>
                    )}
                </div>
            )}
            {impersonating && (
                <ImpersonationBanner
                    name={user.profile.full_name}
                    role={user.profile.role}
                />
            )}
            <SidebarProvider defaultOpen={sidebarAbierto} className="flex-1">
                <a
                    href="#contenido"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg focus:outline-2 focus:outline-[color:var(--ring)]"
                >
                    Saltar al contenido
                </a>
                <AppSidebar groups={navGroups} logoUrl={LOGO_URL} />
                <SidebarInset className="bg-secondary">
                    <Topbar groups={navGroups}>
                        <UserMenu profile={user.profile} />
                    </Topbar>
                    <main id="contenido" className="flex-1 p-4 md:p-6">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </div>
    )
}
```

- [ ] **Step 3: Ajustar el fondo del área de contenido**

En `app/globals.css`, dentro del bloque `@layer base`, agregar debajo de la regla de `body` — el sidebar es blanco puro y el fondo de la app (`#f9fafb`) da 1.27:1 contra él, o sea que a ojo son el mismo color:

```css
  /* El área de contenido va un punto más gris que el sidebar blanco: si no, el
     panel no se despega (1.27:1 entre --background y --sidebar). La separación
     la hace el fondo, no un borde más grueso. */
  [data-slot="sidebar-inset"] {
    background-color: var(--secondary);
  }
```

- [ ] **Step 4: Borrar el menú viejo**

```bash
git rm "app/(dashboard)/DashboardNav.tsx" components/nav/NavDropdown.tsx
```

- [ ] **Step 5: Verificar tipos y suite completa**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: la suite entera en verde. Si algún test preexistente falla, **no se toca el test**: se investiga qué se rompió del layout.

- [ ] **Step 6: Verificar que no se agregaron dependencias**

Run: `git diff --exit-code package.json package-lock.json`
Expected: sin diferencias (código de salida 0).

- [ ] **Step 7: Mirarlo en el navegador**

Run: `npx next dev --webpack`
(Primer arranque ~4 min. **No usar `npm run dev`**: Turbopack revienta en esta carpeta por el acento de "Gestión".)

Recorrer y confirmar:
- `/tasks`, `/properties`, `/crm`, `/inbox`, `/metrics`, `/settings` cargan y se ven dentro del marco nuevo.
- El menú marca la pantalla en la que estás.
- Entrar a una ficha (`/properties/<id>`) y confirmar que "Listado" sigue marcado.
- Colapsar el menú, recargar, y confirmar que sigue colapsado.
- Achicar la ventana a ~390 px: el menú desaparece y se abre desde el botón ☰.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/layout.tsx" app/globals.css
git commit -m "feat(nav): menú lateral en toda la plataforma; se jubila el menú de arriba

El layout arma el marco y delega el menú en lib/nav. Ninguna de las 39
pantallas cambia por dentro. Se agrega 'Saltar al contenido' para teclado."
```

---

### Task 6: Repaso de accesibilidad con teclado

Cierra la Fase 1 verificando lo que los tests no pueden ver.

**Files:**
- Modify: `components/ui/sidebar.tsx` (solo si hace falta traducir textos accesibles)
- Modify: `app/globals.css` (solo si hace falta reforzar el foco visible)

- [ ] **Step 1: Buscar textos accesibles en inglés**

Run: `grep -n "sr-only\|aria-label\|Toggle\|Sidebar\"" components/ui/sidebar.tsx`

Traducir al español todo texto que lea un lector de pantalla (`"Toggle Sidebar"` → `"Abrir o cerrar el menú"`). Los `data-*` y nombres de clase se dejan como están.

- [ ] **Step 2: Recorrido con teclado en el navegador**

Con `npx next dev --webpack` corriendo, desde `/tasks`:

1. Tab desde el inicio → aparece "Saltar al contenido" **visible**; Enter salta al contenido.
2. Tab por el menú → cada ítem muestra un anillo de foco claro.
3. Sobre un desplegable → Enter y Espacio lo abren y cierran; `aria-expanded` cambia.
4. Ventana a ~390 px → abrir el menú con ☰: el foco queda **dentro** del panel (Tab no se escapa al contenido) y al cerrar con Escape vuelve al botón ☰.

- [ ] **Step 3: Confirmar los contrastes contra lo pintado**

En el inspector del navegador, sobre el ítem activo del menú, confirmar que el color de texto resuelve a `--brand` y el fondo a `--brand-soft`. Los valores medidos (7.69:1) valen solo si esos son los tokens que efectivamente se aplican.

Si en la implementación se le bajó opacidad al título de grupo, **volver a medir**: partía de 4.85:1 y no tiene margen contra el mínimo de 4.5.

- [ ] **Step 4: Commit (solo si hubo cambios)**

```bash
git add components/ui/sidebar.tsx app/globals.css
git commit -m "fix(a11y): textos accesibles del menú en español y foco visible"
```

- [ ] **Step 5: Mostrárselo al dueño**

Fin de la Fase 1. Antes de seguir con las tablas, que lo mire en el navegador: es la única verificación que decide si se ve como quería.

---

# FASE 2 — Tablas y filtros

No empezar hasta que la Fase 1 esté aprobada por el dueño.

---

### Task 7: El estado de filtros en la barra de direcciones

Helpers puros para leer y escribir filtros en la URL. Se testean solos, sin montar ninguna pantalla.

**Files:**
- Create: `lib/filters/url-state.ts`
- Test: `lib/filters/url-state.test.ts`

**Interfaces:**
- Produces:
  - `function leerFiltros<T extends Record<string, string>>(params: URLSearchParams, defaults: T): T`
  - `function escribirFiltros<T extends Record<string, string>>(filtros: T, defaults: T): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/filters/url-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { leerFiltros, escribirFiltros } from './url-state'

const DEFAULTS = { q: '', status: 'todos', advisor: '' }

describe('leerFiltros', () => {
  it('sin parámetros devuelve los valores por defecto', () => {
    expect(leerFiltros(new URLSearchParams(''), DEFAULTS)).toEqual(DEFAULTS)
  })

  it('toma de la URL solo las claves conocidas', () => {
    const p = new URLSearchParams('q=palermo&status=publicada&colado=si')
    expect(leerFiltros(p, DEFAULTS)).toEqual({ q: 'palermo', status: 'publicada', advisor: '' })
  })

  it('una clave presente pero vacía cae al valor por defecto', () => {
    expect(leerFiltros(new URLSearchParams('status='), DEFAULTS).status).toBe('todos')
  })
})

describe('escribirFiltros', () => {
  it('omite lo que está en su valor por defecto: la URL queda limpia', () => {
    expect(escribirFiltros(DEFAULTS, DEFAULTS)).toBe('')
  })

  it('escribe solo lo que difiere del defecto', () => {
    expect(escribirFiltros({ q: 'palermo', status: 'todos', advisor: '' }, DEFAULTS)).toBe('q=palermo')
  })

  it('ordena las claves para que la misma selección dé siempre la misma URL', () => {
    const a = escribirFiltros({ q: 'x', status: 'publicada', advisor: '' }, DEFAULTS)
    const b = escribirFiltros({ status: 'publicada', q: 'x', advisor: '' } as typeof DEFAULTS, DEFAULTS)
    expect(a).toBe(b)
    expect(a).toBe('q=x&status=publicada')
  })

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const filtros = { q: 'agüero 950', status: 'publicada', advisor: 'ana' }
    expect(leerFiltros(new URLSearchParams(escribirFiltros(filtros, DEFAULTS)), DEFAULTS)).toEqual(filtros)
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run lib/filters/url-state.test.ts`
Expected: FAIL — no existe `./url-state`.

- [ ] **Step 3: Escribir el módulo**

Crear `lib/filters/url-state.ts`:

```ts
/**
 * Filtros en la barra de direcciones. Reglas:
 * - clave ausente o vacía = "sin filtrar" (el valor por defecto), igual que el
 *   estado inicial de las pantallas antes de este cambio;
 * - lo que está en su valor por defecto NO se escribe, así la URL sin filtros
 *   queda limpia;
 * - las claves salen ordenadas para que la misma selección dé siempre la misma
 *   URL (si no, el historial se llena de entradas que son la misma vista).
 */
export function leerFiltros<T extends Record<string, string>>(params: URLSearchParams, defaults: T): T {
  const out = { ...defaults }
  for (const clave of Object.keys(defaults) as (keyof T & string)[]) {
    const valor = params.get(clave)
    if (valor) out[clave] = valor as T[keyof T & string]
  }
  return out
}

export function escribirFiltros<T extends Record<string, string>>(filtros: T, defaults: T): string {
  const params = new URLSearchParams()
  for (const clave of (Object.keys(defaults) as (keyof T & string)[]).sort()) {
    const valor = filtros[clave]
    if (valor && valor !== defaults[clave]) params.set(clave, valor)
  }
  return params.toString()
}
```

- [ ] **Step 4: Correr los tests y commitear**

Run: `npx vitest run lib/filters/url-state.test.ts`
Expected: PASS — 8 tests.

```bash
git add lib/filters/url-state.ts lib/filters/url-state.test.ts
git commit -m "feat(filtros): helpers puros para el estado de filtros en la URL"
```

---

### Task 8: La barra de filtros

**Files:**
- Create: `components/filters/FilterBar.tsx`
- Test: `components/filters/FilterBar.test.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils`.
- Produces:
  - `interface FilterOption { value: string; label: string }`
  - `interface FilterSelect { key: string; label: string; options: FilterOption[] }`
  - `export function FilterBar({ selects, values, onChange, onClear, extraActivo, children }: Props)`

**Dos decisiones que salen de mirar el código actual (verificado el 2026-08-07):**

1. **Sin buscador.** Ninguna de las 4 pantallas de listado tiene búsqueda de texto
   hoy: Propiedades filtra por estado + fechas + "solo míos"; Contactos por origen +
   fechas; CRM por etapa + origen + asesor + fechas. Agregar un buscador sería
   funcionalidad nueva y encima exigiría que la API acepte texto libre. **No se
   agrega.** Si algún día se quiere, es su propio proyecto.
2. **Hueco para lo que ya existe.** `DateRangeFilter` ya está hecho y usado, y hay
   controles que no son desplegables (el interruptor "solo míos" de Propiedades, el
   selector grilla/lista/tabla). Van por el slot `children`, sin reescribirlos. La
   prop `extraActivo` le avisa a la barra que uno de esos controles está aplicado,
   para que aparezca "Limpiar todo".

- [ ] **Step 1: Escribir el test que falla**

Crear `components/filters/FilterBar.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from './FilterBar'

const SELECTS = [
  { key: 'status', label: 'Estado', options: [
    { value: '', label: 'Todos los estados' },
    { value: 'approved', label: 'Publicada' },
  ]},
]

describe('FilterBar', () => {
  it('sin nada aplicado no muestra fichas ni "Limpiar todo"', () => {
    render(<FilterBar selects={SELECTS} values={{ status: '' }} onChange={() => {}} onClear={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).not.toBeInTheDocument()
  })

  it('con un filtro puesto muestra su ficha y el botón de limpiar', () => {
    render(<FilterBar selects={SELECTS} values={{ status: 'approved' }} onChange={() => {}} onClear={() => {}} />)
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument()
  })

  it('la ficha muestra la etiqueta legible, nunca el valor crudo de la base', () => {
    render(<FilterBar selects={SELECTS} values={{ status: 'approved' }} onChange={() => {}} onClear={() => {}} />)
    expect(screen.queryByText('approved')).not.toBeInTheDocument()
  })

  it('quitar una ficha avisa con el valor vacío', async () => {
    const onChange = vi.fn()
    render(<FilterBar selects={SELECTS} values={{ status: 'approved' }} onChange={onChange} onClear={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Estado' }))
    expect(onChange).toHaveBeenCalledWith('status', '')
  })

  it('el desplegable avisa al elegir una opción', async () => {
    const onChange = vi.fn()
    render(<FilterBar selects={SELECTS} values={{ status: '' }} onChange={onChange} onClear={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'approved')
    expect(onChange).toHaveBeenCalledWith('status', 'approved')
  })

  it('renderiza los controles que le pasan por children (rango de fechas, "solo míos")', () => {
    render(
      <FilterBar selects={SELECTS} values={{ status: '' }} onChange={() => {}} onClear={() => {}}>
        <button>Solo míos</button>
      </FilterBar>,
    )
    expect(screen.getByRole('button', { name: 'Solo míos' })).toBeInTheDocument()
  })

  // Sin esto, poner "solo míos" o un rango de fechas no ofrecería "Limpiar todo",
  // y el usuario se queda sin forma de volver atrás de un solo golpe.
  it('un control de children aplicado también habilita "Limpiar todo"', () => {
    render(
      <FilterBar selects={SELECTS} values={{ status: '' }} onChange={() => {}} onClear={() => {}} extraActivo>
        <button>Solo míos</button>
      </FilterBar>,
    )
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run components/filters/FilterBar.test.tsx`
Expected: FAIL — no existe `./FilterBar`.

- [ ] **Step 3: Escribir el componente**

Crear `components/filters/FilterBar.tsx`:

```tsx
'use client'

import { X } from 'lucide-react'

export interface FilterOption { value: string; label: string }
export interface FilterSelect { key: string; label: string; options: FilterOption[] }

interface Props {
  selects: FilterSelect[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onClear: () => void
  /**
   * Marca que algún control pasado por `children` está aplicado (rango de fechas,
   * "solo míos"). La barra no puede saberlo sola y sin esto "Limpiar todo" no
   * aparecería con esos filtros puestos.
   */
  extraActivo?: boolean
  /** Controles que ya existen y no son desplegables. No se reescriben. */
  children?: React.ReactNode
}

export function FilterBar({ selects, values, onChange, onClear, extraActivo, children }: Props) {
  const fichas = selects
    .map(s => ({ s, opcion: s.options.find(o => o.value === values[s.key] && o.value !== '') }))
    .filter((f): f is { s: FilterSelect; opcion: FilterOption } => !!f.opcion)

  const hayAlgo = fichas.length > 0 || !!extraActivo

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {selects.map(s => (
          <select
            key={s.key}
            aria-label={s.label}
            value={values[s.key] ?? ''}
            onChange={e => onChange(s.key, e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {s.options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
        {children}
      </div>

      {hayAlgo && (
        <div className="flex flex-wrap items-center gap-2">
          {fichas.map(({ s, opcion }) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-soft)] px-2.5 py-1 text-xs text-[color:var(--brand)]"
            >
              {opcion.label}
              <button
                type="button"
                onClick={() => onChange(s.key, '')}
                aria-label={`Quitar filtro ${s.label}`}
                className="rounded-full hover:bg-black/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr los tests y commitear**

Run: `npx vitest run components/filters/FilterBar.test.tsx`
Expected: PASS — 7 tests.

```bash
git add components/filters/FilterBar.tsx components/filters/FilterBar.test.tsx
git commit -m "feat(filtros): barra de filtros única, con fichas de lo aplicado

Sin buscador: ninguna de las 4 pantallas de listado tiene búsqueda de texto
hoy y agregarla sería funcionalidad nueva. Los controles que ya existen
(rango de fechas, 'solo míos') entran por children, sin reescribirlos."
```

---

### Task 8b: Que el rango de fechas se pueda controlar desde afuera

`DateRangeFilter` es **no controlado**: solo recibe `onChange` y guarda `active` / `customFrom` / `customTo` en su propio estado (`DateRangeFilter.tsx:7-9,23-26`). Con los filtros en la URL eso deja un estado partido: refrescás, el filtro sigue aplicado porque está en la dirección, pero el control se dibuja vacío. Hay que poder decirle desde afuera qué está seleccionado.

**Files:**
- Modify: `components/filters/DateRangeFilter.tsx`
- Test: `components/filters/DateRangeFilter.test.tsx`

**Interfaces:**
- Produces: `export function DateRangeFilter({ onChange, value }: { onChange: (r: { from: string; to: string }) => void; value?: { from: string; to: string } })`
  - `value` es **opcional**: sin él se comporta exactamente como hoy. Así las 3 pantallas que ya lo usan siguen funcionando sin tocarlas.

- [ ] **Step 1: Escribir el test**

Crear `components/filters/DateRangeFilter.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateRangeFilter } from './DateRangeFilter'

describe('DateRangeFilter', () => {
  it('sin value se comporta como siempre: elegir un preset avisa un rango', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    )
  })

  it('con value vacío no marca ningún preset', () => {
    render(<DateRangeFilter onChange={() => {}} value={{ from: '', to: '' }} />)
    for (const p of ['Hoy', '7d', '30d']) {
      expect(screen.getByRole('button', { name: p })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  // Este es el caso que importa: volver de la URL después de un refresco.
  it('con un value que coincide con un preset, ese preset queda marcado', () => {
    const hoy = new Date().toISOString().split('T')[0]
    render(<DateRangeFilter onChange={() => {}} value={{ from: hoy, to: hoy }} />)
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('con un rango que no coincide con ningún preset, muestra las fechas cargadas', () => {
    render(<DateRangeFilter onChange={() => {}} value={{ from: '2026-01-05', to: '2026-02-10' }} />)
    expect(screen.getByDisplayValue('2026-01-05')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-02-10')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test y confirmar qué falla**

Run: `npx vitest run components/filters/DateRangeFilter.test.tsx`
Expected: el primero PASA (es el comportamiento actual); los otros tres FALLAN.

- [ ] **Step 3: Hacerlo controlable**

En `DateRangeFilter.tsx`:
- Agregar `value?: { from: string; to: string }` a las props.
- Cuando llega `value`, derivar de él qué preset está activo (comparando contra el rango que produciría cada preset) en vez de leer el `useState`, y precargar los inputs de fechas con `value.from` / `value.to`.
- Agregar `aria-pressed` a los botones de preset — hoy no hay forma de saber cuál está elegido con un lector de pantalla.
- **Sin `value`, el camino de hoy queda intacto.**

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run components/filters/DateRangeFilter.test.tsx`
Expected: PASS — los 4.

- [ ] **Step 5: Confirmar que no rompió a quien ya lo usa**

Run: `npx tsc --noEmit && npm test`

Las 3 pantallas que lo usan hoy (`properties`, `contacts`, `crm`) no le pasan `value`, así que no deberían notar nada.

- [ ] **Step 6: Commit**

```bash
git add components/filters/DateRangeFilter.tsx components/filters/DateRangeFilter.test.tsx
git commit -m "feat(filtros): el rango de fechas acepta valor desde afuera

Sin esto, con los filtros en la URL el control se dibuja vacío aunque el
filtro esté aplicado. La prop es opcional: quien no la pasa no cambia."
```

---

### Task 9: Restyle de la tabla, sin tocarle la interfaz

**Files:**
- Modify: `components/ui/DataTable.tsx` (solo presentación)
- Test: `components/ui/DataTable.test.tsx`

**Interfaces:**
- Produces: la MISMA interfaz de hoy (`data`, `columns`, `onRowClick`, `getRowKey`, `emptyMessage`, `selectable`, `selectedIds`, `onSelectionChange`, `sort`, `onSortChange`). No se agrega, saca ni renombra ninguna prop.

- [ ] **Step 1: Escribir el test de contrato**

Crear `components/ui/DataTable.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type Column } from './DataTable'

interface Fila { id: string; direccion: string; precio: number }
const FILAS: Fila[] = [
  { id: 'a', direccion: 'Agüero 950', precio: 300 },
  { id: 'b', direccion: 'Mistral 2750', precio: 100 },
]
const COLS: Column<Fila>[] = [
  { key: 'direccion', label: 'Dirección', render: r => r.direccion, sortable: true },
  { key: 'precio', label: 'Precio', render: r => r.precio, sortable: true },
]

describe('DataTable', () => {
  it('dibuja una fila por dato', () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    expect(screen.getAllByRole('row')).toHaveLength(3) // cabecera + 2
  })

  it('sin datos muestra el mensaje de vacío', () => {
    render(<DataTable data={[]} columns={COLS} getRowKey={(r: Fila) => r.id} emptyMessage="No hay propiedades" />)
    expect(screen.getByText('No hay propiedades')).toBeInTheDocument()
  })

  it('sin onSortChange ordena en memoria', async () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    await userEvent.click(screen.getByText('Precio'))
    const celdas = screen.getAllByRole('cell').map(c => c.textContent)
    expect(celdas[0]).toBe('Agüero 950') // desc: 300 primero
  })

  // Este modo existe porque con datos paginados ordenar en memoria solo reordena
  // la página cargada — ver el comentario de DataTable.tsx.
  it('con onSortChange NO reordena: solo avisa del click', async () => {
    const onSortChange = vi.fn()
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        sort={{ key: 'precio', dir: 'asc' }} onSortChange={onSortChange} />,
    )
    await userEvent.click(screen.getByText('Precio'))
    expect(onSortChange).toHaveBeenCalledWith('precio', 'desc')
    const celdas = screen.getAllByRole('cell').map(c => c.textContent)
    expect(celdas[0]).toBe('Agüero 950') // el orden lo manda el padre, no la tabla
  })

  it('seleccionar todo devuelve las claves de todas las filas', async () => {
    const onSelectionChange = vi.fn()
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        selectable selectedIds={new Set()} onSelectionChange={onSelectionChange} />,
    )
    await userEvent.click(screen.getByLabelText('Seleccionar todo'))
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['a', 'b']))
  })

  it('el click en una fila avisa con su dato', async () => {
    const onRowClick = vi.fn()
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} onRowClick={onRowClick} />)
    await userEvent.click(screen.getByText('Agüero 950'))
    expect(onRowClick).toHaveBeenCalledWith(FILAS[0])
  })
})
```

- [ ] **Step 2: Correr los tests contra la tabla ACTUAL**

Run: `npx vitest run components/ui/DataTable.test.tsx`
Expected: PASS — los 6 pasan **antes** de tocar nada. Son la red de seguridad del restyle. Si alguno falla acá, el test está mal escrito: arreglarlo hasta que describa el comportamiento actual.

- [ ] **Step 3: Commitear la red de seguridad**

```bash
git add components/ui/DataTable.test.tsx
git commit -m "test(ui): fija el comportamiento de DataTable antes de rediseñarla"
```

- [ ] **Step 4: Aplicar el restyle**

En `components/ui/DataTable.tsx`, solo clases:

- Contenedor: `rounded-xl border bg-card shadow-sm` (era `rounded-lg border`).
- Cabecera: `bg-card` con `border-b`, texto `eyebrow` en vez de `text-muted-foreground` a secas, y `sticky top-0` para que sobreviva al scroll horizontal.
- Filas: `hover:bg-secondary/60`; la selección pasa de ámbar a la marca: `bg-[color:var(--brand-soft)]`.
- Celdas numéricas: si `col.className` incluye `text-right`, agregar `tabular-n`.

**No tocar** ninguna prop, ni la lógica de orden, ni la de selección.

- [ ] **Step 5: Correr los tests otra vez**

Run: `npx vitest run components/ui/DataTable.test.tsx`
Expected: PASS — los mismos 6. Si alguno se rompió, el restyle cambió comportamiento: revertir y rehacer solo con clases.

- [ ] **Step 6: Commit**

```bash
git add components/ui/DataTable.tsx
git commit -m "style(ui): tabla con la estética nueva, misma interfaz"
```

---

### Task 10: Propiedades — filtros unificados y en la URL

**Files:**
- Modify: `app/(dashboard)/properties/page.tsx`

**Interfaces:**
- Consumes: `FilterBar` de `@/components/filters/FilterBar`; `leerFiltros`, `escribirFiltros` de `@/lib/filters/url-state`; `useSearchParams`, `useRouter`, `usePathname` de `next/navigation`.

**Los filtros de esta pantalla, tal como están hoy** (verificado el 2026-08-07, `properties/page.tsx:65-110`):

| Estado de React | Va a la API como | Clave en la URL | Defecto |
|---|---|---|---|
| `filterStatus` | `status` | `status` | `''` |
| `dateRange.from` | `from` | `from` | `''` |
| `dateRange.to` | `to` | `to` | `''` |
| `onlyMine` | `assigned_to=<mi id>` | `mios` (`'1'`) | `''` |

En la URL va `mios=1` y no el id del usuario: el id no aporta nada al link compartido y no tiene por qué quedar a la vista.

**Lo que NO va a la URL en esta fase:**
- `tableSort` — el orden se queda en estado de React, como hoy. Meterlo suma riesgo sobre el modo de orden controlado (que es lo que hace que "el más caro" sea de todo el sistema y no de la página cargada) sin que nadie lo haya pedido.
- `viewMode` (grilla/lista/tabla) — no es un filtro, es una preferencia, y ya se guarda en `localStorage`. Se deja igual.

- [ ] **Step 1: Definir los valores por defecto**

Arriba del componente:

```ts
const FILTROS_DEFECTO = { status: '', from: '', to: '', mios: '' }
```

- [ ] **Step 2: Reemplazar los controles por `FilterBar`**

El desplegable de estado va como `FilterSelect`; **sus opciones salen del mismo arreglo que hoy alimenta el `<select>`** (no se inventan etiquetas ni valores nuevos). El rango de fechas y el interruptor "solo míos" van por `children`, sin tocarlos:

```tsx
<FilterBar
  selects={[{ key: 'status', label: 'Estado', options: OPCIONES_ESTADO }]}
  values={filtros}
  onChange={setFiltro}
  onClear={() => router.replace(pathname, { scroll: false })}
  extraActivo={!!filtros.from || !!filtros.to || filtros.mios === '1'}
>
  <DateRangeFilter
    value={{ from: filtros.from, to: filtros.to }}
    onChange={r => setFiltros({ ...filtros, from: r.from, to: r.to })}
  />
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={filtros.mios === '1'}
      onChange={e => setFiltro('mios', e.target.checked ? '1' : '')}
    />
    Solo míos
  </label>
</FilterBar>
```

**La lógica de qué se le pide a la API no se toca**: `buildParams` sigue igual, solo que lee de `filtros` en vez de los `useState` sueltos, y `assigned_to` se sigue mandando cuando `filtros.mios === '1'`.

- [ ] **Step 3: Conectar el estado a la URL**

```tsx
const router = useRouter()
const pathname = usePathname()
const searchParams = useSearchParams()
const filtros = leerFiltros(new URLSearchParams(searchParams.toString()), FILTROS_DEFECTO)

function setFiltros(nuevos: typeof FILTROS_DEFECTO) {
  const qs = escribirFiltros(nuevos, FILTROS_DEFECTO)
  // replace y no push: con push, cada ajuste del rango de fechas deja una entrada
  // en el historial y el botón Atrás se vuelve inusable.
  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
}

function setFiltro(key: string, value: string) {
  setFiltros({ ...filtros, [key]: value })
}
```

El `useEffect` que trae los datos pasa a depender de `filtros` en vez de los `useState` sueltos. El reset a la página 0 al cambiar un filtro **se conserva**: hoy existe porque un filtro nuevo cambia qué 24 filas son la página 0.

- [ ] **Step 4: Envolver en `<Suspense>`**

`useSearchParams` obliga a un límite de Suspense en App Router. Si el build se queja, envolver el componente cliente:

```tsx
<Suspense fallback={null}><PropertiesClient /></Suspense>
```

- [ ] **Step 5: Verificar en el navegador**

Con `npx next dev --webpack`:
- Filtrar por estado → la dirección cambia → **F5** → el filtro sigue puesto.
- Copiar la URL en otra pestaña → se abre ya filtrada.
- Atrás vuelve al filtro anterior, no a otra pantalla.
- Ordenar por Precio sigue trayendo el más caro **de todo el sistema**, no el de la página cargada (es el modo de orden controlado; si se rompe, se rompió la paginación).

- [ ] **Step 6: Verificar y commitear**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores, suite en verde.

```bash
git add "app/(dashboard)/properties/page.tsx"
git commit -m "feat(propiedades): barra de filtros única y filtros en la URL"
```

---

### Task 11: Contactos y CRM

**Files:**
- Modify: `app/(dashboard)/contacts/page.tsx`, `app/(dashboard)/crm/page.tsx`

**Contactos — filtros de hoy** (`contacts/page.tsx:66-80`):

| Estado de React | Va a la API como | Clave en la URL | Defecto |
|---|---|---|---|
| `filterOrigin` | `origin` | `origin` | `''` |
| `dateRange.from` | `from` | `from` | `''` |
| `dateRange.to` | `to` | `to` | `''` |

`assigned_to` **no** va a la URL: no es un filtro que el usuario elija, lo impone el rol (`if (userInfo?.role === 'asesor')`). Esa línea se conserva tal cual.

- [ ] **Step 1: Contactos — defaults y barra**

```ts
const FILTROS_DEFECTO = { origin: '', from: '', to: '' }
```

```tsx
<FilterBar
  selects={[{ key: 'origin', label: 'Origen', options: OPCIONES_ORIGEN }]}
  values={filtros}
  onChange={setFiltro}
  onClear={() => router.replace(pathname, { scroll: false })}
  extraActivo={!!filtros.from || !!filtros.to}
>
  <DateRangeFilter
    value={{ from: filtros.from, to: filtros.to }}
    onChange={r => setFiltros({ ...filtros, from: r.from, to: r.to })}
  />
</FilterBar>
```

`OPCIONES_ORIGEN` es el mismo arreglo que hoy alimenta el `<select>` de origen.

- [ ] **Step 2: Contactos — conectar a la URL**

Mismo bloque de `leerFiltros` / `escribirFiltros` / `router.replace(..., { scroll: false })` de la Task 10, Step 3, con `FILTROS_DEFECTO` de esta pantalla. El `useEffect` que trae los datos pasa a depender de `filtros`.

- [ ] **Step 3: Contactos — verificar y commitear**

En el navegador: filtrar por origen → F5 → sigue puesto. Como asesor, confirmar que sigue viendo **solo sus** contactos (que es la línea de `assigned_to` que no se tocó).

Run: `npx tsc --noEmit && npm test`

```bash
git add "app/(dashboard)/contacts/page.tsx"
git commit -m "feat(contactos): barra de filtros única y filtros en la URL"
```

**CRM — filtros de hoy** (`crm/page.tsx:229-241`):

| Estado de React | Va a la API como | Clave en la URL | Defecto |
|---|---|---|---|
| `filterCRMStage` | `crm_stage` | `etapa` | `''` |
| `filterOrigin` | `origin` | `origin` | `''` |
| `filterAdvisor` | `assigned_to` | `asesor` | `''` |
| `dateRange.from` | `from` | `from` | `''` |
| `dateRange.to` | `to` | `to` | `''` |

**Cuidado con `assigned_to`:** hoy tiene dos usos que se pisan. Si el rol es `asesor`, se fuerza a su propio id e **ignora** `filterAdvisor`; si no, usa `filterAdvisor`. Ese `if/else` se conserva íntegro — es lo que impide que un asesor vea deals ajenos manipulando la URL.

- [ ] **Step 4: CRM — defaults y barra**

```ts
const FILTROS_DEFECTO = { etapa: '', origin: '', asesor: '', from: '', to: '' }
```

```tsx
<FilterBar
  selects={[
    { key: 'etapa', label: 'Etapa', options: OPCIONES_ETAPA },
    { key: 'origin', label: 'Origen', options: OPCIONES_ORIGEN },
    ...(esAsesor ? [] : [{ key: 'asesor', label: 'Asesor', options: OPCIONES_ASESOR }]),
  ]}
  values={filtros}
  onChange={setFiltro}
  onClear={() => router.replace(pathname, { scroll: false })}
  extraActivo={!!filtros.from || !!filtros.to}
>
  <DateRangeFilter
    value={{ from: filtros.from, to: filtros.to }}
    onChange={r => setFiltros({ ...filtros, from: r.from, to: r.to })}
  />
</FilterBar>
```

El desplegable de asesor **no se muestra** cuando el rol es asesor, igual que hoy.

- [ ] **Step 5: CRM — conectar a la URL**

Mismo bloque de la Task 10, Step 3, con estos `FILTROS_DEFECTO`. En `fetchData`, mapear `filtros.etapa → crm_stage` y `filtros.asesor → assigned_to`, respetando el `if/else` del rol.

- [ ] **Step 6: CRM — verificar y commitear**

En el navegador, con un usuario **asesor**: poner `?asesor=<id de otro>` a mano en la barra de direcciones y confirmar que **sigue viendo solo sus deals**. Si ve los de otro, el `if/else` del rol se rompió: revertir.

Run: `npx tsc --noEmit && npm test`

```bash
git add "app/(dashboard)/crm/page.tsx"
git commit -m "feat(crm): barra de filtros única y filtros en la URL

El forzado de assigned_to por rol se conserva: un asesor no ve deals
ajenos ni tocando la URL a mano."
```

- [ ] **Step 7: Partir el archivo si quedó muy grande**

`crm/page.tsx` arrancó en 659 líneas. Si al terminar pasó de 700, extraer la barra de filtros y la tabla a `app/(dashboard)/crm/_components/`, **moviendo solo presentación** — la lógica de datos se queda en la página.

---

### Task 12: Visitas — absorber `VisitFiltersBar`

**Files:**
- Modify: `app/(dashboard)/visits/page.tsx`, `app/(dashboard)/visits/_components/VisitsTable.tsx`
- Delete: el componente `VisitFiltersBar` (ubicarlo con `grep -rn "VisitFiltersBar" app components`)

- [ ] **Step 1: Ver qué filtros ofrece hoy**

Run: `grep -rn "VisitFiltersBar" app components` y leer el componente. Anotar cada filtro con su clave y valor por defecto. **La lista de filtros no cambia**: los mismos que hoy, en el mismo orden.

- [ ] **Step 2: Reemplazar por `FilterBar` y conectar a la URL**

Igual que la Task 10. El filtro por asesor solo se muestra si `isAdmin`, como hoy — esa condición se conserva tal cual.

- [ ] **Step 3: Pasar `VisitsTable` a `DataTable`**

`VisitsTable.tsx` usa `<table>` cruda. Convertirla a `DataTable` definiendo un `Column<PropertyVisitWithRelations>[]`. Si alguna celda tiene interacción propia (botones dentro de la fila), conservarla dentro del `render` de su columna y mantener el `e.stopPropagation()` para que no dispare el click de fila.

- [ ] **Step 4: Verificar en el navegador**

Filtrar, refrescar, y confirmar que las acciones por fila siguen funcionando (que es donde una migración de tabla suele romper algo).

- [ ] **Step 5: Verificar y commitear**

Run: `npx tsc --noEmit && npm test`

```bash
git add "app/(dashboard)/visits/page.tsx" "app/(dashboard)/visits/_components/VisitsTable.tsx"
git rm <ruta del VisitFiltersBar>
git commit -m "feat(visitas): tabla y filtros unificados; se jubila VisitFiltersBar"
```

---

### Task 13: Las tablas que solo cambian de aspecto

Tasaciones y Usuarios (que **no tienen filtros hoy** y no se les inventa uno) más las tablas de reporte.

**Files:**
- Modify: `app/(dashboard)/appraisals/page.tsx`, `app/(dashboard)/users/page.tsx`
- Modify: `components/metrics/MetricsTable.tsx`, `components/metrics/CampaignBreakdown.tsx`, `app/(dashboard)/admin/ai-usage/AiUsageClient.tsx`, `app/(dashboard)/embudos/EmbudosClient.tsx`, `app/(dashboard)/settings/notifications/page.tsx`

- [ ] **Step 1: Confirmar que Tasaciones y Usuarios siguen sin filtros**

Run: `grep -n "useState.*[Ff]ilter\|useState.*search" "app/(dashboard)/appraisals/page.tsx" "app/(dashboard)/users/page.tsx"`
Expected: sin resultados. Si aparece algo, esa pantalla pasa al procedimiento de la Task 10 en vez de este.

- [ ] **Step 2: Alinear las tablas de reporte con la estética nueva**

En cada una de las 5 tablas de reporte, aplicar el mismo tratamiento de cabecera y bordes que quedó en `DataTable` (Task 9, Step 4): contenedor `rounded-xl border bg-card shadow-sm`, cabecera con `eyebrow`, y `tabular-n` en las columnas de números.

**No se convierten a `DataTable`**: no son listados, no se filtran, y varias tienen estructura propia (celdas combinadas, totales). Convertirlas sería reescribirlas.

- [ ] **Step 3: Confirmar que las excluidas quedaron intactas**

Run: `git status --short components/appraisal/ components/pdf/`
Expected: vacío. `ValuationReport.tsx` y todo `components/pdf/` están fuera de alcance.

- [ ] **Step 4: Verificar y commitear**

Run: `npx tsc --noEmit && npm test`

Mirar en el navegador `/metrics`, `/embudos` y `/admin/ai-usage`: los números tienen que seguir siendo los mismos de antes del cambio.

```bash
git add "app/(dashboard)/appraisals/page.tsx" "app/(dashboard)/users/page.tsx" components/metrics/MetricsTable.tsx components/metrics/CampaignBreakdown.tsx "app/(dashboard)/admin/ai-usage/AiUsageClient.tsx" "app/(dashboard)/embudos/EmbudosClient.tsx" "app/(dashboard)/settings/notifications/page.tsx"
git commit -m "style(tablas): estética unificada en listados sin filtro y tablas de reporte"
```

---

# FASE 3 — Números e Inicio

No empezar hasta que la Fase 2 esté aprobada por el dueño.

---

### Task 14: La tarjeta de número

**Files:**
- Create: `components/ui/StatTile.tsx`
- Test: `components/ui/StatTile.test.tsx`

**Interfaces:**
- Produces: `export function StatTile({ label, value, context, href, tone }: { label: string; value: string | number | null; context: string; href?: string; tone?: 'neutral' | 'alerta' })`
  - `value === null` significa **sin datos**, que no es lo mismo que cero.
  - `context` es **obligatorio**: es la regla del tablero (toda métrica viaja con su base).

- [ ] **Step 1: Escribir el test que falla**

Crear `components/ui/StatTile.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { StatTile } from './StatTile'

describe('StatTile', () => {
  it('muestra etiqueta, número y contexto', () => {
    render(<StatTile label="Propiedades publicadas" value={41} context="7 esperando revisión" />)
    expect(screen.getByText('Propiedades publicadas')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getByText('7 esperando revisión')).toBeInTheDocument()
  })

  // La regla del tablero: un período sin datos dice "sin datos", nunca "$0".
  it('sin datos dice "Sin datos", no cero', () => {
    render(<StatTile label="Inversión del mes" value={null} context="0 de 31 días con dato" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('un cero de verdad se muestra como cero', () => {
    render(<StatTile label="Sin responder" value={0} context="sobre 63 conversaciones" />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Sin datos')).not.toBeInTheDocument()
  })

  it('con href toda la tarjeta es un link', () => {
    render(<StatTile label="Pendientes" value={3} context="2 vencen hoy" href="/tasks" />)
    expect(screen.getByRole('link', { name: /Pendientes/ })).toHaveAttribute('href', '/tasks')
  })

  it('sin href no es un link', () => {
    render(<StatTile label="Pendientes" value={3} context="2 vencen hoy" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run components/ui/StatTile.test.tsx`
Expected: FAIL — no existe `./StatTile`.

- [ ] **Step 3: Escribir el componente**

Crear `components/ui/StatTile.tsx`:

```tsx
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  /** `null` = no hay dato. NO es lo mismo que 0 y no se muestra como 0. */
  value: string | number | null
  /** Obligatorio: de dónde sale el número. Regla del tablero, no decoración. */
  context: string
  href?: string
  tone?: 'neutral' | 'alerta'
}

export function StatTile({ label, value, context, href, tone = 'neutral' }: Props) {
  const cuerpo = (
    <>
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          'tabular-n mt-1 text-3xl leading-none',
          value === null && 'text-base text-muted-foreground',
          tone === 'alerta' && value !== null && 'text-[color:var(--destructive)]',
        )}
      >
        {value === null ? 'Sin datos' : value}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{context}</div>
    </>
  )

  const clases = 'block rounded-xl border bg-card p-4 shadow-sm'
  return href
    ? <Link href={href} className={cn(clases, 'transition-colors hover:bg-secondary')}>{cuerpo}</Link>
    : <div className={clases}>{cuerpo}</div>
}
```

- [ ] **Step 4: Correr los tests y commitear**

Run: `npx vitest run components/ui/StatTile.test.tsx`
Expected: PASS — 5 tests.

```bash
git add components/ui/StatTile.tsx components/ui/StatTile.test.tsx
git commit -m "feat(ui): tarjeta de número con contexto obligatorio y estado sin datos"
```

---

### Task 15: La pantalla de Inicio

**Files:**
- Create: `app/(dashboard)/inicio/page.tsx`
- Modify: `app/page.tsx` (destino por rol), `lib/nav/sections.ts` (entrada del menú), `lib/nav/sections.test.ts`

**Interfaces:**
- Consumes: `StatTile` de `@/components/ui/StatTile`; las rutas `GET /api/leads/count`, `GET /api/tasks`, `GET /api/visits`, `GET /api/properties` — **ninguna se modifica**.

- [ ] **Step 1: Actualizar los tests del menú**

En `lib/nav/sections.test.ts`, agregar `'/inicio'` a las rutas esperadas de asesor, coordinador y admin, y afirmar que el abogado **no** lo tiene:

```ts
it('el abogado no tiene Inicio: su entrada sigue siendo la revisión legal', () => {
  expect(navHrefs(getNavSections('abogado'))).not.toContain('/inicio')
})

it.each(['admin', 'dueno', 'coordinador', 'asesor'] as const)('%s entra por Inicio', role => {
  expect(navHrefs(getNavSections(role))[0]).toBe('/inicio')
})
```

- [ ] **Step 2: Correr y confirmar que fallan**

Run: `npx vitest run lib/nav/sections.test.ts`
Expected: FAIL — `/inicio` todavía no está en el menú.

- [ ] **Step 3: Agregar Inicio al menú**

En `lib/nav/sections.ts`, agregar `import { LayoutDashboard } from 'lucide-react'`, la constante, y ponerla primera en el grupo sin título de asesor, coordinador y admin (**no** en el del abogado):

```ts
const INICIO: NavItem = { href: '/inicio', label: 'Inicio', icon: LayoutDashboard }
// ...
{ label: null, entries: [INICIO, PENDIENTES] },
```

Actualizar también la lista de 10 rutas del asesor en el test de la Task 1: pasa a 11 con `/inicio`.

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run lib/nav/sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir la pantalla**

Crear `app/(dashboard)/inicio/page.tsx`. **Client component**, igual que `/tasks` y `/properties`: en esta plataforma las pantallas piden sus datos a las rutas de API desde el cliente, y un server component tendría que armar URL absoluta y reenviar cookies para llamarse a sí mismo.

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StatTile } from '@/components/ui/StatTile'

/** `null` = no se pudo traer. Nunca se muestra como 0 (regla del tablero). */
interface Numeros {
  pendientes: number | null
  sinResponder: number | null
  porRevisar: number | null
}

export default function InicioPage() {
  const [n, setN] = useState<Numeros>({ pendientes: null, sinResponder: null, porRevisar: null })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // Cada número falla por su cuenta: que una ruta se caiga no puede dejar la
    // pantalla entera en blanco ni, peor, mostrar ceros que no son ceros.
    async function pedir<T>(url: string, saca: (j: unknown) => number): Promise<number | null> {
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        return saca(await res.json())
      } catch {
        return null
      }
    }

    Promise.all([
      pedir('/api/tasks', (j: any) => (j.data ?? j).length),
      pedir('/api/leads/count', (j: any) => j.new ?? 0),
      pedir('/api/properties?status=pending_review&limit=1&offset=0', (j: any) => j.total ?? 0),
    ]).then(([pendientes, sinResponder, porRevisar]) => {
      setN({ pendientes, sinResponder, porRevisar })
      setCargando(false)
    })
  }, [])

  if (cargando) return <div className="text-sm text-muted-foreground">Cargando…</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Pendientes"
          value={n.pendientes}
          context={n.pendientes === null ? 'no se pudo consultar' : 'cosas esperándote'}
          href="/tasks"
          tone={n.pendientes && n.pendientes > 0 ? 'alerta' : 'neutral'}
        />
        <StatTile
          label="Consultas sin responder"
          value={n.sinResponder}
          context={n.sinResponder === null ? 'no se pudo consultar' : 'leads nuevos en el Inbox'}
          href="/inbox"
        />
        <StatTile
          label="Propiedades por revisar"
          value={n.porRevisar}
          context={n.porRevisar === null ? 'no se pudo consultar' : 'esperando revisión legal'}
          href="/properties/review"
        />
      </div>

      <Link href="/metrics" className="inline-block text-sm text-[color:var(--brand)] underline">
        Ver el estado del embudo
      </Link>
    </div>
  )
}
```

**Tres reglas que no se negocian:**
- Un dato que no se pudo traer va `value={null}` → la tarjeta dice "Sin datos". **Nunca un cero inventado**: un cero es una afirmación sobre el negocio.
- **No se duplica el análisis del negocio.** Solo el link a `/metrics`; el estado de resultados del embudo vive ahí.
- Cada tarjeta lleva `href` a la pantalla donde eso se resuelve.

- [ ] **Step 5b: Sumar la tarjeta de visitas, si el dato existe**

Leer `types/visits.types.ts` y la respuesta de `GET /api/visits` para ver si trae un campo de fecha que permita contar las de hoy filtrando en el cliente.

- **Si lo trae:** agregar una cuarta tarjeta "Visitas de hoy" con `href="/visits"`, contando sobre la respuesta que ya se pide.
- **Si no lo trae** (haría falta un parámetro nuevo en la ruta): **la tarjeta no va**. Anotarlo en el reporte final. Agregar un parámetro a `/api/visits` es tocar la API, y eso está fuera de alcance.

- [ ] **Step 5c: Recortar por rol**

El asesor y el coordinador no tienen `properties.review`, así que la tarjeta "Propiedades por revisar" no les sirve. Traer el rol con `fetch('/api/auth/me')` — la misma ruta que ya usan `/properties` y `/crm` — y mostrar cada tarjeta solo si su pantalla destino está en el menú de ese rol:

```ts
import { getNavSections, navHrefs } from '@/lib/nav/sections'
const permitidas = new Set(navHrefs(getNavSections(rol)))
// …y cada tarjeta se dibuja solo si `permitidas.has('/properties/review')`, etc.
```

Así la pantalla nunca ofrece un link que ese rol no puede abrir, y la regla vive en un solo lugar.

- [ ] **Step 6: Cambiar el destino de entrada**

En `app/page.tsx`, el `switch` pasa a: `abogado` → `/properties/review` (igual que hoy); el resto → `/inicio`.

- [ ] **Step 7: Verificar en el navegador**

Con `npx next dev --webpack`: entrar como cada rol y confirmar que la pantalla de entrada es la correcta y que **ningún número aparece en cero cuando en realidad no se pudo traer** (probar cortando la red en el inspector: tienen que decir "Sin datos").

- [ ] **Step 8: Verificar y commitear**

Run: `npx tsc --noEmit && npm test`

```bash
git add "app/(dashboard)/inicio/page.tsx" app/page.tsx lib/nav/sections.ts lib/nav/sections.test.ts
git commit -m "feat(inicio): pantalla de entrada con los números del día

Sale de rutas que ya existían; no se agregó ninguna consulta. El análisis
del negocio sigue viviendo en /metrics."
```

---

### Task 16: Números en las cabeceras de los listados

**Files:**
- Modify: `app/(dashboard)/properties/page.tsx`, `app/(dashboard)/crm/page.tsx`, `app/(dashboard)/visits/page.tsx`

- [ ] **Step 1: Agregar la fila de tarjetas**

Encima de la barra de filtros, una fila de `StatTile` alimentada **solo con lo que la pantalla ya tiene en memoria**. Concretamente:

| Pantalla | Tarjetas | De dónde sale |
|---|---|---|
| Propiedades | "Propiedades" (total) · "En pantalla" | `total` y `properties.length`, dos `useState` que ya existen |
| CRM | "Deals" (total) · una por etapa | `total` y `stageCounts` / `crmStageCounts`, que la respuesta de `/api/deals` **ya devuelve** y la pantalla ya guarda |
| Visitas | "Visitas" (total) | el largo del arreglo que ya se pide |

El `context` de cada tarjeta dice sobre qué está contando, y **respeta el filtro puesto**: si hay filtros aplicados, el texto es "con los filtros puestos", no "en total" — si no, la tarjeta miente sobre su propia base.

```tsx
<div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
  <StatTile
    label="Propiedades"
    value={total}
    context={hayFiltros ? 'con los filtros puestos' : 'en el sistema'}
  />
  <StatTile label="En pantalla" value={properties.length} context={`de ${total}`} />
</div>
```

Si un número exigiera una consulta nueva, **no se pone**.

- [ ] **Step 2: Confirmar que no se agregaron llamadas**

Run: `git diff app/\(dashboard\)/properties/page.tsx | grep -E "^\+.*(fetch|useEffect)"`
Expected: sin resultados. Si aparece un `fetch` nuevo, ese número no sale de datos existentes: sacarlo.

- [ ] **Step 3: Verificar y commitear**

Run: `npx tsc --noEmit && npm test`

```bash
git add "app/(dashboard)/properties/page.tsx" "app/(dashboard)/crm/page.tsx" "app/(dashboard)/visits/page.tsx"
git commit -m "feat(listados): fila de números arriba de cada listado"
```

- [ ] **Step 4: Revisión final del dueño**

Recorrer la plataforma entera con él en el navegador, en computadora y en celular.

---

## Notas de ejecución

- **Cada fase termina con aprobación del dueño** antes de empezar la siguiente. La Fase 1 es la que cambia todo visualmente; su reacción puede cambiar el detalle de las Fases 2 y 3.
- **Si un test preexistente se pone en rojo, no se toca el test.** Se investiga qué se rompió.
- **Ante cualquier duda sobre "¿esto era así antes?"**, la referencia es `git show HEAD~N:<archivo>`, no la memoria.
- **El contador de Pendientes** queda fuera de la Fase 1 a propósito (no hay fuente que lo cuente sin agregar una consulta). Cuando la Task 15 traiga los pendientes para el Inicio, se puede evaluar reutilizar ese dato para el menú.
