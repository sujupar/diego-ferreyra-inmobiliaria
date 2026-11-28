# Radar de referencias de Instagram — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la alimentación de "Referencias" por OpenClaw por un radar propio que corre a diario en la Mac de Julian con su sesión de Instagram, mide reels contra la mediana de su cuenta, filtra con IA (80 % inmobiliario AR), analiza el video completo y lo publica en la plataforma con el video reproducible.

**Architecture:** Un paquete `radar/` dentro del repo, ejecutado con `node --import tsx` desde un clon propio (`~/.radar-referencias/app`) disparado por `launchd`. Playwright maneja un perfil de Chromium persistente con la sesión de Instagram y hace `fetch` a la API web de Instagram **desde la página** (misma sesión). Lógica pura (medición, mezcla 80/20, parseo, armado de filas) separada de la E/S y probada. Gemini (texto para el filtro, video inline para el análisis). Supabase: columnas nuevas en `video_refs` + tablas `radar_*` + bucket privado `video-refs`. La plataforma lee, firma URLs de video y vigila con un cron (`radar-watchdog`) que manda el email si el radar se cae.

**Tech Stack:** TypeScript, Playwright (`@playwright/test` ya en devDependencies; usar `chromium` de `playwright`/`@playwright/test`), yt-dlp + ffmpeg (instalados en `/opt/homebrew/bin`), Gemini REST (`gemini-2.5-flash`), Supabase JS (service_role), Next.js 16 (rutas y pantalla), vitest, launchd.

**Spec:** `docs/superpowers/specs/2026-11-27-radar-referencias-instagram-design.md`

## Global Constraints

- Solo Instagram. Sin servicios pagos de lectura (Apify y similares). **Solo lee**: nunca like, comentar, seguir ni publicar.
- Cuenta: la de Arc "Julian Parra". El robot usa su **propio** perfil persistente en `~/.radar-referencias/perfil-navegador/`; nunca abre ni toca el perfil de Arc.
- Todo el estado local fuera de iCloud: `~/.radar-referencias/` (perfil, `app/`, `.env`, `logs/`, `tmp/`, `radar.lock`).
- Umbrales por defecto (en `radar_config`, no en el código): multiplicador ≥ **3**; antigüedad ≤ **30** días; vistas ≥ **20.000**; reels por cuenta para la base **24**; excluir de la base reels de < **3** días; puntaje de relevancia ≥ **6**; tope **10** publicadas por día; tope por corrida **25** cuentas y **300** reels mirados.
- Línea de base = **mediana** (no promedio).
- Regla 80/20 sobre los **últimos 7 días** de publicadas (`fuente='radar'`): otro rubro ≤ 20 % de la semana; como mínimo 1 de otro rubro por día si ese día hubo ≥ 1 inmobiliario.
- Ante desafío/checkpoint/"intentá más tarde" de Instagram: frenar la corrida entera, estado `frenada_por_instagram`, sin reintentos ese día.
- Una sola corrida exitosa por día calendario (America/Argentina/Buenos_Aires); candado de archivo contra corridas simultáneas.
- Pausas aleatorias entre navegaciones/llamadas: 2–6 s; entre cuentas 8–20 s.
- `video_refs` existentes: `fuente='openclaw'`, `oculta=true`. La pantalla muestra por defecto solo `fuente='radar'`; "Archivo anterior" muestra las de OpenClaw. **No se borran filas.**
- Videos recomprimidos a 720p (lado largo), H.264 + AAC, `-crf 28`, antes de subir. Retención: borrar del Storage el video (no la fila ni la portada) de filas ocultas/"No sirve" o con > 120 días y `estado_uso='sin_usar'`.
- `ficha_slug = 'ig-' + shortcode`, `plataforma='instagram'`, `tipo='video_cuenta'`.
- Ninguna cifra inventada: métricas solo de Instagram; si faltan, `null`.
- Commits como `Sujupar <redstyle50@gmail.com>`, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Migraciones nuevas con prefijo `20261128…` (mirar el directorio antes, no duplicar).
- Pruebas: `npx vitest run -c vitest.radar.config.ts`; tipos: `npx tsc --noEmit -p tsconfig.radar.json` (la config raíz se cuelga en esta Mac).

## Review Focus

1. **Reel sin vistas** (`play_count` ausente o 0 en fotos/carruseles mezclados en el feed): se ignora para la base y como candidato, nunca cuenta como 0 que tire la mediana. → prueba en Task 2 (`medirCuenta ignora reels sin vistas`).
2. **Cuenta con menos de 6 reels maduros**: no hay base confiable → la cuenta no produce candidatos (se registra `bajo_umbral` con motivo "base insuficiente"). → prueba en Task 2.
3. **Sesión vencida** (Instagram redirige a `/accounts/login`): la corrida termina `error` en el paso `sesion` con mensaje "iniciar sesión con `radar login`", sin seguir pidiendo. → prueba en Task 4 (`detectarBloqueo` con HTML/URL de login).
4. **Reel ya publicado aparece de nuevo otro día** (o con más vistas): no se duplica tarjeta; se actualizan vistas/multiplicador de la fila existente. → prueba en Task 2 (`armarFilaVideoRef` + upsert por `ig_shortcode` en Task 8 con `--seco` contra una fila existente).
5. **Respuesta de Gemini que no es JSON válido o le falta un campo**: ese reel queda `error` en `radar_vistos` con el motivo y la corrida sigue con el siguiente. → pruebas en Task 5 y Task 7 (`parsearClasificacion`/`parsearAnalisis` con texto roto).

---

## Estructura de archivos

```
radar/
  tipos.ts                 tipos compartidos (ReelCrudo, CuentaPerfil, Clasificacion, Analisis, ConfigRadar)
  medicion.ts (+ .test)    mediana, base, multiplicador, candidatos
  mezcla.ts (+ .test)      regla 80/20 + tope diario
  filas.ts (+ .test)       armado de la fila video_refs desde reel+clasificación+análisis
  instagram/
    parsers.ts (+ .test)   JSON de Instagram → ReelCrudo/CuentaPerfil/comentarios
    fixtures/*.json        respuestas reales capturadas (sin datos de sesión)
    cliente.ts             Playwright: abrir perfil, fetch en página, pausas, bloqueo
    bloqueo.ts (+ .test)   detectarBloqueo(url, status, cuerpo)
  ia/
    gemini.ts              llamada REST genérica (texto y video inline)
    clasificar.ts (+ .test) prompt + parsearClasificacion
    analizar.ts (+ .test)  prompt + parsearAnalisis
  medios.ts                yt-dlp (cookies del perfil) + ffmpeg + subida a Storage + retención
  db.ts                    cliente service_role + lecturas/escrituras radar_* y video_refs
  correr.ts                orquestador de la corrida
  cli.ts                   comandos: login | capturar | correr [--seco] | instalar | desinstalar
  launchd/ar.inmodf.radar-referencias.plist.tpl
  README.md
supabase/migrations/20261128000001_radar_referencias.sql
supabase/migrations/20261128000002_cron_radar_watchdog.sql
scripts/apply-radar-referencias-pg.ts
scripts/apply-cron-radar-watchdog-pg.ts
app/api/video-refs/route.ts                 (modificar: filtros, URLs firmadas, estado del radar)
app/api/video-refs/[id]/no-sirve/route.ts   (nuevo)
app/api/cron/radar-watchdog/route.ts        (nuevo)
app/(dashboard)/referencias/{grilla,detalle}.tsx (modificar)
lib/video-refs/repo.ts                      (tipo VideoRef + funciones nuevas)
lib/video-refs/guionizar.ts                 (campos nuevos en el prompt)
vitest.radar.config.ts, tsconfig.radar.json
```

---

### Task 1: Migración de datos + bucket

**Files:**
- Create: `supabase/migrations/20261128000001_radar_referencias.sql`
- Create: `scripts/apply-radar-referencias-pg.ts`
- Modify: `lib/video-refs/repo.ts` (tipo `VideoRef`)

**Interfaces:**
- Produces: columnas nuevas de `video_refs`: `fuente text not null default 'openclaw' check in ('radar','openclaw')`, `ig_shortcode text` (índice único parcial `where ig_shortcode is not null`), `video_storage_path text`, `portada_storage_path text`, `formato text`, `comentarios_analisis text`, `transcripcion text`, `categoria text check in ('inmobiliario_ar','inmobiliario_otro_pais','formato_otro_rubro')`, `tema_categoria text check in ('noticias','impuestos','datos_mercado','creditos','gobierno_normativa','inmobiliarias','otro')`, `puntaje smallint`, `oculta boolean not null default false`, `no_sirve_motivo text`, `no_sirve_at timestamptz`, `radar_run_id uuid`.
- Tablas: `radar_cuentas(usuario text pk, ig_user_id text, origen text check in ('semilla','busqueda','explorar'), rubro text check in ('inmobiliario','otro'), seguidores bigint, base_vistas bigint, base_n int, base_medida_at timestamptz, destacados int default 0, descartes_manuales int default 0, veces_revisada int default 0, ultima_revision_at timestamptz, activa boolean default true, created_at)`; `radar_busquedas(termino text pk, activo boolean default true)`; `radar_vistos(ig_shortcode text pk, cuenta text, multiplicador numeric, resultado text check in ('publicado','descartado_relevancia','bajo_umbral','error'), motivo text, run_id uuid, visto_at timestamptz default now())`; `radar_corridas(id uuid pk default gen_random_uuid(), inicio timestamptz default now(), fin timestamptz, estado text check in ('corriendo','ok','parcial','frenada_por_instagram','error'), paso text, cuentas_revisadas int default 0, reels_mirados int default 0, candidatos int default 0, publicadas int default 0, mensaje text, version text, notificada_at timestamptz)`; `radar_config(clave text pk, valor jsonb)`.
- Bucket `video-refs`, privado, `file_size_limit` 50 MB, `allowed_mime_types` `{video/mp4,image/jpeg,image/webp}`.

- [ ] **Step 1:** Escribir la migración idempotente (`IF NOT EXISTS`, `DO $$` para policies), con: `UPDATE video_refs SET oculta = true WHERE fuente = 'openclaw'` (después de agregar las columnas); RLS habilitada en las 5 tablas `radar_*` con policy `FOR SELECT TO authenticated USING (public.is_operations_user())` y sin policy de escritura; seeds de `radar_config` con los umbrales de Global Constraints (`ON CONFLICT DO NOTHING`), claves: `multiplicador_min, dias_max, vistas_min, reels_base, dias_maduro, puntaje_min, tope_diario, tope_cuentas, tope_reels`; seeds de `radar_busquedas`: crédito hipotecario, créditos hipotecarios, comprar departamento, vender departamento, alquileres, ley de alquileres, impuesto inmueble, ganancias inmueble, escritura, escribano, inmobiliaria, martillero, tasación, dólar inmuebles, propietarios, mercado inmobiliario, precio del metro cuadrado, bienes raíces argentina.
- [ ] **Step 2:** `scripts/apply-radar-referencias-pg.ts` (patrón de `scripts/apply-cron-guionizar-refs-pendientes-pg.ts`: pooler, `SUPABASE_DB_PASSWORD`). Aplica y **verifica**: existen las columnas, `count(*) where fuente='openclaw' and oculta=false` = 0, existen 9 filas en `radar_config`, existe el bucket privado. Aborta si algo no cuadra.
- [ ] **Step 3:** Correr `node --env-file=.env.local --import tsx scripts/apply-radar-referencias-pg.ts`. Expected: "OK" + conteos. (Antes: Task 12 Step 1, apagar a Bruno, ya tiene que estar hecho.)
- [ ] **Step 4:** Actualizar `VideoRef` en `lib/video-refs/repo.ts` con los campos nuevos (tipos exactos de arriba). `npx tsc --noEmit -p tsconfig.radar.json` (crear `tsconfig.radar.json` extendiendo el raíz con `include: ["next-env.d.ts","types/**/*.ts","radar/**/*.ts","lib/video-refs/**/*.ts","app/api/video-refs/**/*.ts","app/api/cron/radar-watchdog/**/*.ts","app/(dashboard)/referencias/**/*.tsx"]`). Expected: sin errores.
- [ ] **Step 5:** Commit `feat(referencias): datos del radar (video_refs + radar_* + bucket)`.

---

### Task 2: Medición y armado de filas (lógica pura)

**Files:**
- Create: `radar/tipos.ts`, `radar/medicion.ts`, `radar/medicion.test.ts`, `radar/filas.ts`, `radar/filas.test.ts`, `vitest.radar.config.ts` (patrón de `vitest.reels.config.ts`, `include: ['radar/**/*.test.ts','lib/video-refs/**/*.test.ts','app/api/video-refs/**/*.test.ts']`)

**Interfaces:**
- Produces (`radar/tipos.ts`):
  - `ReelCrudo { shortcode: string; pk: string; cuenta: string; publicadoAt: string /*ISO*/; vistas: number | null; likes: number | null; comentarios: number | null; caption: string; duracionSeg: number | null; urlPortada: string | null; esReel: boolean }`
  - `CuentaPerfil { usuario: string; igUserId: string; seguidores: number | null }`
  - `ConfigRadar { multiplicadorMin: number; diasMax: number; vistasMin: number; reelsBase: number; diasMaduro: number; puntajeMin: number; topeDiario: number; topeCuentas: number; topeReels: number }`
  - `MedicionCuenta { base: number | null; baseN: number; candidatos: Array<ReelCrudo & { multiplicador: number }>; descartados: Array<{ shortcode: string; motivo: string; multiplicador: number | null }> }`
  - `Categoria = 'inmobiliario_ar' | 'inmobiliario_otro_pais' | 'formato_otro_rubro' | 'no_sirve'`; `TemaCategoria` (los 7 de Task 1)
  - `Clasificacion { categoria: Categoria; tema: TemaCategoria; puntaje: number; razon: string }`
  - `Analisis { tema: string; gancho: string; formato: string; por_que: string; comentarios_analisis: string; adaptacion_diego: string; transcripcion: string }`
- Produces (`radar/medicion.ts`): `mediana(xs: number[]): number | null`; `medirCuenta(reels: ReelCrudo[], cfg: ConfigRadar, ahora: Date): MedicionCuenta`.
- Produces (`radar/filas.ts`): `armarFilaVideoRef(reel: ReelCrudo & { multiplicador: number }, base: number, perfil: CuentaPerfil, clas: Clasificacion, an: Analisis, medios: { videoPath: string | null; portadaPath: string | null }, runId: string): Record<string, unknown>`.

- [ ] **Step 1: Pruebas que fallan** en `radar/medicion.test.ts`:
  - `mediana([])` → `null`; `mediana([1,3,2])` → `2`; `mediana([1,2,3,4])` → `2.5`.
  - `medirCuenta` con 10 reels maduros de 10.000 vistas y uno de 60.000 de hace 5 días → base 10.000, 1 candidato con multiplicador 6.
  - `medirCuenta ignora reels sin vistas`: reels con `vistas: null` o `0` o `esReel:false` no entran a la base ni como candidatos.
  - Reel de hace 2 días con 90.000 vistas: no entra a la base (inmaduro) pero **sí** puede ser candidato.
  - Base insuficiente: con 5 reels maduros → `base: null`, 0 candidatos, descartados con motivo `"base insuficiente"`.
  - Umbrales: multiplicador 2,9 → descartado `"bajo multiplicador"`; 19.999 vistas → `"pocas vistas"`; publicado hace 31 días → `"viejo"`.
  - Solo se usan los `cfg.reelsBase` reels más recientes para la base.
- [ ] **Step 2:** Correr `npx vitest run -c vitest.radar.config.ts radar/medicion.test.ts`. Expected: FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `tipos.ts` y `medicion.ts` (mínimo 6 reels maduros para que haya base).
- [ ] **Step 4:** Pruebas en `radar/filas.test.ts`: la fila tiene `fuente:'radar'`, `plataforma:'instagram'`, `tipo:'video_cuenta'`, `ficha_slug:'ig-ABC'`, `ig_shortcode:'ABC'`, `url_video:'https://www.instagram.com/reel/ABC/'`, `multiplicador` redondeado a 1 decimal, `baseline_cuenta:'mediana de 24 reels: 10.000 vistas'` (formato es-AR), `fecha_video` = fecha (YYYY-MM-DD) de `publicadoAt` en zona Buenos Aires, campos de `Analisis` mapeados 1 a 1, `estado_uso` **ausente** (no pisar el de una fila existente), `oculta:false`. Una métrica `null` queda `null` (nunca 0).
- [ ] **Step 5:** Implementar `filas.ts`; correr las dos suites. Expected: PASS.
- [ ] **Step 6:** Commit `feat(radar): medición contra la mediana de la cuenta`.

---

### Task 3: Mezcla 80/20

**Files:** Create `radar/mezcla.ts`, `radar/mezcla.test.ts`

**Interfaces:**
- Consumes: `Clasificacion`, `ConfigRadar` (Task 2).
- Produces: `type Aprobado = { shortcode: string; multiplicador: number; clas: Clasificacion }`; `elegirPublicables(aprobados: Aprobado[], semana: { inmobiliarias: number; otras: number }, cfg: ConfigRadar): Aprobado[]`. Inmobiliario = `inmobiliario_ar` | `inmobiliario_otro_pais`. Orden por `multiplicador * puntaje` desc, `inmobiliario_ar` primero ante empate.

- [ ] **Step 1: Pruebas que fallan:**
  - 12 inmobiliarios + 5 otros, semana vacía → 10 publicados; otros ≤ 2 (porque (otros)/(total semana+hoy) ≤ 0,2) y ≥ 1.
  - 1 inmobiliario + 3 otros, semana `{inmobiliarias: 0, otras: 0}` → 2 publicados (1 + el mínimo de 1 otro).
  - 0 inmobiliarios + 3 otros → 0 publicados.
  - Semana `{inmobiliarias: 8, otras: 2}` + hoy 2 inmobiliarios + 2 otros → publica 2 inmobiliarios + 1 otro (mínimo diario) aunque supere el 20 % semanal.
  - Aprobados con `categoria:'no_sirve'` o `puntaje < cfg.puntajeMin` nunca salen.
- [ ] **Step 2:** Correr, FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr, PASS.
- [ ] **Step 5:** Commit `feat(radar): regla 80/20 semanal`.

---

### Task 4: Cliente de Instagram + login + captura de muestras

**Files:**
- Create: `radar/instagram/cliente.ts`, `radar/instagram/bloqueo.ts`, `radar/instagram/bloqueo.test.ts`, `radar/instagram/parsers.ts`, `radar/instagram/parsers.test.ts`, `radar/instagram/fixtures/` , `radar/cli.ts` (comandos `login` y `capturar`), `radar/README.md`

**Interfaces:**
- Produces (`cliente.ts`):
  ```ts
  class InstagramCliente {
    static abrir(opts: { headless: boolean }): Promise<InstagramCliente> // launchPersistentContext('~/.radar-referencias/perfil-navegador')
    perfil(usuario: string): Promise<CuentaPerfil>
    reelsDeCuenta(perfil: CuentaPerfil, n: number): Promise<ReelCrudo[]>
    buscarCuentas(termino: string, n: number): Promise<string[]>       // usuarios
    explorar(n: number): Promise<ReelCrudo[]>
    comentarios(pk: string, n: number): Promise<string[]>               // texto, más relevantes primero
    reelPorShortcode(shortcode: string): Promise<ReelCrudo | null>
    cookiesNetscape(destino: string): Promise<void>                     // para yt-dlp (Task 6)
    cerrar(): Promise<void>
  }
  class BloqueoInstagram extends Error { tipo: 'login' | 'desafio' | 'limite' }
  ```
  Cada método hace `page.evaluate(fetch(...))` contra la API web de Instagram con el header `x-ig-app-id` que usa la propia web, pasa la respuesta por `detectarBloqueo` y luego por el parser, y espera la pausa aleatoria de Global Constraints. Los endpoints exactos los descubre el constructor con el navegador real (el spec se los deja) y quedan documentados en `radar/README.md`.
- Produces (`bloqueo.ts`): `detectarBloqueo(r: { url: string; status: number; cuerpo: string }): BloqueoInstagram['tipo'] | null` — `login` si la URL final contiene `/accounts/login` o el cuerpo trae `"require_login":true`; `desafio` si `checkpoint_required`/`challenge`; `limite` si status 429 o `"Please wait a few minutes"`/`feedback_required`.
- Produces (`parsers.ts`): `parsearPerfil(json: unknown): CuentaPerfil`, `parsearReels(json: unknown, cuenta: string): ReelCrudo[]`, `parsearBusqueda(json: unknown): string[]`, `parsearComentarios(json: unknown): string[]`. Ante una forma desconocida, **tiran** `Error('forma inesperada: <endpoint>')` (fallar ruidoso, nunca datos a medias).

- [ ] **Step 1:** Escribir `cli.ts login`: abre el perfil persistente **visible** en `https://www.instagram.com/`, espera a que Julian inicie sesión (sondea que exista la cookie `sessionid`), imprime "Sesión lista" y cierra. Escribir `cli.ts capturar <usuario>`: abre headless, llama a cada endpoint una vez y guarda las respuestas crudas en `radar/instagram/fixtures/<endpoint>.json` **quitando** ids de sesión, csrf y cualquier dato de la cuenta de Julian.
- [ ] **Step 2 (con Julian):** Julian corre `node --import tsx radar/cli.ts login` e inicia sesión con la cuenta de Arc "Julian Parra". Luego el constructor corre `capturar` sobre 1 cuenta inmobiliaria AR pública y guarda las muestras. Expected: 5 archivos de muestra (perfil, reels, búsqueda, explorar, comentarios).
- [ ] **Step 3: Pruebas que fallan** en `parsers.test.ts` usando las muestras: `parsearPerfil` devuelve usuario/igUserId/seguidores reales de la muestra; `parsearReels` devuelve ≥ 1 reel con `vistas` numérico, `publicadoAt` ISO y `esReel:true`, y marca `esReel:false` en posts sin video; `parsearComentarios` devuelve textos no vacíos; un JSON `{}` hace tirar `forma inesperada`. En `bloqueo.test.ts`: los tres tipos + `null` para una respuesta normal + `login` para `url: 'https://www.instagram.com/accounts/login/?next=/'`.
- [ ] **Step 4:** Correr, FAIL. Implementar `parsers.ts` y `bloqueo.ts`. Correr, PASS.
- [ ] **Step 5:** Implementar `cliente.ts`. Verificación manual: `node --import tsx radar/cli.ts capturar <usuario>` de nuevo pasa por los parsers sin errores e imprime un resumen (seguidores, n reels, vistas del primero).
- [ ] **Step 6:** Commit `feat(radar): cliente de Instagram con la sesión del robot` (sin el perfil del navegador ni cookies: verificar con `git status` que `~/.radar-referencias` no está en el repo y que las muestras no contienen `sessionid`/`csrftoken`).

---

### Task 5: Filtro de relevancia (IA)

**Files:** Create `radar/ia/gemini.ts`, `radar/ia/clasificar.ts`, `radar/ia/clasificar.test.ts`

**Interfaces:**
- Produces (`gemini.ts`): `llamarGemini(opts: { system: string; partes: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>; json: true; timeoutMs: number; temperature?: number }): Promise<string>` — REST `generateContent`, `responseMimeType: 'application/json'`, `GEMINI_API_KEY` de `process.env`, modelo `process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash'`; tira con el mensaje de Gemini si no es 2xx.
- Produces (`clasificar.ts`): `promptClasificacion(ejemplosNoSirve: string[]): string`; `entradaClasificacion(reel: ReelCrudo, perfil: CuentaPerfil, comentarios: string[]): string`; `parsearClasificacion(texto: string): Clasificacion`; `clasificar(reel, perfil, comentarios, ejemplosNoSirve): Promise<Clasificacion>` (timeout 30 s).
- El prompt (en castellano) define las 4 categorías con ejemplos (inmobiliario_ar: noticias, impuestos, datos de mercado, créditos, normativa/gobierno, inmobiliarias/martilleros en Argentina; formato_otro_rubro: solo si el **formato** —animación explicativa, pizarra, gancho— se puede voltear al propietario; no_sirve: lifestyle, humor sin relación, moda, etc.), la escala de puntaje (utilidad para Diego: ¿se voltea al propietario?, ¿Diego lo puede grabar?) e incluye la lista `ejemplosNoSirve` como "esto el equipo marcó que NO sirve".

- [ ] **Step 1: Pruebas que fallan:** `parsearClasificacion` acepta un JSON válido y lo devuelve; tira ante texto no-JSON, ante `categoria` fuera del enum y ante `puntaje` fuera de 0–10; `promptClasificacion(['glow up de pelo'])` contiene `glow up de pelo`; `entradaClasificacion` incluye caption, cuenta, seguidores y hasta 10 comentarios.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Commit `feat(radar): filtro de relevancia con Gemini`.

---

### Task 6: Medios — bajar, comprimir, subir, retener

**Files:** Create `radar/medios.ts`, `radar/db.ts` (solo lo que usa medios por ahora: `supabaseAdmin()`)

**Interfaces:**
- Consumes: `InstagramCliente.cookiesNetscape` (Task 4).
- Produces: `bajarYSubir(shortcode: string, cookiesPath: string): Promise<{ videoPath: string; portadaPath: string | null; mp4Local: string }>` — `yt-dlp --cookies <cookiesPath> -f 'best[ext=mp4]/best' -o <tmp>` sobre `https://www.instagram.com/reel/<shortcode>/`; `ffmpeg -vf "scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)'" -c:v libx264 -crf 28 -preset veryfast -c:a aac -b:a 96k -movflags +faststart`; portada con `ffmpeg -ss 1 -frames:v 1` a JPEG; sube a `video-refs/radar/<shortcode>.mp4` y `video-refs/radar/<shortcode>.jpg` con `upsert: true`. Devuelve los paths del bucket y el mp4 comprimido local (para Task 7). Borra los temporales grandes.
- Produces: `limpiarRetencion(): Promise<number>` — borra del Storage `video_storage_path` de filas `fuente='radar'` con (`oculta=true` o `no_sirve_at is not null` o (`created_at < now()-120 días` y `estado_uso='sin_usar'`)) y pone `video_storage_path=null`; devuelve cuántos borró.
- `supabaseAdmin()` lee `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del `.env` del radar.

- [ ] **Step 1:** Implementar. Verificación manual con un shortcode real de las muestras: `node --import tsx -e "import('./radar/medios.ts').then(m=>m.bajarYSubir('<sc>', '<cookies>')).then(console.log)"`. Expected: paths devueltos, mp4 comprimido < 15 MB, objetos visibles en el bucket.
- [ ] **Step 2:** Commit `feat(radar): descarga, compresión y guardado de videos`.

---

### Task 7: Análisis a fondo del video (IA)

**Files:** Create `radar/ia/analizar.ts`, `radar/ia/analizar.test.ts`

**Interfaces:**
- Consumes: `llamarGemini` (Task 5), `Analisis` (Task 2).
- Produces: `promptAnalisis(): string`; `entradaAnalisis(reel: ReelCrudo & { multiplicador: number }, base: number, perfil: CuentaPerfil, comentarios: string[]): string`; `parsearAnalisis(texto: string): Analisis`; `analizar(mp4Local: string, ...entrada): Promise<Analisis>` — video inline (`video/mp4`, base64), timeout 120 s, temperatura 0,4.
- El prompt incluye `reglas` y `playbook` de `lib/guion/voz/` (solo para `adaptacion_diego`), pide citar comentarios **textuales** de los que se le pasan (nunca inventados) y citar el multiplicador y la base en `por_que`, y el ángulo de Diego "lo importante no es a cuánto vendés, es cuánto te queda en mano" cuando aplique.

- [ ] **Step 1: Pruebas que fallan:** `parsearAnalisis` acepta el JSON con los 7 campos; tira si falta alguno o viene vacío; `entradaAnalisis` incluye `×6,2`, la base formateada es-AR y los comentarios numerados.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Verificación manual sobre el mp4 de Task 6 Step 1: imprime un `Analisis` cuyo `gancho` describe lo que efectivamente pasa al inicio del video (mirarlo).
- [ ] **Step 4:** Commit `feat(radar): análisis del porqué con el video completo`.

---

### Task 8: Orquestador de la corrida

**Files:** Modify `radar/db.ts`, `radar/cli.ts`; Create `radar/correr.ts`, `radar/correr.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces (`db.ts`): `leerConfig(): Promise<ConfigRadar>`; `crearCorrida(version: string): Promise<string>`; `cerrarCorrida(id, estado, paso, contadores, mensaje)`; `yaCorrioHoy(): Promise<boolean>` (hay corrida `ok`/`parcial` con `inicio` hoy en Buenos Aires); `cuentasParaRevisar(tope: number): Promise<string[]>` (activas, `ultima_revision_at` más vieja primero, semillas e inmobiliarias primero); `registrarCuentas(usuarios: string[], origen)`; `actualizarCuenta(usuario, perfil, medicion)`; `vistos(shortcodes: string[]): Promise<Set<string>>`; `marcarVisto(...)`; `semanaPublicada(): Promise<{inmobiliarias:number; otras:number}>`; `ejemplosNoSirve(n=20): Promise<string[]>` (`tema` + `no_sirve_motivo` de las últimas descartadas a mano); `upsertVideoRef(fila)` (`onConflict: 'ig_shortcode'`; si existe, solo actualiza métricas).
- Produces (`correr.ts`): `correr(opts: { seco: boolean; forzar: boolean }): Promise<{ estado: string; publicadas: number }>`.
- Orden: candado (`~/.radar-referencias/radar.lock` con pid; si el pid vive, salir) → `yaCorrioHoy` (salir salvo `forzar`) → `crearCorrida` → abrir cliente → **descubrir** (búsquedas activas: hasta 5 cuentas nuevas por término, máximo 6 términos por corrida rotando; explorar: 30 reels → sus cuentas) → **medir** (`cuentasParaRevisar(topeCuentas)`, `reelsDeCuenta(base)`, `medirCuenta`, cortar al llegar a `topeReels`) → candidatos no vistos → comentarios (20) + `clasificar` → `elegirPublicables` → por cada uno `bajarYSubir` + `analizar` + `armarFilaVideoRef` + `upsertVideoRef` + `marcarVisto('publicado')` → `limpiarRetencion` → `cerrarCorrida('ok' | 'parcial' si hubo errores de reel)`. `BloqueoInstagram` en cualquier punto → `cerrarCorrida('frenada_por_instagram' | 'error' si tipo login, paso, mensaje)`. Cualquier otra excepción → `error` con el paso. Siempre se cierra el navegador y se libera el candado (`finally`). En `seco`, nada de escrituras en Supabase ni subidas: imprime lo que haría.
- Cuenta con 3 `descartes_manuales` → no vuelve a `cuentasParaRevisar` (lo garantiza la consulta).
- **Las que nunca rinden se dejan de revisar:** `actualizarCuenta` pone `activa=false` a una cuenta de origen `busqueda`/`explorar` con `veces_revisada >= 4` y `destacados = 0` (las `semilla` no se desactivan solas). Prueba (g) en `correr.test.ts`: la cuarta revisión sin destacados de una cuenta descubierta llama a `actualizarCuenta` con `activa:false`.

- [ ] **Step 1: Pruebas que fallan** en `correr.test.ts` con dobles de `InstagramCliente`, `db`, `medios` e `ia` (inyectados como parámetro `deps` de `correr`): (a) un `BloqueoInstagram('desafio')` en `reelsDeCuenta` cierra con `frenada_por_instagram` y no llama a `clasificar` de nuevo; (b) un error de Gemini en un reel marca ese reel `error` y la corrida termina `parcial` con los demás publicados; (c) `yaCorrioHoy=true` sin `forzar` → no abre el navegador; (d) un reel ya en `vistos` no se clasifica; (e) en `seco` no se llama a `upsertVideoRef` ni `bajarYSubir`; (f) el navegador se cierra aunque falle.
- [ ] **Step 2:** FAIL → implementar (`correr(opts, deps = depsReales())`) → PASS.
- [ ] **Step 3:** `cli.ts correr [--seco] [--forzar]` registra la salida en `~/.radar-referencias/logs/AAAA-MM-DD.log`.
- [ ] **Step 4:** Commit `feat(radar): corrida diaria completa`.

---

### Task 9: Programación con launchd y clon propio

**Files:** Create `radar/launchd/ar.inmodf.radar-referencias.plist.tpl`, `radar/correr-diario.sh`; Modify `radar/cli.ts` (`instalar`, `desinstalar`), `radar/README.md`

**Interfaces:**
- `radar instalar`: si no existe, `git clone` del repo en `~/.radar-referencias/app` (rama `main`), `npm ci --omit=dev` + `npx playwright install chromium` ahí, copia `~/.radar-referencias/.env` de ejemplo si falta (claves: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`), escribe el plist en `~/Library/LaunchAgents/ar.inmodf.radar-referencias.plist` con `StartCalendarInterval` Hour 8 Minute 0 y `RunAtLoad false`, y `launchctl bootstrap gui/$UID`.
- `correr-diario.sh`: `cd ~/.radar-referencias/app && git fetch origin main && git merge --ff-only origin/main || echo "no pude actualizar, sigo con $(git rev-parse --short HEAD)"`, luego `npm ci` solo si cambió `package-lock.json`, luego `node --env-file=../.env --import tsx radar/cli.ts correr`. La versión (`git rev-parse --short HEAD`) se pasa a `crearCorrida`.
- Al despertar la Mac después de las 8:00, launchd dispara la corrida perdida (comportamiento estándar de `StartCalendarInterval`); `yaCorrioHoy` evita la doble.
- Nota: `@playwright/test` es devDependency → mover `playwright` (o `@playwright/test`) a `dependencies` o instalar con `npm ci` completo en el clon; elegir `npm ci` completo (más simple) y documentarlo.

- [ ] **Step 1:** Implementar. Verificación: `node --import tsx radar/cli.ts instalar` → `launchctl print gui/$UID/ar.inmodf.radar-referencias` muestra el job; `launchctl kickstart gui/$UID/ar.inmodf.radar-referencias` arranca una corrida y deja log.
- [ ] **Step 2:** `desinstalar` hace `bootout` y borra el plist (no toca el perfil ni `.env`). Verificar.
- [ ] **Step 3:** Commit `feat(radar): corrida diaria programada en la Mac`.

---

### Task 10: Plataforma — lectura, video, "No sirve", estado del radar

**Files:**
- Modify: `app/api/video-refs/route.ts`, `lib/video-refs/repo.ts`, `app/(dashboard)/referencias/grilla.tsx`, `app/(dashboard)/referencias/detalle.tsx`, `app/(dashboard)/referencias/page.tsx`
- Create: `app/api/video-refs/[id]/no-sirve/route.ts`, `app/api/video-refs/route.test.ts`, `lib/video-refs/estado-radar.ts`, `lib/video-refs/estado-radar.test.ts`

**Interfaces:**
- `GET /api/video-refs?archivo=1` → `{ refs: Array<VideoRef & { video_url: string | null; portada_url: string | null }>, radar: EstadoRadar }`. Sin `archivo`: `fuente='radar' AND oculta=false`; con `archivo=1`: `fuente='openclaw'`. URLs firmadas (1 h) con `storage.from('video-refs').createSignedUrls` en un solo llamado; si `portada_storage_path` es null, `portada_url = thumbnail_url`.
- `lib/video-refs/estado-radar.ts`: `type EstadoRadar = { ultima: { inicio: string; estado: string; cuentas: number; reels: number; publicadas: number; mensaje: string | null } | null; alerta: null | 'sin_corridas' | 'atrasado' | 'frenado' | 'error' }`; `calcularEstadoRadar(ultimaOk: Fila | null, ultima: Fila | null, ahora: Date): EstadoRadar` — `atrasado` si la última `ok/parcial` tiene > 36 h; `frenado`/`error` si la última corrida terminó así.
- `POST /api/video-refs/[id]/no-sirve` body `{ motivo?: string }` (≤ 300 chars) → `oculta=true, no_sirve_at=now(), no_sirve_motivo`, y `radar_cuentas.descartes_manuales += 1` de esa cuenta; si llega a 3, `activa=false`. Requiere `getUser()`; 404 si no existe.
- Pantalla (ver boceto del spec §8): cartel de estado arriba (verde "Última búsqueda: hoy 08:12 · 280 reels de 24 cuentas · 7 nuevas"; ámbar con el texto de la alerta: "El radar no corre desde el martes" / "Instagram frenó la búsqueda de hoy" / "La búsqueda de hoy falló: <mensaje>"); filtros Hoy/Semana/Todas + Inmobiliario/Otros formatos (`categoria`) + Tema (`tema_categoria`) + enlace "Archivo anterior"; tarjeta con portada, ×N, vistas, comentarios, cuenta, fecha y `formato` en una línea; detalle con `<video controls playsInline preload="metadata">` desde `video_url` (si no hay, la portada + "Ver en Instagram"), bloques "Por qué funcionó", "El gancho", "El formato", "Qué dicen los comentarios", "Cómo lo haría Diego", la línea de origen de la cifra ("×6,2 sobre la mediana de 45 mil de @cuenta", desde `baseline_cuenta`), botón "Guionizar en la voz de Diego" (sin cambios) y botón "No sirve" con campo de motivo opcional.

- [ ] **Step 1: Pruebas que fallan:** `calcularEstadoRadar` (sin filas → `sin_corridas`; ok hace 2 h → `null`; ok hace 37 h → `atrasado`; última `frenada_por_instagram` → `frenado`). `route.test.ts` (mockeando supabase como en `app/api/video-refs/guionizar/route.test.ts`): 401 sin sesión; sin `archivo` filtra `fuente='radar'` y `oculta=false`; la respuesta trae `video_url` firmada.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Implementar pantalla y `no-sirve`. `npx tsc --noEmit -p tsconfig.radar.json` sin errores.
- [ ] **Step 4:** Commit `feat(referencias): video adentro, porqué completo, "No sirve" y estado del radar`.

---

### Task 11: Guionizado con los campos nuevos + vigilante

**Files:**
- Modify: `lib/video-refs/guionizar.ts`, `lib/video-refs/guionizar.test.ts`
- Create: `app/api/cron/radar-watchdog/route.ts`, `supabase/migrations/20261128000002_cron_radar_watchdog.sql`, `scripts/apply-cron-radar-watchdog-pg.ts`

**Interfaces:**
- `guionizarReferencia` agrega a `referencia`, solo si existen: `Formato: …`, `Qué dicen los comentarios: …`, `Transcripción del original: …` (recortada a 2.000 chars).
- `POST /api/cron/radar-watchdog` (auth `x-cron-secret` igual que `guionizar-refs-pendientes`; `GET ?ping=1`): calcula `calcularEstadoRadar`; si hay alerta y no se avisó por ese incidente (para `frenado`/`error`: `notificada_at is null` en esa corrida; para `atrasado`/`sin_corridas`: clave `radar_config('ultimo_aviso_atraso')` con más de 24 h), manda **un** email con `sendEmail` a `EMAIL_ALERTAS_RADAR` (env; default el `EMAIL_REPLY_TO`) con asunto "Radar de referencias: <alerta>" y el paso/mensaje, y marca el aviso. Job `pg_cron` `radar-watchdog` cada hora (`17 * * * *`), mismo patrón y secreto que `scripts/apply-cron-guionizar-refs-pendientes-pg.ts` (secreto de `cron_config('send_report')`, dominio del job `meta-sync`, verificar `?ping=1` antes de programar).

- [ ] **Step 1: Pruebas que fallan:** `guionizar.test.ts` — una fila vieja (campos nuevos `null`) produce exactamente el mismo cuerpo de pedido que hoy; una fila con `formato` incluye `Formato:`; la transcripción se recorta a 2.000.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Implementar la ruta del vigilante con prueba de la deduplicación (dos llamadas seguidas con la misma corrida frenada → un solo `sendEmail`).
- [ ] **Step 4:** Commit `feat(referencias): guion con formato y comentarios; vigilante del radar`. (El job se programa en Task 13, después del deploy.)

---

### Task 12: Retirar a Bruno de Referencias + semilla de cuentas + documentación

**Files:**
- Modify (fuera del repo): `~/.openclaw/workspace/diego-data/bruno/METODO-BRUNO.md`; mover a `~/.openclaw/workspace/diego-data/_retirado/`: `bruno/bruno_video_refs.py`, `formatos/sync_video_refs.py`, `formatos/backfill_video_refs.py`, `formatos/thumbs_video_refs.py`, `formatos/video_refs_parse.py`
- Create: `scripts/seed-radar-cuentas.ts`
- Modify: `CLAUDE.md` (sección nueva "Radar de referencias de Instagram")

- [ ] **Step 1 (ANTES de Task 1 Step 3):** Borrar del `METODO-BRUNO.md` la sección "Al cerrar una ficha nueva" (subida a la plataforma) y agregar una línea: "Desde 2026-11-28 Referencias la alimenta el radar propio de la plataforma; Bruno NO sube nada a `video_refs`." Mover los 5 scripts. Verificar con `grep -rl video_refs ~/.openclaw/workspace/diego-data --include='*.py'` que solo quedan en `_retirado/` y que `_tools/check_avisos.py`/`notify_avisos.py` no se rompen (si los usan, quitar esa referencia y anotarlo).
- [ ] **Step 2:** `scripts/seed-radar-cuentas.ts`: inserta en `radar_cuentas` (`origen='semilla'`) las cuentas inmobiliarias argentinas que el constructor reúne con el navegador del robot (búsquedas de Task 1 + verificación de que publican reels y son de Argentina; objetivo ≥ 30) y, con `rubro='otro'`, las de `~/.openclaw/workspace/diego-data/formatos/_creadores-referencia.md` marcadas ⭐ que publiquen en Instagram. Idempotente (`on conflict do nothing`). Imprime la lista para que Julian la revise.
- [ ] **Step 3:** `CLAUDE.md`: qué es el radar, dónde corre (`~/.radar-referencias`, launchd 08:00), comandos, cómo diagnosticar (`radar_corridas`, logs, `launchctl print`), que la sesión se renueva con `radar login`, que Bruno ya no alimenta Referencias, y los endpoints de Instagram de `radar/README.md`.
- [ ] **Step 4:** Commit `chore(referencias): Bruno deja de alimentar Referencias; semilla y documentación del radar`.

---

### Task 13: Puesta en marcha y verificación de punta a punta

- [ ] **Step 1:** Abrir PR, esperar la vista previa de Netlify, QA de la pantalla con el navegador de Claude (estado del radar, filtros, detalle con video, "No sirve", "Archivo anterior", guionizar sigue andando sobre una fila vieja).
- [ ] **Step 2:** Merge a `main` (`gh pr merge`), esperar deploy, correr `scripts/apply-cron-radar-watchdog-pg.ts`. Verificar en `cron.job` y `net._http_response` un 200.
- [ ] **Step 3:** Julian agrega `GEMINI_API_KEY` a `~/.radar-referencias/.env`. `radar instalar`.
- [ ] **Step 4:** `radar correr --seco --forzar` con la cuenta real: revisar a mano los candidatos y su clasificación (¿son del rubro? ¿≥ 80 % inmobiliario?). Ajustar prompt/semilla si hace falta.
- [ ] **Step 5:** `radar correr --forzar`: verificar en `radar_corridas` estado `ok`, en `video_refs` las filas nuevas con video, y en la pantalla de producción que se reproducen.
- [ ] **Step 6:** Al día siguiente: confirmar que launchd corrió solo a las 08:00 (`radar_corridas`).
