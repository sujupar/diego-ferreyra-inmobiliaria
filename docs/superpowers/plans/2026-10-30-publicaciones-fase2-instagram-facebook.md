# Publicaciones — Fase 2: Instagram y Facebook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** que los envíos programados de Instagram y Facebook salgan solos a su hora (con el interruptor general prendido), con estado visible, reintento y pestaña Publicado.

**Architecture:** un worker pg_cron cada 2 minutos (`/api/cron/publicaciones-publicar`) avanza UNA etapa por envío por corrida. La decisión de qué hacer con cada envío es pura (`lib/publicaciones/publicador/`), las llamadas a Meta viven en adaptadores (`lib/integrations/instagram/publicar.ts` reusado, `lib/integrations/facebook/reels.ts` nuevo). La reserva de cada envío es atómica (UPDATE condicional), así dos corridas nunca hacen la misma etapa.

**Spec:** `docs/superpowers/specs/2026-10-29-publicacion-masiva-contenido-design.md` (§3.5, §3.6, §4.4, criterios 10–13).

## Global Constraints

- Interruptor `publicacion_ajustes.publicacion_automatica` apagado → la corrida no toca nada y lo dice (`motivo: 'apagado'`).
- Un envío sale cuando: estado `programado`/`en_curso`, video no `pausado`, tanda confirmada, `programado_para <= now`, `proximo_intento` nulo o vencido.
- Presupuesto por corrida: **18 s** (el pg_net corta a 30 s; Netlify ~26 s). Máximo 6 envíos por corrida.
- Reintentos: errores transitorios (red, 5xx, códigos Meta 1, 2, 4, 17, 32, 341, 368, 613, 80001–80014) con espera 1, 2, 5, 15, 30 min y techo de **5 intentos**; el resto, `fallido` con motivo en castellano.
- Reserva: antes de cada etapa, `proximo_intento = now + 3 min` con `.eq('updated_at', leído)`; si no afecta filas, otra corrida lo tomó.
- La URL del video que se manda a Meta tiene que ser la URL pública del bucket propio del video (`urlPublica(video_path)` + `esRutaPropia`).
- Nunca se publica dos veces: antes de "publicar", se consulta el estado (IG `PUBLISHED`, FB `publishing_phase.status = complete`) y si ya salió, se marca publicado.
- Limpieza: el archivo del video se borra de Storage 30 días después de que TODOS sus envíos están `publicado` o `cancelado`.
- Textos de UI en castellano, sin jerga. Commits Sujupar, trailer Co-Authored-By.

## Review Focus

1. **La función muere entre "publicar" y escribir el resultado** → la corrida siguiente ve que ya está publicado y lo marca, sin segundo post. Test en Task 1/2 (`siguienteEtapa` con `YA_PUBLICADO` / FB complete).
2. **Interruptor apagado con envíos vencidos** → no sale nada y la fila dice "Esperando: publicación automática apagada". Test en Task 1 + UI Task 5.
3. **Un envío que falla no frena a los demás del mismo video ni de la corrida** → test del runner con un adaptador que tira.
4. **Video pausado o tanda borrador** → no se toma. Test de selección en Task 1.
5. **Reintentar un envío fallido de IG con contenedor viejo** → arranca de cero (contenedor nuevo), no reusa uno vencido. Test en Task 1.

---

### Task 1: Máquina de etapas pura (`lib/publicaciones/publicador/maquina.ts` + test)

**Produces:**
```ts
export type EtapaIg = null | 'contenedor' | 'publicando'
export type EtapaFb = null | 'iniciado' | 'subido' | 'publicando'
export type ErrorClasificado = { transitorio: boolean; mensaje: string }
export function clasificarError(e: unknown): ErrorClasificado
export function esperaDeReintento(intentos: number): number | null   // ms; null = sin más reintentos
export function puedeSalir(e, video, tanda, ahora): { sale: true } | { sale: false; motivo: 'apagado'|'pausado'|'antes_de_hora'|'esperando_reintento'|'terminado'|'borrador' }
export function motivoEnPantalla(envio, video, automatica, ahora): string | null   // "Esperando: publicación automática apagada", "Publicando…", etc.
```
Tests: un caso por motivo; espera 1/2/5/15/30 min y null al 6º; códigos 4/17/613/5xx/red transitorios; 100/190/otro definitivos con mensaje legible.

### Task 2: Adaptador de Facebook (`lib/integrations/facebook/reels.ts`)

`iniciarReel()`, `subirPorUrl(videoId, url)` (rupload.facebook.com con `Authorization: OAuth <page token>` y header `file_url`), `publicarReel(videoId, descripcion)` (`upload_phase=finish&video_state=PUBLISHED`), `estadoReel(videoId)` → `'procesando'|'publicado'|'error'` + `permalink`. Pura: `interpretarEstadoFb(json)` con test (status.video_status, publishing_phase.status, processing_phase.status = error).

### Task 3: Ejecutores por red (`lib/publicaciones/publicador/instagram.ts`, `facebook.ts`)

Cada uno: `avanzar(envio, video): Promise<Resultado>` donde `Resultado = { etapa, ids?, estado?: 'publicado'|'fallido', enlace?, esperarMs? }`. IG: null → contenedor; contenedor → (LISTO → publicando: media_publish) (EN_PROCESO → esperar 60 s) (YA_PUBLICADO → publicado) (ERROR/VENCIDO → fallido); publicando → leer permalink → publicado. FB: null → iniciar; iniciado → subir; subido → publicar (antes mira estado: si ya publicado → publicado); publicando → estado hasta publicado. Tests con dependencias inyectadas (sin red).

### Task 4: Runner + ruta cron + migración (`servidor/publicador.ts`, `app/api/cron/publicaciones-publicar/route.ts`, `supabase/migrations/20261030000001_publicaciones_cron.sql`, `scripts/apply-cron-publicaciones-pg.ts`, columna `publicacion_videos.archivo_borrado_at`)

Runner: lee interruptor; selecciona candidatos (join video+tanda); reserva; ejecuta; escribe; cuenta; limpieza de 30 días al final si sobra tiempo. Test del runner con fakes: interruptor apagado no llama nada; un adaptador que tira no frena al resto; transitorio → `proximo_intento`, definitivo → `fallido`. Ruta con auth doble (env o `cron_config`), `?ping=1`. Job programado DESPUÉS del deploy.

### Task 5: UI — estados, reintentar y Publicado

`POST /api/publicaciones/envios/[id]/reintentar` (operaciones; `fallido` → `programado`, `intentos=0`, `etapa=null`, `ids_externos={}`). Programado: chips Programado / Publicando / Publicado (enlace) / Falló (motivo + Reintentar) / "Esperando: publicación automática apagada". Pestaña Publicado: `GET /api/publicaciones/publicado` (videos con algún envío publicado o fallido, últimos 60 días), filtros por red y fecha, enlace por red. Probe de render.

### Task 6: QA y despliegue

Revisión adversarial; PR; QA en vista previa con interruptor apagado (criterio 10); **publicación real de prueba solo con OK explícito del dueño** (criterio 11: Facebook se borra por API; Instagram no tiene borrado por API → lo borra Diego a mano); merge; programar el job; verificar `net._http_response` (criterio 13).
