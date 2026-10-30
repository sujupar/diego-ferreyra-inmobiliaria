# Conectar avisos desde Consultas — plan

**Spec:** `docs/superpowers/specs/2026-10-30-conectar-avisos-design.md` (aprobado por el dueño el 2026-10-30).

## Lo medido antes de planificar (2026-10-30)
- Consultas sin propiedad: ZonaProp 186 (con código, **0 con enlace**), Argenprop 45 (42 con código y enlace: el lector ya lo arma desde el redireccionador de Mandrill).
- Mail de ZonaProp: los enlaces son `http://link.zonaprop.com.ar/ls/click?upn=…`. Uno lleva (302) a `https://www.zonaprop.com.ar/propiedades/clasificado/<slug>-<id>.html?utm_…`; los otros van al logo, al panel o a "responder". La foto es `https://imgar.zonapropcdn.com/avisos/…/290x180/<n>.jpg`.
- Mail de Argenprop: la foto del aviso es la primera `https://www.argenprop.com/static-content/…jpg` (los íconos están en `/content/emails/`).
- Quién la muestra ya tiene lugar: `portal_property_map.assigned_to` → `portal_inquiries.assigned_to` → `notify.ts`. El asesor que la captó es `properties.assigned_to`.

## Decisiones tomadas al planificar (mías; el dueño puede corregirlas)
1. **La foto se muestra solo en la hoja "Avisos sin propiedad"**, que lee `portal_inquiries` directo. No se tocan la vista `consultas_unificadas` ni `consultas_del_periodo` (el enlace del aviso ya viaja en `aviso_url`). La migración agrega solo la columna.
2. **"¿Quién la muestra?" también en la hoja de una consulta suelta** ("¿Qué propiedad quiere ver?", antes de agendar): el dueño lo pidió para los dos lugares.
3. **El cartel de Inicio cuenta los avisos de la hoja de Consultas** (`GET /api/consultas/avisos`), no las filas huérfanas del mapa. Si no, diría un número distinto del que se ve al abrirla.
4. `/avisos` redirige a `/consultas?avisos=1`. Se borran `AvisosClient` (y su test) e `IdentifyAvisoDialog`. `/api/portal-inquiries/identify`, `resolve-link` y `unidentified` quedan (las usa el link pegado y otras pantallas).

## Tareas

### T1 — Migración `property_photo_url`
- `supabase/migrations/20261030000001_portal_inquiries_foto_aviso.sql`: `ADD COLUMN IF NOT EXISTS property_photo_url text` + `CHECK (property_photo_url IS NULL OR property_photo_url ~ '^https://')`.
- `scripts/apply-foto-aviso-pg.ts`: la aplica y verifica la columna y el CHECK (inserta una fila inválida dentro de una transacción con ROLLBACK).
- Se aplica ANTES del código (el cron la escribe).

### T2 — Leer el aviso del mail (puro + red inyectada), TDD
- `lib/integrations/portal-inquiries/aviso-del-mail.ts`:
  - `fotoDelAviso(portal, html): string | null`. ZonaProp: host exacto `imgar.zonapropcdn.com`, ruta `/avisos/`. Argenprop: host exacto `www.argenprop.com`, ruta `/static-content/`. Solo `https`.
  - `enlacesDeClicZonaprop(html): string[]`: únicos, host exacto `link.zonaprop.com.ar`, ruta `/ls/click`, en orden y con tope de 8.
  - `avisoZonapropLimpio(destino): string | null`: `https`, host exacto `www.zonaprop.com.ar`, ruta `/propiedades/clasificado/…html`, sin query ni hash.
  - `resolverAvisoZonaprop(html, { fetch, techoMs }): Promise<string | null>`: sigue de a uno con `redirect: 'manual'` hasta encontrar el aviso. Un solo techo total; nunca lanza.
- Tests (`aviso-del-mail.test.ts`): el mail real recortado, hosts parecidos (`imgar.zonapropcdn.com.evil.com`, `link.zonaprop.com.ar.x.com`), `http` destino, query/utm fuera, red que falla, techo vencido, html vacío.

### T3 — Ingesta (cron) y relleno de lo viejo
- `app/api/cron/portal-inquiries/route.ts`: al insertar, `property_photo_url: fotoDelAviso(...)`. Si es ZonaProp y no hay enlace: `resolverAvisoZonaprop` con techo de 5 s, solo si queda presupuesto en la corrida. Un fallo deja la consulta sin enlace, nunca la frena.
- `scripts/completar-enlaces-avisos.ts [--commit]`: por cada aviso agrupable sin propiedad, lee UN mail y completa enlace y foto de las consultas del aviso que no los tienen. Las sueltas, de a una. Simula por defecto.

### T4 — Servidor: quién la muestra (TDD sobre `lib/consultas/identificar.ts`)
- `conectarAviso(sb, { portal, codigo, propertyId, muestraId })` y `conectarConsulta(sb, { consultaId, propertyId, muestraId })`:
  - `muestraId` debe ser un perfil activo `asesor` o `dueno`; si no, 400 "Elegí quién la muestra".
  - El aviso y las consultas quedan con `assigned_to = muestraId`. **Nunca se escribe `properties`.** Se recuerda siempre (antes dependía del asesor de la propiedad).
- `quienMuestraLaPropiedad(sb, propertyId): Promise<string | null>`: el `assigned_to` del aviso activo más reciente de esa propiedad.
- Rutas:
  - `POST /api/consultas/avisos` y `POST /api/consultas/[id]/propiedad` piden `muestraId` (Zod uuid).
  - Nueva `GET /api/consultas/avisos/quien-muestra?propiedad=<uuid>`, solo operaciones.
  - `GET /api/consultas/avisos` devuelve `foto` por aviso (`avisos-datos.ts` + `agruparAvisos`).
- Tests:
  - conectar no toca `properties`; muestra inválido → 400; muestra = otro asesor que el captador; recuerda aunque la propiedad no tenga asesor.
  - Rutas: falta `muestraId` → 400; asesor → 403.

### T5 — Pantallas
- `HojaAvisosSinPropiedad`:
  - La tarjeta muestra la foto (validada con `fotoSegura`) y el botón "Ver aviso en <portal>".
  - Al conectar, en orden: buscador de propiedad (principal), "¿Quién la muestra?" (select con los asesores; viene elegido si `quien-muestra` responde, si no vacío y obligatorio) y "Conectar N consultas".
  - Abajo, "¿No la encontrás? Pegá el link del aviso": usa `resolve-link`. Si encuentra la propiedad, la elige; si no, dice que no está publicada desde la plataforma y que la busques en la lista.
- `HojaElegirPropiedad`: mismo "¿Quién la muestra?" antes de "Seguir".
- `ConsultasClient` pasa los asesores a las dos hojas y abre la hoja de avisos con `?avisos=1` (prop desde `page.tsx`, solo si puede identificar).
- Tests de componente: el botón Conectar queda deshabilitado sin quién la muestra; el cuerpo enviado lleva `muestraId`; la foto no se dibuja con un host ajeno.

### T6 — Sacar "Avisos por identificar"
- `lib/nav/sections.ts`: fuera `AVISOS`; actualizar `sections.test.ts`.
- `app/(dashboard)/avisos/page.tsx` → `redirect('/consultas?avisos=1')`; borrar `AvisosClient(.test).tsx` e `IdentifyAvisoDialog.tsx`.
- `UnidentifiedBanner`: cuenta `GET /api/consultas/avisos` y enlaza a `/consultas?avisos=1`. En Inicio se muestra a operaciones (ya no hay `/avisos` en el menú). Actualizar su test.

### T7 — Verificación
- `vitest.consultas.config.ts` + los tests nuevos de ingesta y del cartel; tsc acotado; eslint de lo tocado.
- Revisión adversarial → PR → QA en la vista previa (criterios 1–8 del spec, roles admin y asesor, celular) → merge → humo en producción → correr el relleno con `--commit` → CLAUDE.md + memoria.
