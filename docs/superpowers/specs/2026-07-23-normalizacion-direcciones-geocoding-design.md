# Normalización de direcciones + geocoding con fallback + fixes de publicación y popup

**Fecha:** 2026-07-23
**Estado:** Diseño aprobado (brainstorm) — pendiente plan de implementación
**Autor:** Julian Parra + Claude

---

## 1. Contexto y problema

Las 25 propiedades **pre-captadas** que se importaron desde CSV (`scripts/import-precaptadas.ts`, 2026-06-25) están aprobadas/captadas pero **no se pueden publicar en MercadoLibre ni Argenprop** ni lanzar campañas Meta, porque el sistema no puede geolocalizar su dirección. Al intentar publicar aparece el error `GOOGLE_GEOCODING_API_KEY no configurada` y el gate `"Falta la ubicación. Tocá 'Geocodificar dirección' y confirmá el pin."`.

El problema tiene **tres capas apiladas** (no solo la normalización que se percibía a simple vista):

1. **El geocoder es solo Google y la key no está configurada.** `app/api/geocode/route.ts:12-13` devuelve `412` si falta `GOOGLE_GEOCODING_API_KEY`. No hay ningún fallback → bloqueo duro inmediato.
2. **Las 25 importadas tienen `latitude`/`longitude` en NULL.** `import-precaptadas.ts` nunca geocodificó (el objeto `record`, L204-239, no incluye lat/lng). Sin coordenadas, tres subsistemas se bloquean:
   - ML: `lib/portals/mercadolibre/mapping.ts:176-178` tira excepción; validación en 3 capas.
   - Argenprop: `lib/portals/validation.ts:15-17` marca error bloqueante.
   - Meta: `lib/marketing/targeting-rules.ts:76-78`, `geo-targeting-presets.ts:55-57` y `meta-campaign-builder.ts:331-333` tiran `"Property sin lat/lng"`.
3. **La dirección viene mal normalizada.** `properties.address` es un blob de texto libre (ej. `"José Luis Cantilo 4300, Villa Devoto, Capital Federal"`). El wizard además re-concatena barrio+ciudad a la query (`StepFields.tsx:98-100`), duplicando datos. La columna `city` guarda el **barrio** (no "Capital Federal"), y la señal `Zona/Provincia` del CSV (CABA vs GBA Norte/Sur) se descartó en el import.

Además hay un **callejón sin salida de UX**: `GeoPinMap` (el mapa para poner el pin a mano) **solo se renderiza si el geocoding ya devolvió lat/lng** (`StepFields.tsx:181-185`). Si el geocode falla, no hay forma de corregir dentro del wizard.

### Evidencia empírica (prueba en vivo con OSM/Nominatim, 2026-07-23)

- **CABA geocodifica perfecto** al edificio: `"José Luis Cantilo 4300, Villa Devoto, Ciudad Autónoma de Buenos Aires, Argentina"` → `-34.6042926, -58.5129293`. ✅
- **GBA es poco confiable con OSM y puede ubicar mal en silencio:**
  - `"Rivadavia 2537, San Andrés, Buenos Aires, Argentina"` → cayó en **San Andrés de Giles, a ~90 km** ❌ (falso match catastrófico por colisión de nombres de localidad).
  - `"Aleu 3500, General San Martín, Buenos Aires, Argentina"` → matcheó "Doctor Aleu **69**" (altura equivocada, match difuso de calle).
  - `"Entre Ríos 2333, Martínez, Buenos Aires, Argentina"` → casa exacta ✅.

**Conclusión de diseño:** ningún geocoder es 100% confiable en GBA por sí solo, así que hay que (a) un geocoder que **nunca bloquee**, (b) un **normalizador** que arme la query desambiguada, (c) **mostrar siempre el pin con aviso de confianza** para que el asesor verifique, y (d) **backfillear las 25** con revisión de baja confianza.

### Problema 2 — Popup del listado de propiedades

Al clickear una card en `app/(dashboard)/properties/` se abre `PropertyDetailModal`. Dos bugs:

- **Fotos rotas:** `PropertyGallery.tsx` (L28-34, 47, 57) usa `next/image` **sin `unoptimized`**, así que rutea por `/_next/image?url=...` (optimizador de Next/Netlify), que falla en runtime con las URLs de Supabase Storage y muestra el `alt` (`${alt} ${i+1}` = el "…1" observado). La card **sí** funciona porque pasa `unoptimized` (`PropertyCard.tsx:71`). **No** es dominio faltante (Storage ya está en `next.config.ts:26`).
- **Footer/scroll roto:** `PropertyDetailModal.tsx:53` mete todo (header + gallery + stats + descripción + footer) en **un único** scroller `overflow-y-auto` sin `overflow-x`, sobre un grid item con `min-width:auto`. La descripción `whitespace-pre-wrap` sin `break-words` fija un min-content ancho → **scroll horizontal**. El footer usa `sticky bottom-0 -mx-6 -mb-6` frágil → se ocluye/recorta y los botones "Ver detalle completo" / "Agendar visita" quedan fuera de vista.

---

## 2. Objetivos y no-objetivos

### Objetivos
1. Que **toda propiedad** (importada o nueva) pueda geolocalizarse de forma confiable, sin bloqueos por config, y que ML, Argenprop y Meta lean coordenadas correctas.
2. Un **normalizador de direcciones** como fuente de verdad para geocoding y portales.
3. **Backfillear las 25 importadas** con lat/lng + provincia, marcando las de baja confianza para revisión.
4. Que el asesor **nunca quede en un callejón sin salida**: pin manual siempre disponible + dirección editable + aviso de confianza.
5. Arreglar el **popup** (fotos + layout/botones).
6. (Opt-in) Argenprop publica propiedades CABA importadas; Meta v2 valida ubicación al inicio y aplica el preset geográfico elegido.

### No-objetivos
- **No** reestructurar la dirección en campos totalmente separados (calle/número/barrio/localidad/provincia/CP con rework del formulario). Se mantiene `address` + normalizador + una columna `province`.
- **No** publicar nada en vivo en MercadoLibre ni Argenprop durante las pruebas (decisión explícita del usuario).
- **No** ampliar Argenprop a GBA/Provincia (hoy solo CABA por catálogo); solo se detecta el caso GBA temprano con mensaje claro.
- **No** migrar el geocoder de Meta a geocodificar al vuelo; Meta sigue leyendo `properties.latitude/longitude` (que ahora estarán pobladas).

---

## 3. Decisiones tomadas (brainstorm)

| Decisión | Elección |
|---|---|
| Motor de geocoding | **Google si hay API key, si no OSM/Nominatim (gratis). Nunca bloquea.** |
| Modelo de datos de dirección | **Normalizador + columna `province`** (sin reestructurar en campos separados). |
| Alcance extra | **Los tres:** Argenprop CABA importadas + Meta v2 aplica preset + Meta v2 valida ubicación al inicio. |

---

## 4. Arquitectura

### Parte A — Normalización + geocoding (núcleo)

#### A1. `lib/properties/address.ts` (módulo puro, testeable)
Fuente de verdad única. Funciones:
- `parseAddress(rawAddress, { neighborhood, city, province }?) → AddressParts` donde `AddressParts = { street, number, neighborhood, locality, province, isCaba }`. Best-effort: parte el blob por comas, toma el primer segmento como "calle + altura", detecta la altura con regex (`/(.+?)\s+(\d+)\s*$/`), y **descarta el sufijo redundante** (", Barrio, Zona/Provincia") comparándolo con `neighborhood`/`city`/`province`.
- `buildGeocodeQuery(parts) → string`: arma `"{calle} {altura}, {localidad}, {provincia-expandida}, Argentina"`. La provincia se expande con `expandProvince()`:
  - `CABA` → `"Ciudad Autónoma de Buenos Aires"`
  - `Buenos Aires` → `"Provincia de Buenos Aires"`
  - otra → el nombre tal cual.
  Si no hay altura, arma la query igual (calle + localidad) y el geocoder marcará confianza baja.
- `normalizeCity(s)`, `normalizeNeighborhood(s)`: Title Case, trim de espacios/acentos duplicados, tabla de alias (ej. `'Nueva Pompeya' → 'Pompeya'`, reusando el criterio del slug de zonaprop ya existente).
- `formatDisplayAddress(parts) → string`: string limpio para mostrar y para `address_line` de portales.
- `deriveProvince({ address, city, csvZona? }) → 'CABA' | 'Buenos Aires' | string`: heurística para poblar `province` cuando no viene explícito (detecta "Capital Federal"/"CABA" en el texto; GBA * → "Buenos Aires").

**Tests unitarios table-driven** contra los ejemplos reales del CSV (incluidos los feos: sin altura como "Lares de Canning", GBA, duplicados Agüero 950 Palermo vs Balvanera).

#### A2. `lib/properties/geocoder.ts` (abstracción con fallback + confianza)
- `geocodeAddress(query, expected?) → Promise<GeocodeResult>` donde
  `GeocodeResult = { lat, lng, formatted, confidence: 'high'|'medium'|'low', provider: 'google'|'osm', raw }`.
  (El valor `'manual'` NO lo devuelve el geocoder: solo se escribe en la columna `geo_confidence` cuando un humano confirma el pin en el wizard.)
- **Orden de proveedores:** si `process.env.GOOGLE_GEOCODING_API_KEY` está presente → Google primero; ante error/`ZERO_RESULTS`/confianza baja → OSM. Si no hay key → OSM directo.
- **OSM/Nominatim:** `format=json&addressdetails=1&countrycodes=ar&limit=1`, header `User-Agent: DiegoFerreyraInmobiliaria/1.0`, throttle ~1.1s (respeta la usage policy; el backfill serializa).
- **Scoring de confianza:**
  - **Google:** `location_type` `ROOFTOP`→high, `RANGE_INTERPOLATED`→medium, `GEOMETRIC_CENTER`/`APPROXIMATE`→low; `partial_match:true` baja un nivel.
  - **OSM:** compara `address.house_number` devuelto vs la altura pedida (distinto → low); `class/type` house/building→high, road/residential→medium, resto→low.
  - **Guarda de región (crítica, mata el "San Andrés de Giles"):** compara `address.state`/`address.county` del resultado contra `expected` (province + locality). Si se esperaba CABA y el `state` no es "Ciudad Autónoma de Buenos Aires", o se esperaba un partido X y el `county` es otro → **rechaza el resultado** (o lo marca low y sigue al siguiente proveedor).
  - **Sanity bbox AR** (y bbox CABA cuando `isCaba`) como red adicional.
- La confianza final es el **mínimo** de las señales. `low` → nunca se auto-confía; se ofrece como punto de partida para el pin manual.

**Tests unitarios** con respuestas mockeadas de Google y OSM, incluido el caso San Andrés → San Andrés de Giles (debe dar `low`/rechazo).

#### A3. `/api/geocode` refactorizado
- Usa `geocodeAddress` (Google→OSM). **Elimina el 412 duro**: sin key usa OSM; solo devuelve error si fallan ambos proveedores.
- Acepta `{ address }` (compat) y opcionalmente `{ expected }` (hints de province/locality para la guarda de región).
- Devuelve `{ lat, lng, formatted, confidence, provider }`.

#### A4. Wizards ML + AP (StepFields)
`components/properties/wizards/ml/steps/StepFields.tsx` y `.../ap/steps/StepFields.tsx` son casi idénticos. Se extrae la lógica compartida (hook o helper). La query de geocode se arma con `buildGeocodeQuery(parseAddress(...))` en lugar del naive `[address, neighborhood, city].join(', ')` — sin duplicar barrio/ciudad y con provincia desambiguada.

#### A5. `GeoPinMap` siempre visible + UX de confianza + dirección editable
`components/properties/wizards/ml/GeoPinMap.tsx` (idéntico en `ap/`):
- Se renderiza **siempre**. Si no hay lat/lng, centra en el centroide del barrio (dataset `lib/marketing/neighborhood-data.ts` ya tiene lat/lng por barrio CABA) o en CABA (`-34.6037, -58.3816`) como fallback. El asesor puede arrastrar/soltar el pin aunque el geocode haya fallado.
- Muestra **badge de confianza** (`high`/`medium`/`low`/`manual`) + la dirección resuelta (`formatted`), pidiendo verificar los `low`/GBA.
- **Campo "dirección a buscar" editable** en StepFields, sembrado de `property.address`. El asesor lo corrige, re-geocodifica, y el valor **persiste** (via el PATCH existente `/ml-preview` | `/ap-preview`, extendido para aceptar `address`). Esto cubre el caso "cuando se pone la dirección mal".
- Al confirmar/mover el pin manualmente, se persiste `geo_confidence = 'manual'`.
- El gate `geoOk` sigue exigiendo lat/lng no-null para publicar, pero ahora siempre hay camino para conseguirlas.

#### A6. Migración `supabase/migrations/2026072300000X_property_geocoding.sql`
```sql
ALTER TABLE properties ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geo_confidence TEXT;   -- 'high'|'medium'|'low'|'manual'
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;
```
(La tabla `properties` fue creada fuera de migraciones; `ALTER ADD` funciona igual.) Se corre a mano en el Dashboard **o** vía session pooler pg (ver CLAUDE.md). Actualizar `types/database.types.ts`.

#### A7. Script de backfill `scripts/backfill-address-geocode.ts`
- Re-lee `scripts/data/precaptadas.csv` para recuperar `Zona/Provincia` (col 13) y setear `province` **preciso** en las 25 importadas (match por `import_external_id` = ID Zonaprop).
- Para cada propiedad con `latitude IS NULL`: `parseAddress` → `buildGeocodeQuery` → `geocodeAddress` → escribe `latitude`, `longitude`, `province`, `geo_confidence`, `geocoded_at`.
- **`--dry-run` por defecto** (imprime propiedad, query, resultado y confianza; no escribe). `--commit` para persistir.
- **Nunca pisa un pin existente:** solo toca filas con `latitude IS NULL`. (Los pins confirmados a mano tienen lat/lng seteada.)
- Reporta al final el desglose high/medium/low y lista las `low` para revisión manual.
- Conexión directa Postgres vía session pooler (la CLI de Supabase no conecta; patrón `scripts/apply-*-migration-pg.ts`, `npm i --no-save pg`).

#### A8. Geocode best-effort al crear/editar
- En `POST /api/properties` (y `PUT`), tras persistir la propiedad, hacer un geocode **best-effort** — `await` envuelto en `try/catch` que **nunca lanza** (si falla o tarda, el alta ya está hecha): `parseAddress` → `geocodeAddress`. Si devuelve `high`/`medium`, setear lat/lng + confidence; si `low`, setear igual como punto de partida + `geo_confidence='low'` (el wizard mostrará el aviso). No se usa fire-and-forget post-respuesta (poco confiable en serverless). Nota: agrega ~1 llamada de geocode a la latencia del alta; aceptable.
- Objetivo: detectar direcciones malas en la captación, no recién al publicar.

#### A9. ML `buildLocation` usa `province` (robustez)
`lib/portals/mercadolibre/mapping.ts` `buildLocation()`: usar `property.province` para `state.name` (`CABA` → "Capital Federal", si no el province) en vez de la heurística hardcodeada "todo lo no-CABA es Buenos Aires". Cambio contenido; mejora la corrección si aparecen otras provincias.

### Parte B — Argenprop publica CABA importadas
`lib/portals/argenprop/adapter.ts` `resolveLocalizacion()` (L41-59):
- Detecta CABA por `property.province === 'CABA'` **o** porque `resolveCabaBarrioId(property.neighborhood)` devuelve un barrio válido del catálogo CABA — **ignora** que `city` traiga el barrio en vez de "Capital Federal".
- Si es claramente GBA/Provincia (barrio no resuelve en CABA y province ≠ CABA) → error claro y **temprano**, movido a `validateForArgenprop` (`ap-preview`) para que el asesor lo vea en el wizard, no con un `502` tardío en `ap-publish`.
- `parseCalle()` (`lib/portals/argenprop/mapping.ts:47-51`) reforzado: extrae calle+altura del blob tomando el número **antes de la primera coma** (usa `parseAddress`), así `"José Luis Cantilo 4300, Villa Devoto, …"` → `{ Nombre: "José Luis Cantilo", Numero: "4300" }` en vez de `S/N`.

### Parte C — Meta Ads v2 (ubicación)
- **C1.** `app/api/properties/[id]/meta-launch-v2/start/route.ts`: devolver `412 "Falta geolocalización (lat/lng)"` si lat/lng null, **antes** de gastar en Gemini (hoy solo gatea `public_slug`; falla recién en `confirm` tras generar 27 piezas ≈ USD 1).
- **C2.** `app/api/properties/[id]/meta-launch-v2/[jobId]/confirm/route.ts`: traducir `job.geo_preset_id → targetingOverride` reusando `buildGeoPresets(property, persona)` y pasarlo a `createCampaignForProperty`. Hoy `confirm` no pasa `targetingOverride` → el preset (Cercanos/Similares/Toda CABA) se **ignora** y siempre sale el pin único por precio. Con esto el preset elegido llega a la campaña (igual que el wizard v1).

### Parte D — Popup del listado
`app/(dashboard)/properties/_components/PropertyGallery.tsx` y `PropertyDetailModal.tsx`:
- **D1.** Agregar `unoptimized` (+ `onError` de respaldo que oculte la imagen rota) a los **tres** `<Image>` de `PropertyGallery.tsx` (principal L28-34, thumbnails L47, lightbox L57), replicando `PropertyCard.tsx:71`.
- **D2.** Reestructurar `PropertyDetailModal.tsx`:
  - `DialogContent` → `flex flex-col overflow-hidden max-h-[90vh]` (+ `overflow-x-hidden`).
  - Envolver header + gallery + stats + video + descripción en un body propio: `<div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">`.
  - Sacar el `<footer>` de ese body → hermano `shrink-0` (sin `sticky`, sin `-mx-6 -mb-6`) → siempre visible por construcción.
  - `min-w-0` en header/título; `break-words` en la descripción → mata el desborde horizontal.

---

## 5. Modelo de datos (resumen)

`properties` (columnas nuevas):
- `province TEXT` — normalizada: `'CABA'`, `'Buenos Aires'`, u otra provincia. Fuente de verdad de región para geocoding y portales.
- `geo_confidence TEXT` — `'high' | 'medium' | 'low' | 'manual'`. `'manual'` = pin confirmado por un humano.
- `geocoded_at TIMESTAMPTZ` — cuándo se geocodificó (observabilidad; distingue backfill de pin manual).

Sin cambios en `address` / `neighborhood` / `city` / `latitude` / `longitude` (semántica: `city` sigue guardando localidad/partido; se **normaliza el casing** en el backfill pero no se cambia el significado).

---

## 6. Testing

- **Unitarios `address.ts`**: `parseAddress`, `buildGeocodeQuery`, `normalizeCity/Neighborhood`, `deriveProvince` — table-driven contra ~10 ejemplos reales del CSV (CABA, GBA, sin altura, duplicados, mayúsculas).
- **Unitarios `geocoder.ts`**: scoring de confianza y guarda de región con respuestas mockeadas Google + OSM (incluye San Andrés de Giles → low/rechazo; altura no coincidente → low; ROOFTOP → high).
- **Prueba en vivo (la "prueba de que lee la dirección" que pidió el usuario):** correr `backfill-address-geocode.ts --dry-run` sobre las 25 reales (OSM en vivo) y **reportar** cuáles resuelven high/medium/low, sin publicar ni escribir nada.
- **Popup**: verificación de estructura/typecheck (Turbopack local está roto por el acento en el path → usar `next dev --webpack` o razonar sobre el diff; es CSS/JSX puro). Confirmar botones visibles + sin scroll horizontal con descripción larga.
- **Argenprop / Meta**: nivel unitario/lógico; **sin publicación en vivo** (Argenprop además está bloqueado por 401 CRM, independiente de esto).

---

## 7. Secuencia y gates de deploy

1. Módulos `address.ts` + `geocoder.ts` + tests (sin efectos).
2. **Migración** `province`/`geo_confidence`/`geocoded_at` (Dashboard o pg pooler) — **antes** del código que escribe esas columnas. Actualizar `types/database.types.ts`.
3. Refactor `/api/geocode` + wizards (A3/A4/A5) + ML `buildLocation` (A9) + Argenprop (B) + Meta v2 (C) + popup (D).
4. **Backfill** de las 25: primero `--dry-run` (revisión conjunta), luego `--commit`.
5. Deploy. **Nada de publicación en vivo en portales durante las pruebas.**
6. (Opcional) Setear `GOOGLE_GEOCODING_API_KEY` en Netlify para precisión GBA; sin ella el sistema ya funciona con OSM.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| OSM ubica mal en GBA (San Andrés de Giles) | Guarda de región en el scoring + confianza `low` + pin manual siempre visible + revisión de `low` en el backfill. |
| Nominatim rate-limit / bloqueo | User-Agent válido, `countrycodes=ar`, throttle ~1.1s, backfill serializado. Volumen real bajo (decenas). |
| Direcciones sin altura o con número redondeado por Zonaprop | Se geocodifican igual (calle+localidad) con confianza baja → el asesor confirma el pin. |
| El backfill pisa un pin bueno | Solo toca `latitude IS NULL`; nunca sobrescribe. |
| Turbopack local roto (no valida el popup) | `next dev --webpack` / typecheck; el fix es CSS/JSX puro y verificable en navegador. |
| Cambiar `buildLocation`/Argenprop rompe publicaciones actuales | Cambios contenidos + sin publicar en vivo; validación temprana evita 502 tardíos. |

---

## 9. Fuera de alcance (posibles follow-ups)

- Reestructurar la dirección en campos separados con rework del formulario.
- Ampliar Argenprop a GBA/Provincia (requiere su catálogo de localidades).
- Validar el barrio contra el árbol geográfico de ML por `value_id` (hoy va por nombre).
- Autocomplete de direcciones (Google Places) en el alta.
