# Publicaciones — comentarios y privado (Instagram y Facebook)

**Spec:** `docs/superpowers/specs/2026-11-04-publicaciones-comentarios-y-privado-design.md` (aprobado 2026-11-04).

## Hechos verificados antes de planear (2026-11-04)
- Permisos del token: `pages_manage_engagement`, `pages_read_user_content`, `pages_messaging`. Un privado o una
  respuesta a un comentario inventado de Facebook da "parámetro inválido" (100), no un error de permiso.
- La Página está suscrita a `feed,messages`, pero la APP solo al objeto `instagram`: hay que sumar el objeto
  `page` (campo `feed`) a la misma dirección del webhook, DESPUÉS del deploy.
- Un reel de la Página tiene `id` (video) y `post_id`; la publicación es `{página}_{post_id}`. El aviso `feed`
  de un comentario trae `post_id` con esa forma → se busca por `fb_post_id`.
- El privado de un comentario de Facebook sale por el MISMO pedido que el de Instagram
  (`POST /{página}/messages` con `recipient.comment_id`): se reusa `mandarPrivadoConEnlace`.

## Tareas
1. **Migración `20261104000002_publicaciones_automatizacion.sql`**: `publicacion_videos.property_id` (FK
   properties, SET NULL), `automatizacion jsonb`, `reel_id` (FK property_reels, SET NULL),
   `automatizacion_error text`; `property_reels.fb_video_id` y `fb_post_id` (UNIQUE); `reel_comentarios.plataforma`
   (`instagram|facebook`, default `instagram`). Script de aplicación con verificación.
2. **Módulo puro `lib/publicaciones/automatizacion.ts`**: esquema de la configuración (palabras, frases, privado,
   botón, modo) validado con `validarMensajes`/`separarPalabras` de reels; `lineaDePalabra(palabra)` y
   `conLineaDePalabra(descripcion, palabra)` (agrega o reemplaza UNA línea, nunca duplica); `mencionaPalabra`.
3. **Webhook de la Página** (`lib/integrations/facebook/webhook.ts`): `leerComentariosDePagina(cuerpo)` →
   comentarios con `plataforma:'facebook'`, `postId`; ignora `verb≠add`, `item≠comment`, sin autor. La ruta del
   webhook une los de Instagram y los de Facebook.
4. **Procesador por plataforma**: búsqueda del reel (IG por `ig_media_id`, FB por `fb_post_id`), "es de la
   cuenta" (FB = id de la Página), respuesta pública (FB `POST /{comentario}/comments` con token de Página),
   `utm_source` por plataforma, `plataforma` en `reel_comentarios`. Instagram sin cambios de comportamiento.
5. **Conexión al publicar**: el runner llama `alPublicar` tras guardar un `publicado`; el servidor crea (o
   completa) la fila de `property_reels` con la configuración del video y el id de la red; si falla, anota
   `automatizacion_error` sin tocar el envío. Ruta `POST /api/publicaciones/videos/[id]/conectar` para
   "Conectar de nuevo".
6. **Edición**: `PATCH /videos/[id]` acepta `property_id` y `automatizacion` (validados en el servidor; la propiedad
   exige `puedeDifundir`); al poner palabra se ajusta la descripción. Ruta de búsqueda de propiedades con su estado
   de landing.
7. **UI**: bloque "Propiedad y comentarios" en la fila de revisión y de Programado; estado en Publicado con enlace
   a la tarjeta de Reels.
8. **Alta del objeto `page` en el webhook** (script, después del deploy) y QA al final con el dueño.

**Pruebas:** `vitest.publicaciones.config.ts` + `vitest.reels.config.ts`.
