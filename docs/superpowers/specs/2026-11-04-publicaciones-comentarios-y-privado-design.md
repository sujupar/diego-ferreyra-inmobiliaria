# Publicaciones: responder comentarios y mandar el privado (Instagram y Facebook)

Fecha: 2026-11-04 · Tamaño: GRANDE (le escribe a clientes reales) · Estado: esperando aprobación del dueño

## Problema y resultado

- **Problema:** los videos que salen desde Publicaciones no tienen la automatización de comentarios. Para
  que un video de una propiedad responda y mande el privado hay que ir después a la ficha y engancharlo a
  mano, y en Facebook no existe ninguna automatización.
- **Resultado:** al preparar un video en Publicaciones se lo conecta a una propiedad y ahí mismo se definen
  la palabra clave, las respuestas públicas y el privado. Cuando el video sale, en Instagram **y** en
  Facebook ya responde solo.

## Qué ve el usuario

**En la revisión de la tanda y en la pestaña Programado**, cada video tiene un bloque nuevo, plegado:
**"Propiedad y comentarios"**.

1. **Propiedad** (opcional): un buscador por dirección. Sin propiedad, el video sale igual que hoy y no
   responde comentarios. Es lo normal para videos de mercado o de opinión.
2. Con propiedad elegida aparecen:
   - **Palabra clave** (una o varias, separadas por coma, igual que en la ficha).
   - **Respuestas públicas**: las 3 frases para quien recibe el privado y las 3 de respaldo.
   - **Privado**: el texto, el texto del botón y el mensaje del enlace.
   - **Modo**: Apagado / Modo prueba / En vivo. En vivo pide confirmación.

   Todo viene precargado con los textos de fábrica de los reels de la ficha (`textos-por-defecto.ts`).
   Son los mismos textos y la misma validación que en "Enganchar reel".
3. **La palabra clave se escribe en la descripción.** Al ponerla, se agrega al final de la descripción la
   línea `Comentá «PALABRA» y te mando toda la info.`. Es texto visible y se puede editar o borrar. Si la
   palabra no figura en la descripción, aparece un aviso naranja: nadie va a comentar algo que no sabe.
4. **Si la propiedad no tiene la landing publicada**, el modo queda bloqueado en Apagado. El aviso dice
   "Publicá la landing de la propiedad: el botón del privado lleva ahí". El video se puede programar igual.
5. **Después de publicado**, la fila de la pestaña Publicado muestra "Responde comentarios · En vivo" (o el
   modo que corresponda) y un enlace a la tarjeta de Reels de la propiedad. El video aparece ahí como
   cualquier reel enganchado. Desde ese momento se administra en la ficha: cambiar el modo, ver los
   comentarios respondidos, editar los textos.

**Roles:** el bloque lo ven quienes ya usan Publicaciones (admin, dueño, coordinador). Conectar un video a
una propiedad exige además el permiso de difundir esa propiedad (`puedeDifundir`), igual que en la ficha.

**El interruptor general** de la automatización (arriba de la tarjeta de Reels) sigue mandando sobre todo:
con él apagado, nada responde, ni en Instagram ni en Facebook.

## Qué pasa por detrás

### Al publicar

- **Instagram:** cuando el publicador confirma la publicación y tiene el `ig_media_id`, crea la fila de
  `property_reels` con `origen='existente'`, la propiedad, los textos y el modo elegidos, y
  `automatizacion_desde` = hora de publicación. Es el mismo `crearReel` que usa "Enganchar reel". Si ya
  existe una fila para ese `ig_media_id` (UNIQUE), no se duplica.
- **Facebook:** cuando el publicador confirma la publicación en Facebook, guarda el identificador del video
  de la Página en esa misma fila (columna nueva `property_reels.fb_video_id`, UNIQUE). Así hay **una sola
  configuración para las dos redes**: mismos textos, mismo modo.
- Si una de las dos redes no se eligió para ese video, la fila existe solo con la red que salió.
- Crear la fila NUNCA puede hacer fallar la publicación: el video ya salió. Si falla, queda el motivo
  visible en la fila del video ("No se pudo conectar la automatización: …") con un botón **Conectar de
  nuevo**.

### Al llegar un comentario

- **Instagram:** igual que hoy, sin cambios.
- **Facebook (nuevo):** Meta avisa los comentarios de la Página por el webhook `feed` (la Página ya está
  suscrita, verificado el 2026-11-04). La ruta del webhook pasa a entender también los avisos de la
  Página (`object: 'page'`, `item: 'comment'`, `verb: 'add'`). Busca la fila por `fb_video_id` y aplica
  **la misma decisión** (`decidirQueHacer`) que en Instagram:
  - respuesta pública: `POST /{comentario}/comments` con el token de la Página;
  - privado: `POST /{página}/messages` con `recipient: { comment_id }` (respuesta privada de Messenger), con
    botón al enlace de la landing y, si Meta rechaza el botón, el enlace escrito en el texto (igual que en
    Instagram);
  - un privado por persona, por video y por red;
  - se ignoran los comentarios de la propia Página y los anteriores a la activación.
- `reel_comentarios` suma la columna `plataforma` (`instagram` | `facebook`, default `instagram`). El
  UNIQUE del identificador del comentario sigue evitando la doble respuesta ante un reintento de Meta.
- El enlace del privado lleva `utm_source=facebook` cuando el comentario es de Facebook.

### Permisos de Meta (verificado el 2026-11-04)

El token ya tiene `pages_manage_engagement` (responder), `pages_read_user_content` (leer comentarios) y
`pages_messaging` (privados), y la Página está suscrita a `feed`. **Lo que no está probado** es si
Facebook deja mandar la respuesta privada a una persona sin rol en la app con el acceso estándar. En
Instagram sí deja. Es lo primero que se prueba, antes de programar la parte de Facebook; si no deja, se
avisa y Facebook queda solo con la respuesta pública.

### Base de datos

- `property_reels.fb_video_id text NULL UNIQUE`.
- `publicacion_videos`: `property_id uuid NULL REFERENCES properties(id) ON DELETE SET NULL` y
  `automatizacion jsonb NULL` (palabra, frases, privado, botón, modo; validado con el mismo
  `validarMensajes` antes de guardar) y `reel_id uuid NULL REFERENCES property_reels(id) ON DELETE SET NULL`
  (la fila creada al publicar).
- `reel_comentarios.plataforma text NOT NULL DEFAULT 'instagram' CHECK (plataforma IN ('instagram','facebook'))`.
- RLS como las tablas existentes: escribe solo el servidor.

## Qué queda afuera

- Comentarios de YouTube y TikTok.
- Videos que ya se publicaron antes de esto (se siguen enganchando desde la ficha, como hoy).
- Videos publicados a mano en Facebook (solo se engancha lo que sale desde Publicaciones).
- Conversar por privado después del primer mensaje (sigue requiriendo el acceso avanzado de Meta).

## Decisiones que tomé yo (corregibles)

- **Una sola configuración para las dos redes**, no una por red. Menos para cargar y menos para equivocarse.
- **Modo prueba en Facebook simula siempre.** Las "cuentas de prueba" de Instagram se reconocen por nombre de
  usuario y Facebook no da nombres de usuario confiables. En Modo prueba, Facebook registra qué habría
  respondido sin mandar nada. Para probarlo de verdad en Facebook se usa En vivo sobre un video de prueba.
- **El modo arranca en "Modo prueba"** al conectar la propiedad; pasar a En vivo es una elección explícita.
- **La línea "Comentá «X»…" se agrega a la descripción visible**, no en el momento de publicar: lo que se ve
  en la revisión es lo que sale.

## Criterios de aceptación

1. En la revisión de una tanda, un video se conecta a una propiedad desde "Propiedad y comentarios" y los
   textos aparecen precargados.
2. Al poner la palabra clave, la descripción del video termina con `Comentá «PALABRA» y te mando toda la info.`
3. Con una propiedad sin landing publicada, el modo no puede salir de Apagado y lo explica.
4. Al publicarse el video en Instagram, aparece en la tarjeta de Reels de esa propiedad, con los textos y el
   modo elegidos (`property_reels` con el `ig_media_id` del post).
5. Al publicarse en Facebook, esa misma fila tiene el `fb_video_id`.
6. Un comentario con la palabra clave en el post de **Instagram**, con el modo En vivo, recibe la respuesta
   pública y el privado con el botón a la landing (`reel_comentarios` con `plataforma='instagram'`).
7. Lo mismo en **Facebook** (`plataforma='facebook'`), con el enlace marcado `utm_source=facebook`.
8. El mismo comentario reenviado por Meta no genera una segunda respuesta ni un segundo privado.
9. Con el interruptor general apagado, ningún comentario de ninguna red recibe respuesta.
10. Un video sin propiedad se publica exactamente igual que hoy.
11. Si crear la conexión falla al publicar, el video figura publicado, el motivo se ve y "Conectar de nuevo" lo arregla.
12. Un asesor o un abogado no puede conectar videos (403 en el servidor).

## Riesgos (pre-flight)

- **Mensajes reales a clientes:** todo arranca en Modo prueba y bajo el interruptor general. El QA se hace
  con cuentas propias y videos `[TEST`.
- **Límite de tiempo de Netlify:** crear la fila es una escritura más dentro de la etapa que publica; no
  agrega llamadas a Meta. El webhook de Facebook hace como mucho 2 llamadas por comentario (respuesta +
  privado), igual que Instagram.
- **Productores/consumidores:** `reel_comentarios` y `property_reels` los leen la tarjeta de Reels, el
  procesador y el publicador de reels. Las columnas nuevas tienen default para que nada viejo cambie.
- **Webhook de la Página:** la app tiene que tener configurado el objeto `page` con la misma dirección del
  webhook. Se verifica al empezar; si falta, se da de alta con un script (como `suscribir-webhook-instagram.ts`).
- **Doble respuesta:** cubierta por los UNIQUE de comentario y de privado por persona.
- **Migración antes del deploy:** las columnas nuevas se aplican y verifican antes de subir el código.
