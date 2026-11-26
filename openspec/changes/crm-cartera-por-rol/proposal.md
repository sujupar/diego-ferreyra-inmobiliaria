# Proposal

## Why

La pantalla del CRM (`/crm`) y la de Contactos (`/contacts`) no dicen qué hacer. Diez tarjetas
de colores del mismo tamaño ("Descartado 472" pesa lo mismo que "Coordinada 15"), una tarjeta
"Deals 984" que repite la suma, tres filtros sin nombre ("Todas / Todos / Todos"), textos en
inglés ("Deals", "Custom") y filas que muestran un número de orden y repiten el nombre, pero no
cuándo se habló por última vez ni cuál es el próximo paso. El dueño (2026-11-25): "no se ve
profesional"; el objetivo es "muchísima claridad y objetividad".

## What Changes

- **BREAKING (visual):** `/crm` deja de ser una sola pantalla igual para todos. Cada rol abre en
  la vista de su trabajo (decisión del dueño, 2026-11-25: "debe ser personalizado por cada
  usuario, ya que cada usuario tiene responsabilidades diferentes"):
  - **Coordinación:** primero las solicitudes sin primer contacto, las llamadas vencidas y las
    tasaciones coordinadas para hoy y mañana; debajo, el resto de solicitudes y coordinadas.
  - **Asesor:** solo sus procesos, ordenados por próximo paso (visitas de hoy, tareas vencidas,
    seguimientos); debajo, los que no tienen nada pendiente.
  - **Admin y dueño:** el embudo completo y lo trabado (solicitudes sin primer contacto con su
    antigüedad, procesos sin asesor, seguimientos sin movimiento); debajo, la lista completa con
    filtros.
- **Selector de vista para admin y dueño** (decisión del dueño, 2026-11-25): pueden ver el CRM
  como lo ve la coordinación o como lo ve cada asesor, para revisar el trabajo de cada uno. Solo
  lectura de lo que esa persona ve; no cambia permisos de nadie.
- Cada fila, en todas las vistas: nombre, etapa, último contacto ("hace 2 días"), próximo paso
  y si está vencido; al tocarla abre la ficha de contacto (`crm-ficha-y-llamadas`).
- Los procesos cerrados (descartados y captados) salen de la vista principal y quedan a un
  filtro de distancia.
- Los números por etapa pasan a una barra chica y secundaria, sin fondos de colores; todo en
  castellano; cada filtro con su nombre a la vista.
- **Contactos (`/contacts`):** la misma lógica y el mismo lenguaje visual: lista clara con
  último contacto y próximo paso, el asesor ve sus contactos (la regla de acceso de
  `crm-ficha-y-llamadas`), y la fila abre la ficha.
- Primero una **maqueta navegable** con las vistas de cada rol, en escritorio y en celular,
  que el dueño aprueba antes de escribir código (mismo método que `crm-sistema-diseno`).
- **Queda afuera:** el tablero Kanban (se revisa en la maqueta si se conserva), métricas de
  negocio (siguen en Métricas), editar procesos desde la lista, acciones masivas nuevas.

Roles: coordinador, asesor, admin, dueño. El abogado no usa el CRM.

## Diferencia con `crm-inicio`

El **Inicio** es la lista corta del día ("qué hago ahora"). El **CRM** es la cartera entera de
procesos, ordenada según lo que le importa a cada rol. Los dos comparten las mismas reglas de
"vencido", "sin primer contacto" y "próximo paso" (un solo módulo en `lib/crm/`), para que
nunca digan cosas distintas sobre el mismo proceso.

## Capabilities

### New Capabilities
- `crm-cartera`: qué ve cada rol al abrir el CRM y Contactos, el selector de vista de admin y
  dueño, y cómo se lee una fila.

### Modified Capabilities
- `crm-sistema-diseno`: suma las piezas de lista (fila de proceso, barra de etapas, filtros con
  nombre, selector de vista) al sistema de diseño aprobado.

## Impact

- Código: `app/(dashboard)/crm/page.tsx` y `_components/` (reemplazo de la vista), 
  `app/(dashboard)/contacts/page.tsx`, una ruta de lectura de la cartera por rol, reglas puras
  en `lib/crm/cartera.ts`.
- Depende de `crm-ficha-y-llamadas` (último contacto, tareas de la cadencia, ficha a la que
  lleva cada fila, regla de acceso a contactos).
- Orden en el plan: va después de `crm-ficha-y-llamadas` y antes de `crm-linea-de-tiempo`,
  `crm-tareas-y-campanita`, `crm-inicio` y `crm-estadisticas-llamadas`, para que la ficha
  nueva y la lista nueva salgan juntas.
- Permisos: el selector de vista lo valida el servidor (solo admin y dueño); el asesor nunca
  recibe procesos ajenos por la red, aunque la pantalla no los muestre.

## Respuestas del dueño a la maqueta (2026-11-26)

"Ok a las 4, seguí", sobre la maqueta https://claude.ai/artifact/5S3NmLpjX98gm7R1jEinhE:

1. **Sin tablero por columnas (Kanban).** Hoy no existe y no se hace.
2. **"Seguimiento sin movimiento" = 14 días** sin contacto.
3. **Las clases gratuitas no aparecen en el CRM de la coordinación** (no las llama ella);
   admin y dueño las siguen viendo.
4. **La cabecera de la ficha dice "Último contacto"** en vez de "Última llamada" (una visita
   también cuenta). Se aplica en `crm-ficha-y-llamadas`, que es el change que construye la
   ficha, para que la ficha y la lista salgan diciendo lo mismo.
