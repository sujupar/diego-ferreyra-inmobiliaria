# Editor de landing de lujo (E1.6) — Design

**Fecha:** 2026-07-24
**Estado:** diseño aprobado (pendiente review del spec)
**Contexto previo:** existe el sistema de landing de LUJO (E1.9, aprobado): template curado `luxury` + bloques + `LandingRenderer` + `LandingSection` (asistente IA que crea/publica la landing). Las landings viven en `property_landings.content` (jsonb con el `LandingDocument`). Ahora se quiere un editor para que el asesor RETOQUE la landing.

## Objetivo

Que el asesor pueda personalizar el CONTENIDO de una landing (textos + fotos) desde la plataforma, con una experiencia visual clara, **sin poder romper el diseño de lujo** (la estructura curada queda fija).

## Decisiones (con el usuario)

1. **Alcance = contenido (texto + fotos).** Editable: textos de todas las secciones (titular, subtítulo, etiqueta de oferta, CTA, los 3 bloques de historia, ubicación, cierre), foto de portada del hero, foto de cada bloque de historia, orden y selección de fotos de la galería, y **mostrar/ocultar secciones opcionales**. **NO** se puede reordenar secciones ni agregar bloques arbitrarios (la estructura de lujo es fija → garantía de calidad).
2. **UI = panel lateral + vista previa en vivo** (patrón Wix/Squarespace). Izquierda: la landing real (misma que se publica). Derecha: panel con los campos de la sección seleccionada. El "arrastrar" es para reordenar fotos.
3. **Guardado = solo automático** (autosave con debounce) + botón "Publicar cambios".

## Arquitectura

Reutiliza el motor existente. "Content is data": el editor MUTA el `LandingDocument` (los campos de override de cada bloque + índices de foto + inclusión de bloques opcionales), todo validado con Zod antes de guardar.

### Draft vs publicado (seguridad)

- **Migración (aditiva):** `ALTER TABLE property_landings ADD COLUMN draft_content jsonb;`
- El editor edita **`draft_content`** (inicializado desde `content` la primera vez). La **vista previa** del editor lee `draft_content`.
- **La página pública `/p/[slug]` sigue leyendo `content` (publicado)** → editar NUNCA afecta lo que está en vivo hasta publicar.
- **"Publicar cambios"** → `content = draft_content`, `status='published'` (reusa/extiende `publishLanding`).
- Así el asesor edita tranquilo; lo live solo cambia al publicar. (Sin la migración habría que escribir sobre `content` y los estados intermedios saldrían en vivo — se evita.)

### Componentes

- **Ruta** `app/(dashboard)/properties/[id]/landing/edit/page.tsx` (pantalla completa; server: carga property + landing + `draft_content ?? content`; gatea `status==='approved'` + `!isAbogado`; si no hay landing, redirige a crearla).
- **`components/landing/editor/LandingEditor.tsx`** (client) — shell de 2 paneles. Tiene el estado del documento (draft), el `selectedBlockId`, el autosave y el estado "Guardado/Guardando". Header con "Volver", indicador de guardado, y "Publicar cambios".
- **`components/landing/editor/EditorPreview.tsx`** (client) — renderiza el documento con `LandingRenderer` (envuelto para que cada bloque sea **seleccionable**: click → `onSelect(blockId)`, con un contorno de selección). La preview es de solo-lectura; la edición ocurre en el panel. En mobile: la preview arriba y el panel abajo (o tabs).
- **`components/landing/editor/panels/*`** — un panel por tipo de bloque editable: `HeroPanel`, `StoryBlocksPanel`, `CuratedGalleryPanel`, `LocationPanel`, `ClosingPanel`. Cada uno recibe el bloque + `onChange(patch)` + la propiedad (para el PhotoPicker). Un `StatsPanel`/`FooterPanel` informativos (no editables, leen la propiedad).
- **`components/landing/editor/PhotoPicker.tsx`** (client, `@dnd-kit`) — elige/reordena fotos de `property.photos` por índice (para portada del hero, foto de cada story, e índices de la galería). Muestra miniaturas; drag para reordenar (galería) o click para elegir (portada/story).
- **`components/landing/editor/SectionToggles.tsx`** — interruptores para mostrar/ocultar secciones opcionales (galería, planos, un bloque de historia). Toggle = agrega/quita ESE bloque del documento (del catálogo curado, nunca uno arbitrario).
- **`components/landing/editor/useAutosave.ts`** — hook: debounce (~800ms) → `PATCH /api/properties/[id]/landing` con `{ draftContent: draftDoc }` (campo NUEVO en el body, distinto de `content` para no tocar el flujo del asistente E1.4); valida Zod antes; expone `status: 'idle'|'saving'|'saved'|'error'`.

### Mutaciones (qué toca cada edición)

- **Texto** → cambia el campo del bloque: hero `{titleOverride, subtitle, offerLabel, ctaLabel}`; story_blocks `items[i].{eyebrow, headline, body}`; location_showcase `{title, body}`; closing_invite `{eyebrow, headline, body, ctaLabel}`.
- **Fotos** → hero `heroPhotoIndex` / `mediaMode`; story `items[i].photoIndex`; curated_gallery `photoIndices` (orden + selección).
- **Toggles** → agrega/quita el bloque opcional del array `blocks` (posición fija según el orden curado del template; un helper `insertBlockInCuratedOrder` mantiene el orden correcto).
- **Cada cambio** produce un documento que se valida con `LandingDocument` (Zod) ANTES de guardar; si no valida, no se guarda y se avisa (no debería pasar con las mutaciones acotadas).

### API / servicio

- Extender `updateLanding` (`lib/landing/landing-service.ts`) para escribir `draft_content` (nuevo campo del patch) además del `content` existente.
- Extender `publishLanding` para copiar `draft_content → content` al publicar (si hay draft).
- La ruta `PATCH /api/properties/[id]/landing` ya existe; agregar el manejo de `draftContent`.
- `getLanding` devuelve `draft_content`; la preview usa `draft_content ?? content`.

## Robustez / verificación

- **No romper el diseño:** el editor solo expone campos de contenido + toggles del catálogo curado. No hay reordenar secciones ni bloques libres → la estructura de lujo se mantiene.
- **Zod en cada save** → nunca se guarda un documento inválido.
- **Edita el draft** → lo publicado no cambia hasta "Publicar cambios".
- **Limitación conocida (honesta):** el editor es interactivo (drag/click/autosave en vivo) → NO se puede verificar headless (Turbopack roto local por la tilde). Se verifica: `tsc` 0 + `renderToStaticMarkup` (que el shell, la preview y los panels rendericen + que las mutaciones produzcan documentos Zod-válidos) + review adversarial (workflow) + WebFetch. El **drag/click/autosave real lo prueba el usuario en el navegador** y se ajusta con su feedback.

## Gate de migración/deploy

- La migración `draft_content` debe correrse en el Dashboard de Supabase ANTES de deployar el código que la usa (sino el PATCH del editor falla).

## No-goals (fuera de alcance v1)

- Reordenar secciones / page-builder libre / agregar bloques arbitrarios (rompería la garantía de calidad).
- Undo/redo (el modelo draft + "Publicar cambios" ya hace el riesgo bajo: lo live no cambia hasta publicar; se puede re-editar siempre).
- Editar la estructura del avatar / regenerar copy con IA desde el editor (eso vive en el asistente E1.4).

## Plan por fases (sketch — lo detalla writing-plans)

1. **Cimientos:** migración `draft_content` + `updateLanding`/`publishLanding`/`getLanding` + ruta editor + shell `LandingEditor` (2 paneles) + `EditorPreview` con selección + autosave a draft. (Editar aún vacío.)
2. **Panels de texto:** HeroPanel + StoryBlocksPanel + LocationPanel + ClosingPanel (editar todos los textos) + botón "Publicar cambios".
3. **Fotos + toggles:** PhotoPicker (@dnd-kit) para portada/story/galería + SectionToggles.
4. **Pulido + review adversarial + deploy + prueba del usuario.**

## Verificación (por tarea)

`tsc` 0 + `renderToStaticMarkup` (shell/preview/panels rinden, sin `opacity:0` mal) + mutaciones → doc Zod-válido + review adversarial (workflow) + WebFetch + OK del usuario en navegador.
