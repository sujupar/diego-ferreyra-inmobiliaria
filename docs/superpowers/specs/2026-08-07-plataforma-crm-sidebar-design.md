# Rediseño de la plataforma a estilo CRM — menú lateral, tablas y medición

**Fecha:** 2026-08-07
**Estado:** diseño aprobado por el dueño (las tres partes, en conversación del 2026-08-07)

## El problema

El menú superior con desplegables se quedó sin lugar. Hoy tiene 10 entradas al mismo
nivel, ordenadas por el momento en que fue apareciendo cada funcionalidad, no por
cómo trabaja el equipo. Cada funcionalidad nueva empeora el problema: no hay dónde
poner la siguiente sin que el header se rompa.

La plataforma tiene **39 pantallas** bajo `app/(dashboard)/`. Un menú horizontal no
escala a eso.

## Las decisiones que ya se tomaron

Estas no se re-discuten durante la implementación. Salieron de la conversación de
diseño del 2026-08-07 con el dueño:

1. **Alcance: las tres partes** — caparazón, tablas/filtros y paneles de medición.
   Se entregan en tres fases para poder deployar y verificar por partes, pero las
   tres están dentro del alcance comprometido.
2. **Norte estético: la referencia de Clínica Bella Vita**, con la estructura de
   secciones agrupadas y los números arriba de cada pantalla — **pero con los
   colores de la marca: blanco y azul**. Nada de sidebar oscuro. Cita textual:
   *"No quiero que aceptes el color oscuro ni nada por el estilo. Sigue siendo el
   blanco y el azul que nosotros utilizamos, pero adaptado para ese estilo."*
3. **Base técnica: el componente `sidebar` de shadcn**, copiado al repo y vestido
   con los tokens de la marca. No suma dependencias: usa `radix-ui`, que ya está
   instalado y ya lo usan `collapsible.tsx` y `tabs.tsx`.
4. **Se crea una pantalla de Inicio nueva.** Hoy `/` redirige a `/tasks`.
5. **Los filtros pasan a la barra de direcciones.** Hoy se pierden al refrescar.
6. **Ninguna funcionalidad se ve afectada.** Cita textual: *"Hay que adaptar
   absolutamente toda la navegación de la plataforma para eso, pero sin afectar ni
   una sola funcionalidad."*

## Estado actual (verificado el 2026-08-07)

- **Navegación:** `app/(dashboard)/layout.tsx` calcula el menú por rol en el
  servidor (`getNavSections`, líneas 19-103) y se lo pasa a `DashboardNav.tsx`
  (cliente), que renderiza `NavDropdown` / `NavLink` / `MobileNav` desde
  `components/nav/NavDropdown.tsx`. Esa cadena la usa **solo** el layout: se puede
  reemplazar completa sin tocar nada más.
- **Contador del Inbox:** `DashboardNav.tsx` hace `fetch('/api/leads/count')` al
  montar y cada 60 segundos. **Es funcionalidad y se conserva tal cual.**
- **Tokens:** `app/globals.css` ya define `--sidebar`, `--sidebar-foreground`,
  `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring` (líneas 95-102) y la
  marca navy `--brand` / `--brand-soft`. El proyecto se scaffoldeó esperando un
  menú lateral que nunca se construyó.
- **Modo oscuro:** los tokens `.dark` existen pero **nada los activa** — no hay
  `ThemeProvider`, ni `useTheme`, ni toggle. La plataforma es light-only y así se
  queda. Los tokens `.dark` no se borran (no molestan) pero tampoco se mantienen
  al día en esta obra.
- **Tablas:** `components/ui/DataTable.tsx` en 4 listados
  (`appraisals`, `contacts`, `crm`, `properties`) más
  `components/metrics/PropertyInquiriesPanel.tsx`. Aparte hay 8 `<table>` crudas
  con estilos propios.
- **Filtros:** un único componente reutilizable (`components/filters/DateRangeFilter.tsx`).
  El resto está hecho a mano pantalla por pantalla. Las pantallas de listado arman
  `URLSearchParams` **para la llamada a la API**, no para la barra de direcciones
  (no usan `useSearchParams` ni `router.replace`): por eso el filtro se pierde al
  refrescar.

---

## Fase 1 — El caparazón

Es el cambio de mayor impacto visual y menor riesgo: toca 1 layout y 2 componentes
de navegación; las 39 pantallas heredan el marco nuevo sin que se les toque el
contenido.

### 1.1 Arquitectura de información

Los títulos de grupo (`CAPTACIÓN`, `COMERCIAL`, …) son **etiquetas, no botones**:
no se clickean ni se colapsan. Los ítems con hijos sí se despliegan.

**admin / dueño**

```
Inicio                        /            (pantalla nueva)
Pendientes            [n]     /tasks

CAPTACIÓN
  Tasaciones ▸
    Coordinar                 /pipeline/new
    Nueva tasación            /appraisal/new
    Historial                 /appraisals
  Propiedades ▸
    Listado                   /properties
    Nueva                     /properties/new
    Revisión legal            /properties/review     (si tiene properties.review)

COMERCIAL
  Inbox               [n]     /inbox
  Avisos por identificar      /avisos
  CRM                         /crm
  Contactos                   /contacts
  Visitas                     /visits

MARKETING
  Redes sociales              /redes-sociales
  Métricas                    /metrics               (si tiene metrics.view)
  Embudos                     /embudos               (si tiene metrics.view)

ADMINISTRACIÓN                                       (si settings.manage o users.manage)
  Configuración ▸                                    (si settings.manage)
    General                   /settings
    Notificaciones            /settings/notifications
    Portales                  /settings/portals
  Herramientas ▸                                     (si settings.manage)
    Probar el sistema         /admin/pipeline-test
    Test de emails            /admin/email-test
    Probar el agente IA       /admin/ai-agent
    Costo del agente IA       /admin/ai-usage
  Usuarios                    /users                 (si users.manage)
```

**coordinador**

```
Inicio · Pendientes [n]

CAPTACIÓN     Tasaciones ▸ (Coordinar, Historial) · Propiedades ▸ (Listado, Nueva)
COMERCIAL     Inbox [n] · Avisos por identificar · CRM · Contactos · Visitas
MARKETING     Redes sociales
```

**asesor**

```
Inicio · Pendientes [n]

MI DÍA        Inbox [n] · CRM · Visitas · Mis contactos
CAPTACIÓN     Tasaciones ▸ (Coordinar, Nueva tasación, Historial) · Mis propiedades
MARKETING     Redes sociales
```

**abogado** — sin grupos. Con 3 pantallas, agrupar es ruido:

```
Pendientes                    /tasks
Revisión legal                /properties/review
Historial                     /appraisals
```

El abogado **no** ve Inicio: su pantalla de entrada sigue siendo `/properties/review`,
como hoy (`app/page.tsx`).

**Cambios respecto del menú actual, y por qué son seguros:**

- Aparecen `Configuración → Notificaciones` (hoy solo se llega desde adentro de
  `/settings`) y las 4 herramientas de prueba agrupadas bajo "Herramientas" (hoy
  cuelgan sueltas de "Admin"). Son links a pantallas que ya existen y funcionan.
- Aparece "Inicio" (pantalla nueva, Fase 3).
- **Nada se saca.** Toda ruta que hoy está en el menú sigue estando.

**Lo que NO se agrega:** buscador global. La referencia lo tiene, pero en esta
plataforma sería funcionalidad nueva de verdad (buscar a la vez en propiedades,
contactos, tasaciones y conversaciones) y el alcance dice explícitamente que no se
toca funcionalidad. Queda anotado como candidato posterior.

### 1.2 Dónde vive la lógica del menú

`getNavSections` sale de `app/(dashboard)/layout.tsx` a un módulo propio:

- **`lib/nav/sections.ts`** — función pura `getNavSections(role: Role): NavGroup[]`,
  sin dependencias de React ni de Next. Los tipos:

  ```ts
  type NavItem  = { href: string; label: string; icon: LucideIcon; badge?: 'inbox' | 'tasks' }
  type NavEntry = NavItem | { label: string; icon: LucideIcon; items: NavItem[] }
  type NavGroup = { label: string | null; entries: NavEntry[] }   // label null = sin título de grupo
  ```

  El `badge` es un **identificador simbólico**, no un número: la función es pura y
  no consulta datos. El componente cliente resuelve el número.

- **`lib/nav/sections.test.ts`** — tests que afirman los permisos del menú. Es el
  seguro de "ninguna funcionalidad afectada": hoy esa lógica no tiene ni un test.

Las decisiones de permiso siguen usando `hasPermission` de `lib/auth/roles`, con
las mismas comprobaciones de hoy. No se agrega, saca ni cambia ningún permiso.

### 1.3 Anatomía de la pantalla

```
┌───────────────┬──────────────────────────────────────────────┐
│  marca        │  Título de la pantalla        ◕ Usuario  ⌄   │  barra superior 56px
│               ├──────────────────────────────────────────────┤
│  navegación   │                                              │
│               │   contenido de la pantalla                   │
│               │                                              │
│  ─────────    │                                              │
│  ◕ usuario    │                                              │
└───────────────┴──────────────────────────────────────────────┘
   240px            fondo --secondary → el sidebar blanco flota
```

- **Marca** arriba del sidebar (el logo que hoy está en el header).
- **Menú de usuario** (`components/auth/UserMenu.tsx`) **en la barra superior a la
  derecha**, como hoy. No se toca ese componente.
- **Barra superior:** botón de colapsar (☰ en celular), título de la pantalla, y el
  menú de usuario. **Título y subtítulo, no breadcrumbs**: el menú tiene 2 niveles,
  así que una miga de pan diría "Propiedades / Listado" y no aporta nada. Es más
  cerca de la referencia y un archivo menos.
- **Los carteles existentes no se mueven** y siguen arriba de todo, a ancho completo:
  el de MODO PRUEBA (`layout.tsx:123-131`) y el de suplantación
  (`ImpersonationBanner`). Ambos avisan de un estado peligroso; taparlos con el
  sidebar sería un retroceso.

**En celular** (`< 768px`): el sidebar desaparece y se abre como panel deslizante
desde un botón ☰ en la barra superior. Los ítems pasan a 44px de alto.

### 1.4 Comportamiento

- **Colapsable a solo íconos**, con el estado guardado en cookie. El servidor lee
  la cookie antes de dibujar, así que no hay parpadeo al cargar. En modo colapsado,
  cada ícono muestra su etiqueta en un tooltip.
- **Submenús desplegables.** El que contiene la ruta activa arranca abierto.
- **Ítem activo marcado por tres señales a la vez**: fondo `--brand-soft`, texto
  `--brand`, y una barra `--brand` de 3px pegada al borde izquierdo. Tres y no una
  porque el color solo deja afuera a quien no distingue azul.
- **Contadores:** el del Inbox conserva exactamente el comportamiento actual
  (`fetch('/api/leads/count')` al montar + cada 60s, con `try/catch` silencioso).

### 1.5 Sistema visual

No se inventa paleta. Los tokens ya existen en `app/globals.css`:

| Elemento | Token | Color |
|---|---|---|
| Fondo del sidebar | `--sidebar` | `#ffffff` |
| Texto de los ítems | `--sidebar-foreground` | `#05070b` |
| Títulos de grupo | `--muted-foreground` + utilidad `eyebrow` | `#6e7278` |
| Ítem activo | `--brand` sobre `--brand-soft` | `#003ca6` sobre `#d5e9ff` |
| Ítem en hover | `--sidebar-foreground` sobre `--sidebar-accent` | carbón sobre `#eff2f5` |
| Borde del sidebar | `--sidebar-border` | `#e2e5e8` |

**Único cambio de token:** el área de contenido sube de `bg-secondary/30` a
`bg-secondary` pleno. Motivo medido: el fondo actual (`#f9fafb`) contra el sidebar
blanco (`#ffffff`) da 1.27:1 — son el mismo color a ojo, y el sidebar no se
despegaría. La separación se resuelve con el fondo, no engordando el borde.

Tipografía: la que ya está (Geist sans, más `tabular-n` para los números y
`eyebrow` para los títulos de grupo). No se agregan fuentes.

### 1.6 Accesibilidad (WCAG AA)

**Contrastes verificados por cálculo el 2026-08-07** (oklch → sRGB → ratio WCAG):

| Par | Medido | Mínimo |
|---|---|---|
| Texto del ítem sobre sidebar blanco | 20.12:1 | 4.5 |
| Título de grupo sobre sidebar blanco | 4.85:1 | 4.5 |
| Ítem activo: navy sobre navy pálido | 7.69:1 | 4.5 |
| Ítem en hover | 17.92:1 | 4.5 |
| Texto blanco sobre navy | 9.52:1 | 4.5 |
| Carbón sobre fondo de la app | 19.27:1 | 4.5 |
| Barra navy del ítem activo vs blanco | 9.52:1 | 3.0 |

El título de grupo pasa con 4.85:1, que es ajustado. Si en la implementación se le
baja opacidad o se le achica el tamaño, hay que **volver a medir** — la opacidad
cambia el contraste efectivo y ese renglón no tiene margen.

Lo que se agrega y hoy no existe:

- Link "Saltar al contenido" visible al primer Tab. Hoy quien navega con teclado
  atraviesa las ~20 entradas del menú en cada pantalla.
- `aria-current="page"` en el ítem activo; `aria-expanded` en los desplegables.
- El panel del celular atrapa el foco mientras está abierto y lo devuelve al botón
  ☰ al cerrarse.
- Los contadores se leen con contexto ("Inbox, 12 sin leer"), no como número suelto.
- Objetivos táctiles ≥ 44px en celular.

### 1.7 Archivos

**Nuevos**

```
components/ui/sidebar.tsx          — shadcn, adaptado a los tokens de marca
components/ui/sheet.tsx            — panel deslizante del celular (lo requiere sidebar)
components/ui/tooltip.tsx          — etiquetas del modo colapsado
components/ui/skeleton.tsx         — estado de carga del menú
hooks/use-mobile.ts                — el alias @/hooks ya está en components.json
lib/nav/sections.ts                — función pura del menú por rol
lib/nav/sections.test.ts           — tests de permisos del menú
components/nav/AppSidebar.tsx      — el menú armado (cliente; resuelve contadores)
components/dashboard/Topbar.tsx    — botón de colapsar + título + UserMenu
```

**Modificados**

```
app/(dashboard)/layout.tsx         — arma el marco; importa getNavSections de lib/nav
app/globals.css                    — fondo del contenido + utilidades del sidebar
```

**Eliminados** (verificado: nadie más los importa)

```
app/(dashboard)/DashboardNav.tsx
components/nav/NavDropdown.tsx
```

---

## Fase 2 — Tablas y filtros

### 2.1 Las tablas se dividen en tres grupos

| Grupo | Cuáles | Qué se hace |
|---|---|---|
| **Listados con filtro** | `/properties`, `/contacts`, `/crm`, `/visits` | Estilo nuevo + barra de filtros unificada + filtros en la URL |
| **Listados sin filtro** | `/appraisals`, `/users` | Solo el estilo. **Verificado el 2026-08-07: hoy no tienen ningún estado de filtro.** No se les inventa uno: agregar filtros donde no hay es funcionalidad nueva, y esta obra no la trae |
| **Reportes** | `MetricsTable`, `CampaignBreakdown`, `/admin/ai-usage`, `EmbudosClient`, `/settings/notifications` | Solo el estilo: misma cabecera, números en columna con `tabular-n` |
| **Excluidas** | `components/appraisal/ValuationReport.tsx` y todo `components/pdf/` | No se tocan |

`ValuationReport` queda afuera a propósito: tiene edición en línea con recálculo en
vivo, y es la pantalla donde un número mal mostrado termina impreso en una tasación.
Retocarle el maquetado para que "combine" es riesgo sin ganancia. `components/pdf/`
usa las primitivas de `@react-pdf`, que no son HTML.

### 2.2 La barra de filtros

Un componente `components/filters/FilterBar.tsx`: buscador a la izquierda,
desplegables al lado, fichas con lo aplicado y "Limpiar todo" cuando hay algo puesto.
Absorbe el `VisitFiltersBar` que hoy existe suelto para `/visits`, que es el único
caso donde la barra de filtros ya está factorizada en su propio componente.

```
[🔍 Buscar dirección…]  [Estado ▾]  [Asesor ▾]  [Operación ▾]
● Publicada ×   ● Ana ×                            Limpiar todo
```

**Invariante:** no se reescribe cómo filtra cada pantalla. Qué se pide, cómo se
consulta y cómo se ordena se queda donde está. Se unifica el envase y los controles.

### 2.3 Filtros en la barra de direcciones

Las 4 pantallas que hoy tienen filtro (`/properties`, `/contacts`, `/crm`,
`/visits`) pasan a leer y escribir su estado de filtro en la URL
(`useSearchParams` + `router.replace` con `scroll: false`). Consecuencias buscadas:
el filtro sobrevive al refresco, el link filtrado se puede compartir, y el botón
Atrás del navegador funciona.

Reglas para no romper nada:

- Los nombres de los parámetros salen de los `URLSearchParams` que cada pantalla ya
  arma para su llamada a la API. No se inventan nombres nuevos.
- Un parámetro ausente significa "sin filtrar", igual que el estado inicial de hoy.
- Un valor inválido en la URL se ignora y se cae al valor por defecto; nunca rompe
  la pantalla.
- `router.replace`, no `push`, para los cambios de filtro tecleados (si no, cada
  letra del buscador deja una entrada en el historial).

### 2.4 `DataTable`

Se conserva la API pública actual (`columns`, `getRowKey`, `selectable`, `sort` /
`onSortChange`). En particular **se conserva el modo de orden controlado**, que
existe porque ordenar en memoria con datos paginados solo reordenaba la página
cargada (está documentado en `DataTable.tsx:26-38`). Los cambios son de
presentación: cabecera, densidad de fila, estados de hover y selección, y que la
tabla scrollee horizontal dentro de su contenedor en celular.

---

## Fase 3 — Números e Inicio

### 3.1 La tarjeta de número

`components/ui/StatTile.tsx` — tres renglones: etiqueta (`eyebrow`), número grande
(`tabular-n`), y **una línea de contexto obligatoria**.

```
┌─────────────────────────┐
│ PROPIEDADES PUBLICADAS  │
│ 41                      │
│ 7 esperando revisión    │
└─────────────────────────┘
```

El tercer renglón no es decoración: es la regla del tablero ya establecida en
`CLAUDE.md` — *"toda métrica viaja con su `n`"* y *"un período sin inversión dice
«sin datos», nunca «$0»"*. Por eso el componente **exige** ese texto y tiene un
estado explícito "sin datos" distinto de mostrar cero.

### 3.2 La pantalla de Inicio

Ruta `/inicio`, con `app/page.tsx` redirigiendo ahí para los roles que la tienen.
El abogado sigue entrando a `/properties/review`.

Muestra el **operativo del día** — pendientes sin resolver, consultas sin responder,
visitas de hoy, propiedades esperando revisión — y accesos directos a lo que cada
rol usa.

**No repite el análisis del negocio.** El estado de resultados del embudo vive en
`/metrics` y ahí se queda, con un link desde Inicio. Esa decisión ya se tomó el
2026-08-06 (está en `CLAUDE.md`: meter análisis de negocio en la pantalla
equivocada fue un error corregido a pedido del dueño).

**Los números salen de fuentes que ya existen** (verificado el 2026-08-07):

| Número | Fuente |
|---|---|
| Consultas sin responder | `GET /api/leads/count` — ya es consciente del rol |
| Pendientes sin resolver | `GET /api/tasks` — el mismo que usa `/tasks` |
| Visitas de hoy | `GET /api/visits` — el mismo que usa `/visits` |
| Propiedades por estado | `GET /api/properties` — el mismo que usa `/properties` |

No se escriben consultas nuevas ni RPCs nuevas, y no se toca ninguna de esas cuatro
rutas. Si durante la implementación aparece un número deseado sin fuente existente,
**no se inventa**: se deja afuera y se anota en el reporte.

---

## Invariantes — lo que no puede cambiar

1. **Ninguna ruta desaparece ni cambia de dirección.**
2. **Ningún permiso cambia.** Quién ve qué sigue decidiéndose con `hasPermission`,
   con las mismas comprobaciones. Los tests de `lib/nav/sections.test.ts` lo fijan.
3. **El contador del Inbox** conserva su comportamiento (`/api/leads/count`, cada 60s).
4. **Los carteles de MODO PRUEBA y de suplantación** siguen a ancho completo arriba
   de todo.
5. **Ninguna dependencia nueva** en `package.json`.
6. **Cero cambios en `app/api/`, `lib/` de negocio, migraciones o Netlify Functions.**
   Esta obra es de interfaz. Las únicas excepciones son `lib/nav/` (nuevo) y las
   páginas de listado en lo que hace a leer sus filtros de la URL.
7. **`components/appraisal/ValuationReport.tsx` y `components/pdf/` no se tocan.**
8. **La landing pública (`app/p/[slug]`, scope `.landing-root`) no se toca.** Tiene
   su propio sistema de diseño y su propio layout; el bloque `.landing-root` de
   `globals.css` queda intacto.

## Verificación

1. **`lib/nav/sections.test.ts`** — afirma los permisos del menú por rol: el abogado
   ve exactamente 3 rutas y ninguna más; el asesor no ve ADMINISTRACIÓN; las rutas
   condicionadas aparecen solo con su permiso. Es el seguro de "no se afectó
   ninguna funcionalidad".
2. **`npx tsc --noEmit`** sobre todo el proyecto.
3. **`npx vitest run`** — la suite existente tiene que seguir verde.
4. **Revisión en navegador real** con `next dev --webpack`. Turbopack revienta en
   esta carpeta por el acento de "Gestión" (documentado en `CLAUDE.md`), así que
   `next build` y `next dev` a secas **no sirven para validar acá**. Se recorren las
   pantallas en ancho de computadora y en ancho de celular.
5. **Revisión con teclado**: Tab desde el inicio → aparece "Saltar al contenido" →
   el menú se recorre en orden → los desplegables se abren con Enter/Espacio → en
   celular el foco queda dentro del panel.
6. **Revisión final del dueño en el navegador**, que es la única que decide si se ve
   como quería.

## Riesgos conocidos

- **La verificación local es parcial.** Turbopack roto significa que `next build` no
  se puede usar como red de seguridad acá; el build real ocurre en Netlify (que
  buildea en un path sin acentos). Un error que solo aparezca en build de producción
  se vería recién en el deploy.
- **Fase 2 es la de riesgo real.** Mover el estado de filtros a la URL toca 6
  pantallas que hoy funcionan. Se hace pantalla por pantalla, no las 6 juntas.
- **El menú crece a ~20 entradas visibles para admin.** Si con el uso resulta
  demasiado largo, la salida es colapsar grupos enteros, no volver al menú
  horizontal.
- **Sesiones en paralelo sobre la misma carpeta.** Hay trabajo sin commitear de otra
  tarea (agente IA, `material-request`, `reset-prueba`). Los commits de esta obra
  deben agregar solo sus propios archivos, nunca `git add -A`.

## Fuera de alcance

- Buscador global.
- Modo oscuro (los tokens `.dark` quedan como están, sin activar).
- Vistas Kanban / calendario / tablero al estilo monday.
- Cualquier cambio en la lógica de negocio, la base de datos o las integraciones.
