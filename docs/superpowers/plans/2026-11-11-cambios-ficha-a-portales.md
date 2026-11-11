# Cambios de la ficha → avisos publicados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** al cambiar tipo, operación, precio o moneda en la ficha de una propiedad publicada, la plataforma pregunta en qué portales aplicarlo, lo ejecuta (actualizar en el lugar, o eliminar+republicar en Argenprop si cambia el tipo) y muestra el resultado; si un aviso ya no coincide con la ficha, la ficha lo avisa.

**Architecture:** un módulo puro calcula diferencias ficha↔aviso vivo por portal y la acción; módulos puros arman el cuerpo del cambio para cada portal; dos rutas (diferencias / sincronizar un portal); un componente de cuadro reutilizado por la ficha (tras guardar) y por una franja de aviso. El precio deja de viajar solo (migración del trigger).

**Tech Stack:** Next.js 16 route handlers, TypeScript estricto, Zod, Supabase service role, vitest acotado, APIs ML `/items` y Argenprop `/v1/avisos`.

**Spec:** `docs/superpowers/specs/2026-11-11-cambios-ficha-a-portales-design.md` (leer §2 y §6: comportamiento medido de cada portal). Reporte de sondas: `.superpowers/sondas-report.md`.

## Global Constraints
- Worktree `/private/tmp/claude-501/wt-cambios-ficha-portales`, rama `feat/cambios-ficha-portales`, `node_modules` enlazado. Env: `ENVF="/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria/.env.local"`.
- Tests: `npx vitest run --config vitest.cambios-ficha.config.ts` (crear en Tarea 1, include acotado a los archivos de este plan + `lib/portals/**/*.test.ts`). Nunca la config raíz. Tipos: `npx tsc --noEmit -p tsconfig.cambios-ficha.json` (extiende el raíz, include acotado; anotar en el reporte errores PREEXISTENTES sin arreglarlos).
- TypeScript estricto: sin `any`, sin `as` para callar errores, `!` solo con comentario. Nombres de negocio en castellano. Comentarios que explican el POR QUÉ.
- Toda ruta nueva: `requireAuth()` + abogado 403 + `puedeDifundir(id, user.id, role, 'difundir', property)`; `requireAuth` FUERA del try (si no, su redirect se vuelve 502).
- Errores al usuario en castellano vía `mensajeYDetalle(err).mensaje`; el detalle crudo solo a `last_error`/auditoría.
- Reusar lo existente: `MercadoLibreAdapter.leerAviso/enviarEdicion`, `ArgenpropAdapter.leerAviso/enviarAviso/setEstado/idAnunciante`, `armarActualizacionMl`, `armarAvisoActualizado`, `numeroArgentino`, `getRawAttributes`, `resolveCategory`, `apCategoria`, `apCodigo`, `fotosPublicables`, `writeAudit`.
- Precio y moneda de ML viajan SIEMPRE juntos (`price` + `currency_id`).
- Commits en castellano, autor `git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit`, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; agregar archivos de a uno (nunca `git add -A`; `scripts/_sonda-*.ts` quedan sin commitear); `git push` al cerrar cada tarea.
- Portales reales: solo propiedades `[TEST`. Nunca tocar avisos reales en pruebas.
- **Despliegue:** código primero, migración del trigger enseguida.

## Review Focus
1. Argenprop eliminado y no republicado (falla entre `eliminado` y `POST`) → reintento único; si sigue, listing `failed` + mensaje claro; nunca "Listo". Test en Tarea 4.
2. ML cambio de categoría que la categoría nueva no acepta → aviso intacto, motivo en castellano y plan B ofrecido; plan B publica primero y cierra el viejo solo si publicó. Tests en Tarea 3.
3. Precio en formato argentino / moneda cambiada sola → ML siempre `price`+`currency_id`. Test en Tarea 3.
4. Operación a alquiler en Argenprop con AptoCredito=true → se manda false. Test en Tarea 4.
5. Portal que no responde en `diferencias` → ese portal vuelve con error y el otro funciona. Test en Tarea 5.

---

### Task 1: Diferencias ficha ↔ aviso (módulo puro) + configs

**Files:** Create `vitest.cambios-ficha.config.ts`, `tsconfig.cambios-ficha.json`, `lib/portals/diferencias-con-ficha.ts`, `lib/portals/diferencias-con-ficha.test.ts`.

**Interfaces — Produces:**
```ts
export type PortalSincronizable = 'mercadolibre' | 'argenprop'
export type CampoSincronizable = 'tipo' | 'operacion' | 'precio'
export interface FichaComercial { property_type: string | null; operation_type: string | null; asking_price: number; currency: string | null }
export interface EstadoMl { category_id: string; price: number; currency_id: string }
export interface EstadoAp { tipo: string; subtipo?: string | null; operacion: string; monto: number; moneda: string }
export interface Diferencia { campo: CampoSincronizable; antes: string; despues: string }   // textos legibles ("Departamento", "USD 79.000")
export interface DiferenciasPortal { portal: PortalSincronizable; diferencias: Diferencia[]; accion: 'actualizar' | 'republicar' | 'nada' }
export function diferenciasMl(ficha: FichaComercial, aviso: EstadoMl): DiferenciasPortal
export function diferenciasAp(ficha: FichaComercial, aviso: EstadoAp): DiferenciasPortal
```
Reglas: ML → tipo/operación distintos cuando `resolveCategory(ficha) !== aviso.category_id` (para separar tipo de operación, comparar contra el mapa `todasLasCategorias()` de `mercadolibre/mapping.ts`: buscar `{operacion,tipo}` de la categoría viva; si la categoría viva no está en el mapa → informar `tipo` con `antes: 'Otra categoría'`). Precio distinto si `Math.round(asking_price) !== Math.round(price)` o moneda distinta. Acción ML: `'actualizar'` siempre que haya diferencias (el cambio de categoría también es en el lugar). Argenprop → tipo distinto si `apCategoria(ficha).tipo !== aviso.tipo` (comparación sin mayúsculas; `subtipo` vacío = sin subtipo) → acción `'republicar'`; operación (`VENTA`/`ALQUILER`/`ALQUILER_TEMPORAL` vs `operation_type` venta/alquiler/temporario) y precio/moneda → `'actualizar'`. Sin diferencias → `'nada'`. Etiquetas legibles: `PROPERTY_TYPE_LABELS` de `lib/properties/property-type.ts` para tipos, "Venta/Alquiler/Alquiler temporario" para operación, `formatMoney` de `lib/properties/detail-view.ts` para precio.

- [ ] TDD: tests para: igual → `nada`; depto→casa en ML (MLA401686 vivo, ficha casa venta) → `[tipo]` acción actualizar; venta→alquiler en ML → `[operacion]`; precio 79000→75000 → `[precio]` con "USD 79.000"→"USD 75.000"; moneda USD→ARS → `[precio]`; AP DEPARTAMENTO vivo con ficha casa → `republicar`; AP VENTA vivo con ficha alquiler → `actualizar`; AP solo precio → `actualizar`; AP `subtipo:''` sin falsa diferencia; PH (AP DEPARTAMENTO+PH) con ficha ph → `nada`.
- [ ] Implementar, verde, tsc, commit+push.

### Task 2: Migración — el precio deja de viajar solo

**Files:** Create `supabase/migrations/20261111000001_requeue_sin_precio.sql`, `scripts/apply-requeue-sin-precio-pg.ts`. (Mirar el directorio antes: el prefijo debe estar libre.)

- [ ] SQL: `CREATE OR REPLACE FUNCTION public.requeue_listings_on_update()` copiando EXACTO el cuerpo de `20260930000001_requeue_solo_cambios.sql` pero sin la línea de `asking_price` (solo `photos` y `expensas`); comentario de cabecera: por qué (el dueño pidió que el precio se confirme con el cuadro), aplicar DESPUÉS del deploy.
- [ ] Script: copia de `scripts/apply-requeue-solo-cambios-pg.ts` adaptado: aplica, verifica con `pg_get_functiondef` que contiene `photos` y `expensas` y NO `asking_price`, y dentro de `BEGIN…ROLLBACK` sobre un listing publicado sin marcas (`cambios_ficha IS NULL` y `needs_update` no true): cambiar `asking_price` → NO aparece `needs_update`; cambiar `expensas` → `cambios_ficha=["expensas"]`. NO correrlo en esta tarea.
- [ ] Commit+push (sin aplicar).

### Task 3: ML — cambio de categoría/precio en el mismo aviso + plan B (módulos puros + adapter)

**Files:** Create `lib/portals/mercadolibre/cambio-categoria.ts` + test. Modify `lib/portals/mercadolibre/adapter.ts` (+ métodos).

**Interfaces — Produces:**
```ts
// cambio-categoria.ts (puro)
export function fijosDeCategoria(raw: readonly MlRawAttribute[]): { id: string; value_id: string; value_name: string }[]  // tags.fixed con values[0]
export function armarCambioDeCategoriaMl(item: MlItemVivo, rawNueva: readonly MlRawAttribute[], categoriaNueva: string, precio: { monto: number; moneda: string } | null): { body: Record<string, unknown> }
// body = { category_id, attributes: [atributos vivos escribibles que la categoría nueva acepta (no read_only, no fixed, presentes en rawNueva), + fijos de la nueva], price?, currency_id? }
export function armarCambioDePrecioMl(precio: { monto: number; moneda: string }): { price: number; currency_id: string }
// adapter.ts (MercadoLibreAdapter)
async cambiarEnElLugar(externalId: string, body: Record<string, unknown>): Promise<void>   // PUT /items/{id}
async publicarReemplazo(property: Property, opts: MlPayloadOptions): Promise<PublishResult>  // = publish() existente
async cerrar(externalId: string): Promise<void>   // = unpublish() existente
```
- [ ] TDD de `fijosDeCategoria` (toma solo `tags.fixed` con un valor), `armarCambioDeCategoriaMl` (depto→casa: manda `category_id: 'MLA401685'`, `PROPERTY_TYPE`=Casa de los fijos de la nueva, conserva `ROOMS/HAS_GARDEN/MAINTENANCE_FEE` vivos aceptados, descarta un atributo vivo que la nueva no tiene, no manda `OPERATION_SUBTYPE` si la nueva no lo tiene, nunca manda `HAS_LOWER_PRICE`; con precio → `price`+`currency_id` juntos), `armarCambioDePrecioMl` (redondeo; moneda en mayúsculas). Usar como fixture los atributos reales de `ml_category_attributes` (MLA401686/MLA401685/MLA1473) copiados a un JSON de test, o mínimos tipados.
- [ ] Adapter: `cambiarEnElLugar` (PUT), `publicarReemplazo` y `cerrar` delegando en lo existente. Verde, tsc, commit+push.

### Task 4: Argenprop — actualizar operación/precio y republicar por cambio de tipo

**Files:** Create `lib/portals/argenprop/cambio-categoria.ts` + test. Modify `lib/portals/argenprop/adapter.ts`.

**Interfaces — Produces:**
```ts
export function armarAvisoConOperacionYPrecio(aviso: ApAvisoVivo, cambios: { operacion?: string; monto?: number; moneda?: string }, schema: readonly ApField[], idAnunciante: number): Record<string, unknown>
  // usa armarAvisoActualizado para precio; pisa Precio.Operacion; si operacion !== 'VENTA' → AptoCredito=false (PUB003)
export function armarAvisoRepublicado(aviso: ApAvisoVivo, nueva: { tipo: string; subtipo?: string }, caracteristicasAceptadas: ReadonlySet<string>, fotosFicha: string[], idAnunciante: number): Record<string, unknown>
  // DTO completo para POST: Codigo igual, Categoria nueva, Caracteristicas filtradas a las aceptadas por la categoría nueva, Multimedia = fotos de la ficha (FOTO) + VIDEO/TOUR vivos, AptoCredito/AceptaPermuta/Contacto/Localizacion(Ids) conservados
// adapter.ts (ArgenpropAdapter)
async caracteristicasDeCategoria(tipo: string): Promise<Set<string>>  // GET /v1/catalogo/categorias/{tipo}/caracteristicas → ids (cache en memoria por proceso)
async republicar(codigo: string, dto: Record<string, unknown>): Promise<{ avisoId: number }>
  // setEstado(codigo,'eliminado') → POST /v1/avisos (reintento único) → devuelve Result (IdAviso). Si el POST falla dos veces: lanza PortalAdapterError con mensaje "El aviso de Argenprop se eliminó pero no se pudo volver a publicar. Publicalo desde el asistente de Argenprop." y el detalle crudo en original.
```
- [ ] TDD: operación VENTA→ALQUILER con AptoCredito true → DTO con `AptoCredito:false` y `Precio.Operacion:'ALQUILER'`; precio "75.000" → 75000; republicar depto→casa: `Categoria {Tipo:'CASA'}` sin Subtipo, descarta `DISPOSICION` y `APTO_PROFESIONAL` cuando no están en el set, Multimedia con fotos de la ficha y conserva un VIDEO vivo, mismo `Codigo`; `republicar` con un fetch simulado: eliminado OK + POST falla 2 veces → error con el mensaje claro; POST falla 1 vez y luego OK → devuelve el IdAviso.
- [ ] Verde, tsc, commit+push.

### Task 5: Rutas `diferencias` y `sincronizar`

**Files:** Create `app/api/properties/[id]/portales/diferencias/route.ts`, `app/api/properties/[id]/portales/sincronizar/route.ts`, `lib/portals/sincronizar-portal.ts` (+ test con dependencias inyectadas).

**Interfaces — Produces:**
- `GET .../portales/diferencias` → `{ portales: Array<DiferenciasPortal & { externalUrl: string | null; estado: string } | { portal: PortalSincronizable; error: string }> }` solo para listings `published`/`paused` con `external_id`. Lecturas en paralelo; un portal caído no tumba al otro.
- `POST .../portales/sincronizar` body Zod `{ portal: 'mercadolibre'|'argenprop', planB?: boolean }` → `{ ok: true, portal, accion, externalUrl, mensaje }` | `{ error, planBDisponible?: boolean }`.
- `lib/portals/sincronizar-portal.ts`: `sincronizarMl(deps, ...)` / `sincronizarAp(deps, ...)` con dependencias inyectadas (lectores, enviadores, supabase-escrituras) para testear sin red. Pasos ML: leer vivo → `diferenciasMl` → si tipo/operación: `armarCambioDeCategoriaMl` (con `getRawAttributes(nueva)`, precio si también difiere) → `cambiarEnElLugar`; si ML rechaza → `{ error: mensaje, planBDisponible: true }`. Si solo precio: `armarCambioDePrecioMl` → `cambiarEnElLugar`. `planB: true` → `publicarReemplazo` con las opciones del borrador (`ml_attributes` filtrados a los ids aceptados por la categoría nueva, `listing_type`, `media_choice`, como hace `ml-publish`), y SOLO si publicó → `cerrar(viejo)`, actualizar `property_listings` (external_id/url, `last_published_at`, `metadata.reemplaza_a`), `portal_property_map` (mover la lógica `syncPortalPropertyMap` de `ml-publish/route.ts` a `lib/portals/mapa-avisos.ts` y reusarla en ambas rutas). Pasos AP: leer vivo → `diferenciasAp` → `republicar` (tipo) con `caracteristicasDeCategoria(nueva)` y fotos `fotosPublicables(property.photos).validas` (si no hay fotos válidas: usar las FOTO vivas) → actualizar `property_listings` (`external_url` con `apPublicUrl`, `metadata.aviso_id`) + mapa de avisos; o `actualizar` (operación/precio) → `enviarAviso`. Auditar cada acción (`writeAudit`, actor, payload `{origen:'sincronizar', campos, accion}`), y `failed` con detalle si falla.
- [ ] TDD de `sincronizar-portal.ts` (orden del plan B: nunca cierra si publicar falla; AP failed tras dos POST fallidos deja `property_listings.status='failed'` y `last_error`; actualizar solo precio no toca categoría). Rutas finas. Verde, tsc, eslint, commit+push.

### Task 6: Cuadro "¿Actualizamos los avisos?" + ficha + franja

**Files:** Create `components/properties/portales/SincronizarPortalesDialog.tsx`, `components/properties/portales/AvisosDesincronizados.tsx`, `components/properties/portales/sincronizar-estado.ts` (+ test). Modify `components/properties/detail/PropertyDetailsEditor.tsx` (tras guardar con éxito `property_type`, `operation_type`, `asking_price` o `currency` → abrir el cuadro en modo "solo si hay diferencias") y la ficha (`components/properties/detail/tabs/OverviewTab.tsx`, arriba) para montar `AvisosDesincronizados`.

- Cuadro: carga `GET diferencias`; si ningún portal tiene diferencias → no se abre (modo ficha) o no se muestra (franja). Una fila por portal con diferencias: casilla marcada, "Tipo: Departamento → Casa", y el texto de qué pasa (ML: "Se actualiza el mismo aviso"; AP republicar: "Argenprop no deja cambiar el tipo de un aviso: lo vamos a eliminar y volver a publicar como Casa con las mismas fotos y datos. El aviso cambia de número (el link viejo deja de andar)."; precio: "Se actualiza el precio del aviso"). Botones "Actualizar avisos" / "Ahora no". Al confirmar: `POST sincronizar` por portal marcado, en serie, con estado por fila (Actualizando… → ✅ Listo + "Ver aviso" / ❌ motivo). Si la respuesta trae `planBDisponible`: botón "Publicar uno nuevo y cerrar el actual" con su propia confirmación en la fila ("El aviso nuevo empieza sin visitas ni preguntas") → `POST {planB:true}`. Al cerrar el cuadro, la ficha recarga (`onChanged`).
- Franja: "El aviso de Argenprop figura como Departamento y la ficha dice Casa" (una línea por portal/diferencia, la primera) + botón "Revisar" que abre el cuadro. 403/errores → no muestra nada.
- Lectura tolerante del JSON (504 HTML), mensajes en castellano, sin `confirm()`, `useCallback` para cargar, botón cómodo en celular.
- [ ] TDD de `sincronizar-estado.ts` (textos por acción/campo, qué filas mostrar). tsc, eslint, commit+push.

### Task 7: Revisión, PR, QA, despliegue
- [ ] Revisión final del branch (correctitud + seguridad) y arreglos.
- [ ] PR → vista previa → QA con agente sobre una propiedad `[TEST]` publicada en los dos portales: los 10 criterios del spec §7 (tipo depto→casa en los dos; precio; "Ahora no"; desmarcar un portal; franja; abogado 403), comparando el aviso vivo antes/después. Dar de baja todo lo de prueba al terminar.
- [ ] Merge → deploy en vivo → aplicar `scripts/apply-requeue-sin-precio-pg.ts` → verificar en producción que un cambio de precio en el `[TEST]` ya no viaja solo y que el cuadro lo aplica.
- [ ] CLAUDE.md (sección nueva) + memoria. Olmos 585 se corrige con la pantalla nueva SOLO con OK del dueño.
