# Publicación en Argenprop — Wizard de publicación vía API (diseño)

**Fecha:** 2026-06-08
**Estado:** Aprobado (diseño) — pendiente de plan de implementación
**Autor:** Claude + Julián

## 1. Objetivo

Replicar el sistema de publicación de propiedades que ya existe para **MercadoLibre** (wizard de 6 pasos, pantalla de campos prellenados, publish/baja desde nuestra plataforma) para el portal **Argenprop / Clarín Clasificados**, integrando vía su API real (`PublicarIntranet`).

Requisitos del usuario:

1. **Misma estructura/UX que MercadoLibre**, adaptada a Argenprop (mismos pasos step-by-step).
2. **Pantalla de campos prellenados**: en el paso de campos, mostrar **todos los datos que pide Argenprop** y aparecer **prellenados** con todo lo que ya tenemos de la propiedad, para que el asesor complete lo que falte y mejore la calidad de la publicación (los portales priorizan por calidad de la publicación).
3. **Publicar y poder ver el aviso** en Argenprop desde nuestra plataforma (link al aviso).
4. **Dar de baja rápido** desde nuestra plataforma (estamos en fase de pruebas: publicar → verificar → dar de baja).
5. Al terminar, un **agente QA** prueba todo el proceso con la propiedad de prueba `[TEST]` (publicar real → verificar → dar de baja) y avisa.

## 2. Contexto y hallazgos clave

### 2.1 La abstracción de portales es genérica y reutilizable

`lib/portals/` ya tiene una abstracción multi-portal sólida que NO requiere refactor:

- `types.ts` — `PortalAdapter` interface, `PortalName = 'mercadolibre' | 'argenprop' | 'zonaprop'`, `PublishResult`, `ValidationResult`, `PortalAdapterError`.
- `registry.ts` / `index.ts` — registro e init de los 3 adapters (Argenprop ya está registrado).
- `credentials.ts` — resolución de credenciales por env + DB (`portal_credentials`).
- `validation.ts`, `audit.ts`, `backoff.ts`, `worker.ts`, `worker-logic.ts` — lógica compartida.
- Tablas: `property_listings` (columna `portal` text como discriminador, `status`, `external_id`, `external_url`, `metadata` jsonb, `next_attempt_at`, `last_error`), `portal_property_map` (bridge a consultas), `property_publish_events` (auditoría), `portal_credentials`. Todas ya soportan `argenprop`.

### 2.2 El scaffold Argenprop actual es un STUB FANTASMA (a reescribir)

`lib/portals/argenprop/{adapter,client,mapping}.ts` fue construido contra una **API REST imaginada** que **no existe**:

- `client.ts` pega a `https://api.argenprop.com/v1` con headers `x-api-key`/`x-client-code` y body JSON. ❌
- `adapter.ts` usa endpoints REST ficticios `POST /ads`, `PUT /ads/{id}`, `PUT /ads/{id}/status`. ❌
- `mapping.ts` produce un JSON limpio con nombres de campo inventados. ❌
- `credentials.ts` mapea `ARGENPROP_API_KEY` / `ARGENPROP_CLIENT_CODE`. ❌

**Todo eso se reescribe** contra el contrato real (ver §3). La abstracción genérica se conserva.

### 2.3 El contrato real: Clarín `PublicarIntranet`

Credenciales productivas reales (van a `.env.local`, gitignored; solo los NOMBRES a `.env.example`):

```
ARGENPROP_PUBLISH_URL = http://www.inmuebles.clarin.com/Publicaciones/PublicarIntranet?contentType=json
ARGENPROP_USR         = dferreyrainmob@api.com
ARGENPROP_PSD         = t638i632
ARGENPROP_ID_SISTEMA  = 10
ARGENPROP_ID_VENDEDOR = 281022
ARGENPROP_ID_ORIGEN   = 60U6_
ARGENPROP_USER_AGENT  = diego-ferreyra-crm
```

Contrato reconstruido (spec oficial v4.0 2013, **no provisto** — se confirma empíricamente en QA):

- **Transporte:** a pesar de `?contentType=json` (que controla el formato de **respuesta**), el body es **`application/x-www-form-urlencoded`**, con colecciones aplanadas en claves indexadas: `imagenes[0].url`, `imagenes[1].url`, etc.
- **Auth:** credenciales por request en el body (`usr`, `psd`) + identidad del vendedor (`aviso.Vendedor.SistemaOrigen.Id` = IdSistema, `aviso.Vendedor.IdOrigen` = IdVendedor). User-Agent custom obligatorio (gate de acceso).
- **Upsert por la clave de aviso que generamos nosotros:** re-POST con la misma clave de aviso actualiza el aviso (idempotencia). **OJO terminología:** hay DOS "IdOrigen" distintos:
  - `ARGENPROP_ID_ORIGEN = 60U6_` → valor **fijo a nivel cuenta/vendedor** que da Argenprop (identifica nuestro sistema/origen como vendedor). Va en cada request como dato del vendedor.
  - **`aviso.IdOrigen` (per-aviso)** → la clave de idempotencia **que generamos nosotros por propiedad** (ver §3.7). Esta es la que se reusa para update/baja.
  - *Cuál campo exacto recibe `60U6_` vs. la clave per-aviso se confirma en el `probe` — es un punto de incertidumbre del contrato.*
- **Baja:** re-POST con `aviso.Estado = Baja` (no hay endpoint separado en v4.0). Esta es la ruta de teardown rápido.
- **TipoPropiedad:** tabla de códigos 1–14 (1=Departamento, 3=Casa, 8=Terreno, 6=Local, 9=Oficina, etc.).
- **Tablas de referencia** (TipoOperación, Moneda, barrios/calles) son **estáticas** (no hay endpoint de tablas en vivo como ML).
- **Fotos:** por **URL** (el portal las descarga), como ML. Las URLs públicas de Supabase Storage sirven.
- **Respuesta OK:** colección JSON de ids de visibilidad creadas. **Envelope de error:** no confirmado (se descubre en QA).

### 2.4 Diferencia arquitectónica vs. ML

ML tiene `GET /categories/{id}/attributes` (endpoint dinámico) que alimenta la pantalla de campos. **Argenprop NO** — su set de campos y tablas son estáticos. Por eso la pantalla de prellenado de Argenprop se alimenta de un **catálogo estático en TS** (`field-schema.ts`), no de un fetch en vivo.

## 3. Arquitectura

### 3.1 Principio de dos capas (por la incertidumbre del contrato)

Como no tenemos el spec oficial, todo lo incierto se aísla para corregirlo en **un solo lugar** tras el `probe` de QA:

- **Capa "wire"** (`client.ts` + armado del form en `mapping.ts`): nombres exactos de campos, aplanado `x-www-form-urlencoded` con claves indexadas, códigos de TipoOperación/Moneda, envelope de error, `Estado=Baja`.
- **Capa "schema"** (`field-schema.ts`): catálogo de campos que ve el asesor (UI). Independiente del transporte.

### 3.2 Ejecución del publish: SÍNCRONA en la route (espejo de ML)

- `POST /ap-publish` llama a `adapter.publish` **directo** y escribe `status='published'`. Argenprop devuelve los ids de visibilidad al instante (no hay estado `not_yet_active` como ML), así que no se necesita worker.
- Argenprop **queda fuera del worker pg_cron**. El worker no auto-publica Argenprop (requisito: wizard-driven manual).

### 3.3 Layout de módulos (espejo de `lib/portals/mercadolibre/`)

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/portals/argenprop/client.ts` | **reescribir** | `apPublish(form: Record<string,string>)`: POST form-urlencoded a `ARGENPROP_PUBLISH_URL`, User-Agent custom, parseo de respuesta JSON (visibilidades / error). Manejo de `PortalAdapterError`. |
| `lib/portals/argenprop/mapping.ts` | **reescribir** | `propertyToApForm(property, opts)` → `Record<string,string>` con claves planas/indexadas reales + códigos. `ApFormOptions { attributeOverrides, idOrigen, estado? }`. Helper de aplanado de colecciones (`imagenes[i].url`). |
| `lib/portals/argenprop/field-schema.ts` | **nuevo** | Catálogo estático: `TIPO_PROPIEDAD` (1–14), `TIPO_OPERACION`, `MONEDA`, lista de campos `ApField[]` (required/recommended, tipo, opciones) + `derivedPrefill(property): Record<string, AttrOverride>`. |
| `lib/portals/argenprop/adapter.ts` | **reescribir** | `publish` (arma form → `apPublish` → `{externalId: idOrigen, externalUrl, metadata:{visibilidadIds}}`), `update` (re-POST mismo IdOrigen), `unpublish` (re-POST `Estado=Baja`), `validate` (via `validateCommon`). |
| `lib/portals/credentials.ts` | **editar** | `ENV_MAP['argenprop']` al modelo real (usr/psd/idSistema/idVendedor/idOrigen/publishUrl/userAgent). Extender `ResolvedCredentials`. `enabled` = usr+psd+publishUrl presentes. |

### 3.4 Routes (espejo de `ml-*`) bajo `app/api/properties/[id]/`

| Route | Métodos | Responsabilidad |
|---|---|---|
| `ap-attributes` | GET | Devuelve el schema estático + `derivedPrefill(property)` + overrides guardados en `metadata`. **(Pantalla de campos prellenados — requisito central.)** |
| `ap-preview` | GET, PATCH | GET: payload de preview + validación. PATCH: guarda el draft en `property_listings(portal='argenprop')` con **status `'draft'`** (no `'pending'`, para no disparar el worker). |
| `ap-publish` | POST, PATCH | POST: publish síncrono → escribe status/external_id(=IdOrigen)/external_url/metadata, llama `syncPortalPropertyMap('argenprop')`, audita en `property_publish_events`. PATCH `{action:'baja'\|'republish'}`: baja (`Estado=Baja`) / re-publish. |

Auth idéntica a ML: `requireAuth()` + `authorize(id, userId, role)`; asesor debe ser `assigned_to`; **abogado denegado**.

### 3.5 Wizard UI (espejo `components/properties/wizards/ml/` → `wizards/ap/`)

Mismos 6 pasos:

- `ArgenpropWizard.tsx` — shell + stepper + `ManageListingPanel` (cuando ya está publicado).
- `steps/StepImages.tsx` (fotos: portada + orden), `StepMedia.tsx` (video / tour), `StepFields.tsx` (**campos prellenados** + geo pin), `StepDescription.tsx` (reusa `generatePortalDescription`), `StepReview.tsx`, `StepConfirm.tsx`.
- `useApPublishDraft.ts` (carga GET `/ap-preview` + GET `/ap-attributes`, PATCH para guardar draft), `types.ts`.
- Página `app/(dashboard)/properties/[id]/marketing/argenprop/page.tsx` (auth, decide wizard vs panel de gestión).
- **Entry point:** botón "Publicar en Argenprop" junto al de ML en el detalle de propiedad / sección marketing.

### 3.6 Baja desde nuestra plataforma (requisito de pruebas)

`ManageListingPanel` muestra:
- **"Ver en Argenprop"** → `external_url`.
- **"Dar de baja"** → PATCH `/ap-publish {action:'baja'}` → `adapter.unpublish` → re-POST `Estado=Baja`. Teardown en un clic.

### 3.7 Identidad / idempotencia (`IdOrigen`)

Nosotros somos dueños de la clave. **Default:** entero estable por propiedad desde una **secuencia Postgres**, asignado en el primer publish, guardado en `property_listings.external_id` y reusado para update/baja. Los ids de visibilidad de Argenprop van a `metadata.visibilidad_ids`. *(int vs string se confirma en el `probe`.)*

### 3.8 Seguridad del worker / auto-encolado

- Argenprop **no** pasa por el worker (publish síncrono en la route).
- **Verificar el trigger de auto-encolado** (el que crea filas `property_listings status='pending'` para las 3 portales al aprobar una propiedad) y **ajustarlo para excluir `argenprop`** (o confirmar que el flujo actual de ML ya lo neutraliza con `status='draft'`), de modo que el worker no auto-publique Argenprop durante las pruebas.
- `buildPublishOpts` del worker sigue ML-only (no-op para argenprop).

## 4. QA de descubrimiento de contrato

Como no hay spec oficial, el QA **descubre y valida el contrato real**.

`scripts/qa-publish-argenprop-test.ts` (espejo del de ML), subcomandos:

- `recon [propertyId]` — read-only: estado de la propiedad, listing, credenciales presentes, schema estático.
- `probe` — request mínimo real a `PublicarIntranet` para aprender nombres de campos / códigos / envelope de error / forma de respuesta. **Sin tocar producción más de lo necesario** (publica un aviso mínimo y lo da de baja inmediatamente, o usa la propiedad `[TEST]`).
- `publish <propertyId>` — guard: el título debe empezar con `[TEST`. Publica con prellenado + overrides.
- `verify <propertyId>` — confirma que el aviso esté visible (external_url alcanzable / respuesta de visibilidades).
- `baja <propertyId>` / `teardown` — re-POST `Estado=Baja` (guard `[TEST`).
- `force-baja <idOrigen>` — baja por IdOrigen directo (sin guard), para limpieza.

Correr con `node --env-file=.env.local --import tsx` (mismo patrón que el QA de ML).

**Flujo del agente QA:** escribe creds a `.env.local` → `recon` → `probe` (ajusta `field-schema`/`mapping`/`client` según lo que devuelva el endpoint real) → `publish` la `[TEST]` → `verify` → `baja` → reporta resultado y diffs aplicados.

## 5. Tests

- Unit: `mapping.test.ts` (aplanado de claves del form, mapeo de códigos TipoPropiedad/Operación/Moneda, `derivedPrefill`), `field-schema` (required vs recommended).
- Validación: espejo de `validation.test.ts`.

## 6. Migración DB

Probablemente **mínima**:
- Secuencia Postgres para `IdOrigen` (ej. `argenprop_id_origen_seq`).
- Ajuste del trigger de auto-encolado para excluir `argenprop` (si aplica tras verificar el estado actual).
- *(Las tablas existentes ya soportan `argenprop`.)*

El usuario corre el SQL en el Dashboard (Supabase CLI no conecta).

## 7. Decisiones cerradas

- Publish síncrono en la route; Argenprop fuera del worker. ✅
- Schema estático (no hay endpoint de atributos en vivo). ✅
- Baja vía `Estado=Baja` (upsert por IdOrigen). ✅
- Credenciales reales a `.env.local`; nombres a `.env.example`. ✅
- QA hace publish + baja real contra producción con la propiedad `[TEST]`. ✅
- Argenprop solo por wizard (manual) durante pruebas. ✅

## 8. Sub-decisiones con default (a confirmar en `probe`)

1. `IdOrigen` = entero desde secuencia Postgres (vs string). **Default: entero.**
2. Tier / "destacado" (visibilidades): publicar en nivel estándar; selector de tier se difiere. **Default: estándar.**
3. Migración: mínima (secuencia + trigger). Se confirma al implementar.

## 9. Riesgos

- **Contrato no documentado:** nombres exactos de campos, códigos y envelope de error se descubren en QA. Mitigado por el diseño de dos capas (wire aislado).
- **Publica un aviso real** en producción durante el QA (visible unos minutos antes de la baja). Aceptado por el usuario.
- **Transporte form-urlencoded con claves indexadas:** encoding cuidadoso de claves/valores para evitar 500/BadFormData.
- **Auto-encolado:** asegurar que el worker no auto-publique Argenprop (verificar trigger).
