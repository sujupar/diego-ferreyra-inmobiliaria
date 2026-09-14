# Plan — Datos de difusión en la visita + publicación en portales

Spec: `docs/superpowers/specs/2026-09-14-datos-difusion-en-visita-y-publicacion-portales-design.md`.
Rama: `feat/datos-portales-y-publicacion` (worktree `/private/tmp/claude-501/wt-datos-portales`).
Orden: primero lo que desbloquea a la asistente HOY (fotos y errores), después la visita.

## Tarea 1 — Fotos incrustadas: módulo puro + materialización + defensa en portales
- `lib/properties/fotos-incrustadas.ts` (+ `.test.ts`): `esFotoIncrustada(url)`, `parsearDataUrl(url)`
  → `{ mime, extension, bytes } | null` (solo `image/jpeg|png|webp`; base64 inválido → null),
  `separarFotos(photos)` → índices de incrustadas y de enlaces válidos.
- `lib/portals/fotos-publicables.ts` (+ `.test.ts`): `fotosPublicables(photos)` →
  `{ validas: string[], descartadas: { indice, motivo }[] }` (solo `https://`, host no vacío,
  largo < 2000). Motivos: "imagen incrustada", "enlace no seguro (http)", "no es un enlace".
- Consumidores (grep `photos ?? []`): `lib/portals/mercadolibre/mapping.ts` (`pictures`),
  `lib/portals/argenprop/mapping.ts` (`Multimedia`), `lib/portals/validation.ts` (error si no
  queda ninguna válida; warning con las descartadas).
- `lib/properties/materializar-fotos.ts` (servidor): `materializarFotosIncrustadas(propertyId, photos, storage)`
  sube cada `data:` a `properties/{id}/photos/{uuid}.{ext}` y devuelve el array con URLs en el
  mismo orden; una que falla se descarta con `console.error`. Test con storage falso.
- `app/api/properties/route.ts` POST: quitar `data:` del INSERT, materializar después del
  insert (`updateProperty`), y recién ahí `checkAndAdvanceProperty`.
- `scripts/reparar-fotos-incrustadas.ts` (`--commit` para escribir; sin flag = informe).
- Prueba: unit (vitest) + script contra la base real en modo informe.

## Tarea 2 — Errores legibles
- `lib/portals/errores-legibles.ts` (+ `.test.ts`): `explicarErrorHttp`, `explicarErrorArgenprop`,
  `recortarDetalle`, `ocultarImagenesIncrustadas`.
- `lib/portals/mercadolibre/client.ts`: 413 y cuerpos HTML → `explicarErrorHttp`; `original`
  recortado. Test en `errores.test.ts`.
- `lib/portals/argenprop/client.ts`: `PortalAdapterError(legible, …, original)`; nuevo
  `lib/portals/argenprop/errores.test.ts`.
- `app/api/properties/[id]/ap-publish/route.ts`: `mensajeYDetalle` (POST y PATCH).
- UI: `ManageListingPanel` ML/AP → `soloElMensaje`; `PostCaptureActions` y `PortalListingsCard`
  → `break-words line-clamp-4`.

## Tarea 3 — Título prellenado y no pisar con vacío
- Exportar `tituloSugerido` desde `lib/portals/mercadolibre/mapping.ts` (= `buildTitle`) y
  `tituloSugeridoAp` desde AP mapping; usarlos en `useMlPublishDraft`/`useApPublishDraft`.
- `ml-preview`/`ap-preview` PATCH: `title` solo si `trim()` no vacío.
- Test: `publish-draft.test.tsx` ya cubre el hook; agregar caso "título vacío → sugerido".

## Tarea 4 — Stepper clickeable
- `lib/portals/wizard-etapas.ts` (+ `.test.ts`): `puedeSaltarA({ destino, actual, maxAlcanzada, actualValida })`.
- `components/properties/wizards/StepperPills.tsx` compartido (botones, `aria-current`,
  `disabled` para no alcanzadas). Reemplaza el bloque duplicado en los dos wizards; `maxIdx`
  como estado; `saltarA` guarda el borrador (`save()`) antes de moverse.
- Test `wizard-next.test.tsx` existente sigue verde; nuevo `stepper.test.tsx` (happy-dom).

## Tarea 5 — Migración + tipos
- `supabase/migrations/20260914000001_property_difusion_data.sql`: `portal_data`,
  `landing_answers` (jsonb NOT NULL DEFAULT '{}'). Aplicar con `scripts/apply-difusion-data-pg.ts`
  (patrón `apply-*-pg.ts`) y verificar con `select`.
- `types/database.types.ts`: Row/Insert/Update de `properties`.
- `types/visit-data.types.ts`: `VisitPortalesData`, `VisitLandingData`, claves en `VisitDataSnapshot`.

## Tarea 6 — Módulo puro de datos de visita → portales
- `lib/portals/datos-visita.ts` (+ `.test.ts`):
  - `atributosMlDerivadosDeVisita(sale)` / `atributosApDerivadosDeVisita(sale)`.
  - `camposPendientesDeVisita({ ml, ap })` → `{ ml: { checklist, otros }, ap: [...] }` sin los
    derivables ni los ocultos (`CONTACT_SCHEDULE`, `PROPERTY_CODE`, `AVAILABLE`, `APARTMENT_NUMBER`,
    `HOUSE_NUMBER`, `TOWER_NUMBER` se piden igual? → NO: son datos administrativos, se dejan al wizard).
  - `armarDatosDifusionDesdeVisita(visitData)` → `{ expensas, portal_data, landing_answers }`.
- `lib/landing/questions-generator.ts`: `PREGUNTAS_FIJAS(barrio)`; `fallbackQuestions` las usa.

## Tarea 7 — Ruta de campos + formulario de visita
- `app/api/deals/[id]/campos-portales/route.ts` GET (auth, abogado 403).
- `components/properties/wizards/AttrField.tsx` extraído del StepFields de ML y reusado.
- `components/pipeline/VisitDataForm.tsx`: estado `portales`/`landing`, secciones 08 y 09,
  autosave por la misma vía, `handleFinalize` incluye las claves nuevas.
- `app/api/deals/[id]/visit-data/route.ts`: sanear `landing` (strings ≤1500) y `portales`
  (objetos `{value_id?|value_name?}` de strings). Test del saneador puro
  (`lib/supabase/visit-data-sanear.ts`).

## Tarea 8 — Captación y prefill
- `app/(dashboard)/properties/new/page.tsx`: leer `deal.visit_data` y mandar
  `expensas`, `portal_data`, `landing_answers` (vía `armarDatosDifusionDesdeVisita`).
- `app/api/properties/route.ts`: validar forma de `portal_data`/`landing_answers`.
- `lib/supabase/properties.ts` `PropertyInput`: `expensas`, `portal_data`, `landing_answers`.
- `ml-attributes` / `ap-attributes`: merge con `portal_data`.

## Tarea 9 — Landing automática + botón de la tarjeta
- `lib/landing/enrich.ts`: `etapaTrasAvatares(ws)`; `enrichLabel` en autopilot.
- `landing-service.ts`: `startCoCreation` siembra preguntas fijas + respuestas + `autopilot`;
  etapa `avatars` con respuestas y salto a `copy`.
- `LandingSection.tsx`: prop `autoStartToken`; tras `runEnrichment` en autopilot → `publish()`.
- `PostCaptureActions.tsx`: prop `onCrearLanding`; `MarketingTab.tsx` los conecta.
- Tests: `enrich.test.ts` (nuevos casos), `LandingSection.test.tsx` (autopilot publica solo).

## Tarea 10 — QA y despliegue
- Revisión adversarial (`/code-review`), push, PR, vista previa.
- QA navegador: visita `[TEST` → captar → wizards → publicar ML y AP de verdad → verify →
  baja/eliminar → borrar propiedad de prueba. Landing automática con video.
- Migración aplicada ANTES del merge. Script de reparación en producción. Humo en prod.
