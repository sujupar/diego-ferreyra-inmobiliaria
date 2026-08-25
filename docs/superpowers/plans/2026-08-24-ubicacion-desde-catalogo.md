# Ubicación elegida de una lista, no escrita a mano

**Fecha:** 2026-08-24
**Disparador:** "Rogelio Vidal 6136" no se pudo publicar en Argenprop.
El cartel decía *"Cargá la provincia en la ficha para publicar en Argenprop
fuera de CABA (ciudad recibida: General San Martín)"*.

## Qué estaba roto (ingeniería inversa, con evidencia)

1. **El alta nunca pregunta la provincia.** `app/(dashboard)/properties/new/page.tsx`
   pide Dirección, Barrio y Ciudad (texto libre, Ciudad con default `'CABA'`).
   La columna `properties.province` existe pero el formulario no la manda nunca.
2. **La provincia solo se deducía al geocodificar, y solo sabe reconocer Capital.**
   `deriveProvince()` (`lib/properties/address.ts`) devuelve `'CABA'` o `null`.
   Fuera de Capital → `null`. Por eso toda propiedad de provincia cargada a mano
   queda sin provincia.
   Evidencia: `f511c84e-eb91-40c9-b070-5cd8f3dca356` →
   `city="General San Martín"`, `neighborhood="Villa Libertad"`, `province=null`.
   4 de 33 propiedades sin provincia; las 5 de San Martín que sí la tienen
   vinieron del import CSV (que traía la zona).
3. **Argenprop, desde el 2026-08-06, publica en todo el país** pero exige la
   cadena provincia → partido → localidad (`adapter.resolveLocalizacion`). Sin
   provincia corta en el primer escalón.
4. **El texto libre es una lotería contra el catálogo real** (probado en vivo el
   2026-08-24 con las credenciales de producción):
   - `PARTIDO_58` se llama `"Partido de General San Martín"`
   - la localidad es `LOCALIDAD_928 "General San Martin"` — **sin tilde**
   - `"Villa Libertad"` no es localidad: es `BARRIO_323` dentro de esa localidad
   - los barrios de CABA van sin tilde: `Villa Pueyrredon`, `Constitucion`, `Nuñez`
   `matchLocalizacion` resuelve muchos casos, pero ante ambigüedad devuelve
   `null` A PROPÓSITO (para no publicar a 90 km del lugar). O sea: escribir a
   mano es apostar.
5. **La ficha no deja corregir la ubicación.** Se edita tipo, precio y
   características; barrio/ciudad/provincia no se tocan desde ningún lado.
6. **Aviso desactualizado:** `ap-preview/route.ts` todavía dice "Argenprop hoy
   solo publica propiedades de CABA".

## El hallazgo que simplifica el diseño

Capital tiene la MISMA jerarquía de 4 niveles que el resto del país:
`PROVINCIA_2 Capital Federal → PARTIDO_135 Capital Federal → LOCALIDAD_2102 CABA → 54 barrios`.
Un solo selector en cascada sirve para toda la Argentina, sin caso especial.

## Diseño

- **`lib/properties/location-selection.ts` (PURO, testeado).** Traduce una
  selección del catálogo a lo que se guarda. Reglas:
  - Provincia `Capital Federal` → se guarda `province = 'CABA'` (es lo que ya
    entienden el adapter de AP, el mapeo de ML y el geocoder).
  - `city` = nombre de la **localidad** (no del partido). En Capital eso da `'CABA'`.
  - `neighborhood` = barrio; si la localidad no tiene barrios, la localidad
    (la columna es NOT NULL).
  - **Conserva tildes:** si el valor que ya estaba escrito normaliza igual que el
    del catálogo, no se pisa (así "Villa Pueyrredón" no se degrada a "Villa Pueyrredon").
  - En Capital el barrio es OBLIGATORIO (regla de la API de AP).
  - Valida la forma de los ids (`PROVINCIA_`/`PARTIDO_`/`LOCALIDAD_`/`BARRIO_`).
- **Columna nueva `properties.location_refs jsonb`** con los ids reales de AP.
  Con el id guardado, publicar no vuelve a adivinar.
- **`GET /api/locations/argenprop?nivel=&padre=`** — sirve el catálogo real
  (usa el cache de 24h que ya existe). 503 explícito si AP no está configurado,
  para que la UI caiga al texto libre en vez de trabar el alta.
- **`<LocationPicker>`** — 4 selects en cascada, reusado en el alta y en la ficha.
- **`PATCH /api/properties/[id]/location`** — ruta dedicada (el `PUT` genérico
  crea tareas y manda mails al pasar a `pending_review`).
- **El adapter usa el id si está**; si no, el camino por nombres de siempre —
  las propiedades viejas siguen publicando igual.

## Orden de ejecución

1. Módulo puro + tests.
2. Migración `location_refs` + script que la aplica y VERIFICA.
3. Endpoint de catálogo.
4. `LocationPicker`.
5. Alta + ficha.
6. Adapter usa el id; aviso viejo de `ap-preview` corregido.
7. Backfill de las propiedades existentes (dry-run por defecto).
8. Publicar Rogelio Vidal en Argenprop y verificar el aviso.
