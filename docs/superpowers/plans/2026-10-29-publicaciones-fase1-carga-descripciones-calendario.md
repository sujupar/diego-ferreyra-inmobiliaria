# Publicaciones — Fase 1: carga, descripciones y calendario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sección `/publicaciones` donde se suben videos desde la computadora, cada uno sale con transcripción con tiempos y descripción al estilo de Diego, se elige un ritmo, se revisa/edita el calendario y se confirma — todo guardado solo. En esta fase NADA se publica (fases 2–4).

**Architecture:** reglas puras en `lib/publicaciones/` (calendario, límites de texto, estados, envíos) con tests; rutas finas en `app/api/publicaciones/**` con `contenidoAuth` + Zod; el trabajo pesado se parte en UNA etapa por request (transcribir, describir, cada lote de aprender estilo) y el cliente loopea. Miniatura y audio se extraen en el navegador. Datos en 5 tablas nuevas + bucket público `contenido-videos`.

**Tech Stack:** Next.js 16 / React 19 / TS estricto, Supabase (pg + Storage), OpenAI (`whisper-1` transcripción, `gpt-4.1` vía `openaiText` de `lib/social/openai.ts`), Meta Graph v21 (lectura de captions), framer-motion, @dnd-kit, shadcn/ui, vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-publicacion-masiva-contenido-design.md`

## Global Constraints

- Roles: admin, dueno, coordinador (`contenidoAuth` de `lib/contenido/route-auth.ts`); asesor/abogado → 403.
- Zona horaria: Argentina, **UTC−3 fijo** (sin horario de verano desde 2009). Todo instante se guarda en UTC (`timestamptz`).
- Horarios por defecto: 1/día `19:00` · 2/día `12:30`,`19:00` · 3/día `09:00`,`13:00`,`19:00` · 1/semana `19:00` el mismo día de semana que la fecha de inicio. "Todos ya": ahora+5 min y luego cada 10 min.
- Inicio por defecto: mañana (fecha argentina).
- Video: mp4/mov, **máx. 200 MB**. Concurrencia de preparación en el navegador: **2 videos**.
- Límites de texto: descripción 2.200 caracteres; máx. 30 hashtags; título YouTube 100 caracteres, sin `<` ni `>`.
- Autoguardado: debounce **800 ms**.
- Una llamada de IA por request (regla dura de CLAUDE.md). Respuestas en el cliente con `readJson` tolerante a HTML (patrón `components/properties/LandingSection.tsx:61`).
- Textos de UI en castellano rioplatense, errores legibles (nunca el error crudo).
- Commits autor `Sujupar <redstyle50@gmail.com>`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verificar con config acotada: `npx vitest run --config vitest.publicaciones.config.ts` y `npx tsc --noEmit -p tsconfig.publicaciones.json`.

## Review Focus

1. **El mismo archivo elegido dos veces** en una tanda (mismo nombre + tamaño) → no se duplica; la segunda vez se avisa "ya está en la tanda". Test en Task 7 (`detectarDuplicados`).
2. **Video sin voz** (solo música) → transcripción vacía; no se inventa descripción: queda `listo` con descripción vacía y aviso "Sin voz: escribí la descripción". Test en Task 6.
3. **La persona edita la descripción mientras la IA todavía la está escribiendo** → la IA no pisa lo editado (`descripcion_editada = true` gana). Test en Task 6.
4. **Inicio hoy con horarios ya pasados / cerca de medianoche** → no se programa nada en el pasado; el primer horario válido es el siguiente. Test en Task 2.
5. **Doble clic en "Programar"** → no se duplican envíos (UNIQUE `(video_id, plataforma)` + upsert `ignoreDuplicates`). Test en Task 5 (`sincronizarEnvios`) + verificación SQL en Task 1.

---

## File Structure

```
supabase/migrations/20261029000010_publicaciones.sql     tablas + bucket + RLS
scripts/apply-publicaciones-pg.ts                         aplica y verifica
vitest.publicaciones.config.ts / tsconfig.publicaciones.json
lib/publicaciones/
  tipos.ts            tipos de filas y enums (Plataforma, EtapaPreparacion, EstadoEnvio)
  calendario.ts(+test) ritmos → instantes; resumen en frase; reasignar al reordenar
  textos.ts(+test)     límites por red, ajuste y validación (teléfonos/precios inventados)
  preparacion.ts(+test) máquina de etapas de preparación de un video
  envios.ts(+test)     sincronizar envíos con los íconos encendidos
  validacion.ts(+test) esquemas Zod de las rutas + esRutaPropia + detectarDuplicados
  estilo.ts(+test)     armar lotes de clasificación, elegir 100, prompts del documento
  wav.ts(+test)        Float32Array mono → WAV 16 kHz PCM16
  db.ts               cliente service-role sin genérico (patrón lib/contenido/db.ts)
  servidor/transcribir.ts   whisper-1 verbose_json → segmentos
  servidor/describir.ts     transcripción + documento → {descripcion, titulo_youtube}
  servidor/estilo.ts        etapas leer / clasificar / redactar
  navegador/medios.ts       extraerMiniatura, extraerAudio (DOM, sin test unitario)
app/api/publicaciones/
  tandas/route.ts                     GET (borradores+confirmadas) · POST crear
  tandas/[id]/route.ts                GET detalle · PATCH ritmo/inicio/soloHabiles · DELETE borrador
  tandas/[id]/videos/route.ts         POST alta de N videos (devuelve URLs firmadas)
  tandas/[id]/calendario/route.ts     POST aplicar ritmo a los videos
  tandas/[id]/confirmar/route.ts      POST → confirmada + envíos
  videos/[id]/route.ts                PATCH campos editables · DELETE
  videos/[id]/archivos/route.ts       POST URL firmada para miniatura/audio
  videos/[id]/preparar/route.ts       POST avanza UNA etapa
  programado/route.ts                 GET videos confirmados con envíos
  ajustes/route.ts                    GET · PATCH (interruptor solo admin/dueno, horarios, documento)
  estilo/aprender/route.ts            POST avanza UNA etapa de aprender estilo
app/(dashboard)/publicaciones/page.tsx
components/publicaciones/
  PublicacionesClient.tsx   pestañas Nueva tanda / Programado / Publicado + botón Ajustes
  leer-json.ts              readJson tolerante
  useAutoguardado.ts        debounce 800 ms por video
  useColaPreparacion.ts     cola de 2 en paralelo, loop de /preparar
  PasoCargar.tsx · FilaVideo.tsx
  PasoRitmo.tsx            tarjetas animadas + frase + mini-calendario
  PasoRevisar.tsx · FilaRevision.tsx · IconosRedes.tsx
  PestanaProgramado.tsx · PestanaPublicado.tsx (vacío en fase 1)
  PanelAjustes.tsx         interruptor, horarios, documento de estilo + "Volver a aprender"
lib/nav/sections.ts (+test)  entrada PUBLICACIONES en Marketing
```

---

### Task 1: Base de datos, bucket y verificación

**Files:**
- Create: `supabase/migrations/20261029000010_publicaciones.sql`, `scripts/apply-publicaciones-pg.ts`, `vitest.publicaciones.config.ts`, `tsconfig.publicaciones.json`

**Interfaces:**
- Produces (tablas):
  - `publicacion_tandas(id uuid pk default gen_random_uuid(), estado text check in ('borrador','confirmada') default 'borrador', ritmo jsonb null, inicio date null, solo_habiles bool default false, creada_por uuid references profiles(id) on delete set null, created_at, updated_at)`
  - `publicacion_videos(id uuid pk, tanda_id uuid not null references publicacion_tandas on delete cascade, orden int not null, origen text check in ('subida','drive') default 'subida', drive_file_id text null, nombre_archivo text not null, tamano_bytes bigint not null, video_path text null, miniatura_path text null, audio_path text null, duracion_seg numeric null, etapa text not null default 'subiendo' check in ('subiendo','extrayendo','transcribiendo','describiendo','listo','error'), error_etapa text null, ultimo_error text null, transcripcion jsonb null /* [{inicio,fin,texto}] */, descripcion text not null default '', descripcion_editada bool default false, titulo_youtube text not null default '', redes text[] not null default '{instagram,facebook,youtube,tiktok}', programado_para timestamptz null, hora_manual bool default false, pausado bool default false, created_at, updated_at)`; check `tamano_bytes <= 209715200`; check `redes <@ '{instagram,facebook,youtube,tiktok}'`.
  - `publicacion_envios(id uuid pk, video_id uuid not null references publicacion_videos on delete cascade, plataforma text not null check in ('instagram','facebook','youtube','tiktok'), estado text not null default 'programado' check in ('programado','en_curso','publicado','fallido','cancelado'), etapa text null, ids_externos jsonb default '{}', enlace text null, intentos int default 0, proximo_intento timestamptz null, ultimo_error text null, created_at, updated_at, unique(video_id, plataforma))`
  - `publicacion_conexiones(plataforma text pk, cuenta text, tokens jsonb, conectada_por uuid references profiles(id) on delete set null, updated_at)` — RLS habilitada **sin ninguna política**.
  - `publicacion_ajustes(id bool pk default true check (id), publicacion_automatica bool not null default false, horarios jsonb not null default '{"1":["19:00"],"2":["12:30","19:00"],"3":["09:00","13:00","19:00"],"semana":["19:00"]}', estilo jsonb not null default '{"etapa":"sin_aprender"}', updated_at)` + insert de la fila única.
  - RLS: `select` para `is_operations_user()` en tandas/videos/envios/ajustes; ninguna política de escritura (todo por service role).
  - Trigger `updated_at` con la función ya existente del repo si la hay (`grep -rn "set_updated_at\|update_updated_at" supabase/migrations | head`); si no, una propia `publicacion_touch_updated_at()` BEFORE UPDATE (solo modifica NEW, no escribe otra tabla).
  - Bucket `contenido-videos`: `public=true`, `file_size_limit=209715200`, `allowed_mime_types={video/mp4,video/quicktime,audio/wav,image/jpeg}`, con `insert ... on conflict (id) do update`.

- [ ] **Step 1:** Mirar `ls supabase/migrations | tail` en `origin/main` y confirmar que `20261029000010` no existe.
- [ ] **Step 2:** Escribir la migración (idempotente: `create table if not exists`, `drop policy if exists`).
- [ ] **Step 3:** Escribir `scripts/apply-publicaciones-pg.ts` (patrón `scripts/apply-cron-reels-pg.ts`: pooler, `SUPABASE_DB_PASSWORD`) que corre el SQL y luego verifica y **aborta** si: falta alguna de las 5 tablas, `publicacion_ajustes` no tiene exactamente 1 fila con `publicacion_automatica=false`, `publicacion_conexiones` tiene alguna política, el bucket no es público o su límite ≠ 209715200, o un insert duplicado de `(video_id, plataforma)` dentro de una transacción con ROLLBACK no da `23505`.
- [ ] **Step 4:** Correr `node --env-file=../../../.env.local --import tsx scripts/apply-publicaciones-pg.ts` → esperado: "OK publicaciones" y cada verificación en verde.
- [ ] **Step 5:** Crear `vitest.publicaciones.config.ts` (copia de `vitest.reels.config.ts` con include `lib/publicaciones/**/*.test.ts`, `lib/nav/**/*.test.ts`) y `tsconfig.publicaciones.json` (patrón `tsconfig.difusion.json`, include `lib/publicaciones/**`, `app/api/publicaciones/**`, `app/(dashboard)/publicaciones/**`, `components/publicaciones/**`, `lib/nav/sections.ts`, `lib/social/openai.ts`, `lib/contenido/route-auth.ts`).
- [ ] **Step 6: Commit** `feat(publicaciones): tablas, bucket y script de verificación`.

### Task 2: Calendario (`lib/publicaciones/calendario.ts`)

**Interfaces:**
- Produces:
```ts
export type Ritmo =
  | { tipo: 'todos_ya' }
  | { tipo: 'por_dia'; cantidad: 1 | 2 | 3 }
  | { tipo: 'por_semana' }
  | { tipo: 'personalizado'; porDia: number; dias: DiaSemana[]; horarios: string[] }
export type DiaSemana = 0|1|2|3|4|5|6            // 0 = domingo
export interface HorariosPorDefecto { '1': string[]; '2': string[]; '3': string[]; semana: string[] }
export interface OpcionesCalendario { ritmo: Ritmo; inicio: string /* YYYY-MM-DD AR */; soloHabiles: boolean; horarios: HorariosPorDefecto; ahora: Date }
export function armarCalendario(cantidad: number, op: OpcionesCalendario): Date[]
export function fraseCalendario(fechas: Date[], ritmo: Ritmo): string
export function reasignarHorarios<T extends { id: string; programado_para: string | null; hora_manual: boolean }>(ordenados: T[]): T[]
export function mananaEnArgentina(ahora: Date): string
export function aHoraArgentina(d: Date): { fecha: string; hora: string; diaSemana: DiaSemana }
```

- [ ] **Step 1: Tests** (`calendario.test.ts`), uno por `it`:
  - `'1 por día desde el jueves 2026-10-30 da 19:00 AR (22:00 UTC) cada día'` → 3 videos → `2026-10-30T22:00Z`, `2026-10-31T22:00Z`, `2026-11-01T22:00Z`.
  - `'2 por día reparte 12:30 y 19:00'` → 6 videos desde jueves 30/10 → jue 15:30Z, jue 22:00Z, vie…, sáb 22:00Z.
  - `'solo días hábiles salta sábado y domingo'` → 1/día, 3 videos desde vie 31/10 → vie 31, lun 3/11, mar 4/11.
  - `'1 por semana usa el día de semana del inicio'` → 3 desde jue 30/10 → 30/10, 6/11, 13/11 a 22:00Z.
  - `'todos ya escalona cada 10 minutos desde ahora+5'` → ahora 2026-10-29T15:00Z, 3 → 15:05, 15:15, 15:25.
  - `'inicio hoy con horario pasado empieza en el siguiente'` → ahora = 2026-10-30T23:00Z (20:00 AR), inicio 2026-10-30, 2/día → primero 2026-10-31T15:30Z.
  - `'personalizado lunes y miércoles a las 10:00 y 18:00'`.
  - `'cantidad 0 devuelve lista vacía'`; `'horario inválido "25:00" lanza error'`.
  - `fraseCalendario`: 20 videos 1/día desde jue 30/10 → `'20 videos, 1 por día a las 19:00 → del jueves 30/10 al martes 18/11'`.
  - `reasignarHorarios`: 3 videos con horas A<B<C, se mueve el 3º al principio → recibe A, los otros B y C; uno con `hora_manual` conserva su hora y no consume horario.
  - `mananaEnArgentina(2026-10-30T02:30Z)` (= 29/10 23:30 AR) → `'2026-10-30'`.
- [ ] **Step 2:** Correr → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar. Fechas AR con offset fijo `-03:00` (`new Date(\`${fecha}T${hora}:00-03:00\`)`); avanzar día a día desde `inicio`, saltando días fuera de `dias`/fin de semana, y descartando instantes `<= ahora`.
- [ ] **Step 4:** Correr → PASS. **Step 5: Commit** `feat(publicaciones): calendario de publicación por ritmo`.

### Task 3: Límites de texto (`lib/publicaciones/textos.ts`)

**Interfaces:**
- Produces:
```ts
export const LIMITES = { descripcion: 2200, hashtags: 30, tituloYoutube: 100 } as const
export function ajustarDescripcion(texto: string): string        // NFC, recorta por frase a 2200, deja solo los primeros 30 hashtags
export function ajustarTituloYoutube(texto: string): string      // quita < >, colapsa espacios, recorta a 100 por palabra
export function problemasDeTexto(descripcion: string, transcripcion: string): string[]  // teléfonos o precios que NO aparecen en la transcripción
```
- [ ] **Step 1: Tests**: recorte de 2.500 caracteres cae en límite de frase ≤2200; 35 hashtags → 30 (se conservan los primeros); título con `<b>` → sin `<>`; título de 120 → ≤100 sin cortar palabra; `'U$D 150.000'` en descripción y no en transcripción → problema `'precio que no dijo Diego: U$D 150.000'`; mismo precio presente en la transcripción → sin problemas; teléfono `11 5555-1234` inventado → problema; texto en NFD (`'tasación'`) sale NFC.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS. **Step 5: Commit** `feat(publicaciones): límites de descripción y título`.

### Task 4: Tipos y máquina de preparación (`tipos.ts`, `preparacion.ts`)

**Interfaces:**
- Produces:
```ts
// tipos.ts
export const PLATAFORMAS = ['instagram','facebook','youtube','tiktok'] as const
export type Plataforma = typeof PLATAFORMAS[number]
export type EtapaPreparacion = 'subiendo'|'extrayendo'|'transcribiendo'|'describiendo'|'listo'|'error'
export type EstadoEnvio = 'programado'|'en_curso'|'publicado'|'fallido'|'cancelado'
export interface Segmento { inicio: number; fin: number; texto: string }
export interface VideoFila { /* columnas de publicacion_videos, snake_case */ }
export interface EnvioFila { /* columnas de publicacion_envios */ }
// preparacion.ts
export type AccionPreparacion = 'esperar_navegador' | 'transcribir' | 'describir' | 'nada'
export function siguienteAccion(v: Pick<VideoFila,'etapa'|'video_path'|'audio_path'|'miniatura_path'>): AccionPreparacion
export function etiquetaEtapa(etapa: EtapaPreparacion, progresoSubida?: number): string   // 'Subiendo 42 %', 'Escuchando el audio', 'Escribiendo la descripción', 'Listo', 'No se pudo …'
export function reintentar(v: Pick<VideoFila,'etapa'|'error_etapa'>): EtapaPreparacion      // vuelve a error_etapa
```
- [ ] **Step 1: Tests**: `subiendo`/`extrayendo` → `esperar_navegador`; `transcribiendo` sin `audio_path` → `esperar_navegador`; `transcribiendo` con audio → `transcribir`; `describiendo` → `describir`; `listo`/`error` → `nada`; etiquetas exactas de arriba; `reintentar` de `error` con `error_etapa='transcribiendo'` → `'transcribiendo'`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5: Commit** `feat(publicaciones): etapas de preparación de un video`.

### Task 5: Envíos (`lib/publicaciones/envios.ts`)

**Interfaces:**
- Produces:
```ts
export function sincronizarEnvios(redes: Plataforma[], actuales: Pick<EnvioFila,'plataforma'|'estado'>[]):
  { crear: Plataforma[]; cancelar: Plataforma[]; reactivar: Plataforma[] }
```
Reglas: red encendida sin envío → crear; encendida con envío `cancelado` → reactivar; apagada con envío `programado` → cancelar; envíos `en_curso`/`publicado`/`fallido` nunca se tocan.
- [ ] **Step 1: Tests**: un caso por regla + `'confirmar dos veces no crea nada nuevo'` (redes = actuales todos programados → todo vacío) + `'apagar una red ya publicada no la cancela'`.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(publicaciones): sincronización de envíos con las redes encendidas`.

### Task 6: Servidor — transcribir y describir (una etapa por llamada)

**Files:** `lib/publicaciones/db.ts`, `lib/publicaciones/servidor/transcribir.ts`, `servidor/describir.ts` (+ `describir.test.ts` de las partes puras), `app/api/publicaciones/videos/[id]/preparar/route.ts`

**Interfaces:**
- Consumes: `siguienteAccion`, `ajustarDescripcion`, `ajustarTituloYoutube`, `problemasDeTexto`, `openaiText` (`lib/social/openai.ts`).
- Produces:
```ts
export function publicacionesDb(): SupabaseClient                         // db.ts
export function segmentosDeWhisper(json: unknown): Segmento[]             // transcribir.ts, puro
export async function transcribirAudio(wav: Blob): Promise<Segmento[]>    // whisper-1, response_format=verbose_json, timestamp_granularities[]=segment, language=es
export function promptDescripcion(segmentos: Segmento[], guia: string, ejemplos: string[]): { system: string; user: string }   // usa como mucho 30 ejemplos
export function aplicarResultadoDescripcion(video: Pick<VideoFila,'descripcion'|'descripcion_editada'|'titulo_youtube'>, ia: { descripcion: string; titulo_youtube: string }): { descripcion: string; titulo_youtube: string }
export async function avanzarPreparacion(videoId: string): Promise<VideoFila>   // UNA etapa
```
- Ruta `POST /api/publicaciones/videos/[id]/preparar`: `contenidoAuth` → `avanzarPreparacion` → `{ video }`. `transcribir`: baja `audio_path` del bucket, transcribe, guarda `transcripcion`, pasa a `describiendo`. `describir`: si la transcripción no tiene texto → `listo` con descripción vacía y `ultimo_error='sin_voz'` (la UI muestra "Sin voz: escribí la descripción"); si no, `openaiText` con schema `{descripcion, titulo_youtube}`; si `problemasDeTexto` no está vacío, se quita la frase problemática (no se reintenta la IA en el mismo request); `aplicarResultadoDescripcion` respeta `descripcion_editada`. Sin documento de estilo aprendido → 409 `{ error: 'Primero aprendé el estilo en Ajustes' }`. Cualquier excepción → `etapa='error'`, `error_etapa`=la etapa en curso, `ultimo_error` legible.
- [ ] **Step 1: Tests**: `segmentosDeWhisper` con un JSON real de muestra (2 segmentos) → `[{inicio:0,fin:3.2,texto:'…'}]`; JSON sin `segments` → `[]`; `aplicarResultadoDescripcion` con `descripcion_editada=true` conserva la descripción y SÍ completa el título si estaba vacío; `promptDescripcion` con 100 ejemplos incluye 30.
- [ ] **Step 2–4.** **Step 5:** sondeo real `scripts/_qa-transcribir.ts` (sin commitear) con un WAV de 10 s → imprime segmentos y tiempo (< 10 s). **Step 6: Commit** `feat(publicaciones): transcripción y descripción por etapas`.

### Task 7: Rutas de tandas y videos

**Files:** `lib/publicaciones/validacion.ts` (+test) y las rutas `tandas/**`, `videos/[id]/route.ts`, `videos/[id]/archivos/route.ts`, `programado/route.ts`.

**Interfaces:**
- Produces:
```ts
export const altaVideosSchema    // { archivos: {nombre:string, tamano:number<=209715200, tipo:'video/mp4'|'video/quicktime'}[] (1..50) }
export const patchVideoSchema    // .strict(): descripcion?, titulo_youtube?, redes?: Plataforma[], programado_para?: iso, hora_manual?, orden?, pausado?, etapa?: 'transcribiendo' (solo desde 'extrayendo'), duracion_seg?, miniatura_path?, audio_path?, video_path?
export const patchTandaSchema    // { ritmo?: Ritmo, inicio?: 'YYYY-MM-DD', solo_habiles?: boolean }
export function esRutaPropia(path: string, tandaId: string, videoId: string): boolean   // empieza EXACTO con `tandas/${tandaId}/${videoId}/` y sin '..'
export function detectarDuplicados(existentes: {nombre_archivo:string; tamano_bytes:number}[], nuevos: {nombre:string; tamano:number}[]): { nuevos: typeof nuevos; repetidos: string[] }
```
- Comportamiento de rutas:
  - `POST tandas/[id]/videos`: filtra repetidos, inserta filas (`etapa='subiendo'`, `orden` correlativo), devuelve `{ videos: [{id, signedUrl, token, path}], repetidos }` con `createSignedUploadUrl` en `tandas/{tanda}/{video}/video.{mp4|mov}`.
  - `POST videos/[id]/archivos {kind:'miniatura'|'audio'}` → URL firmada a `…/miniatura.jpg` o `…/audio.wav`.
  - `PATCH videos/[id]`: valida con `patchVideoSchema`, rechaza paths que no pasen `esRutaPropia`; si viene `descripcion`, setea `descripcion_editada=true` y aplica `ajustarDescripcion`; si la tanda está confirmada y vienen `redes`, aplica `sincronizarEnvios` (crear/reactivar/cancelar).
  - `POST tandas/[id]/calendario`: lee videos por `orden`, `armarCalendario`, escribe `programado_para` a los que no tienen `hora_manual`.
  - `POST tandas/[id]/confirmar`: 409 si algún video no está `listo` o no tiene `programado_para`; si no, `estado='confirmada'` y upsert de envíos `onConflict:'video_id,plataforma', ignoreDuplicates:true`.
  - `DELETE videos/[id]`: borra fila y sus 3 objetos de Storage; 409 si tiene envíos `en_curso`/`publicado`.
  - `GET programado`: videos de tandas confirmadas con `programado_para >= now() - 1 day`, con envíos, ordenados.
- [ ] **Step 1: Tests** de `validacion.ts`: `esRutaPropia` acepta el prefijo exacto y rechaza otra tanda, `..`, prefijo sin la barra final (`tandas/A/B2/` para video `B`); `patchVideoSchema` rechaza un campo desconocido (`estado`) y 210 MB en el alta; `detectarDuplicados` marca mismo nombre+tamaño y deja pasar mismo nombre con otro tamaño.
- [ ] **Step 2–4.** **Step 5:** sondeo `scripts/_qa-rutas-publicaciones.ts` contra la base real: crea tanda `[TEST`, alta de 1 video, sube un mp4 chico, PATCH, confirma dos veces → 4 envíos (no 8), borra todo. **Step 6: Commit** `feat(publicaciones): rutas de tandas, videos y confirmación`.

### Task 8: Aprender el estilo

**Files:** `lib/publicaciones/estilo.ts` (+test), `servidor/estilo.ts`, `app/api/publicaciones/estilo/aprender/route.ts`, `app/api/publicaciones/ajustes/route.ts`

**Interfaces:**
- Consumes: `cuentaInstagram()` e `instagramFetch()` de `lib/integrations/instagram/client.ts`.
- Produces:
```ts
export type EstadoEstilo =
  | { etapa: 'sin_aprender' }
  | { etapa: 'clasificando'; candidatos: { id: string; caption: string; fecha: string }[]; cursor: number; elegidos: string[] }
  | { etapa: 'redactando'; ejemplos: { caption: string; fecha: string }[] }
  | { etapa: 'listo'; guia: string; ejemplos: { caption: string; fecha: string }[]; aprendido_en: string }
export const TAMANO_LOTE = 50
export const EJEMPLOS_OBJETIVO = 100
export function siguienteLote(e: Extract<EstadoEstilo,{etapa:'clasificando'}>): { id: string; caption: string }[]
export function aplicarClasificacion(e: Extract<EstadoEstilo,{etapa:'clasificando'}>, resultado: { id: string; es_diego_hablando: boolean }[]): EstadoEstilo   // pasa a 'redactando' al llegar a 100 o al agotar candidatos
export function promptClasificacion(lote: { id: string; caption: string }[]): { system: string; user: string }
export function promptGuia(ejemplos: { caption: string }[]): { system: string; user: string }
export async function avanzarAprendizaje(): Promise<EstadoEstilo>    // UNA etapa
```
- Etapas: `sin_aprender`/`listo` (al pedir "volver a aprender") → leer hasta 400 reels (`/{ig}/media?fields=id,caption,media_product_type,timestamp&limit=100`, paginado, solo REELS con caption) → `clasificando`; cada llamada clasifica 1 lote (una llamada IA) en orden de más nuevo a más viejo; `redactando` → una llamada IA que escribe la guía (largo típico, arranque, emojis, pregunta final, hashtags recurrentes, qué NO hace) → `listo`. Mientras se reaprende, el documento anterior sigue vigente (se guarda en `estilo.anterior` hasta llegar a `listo`).
- `PATCH ajustes`: `{ guia?: string }` (edición manual del documento, solo si `etapa='listo'`), `{ horarios? }`, `{ publicacion_automatica? }` → este último 403 salvo admin/dueno.
- [ ] **Step 1: Tests**: `siguienteLote` devuelve 50 desde el cursor; `aplicarClasificacion` acumula elegidos, pasa a `redactando` al llegar a 100 exactos (descarta los sobrantes), y también al agotar candidatos con menos de 100; ids que la IA devuelve y no estaban en el lote se ignoran.
- [ ] **Step 2–4.** **Step 5:** correr el aprendizaje real con `scripts/_qa-aprender-estilo.ts` (loop de `avanzarAprendizaje` hasta `listo`) y LEER la guía y 10 ejemplos al azar: ninguno es un aviso de propiedad (criterio 5). **Step 6: Commit** `feat(publicaciones): aprender el estilo de Diego desde Instagram`.

### Task 9: Medios en el navegador (`wav.ts`, `navegador/medios.ts`)

**Interfaces:**
- Produces:
```ts
export function codificarWav(muestras: Float32Array, frecuencia: number): Blob      // wav.ts, PCM16 mono, header RIFF
export async function extraerMiniatura(fuente: File | string): Promise<{ jpeg: Blob; duracionSeg: number; ancho: number; alto: number }>   // frame en min(1 s, 10 % de la duración), JPEG 0.82, máx 720 px de alto
export async function extraerAudio(fuente: File | string): Promise<Blob>          // decodeAudioData → OfflineAudioContext 16000 Hz mono → codificarWav
```
`string` = URL pública del bucket (para retomar videos ya subidos); `<video crossOrigin="anonymous">` / `fetch` (Storage público sirve CORS).
- [ ] **Step 1: Tests** (`wav.test.ts`): 16000 muestras a 16 kHz → Blob de 44+32000 bytes, header `RIFF`/`WAVE`, sample rate 16000 en offset 24, valor 1.0 → 32767 y −1.0 → −32768, valores fuera de rango se recortan.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(publicaciones): miniatura y audio extraídos en el navegador`.

### Task 10: UI — shell, Paso 1 (Cargar) y cola de preparación

**Files:** `app/(dashboard)/publicaciones/page.tsx`, `components/publicaciones/{PublicacionesClient,leer-json,useAutoguardado,useColaPreparacion,PasoCargar,FilaVideo}.tsx|ts`

**Interfaces:**
- Consumes: rutas de Task 6–7, `extraerMiniatura`, `extraerAudio`, `etiquetaEtapa`, `siguienteAccion`.
- Produces: `useColaPreparacion(videos, archivosLocales: Map<videoId, File>, onCambio)`; `useAutoguardado(videoId) → (campos: Partial<…>) => void`.
- Comportamiento: página server que solo renderiza el cliente (el gate es la API; mismo criterio que `/contenido`). `PublicacionesClient` al montar hace `GET tandas`: si hay un borrador muestra la tarjeta **"Seguir con la tanda del DD/MM (N videos)"** y "Empezar una nueva". Zona de arrastre + botón "elegilos de la computadora" (`accept="video/mp4,video/quicktime"`, múltiple; >200 MB se rechaza en el cliente con mensaje). Por cada archivo: alta → PUT con XHR y progreso (patrón `lib/properties/upload-reel.ts`) → PATCH `video_path`, `etapa='extrayendo'` → miniatura + audio → subir ambos → PATCH `etapa='transcribiendo'` → loop `/preparar` hasta `listo`/`error`. Cola: 2 a la vez. Al retomar: `subiendo` sin `File` en memoria → fila con "Volvé a elegir este archivo" (reconoce por nombre+tamaño al re-elegir); `extrayendo` → extrae desde la URL pública; `transcribiendo`/`describiendo` → solo loop. Botón "Siguiente: elegir ritmo" habilitado con ≥1 video (no espera a que terminen todos). `FilaVideo`: miniatura 9:16 a la izquierda (placeholder mientras no hay), nombre, duración `m:ss`, etiqueta de etapa, barra, "Reintentar" en error, "Quitar".
- [ ] **Step 1:** Implementar. **Step 2:** `tsc` acotado + `npx eslint components/publicaciones app/(dashboard)/publicaciones` limpios. **Step 3: Commit** `feat(publicaciones): carga de videos con preparación automática`.

### Task 11: UI — Paso 2 (Ritmo) y Paso 3 (Revisar)

**Files:** `PasoRitmo.tsx`, `PasoRevisar.tsx`, `FilaRevision.tsx`, `IconosRedes.tsx`

**Interfaces:** Consumes `armarCalendario`, `fraseCalendario`, `reasignarHorarios`, `aHoraArgentina`, `LIMITES`, rutas `tandas/[id]`, `calendario`, `confirmar`, `videos/[id]`.
- **PasoRitmo:** título "¿Cómo querés repartir estos N videos?"; 6 tarjetas grandes (Todos ya · 1 por día · 2 por día · 3 por día · 1 por semana · A mi manera) en grilla 2×3 (1 columna en celular), con `framer-motion` (entrada escalonada, `layout` en la seleccionada; respetar `prefers-reduced-motion` SIN cambiar la estructura del DOM — ver regla de la landing en CLAUDE.md). Bajo la selección: frase de `fraseCalendario` (preview calculado en el cliente con `armarCalendario`) y mini-calendario de 5 semanas con puntitos por día que se llenan animados. Controles: fecha de inicio (default mañana), interruptor "Solo días hábiles". "A mi manera": cuántos por día (1–5), chips L M X J V S D, horarios (lista editable con "+ horario"). Al confirmar el ritmo: PATCH tanda + POST calendario → Paso 3.
- **PasoRevisar:** lista ordenable (`@dnd-kit/sortable`, asa visible) en orden de salida; al soltar → `reasignarHorarios` → PATCH de `orden` y `programado_para` de los afectados. `FilaRevision`: miniatura (abre `<video controls>` en un Dialog), fecha/hora editables (input date + time; al cambiar → `hora_manual=true` y badge "hora manual"), `IconosRedes` (4 botones toggle con `aria-pressed`, íconos lucide/SVG simples, encendido a color y apagado gris; al menos una encendida — apagar la última muestra "Si no va a ninguna red, quitá el video"), descripción expandible en `<textarea>` con contador `n/2200` y título YouTube con contador `n/100`, avisos (sin voz; > 180 s "YouTube: va como video común, no como Short"). Todo cambio → `useAutoguardado` (800 ms) con indicador "Guardado" / "Guardando…". Pie fijo: botón **"Programar N videos"** → Dialog con resumen ("N videos · M publicaciones · del DD/MM al DD/MM") → POST confirmar → pestaña Programado. Deshabilitado con texto si algún video no está listo.
- [ ] **Step 1:** Implementar. **Step 2:** tsc + eslint. **Step 3:** `scripts/publicaciones-ui.probe.tsx` con `renderToStaticMarkup` de `PasoRitmo` y `FilaRevision` con datos fijos: las 6 tarjetas están, la frase aparece, los 4 íconos tienen `aria-pressed`, nada con `opacity:0` en el markup inicial. **Step 4: Commit** `feat(publicaciones): ritmo y revisión del calendario`.

### Task 12: UI — Programado, Publicado, Ajustes y menú

**Files:** `PestanaProgramado.tsx`, `PestanaPublicado.tsx`, `PanelAjustes.tsx`, `lib/nav/sections.ts`, `lib/nav/sections.test.ts`

- **Programado:** `GET programado`, agrupado por día ("Jueves 30/10"), filas reutilizando `FilaRevision` en modo programado (editable si ningún envío está `en_curso`/`publicado`), con chip de estado por red (Programado/Cancelado; en fase 1 nada avanza) y acciones "Pausar" y "Sacar del calendario". Banner si `publicacion_automatica=false`: "La publicación automática está apagada: nada se va a publicar hasta que la prendas en Ajustes."
- **Publicado:** estado vacío "Todavía no se publicó nada" (se llena en fase 2).
- **Ajustes** (Sheet lateral desde el engranaje): interruptor general (deshabilitado para coordinador, con texto "Lo cambian admin y dueño"; prender pide confirmación); horarios por ritmo; **Estilo de las descripciones**: si `sin_aprender` → botón "Aprender del Instagram" que loopea `estilo/aprender` mostrando "Leyendo publicaciones… / Separando videos de Diego (60 de 100) / Escribiendo la guía"; si `listo` → la guía en textarea editable (autoguardado) + "Ver los 100 ejemplos" (lista plegable con fecha) + "Volver a aprender". Conexiones: en fase 1, una lista informativa de las 4 redes con "Se conecta en la próxima etapa".
- **Menú:** `const PUBLICACIONES: NavItem = { href: '/publicaciones', label: 'Publicaciones', icon: Send }` agregado al grupo Marketing de coordinador y de admin/dueno (NO al asesor). Test en `sections.test.ts`: aparece para `admin`, `dueno`, `coordinador`; no aparece para `asesor` ni `abogado`.
- [ ] **Step 1:** Test del menú → FAIL. **Step 2:** Implementar todo. **Step 3:** vitest + tsc + eslint verdes. **Step 4: Commit** `feat(publicaciones): programado, ajustes y entrada en el menú`.

### Task 13: QA y despliegue de la fase 1 (Etapas 5 y 6 del protocolo)

- [ ] **Step 1:** Revisión adversarial (`feature-dev:code-reviewer`) + `/security-review` (subida de archivos, tokens, rutas). Verificar cada hallazgo; lo aplicado vuelve a Task correspondiente.
- [ ] **Step 2:** `git diff --name-only origin/main feat/publicacion-contenido` → solo archivos propios. Push + `gh pr create --base main`.
- [ ] **Step 3:** En la vista previa con el navegador de Claude, recorrer criterios 1, 2, 4–10 del spec con videos `[TEST` (3 videos cortos de Diego hablando tomados de la cuenta, más uno sin voz): capturas + `select` en la base de cada uno; consola y red limpias; rol coordinador y asesor; viewport 390×844; menú colapsado. Tabla criterio → cómo → resultado.
- [ ] **Step 4:** Merge (`gh pr merge`), esperar deploy, humo en `https://inmodf.com.ar/publicaciones`, borrar tandas `[TEST` y sus archivos, cerrar el navegador.
- [ ] **Step 5:** CLAUDE.md: sección "Publicaciones (2026-10-29)" con las trampas encontradas; memoria del proyecto; reporte al dueño.

---

## Fases siguientes (planes aparte, cada una desplegable sola)

- **Fase 2 — Instagram y Facebook:** worker pg_cron `publicaciones-publicar` (cada 2 min, una etapa por envío, interruptor general), máquina IG reusando `lib/integrations/instagram/publicar.ts`, Reels de Página con `video_reels`, verificación previa del permiso de publicar en la Página, pestaña Publicado con enlaces, reintentos con espera creciente, limpieza a 30 días.
- **Fase 3 — YouTube y Drive:** OAuth Google (`/api/oauth/google/*`, tokens en `publicacion_conexiones`), subida reanudable por partes con `publishAt` 3 h antes, entrada por enlace de Drive (clave de API para carpetas públicas, OAuth para privadas) con copia por partes a Storage.
- **Fase 4 — TikTok:** OAuth TikTok, envío a borradores por partes, tope de 5 pendientes cada 24 h con aviso en la revisión.
