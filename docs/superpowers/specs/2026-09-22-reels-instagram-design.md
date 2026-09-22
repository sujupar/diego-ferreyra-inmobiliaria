# Reels de Instagram por propiedad — diseño

**Fecha:** 2026-09-22 · **Tamaño:** grande (integración externa + mensajes a clientes)
**Aprobado por el dueño en el chat antes de escribir este archivo.**

## Problema

Cada reel de una propiedad junta decenas de comentarios pidiendo información —31 en un
solo día— y hoy se responden a mano, uno por uno, sin forma de saber a qué propiedad se
refería cada uno ni de llevar a esa persona a un lugar donde deje sus datos.

## Resultado esperado

Que el asesor suba (o enganche) un reel desde la ficha de la propiedad, elija una palabra,
y a partir de ahí cada persona que comente esa palabra reciba sola la respuesta pública, el
mensaje privado y —al tocar el botón— el enlace de la landing de esa propiedad.

## Estado de la integración con Meta (verificado el 2026-09-22, no supuesto)

| Capacidad | Estado | Evidencia |
|---|---|---|
| Token | Usuario de sistema, **sin vencimiento** | `debug_token`: `expires_at: 0`, `type: SYSTEM_USER` |
| Cuenta | `@inmobiliariadiegoferreyra` (`17841421542114621`), página `103823292484521` | `/me/accounts` |
| Publicar reel | ✅ | `POST /{ig}/media` devolvió contenedor `18140439997718071` |
| Cupo de publicación | 100 por 24 h, 0 usadas | `/{ig}/content_publishing_limit` |
| Leer comentarios | ✅ | `/{media}/comments` devolvió los comentarios reales del reel del 20/09 |
| Responder comentario | ✅ | `POST /{id}/replies` con id inventado → error 100/33 "no existe", **no** falta de permiso |
| **Mensaje privado** | ❌ **bloqueado** | `POST /{ig}/messages` → `(#3) Application does not have the capability`; por la página → `(#230) Requires pages_messaging permission` |
| Botón en el privado | ✅ **forma válida** | Un `content_type` inventado dio error 100 sobre *ese* campo; el botón real no dio error de forma ⇒ Meta valida la forma antes que los permisos |

**Bloqueo conocido:** falta el permiso `pages_messaging` en el token. Lo resuelve el dueño
en el panel de Meta. Todo el resto se construye igual y el privado nace apagado.

**Suscripción de webhook:** la app hoy no tiene **ninguna** (`/{app}/subscriptions` → vacío)
y la página tampoco (`subscribed_apps` → vacío). Hay que crearlas; se puede por API.

## Qué ve el asesor

### Dónde

Pestaña **Difusión** de la ficha (`components/properties/detail/tabs/MarketingTab.tsx`),
debajo de la sección de landing. Ahí es donde ya viven los canales de publicación y la
landing, que es justo el requisito del reel. **No** se crea una pestaña nueva.

Roles: se usa la tabla de permisos que ya existe, `lib/properties/difusion-access.ts`. Ver
la tarjeta = capacidad `ver_difusion`; crear, publicar y activar la automatización =
capacidad `difundir`. En la práctica: admin, dueño, coordinador y asesor hacen todo; **el
abogado ve la tarjeta pero sin ningún botón**, igual que ya le pasa con la landing y los
portales. No se inventa una regla de roles nueva: esa tabla existe justamente porque la
regla estaba copiada a mano en más de veinte archivos.

### Tarjeta "Reels de Instagram"

Sin reels: un texto corto que explica qué hace y dos botones, **"Subir un reel"** y
**"Enganchar uno ya publicado"**.

Con reels: una fila por reel con miniatura, estado, fecha, la palabra elegida y —cuando ya
está publicado— cuántos comentarios coincidieron y cuántos privados salieron.

### Subir un reel

1. **Archivo.** Arrastrar o elegir. Solo **`.mp4` y `.mov`** (Instagram no acepta `webm` ni
   `m4v`), hasta 200 MB. Sube por enlace firmado directo al almacenamiento, igual que el
   video de la propiedad — nunca por el servidor.
2. **Palabra del llamado a la acción.** Campo de texto, obligatorio para automatizar. Una
   sola palabra o frase corta. Debajo, en gris: *"Las personas que escriban esta palabra en
   los comentarios van a recibir el mensaje automático."*
3. **Descripción.** Se arma sola con los datos de la propiedad, **sin precio**, y termina con
   *"Comentá la palabra TASACIÓN y te mando la ficha completa"*. Editable, siempre.
4. **Mensaje privado.** Tres campos con texto sugerido ya cargado y editables **para este
   reel**: el mensaje, el texto del botón y el texto que acompaña al enlace.
5. **Cuándo.** *Publicar ahora* o *Programar* con fecha y hora.

### Enganchar uno ya publicado

Lista de los reels de la cuenta con miniatura, fecha y cantidad de comentarios. Se elige
uno, se escribe la palabra y los textos del privado. La descripción **no se toca** (ya está
publicada en Instagram).

### El candado de la landing

Publicar y activar la automatización exigen que la propiedad tenga **landing publicada**.
Si no la tiene, esos botones quedan apagados con el cartel *"Falta publicar la landing de
esta propiedad"* y un atajo para crearla. **Subir, escribir y guardar siempre se puede**:
el enlace recién se necesita al final de la cadena, no al subir el archivo.

### Estados y errores

| Estado | Qué ve el asesor |
|---|---|
| Borrador | "Sin publicar" + botón Publicar |
| Programado | "Se publica el jueves 25 a las 19:00" + botón Cancelar |
| Procesando | "Instagram está procesando el video (1-2 min)" |
| Publicado | Enlace al reel + contadores |
| Fallido | El motivo **en castellano** + el detalle crudo aparte + botón Reintentar |

## Qué pasa por detrás

### Publicar (nunca dentro de un request)

`POST …/publicar` solo **anota el pedido** y responde. Publicar dentro del request se
cortaría por el límite de tiempo de Netlify — el mismo error ya documentado dos veces en
`CLAUDE.md`. El trabajo lo hace el cron:

1. Toma los reels vencidos (`programado_para <= ahora`) o pedidos para ya.
2. **Verifica la landing publicada.** Si no está, no publica: deja el motivo escrito.
3. Crea el contenedor en Instagram (`POST /{ig}/media`, `media_type: REELS`) y guarda su id.
4. En corridas siguientes consulta `status_code` hasta `FINISHED`, y ahí sí publica
   (`POST /{ig}/media_publish`). Guarda `ig_media_id` y el enlace.
5. `ERROR` o `EXPIRED` → estado fallido con el motivo.

Cron `reels-instagram`, **cada 5 minutos**, apuntando a `/api/cron/reels-publish`, con
**autorización doble** (variable de entorno *o* tabla `cron_config`): en este proyecto
conviven dos secretos de cron y validar contra uno solo deja el job en 403 mudo.

### La cadena de comentarios

1. Meta avisa a `/api/webhooks/instagram` (campo `comments`).
2. **Se verifica la firma** `x-hub-signature-256` con `META_APP_SECRET`, reusando
   `verifySignature` de `lib/integrations/whatsapp/webhook.ts`. Sin firma válida: 403.
3. Se busca el reel por `ig_media_id`. Si no es nuestro, se ignora.
4. **Se descarta si el comentario es anterior a `automatizacion_desde`.** Enganchar un reel
   viejo no le escribe a quien comentó hace días.
5. Se descarta si el autor es la propia cuenta (no contestarnos a nosotros mismos).
6. Se anota el comentario. El identificador lleva **UNIQUE**: Meta reintenta sus avisos y
   así el reintento no duplica nada.
7. Si el texto **contiene** la palabra → se responde el comentario en público y se manda el
   privado con el botón. Si no la contiene, se anota y no pasa nada más.

**Comparación de la palabra:** minúsculas, sin tildes, y con el texto normalizado a forma
NFC antes de comparar. Lo de NFC no es teórico: ya mordió al buscador de los listados
(`CLAUDE.md`), porque macOS entrega la "ó" como dos caracteres y la comparación falla sin
error visible.

### El botón y la vuelta

El botón viaja como **respuesta rápida** (`quick_replies`) y lleva escondido el
identificador del reel: `reel:<uuid>`. Cuando la persona lo toca, entra un aviso `messages`
con ese dato, así que sabemos **exactamente** de qué propiedad hablaba sin cruzar usuarios
—que es frágil, porque el identificador del comentario y el del chat no siempre coinciden—.
Ahí se responde con el texto de seguimiento y el enlace absoluto de la landing.

### Los tres frenos

| Freno | Dónde | Valor inicial |
|---|---|---|
| Automatización global | `instagram_ajustes.automatizacion_habilitada` | **apagado** |
| Privados habilitados | `instagram_ajustes.dm_habilitado` | **apagado** (espera a Meta) |
| Simulacro, por reel | `property_reels.simulacro` | **prendido** |

En simulacro se anota todo lo que **habría** pasado —a quién, con qué texto— sin llamar a
Instagram. Es lo que permite ver la cacería de palabras funcionando con comentarios reales
antes de dejar que el sistema hable. Mismo criterio que el agente de WhatsApp.

Los tres se leen **cerrados ante la duda**: si la tabla no existe, si falla la red o si no
se puede leer el valor, no se manda nada.

### Datos

**`property_reels`** — `id`, `property_id` (→ `properties`, ON DELETE CASCADE), `created_by`
(→ `profiles`, **ON DELETE SET NULL**, regla del repo), `origen` ('subido' | 'existente'),
`video_url`, `descripcion`, `palabra_clave`, `dm_texto`, `dm_boton`, `dm_seguimiento`,
`estado` ('borrador' | 'programado' | 'procesando' | 'publicado' | 'fallido'),
`programado_para`, `ig_creation_id`, `ig_media_id` (**UNIQUE**, es por donde entra el
webhook), `ig_permalink`, `publicado_en`, `ultimo_error`, `automatizacion_activa`,
`automatizacion_desde`, `simulacro`, `created_at`, `updated_at`.

**`reel_comentarios`** — `id`, `reel_id` (CASCADE), `ig_comment_id` (**UNIQUE**), `ig_user_id`,
`username`, `texto`, `coincide`, `respondido_en`, `dm_enviado_en`, `boton_tocado_en`,
`enlace_enviado_en`, `error`, `simulado`, `created_at`. Índice `(reel_id, ig_user_id)` para
el descarte de repetidos.

**`instagram_ajustes`** — una sola fila (`id = 'default'`) con los dos interruptores globales.

RLS en las tres, copiando **exactamente** el patrón de `property_landings`
(`20260723000002`): una política para operaciones (`is_operations_user()`) y otra para el
asesor asignado a esa propiedad. El webhook y el cron entran con la clave de servicio, que
no pasa por RLS — por eso el permiso de verdad lo decide `puedeDifundir()` en cada ruta.

### Reglas de Instagram que el diseño respeta

- **Un solo privado por persona que comenta.** Lo dice la documentación de Meta y además lo
  imponemos nosotros: un privado por persona y por reel, comente las veces que comente.
- **7 días** de plazo desde el comentario para mandar el privado. Pasado eso, se anota
  vencido y no se intenta.
- El video sale de un enlace público del almacenamiento: Instagram lo descarga por su cuenta.

## Qué queda afuera (explícito)

- **No publica en Facebook.** Solo Instagram.
- **No mira ni escucha el video.** La descripción sale de los datos de la propiedad.
- **No conversa.** Si la persona escribe cualquier otra cosa, queda en la bandeja de
  Instagram para que la atienda una persona. No se conecta con el agente de WhatsApp.
- **No toca los comentarios viejos.** Solo los posteriores a activar la automatización.
- **No hay estadísticas de alcance del reel.** Se muestran comentarios y privados, nada más.
- **No hay edición del reel ya publicado** (ni de su descripción) desde la plataforma.

## Criterios de aceptación

Cada uno se comprueba en la interfaz de la vista previa o con un `select`.

1. En la pestaña **Difusión** de una propiedad captada aparece la tarjeta "Reels de
   Instagram" con los botones "Subir un reel" y "Enganchar uno ya publicado". Con el usuario
   en rol **abogado**, la tarjeta aparece pero **sin ningún botón de acción**, y el servidor
   responde 403 si se la llama igual.
2. Al elegir un archivo `.webm`, el formulario lo rechaza con un mensaje que nombra los
   formatos aceptados; con un `.mp4` lo acepta.
3. Al subir un `.mp4` y escribir la palabra `TASACIÓN`, la descripción se arma sola,
   **no contiene el precio de la propiedad** y termina con la frase que incluye esa palabra.
   El texto se puede editar y lo editado es lo que queda guardado (`select` de `descripcion`).
4. Con una propiedad **sin landing publicada**, el botón Publicar está apagado y se ve el
   cartel "Falta publicar la landing de esta propiedad". Con la landing publicada, el botón
   se habilita.
5. Al elegir "Programar" con fecha y hora, el reel queda en estado `programado` con
   `programado_para` correcto, y la tarjeta muestra la fecha en castellano.
6. "Enganchar uno ya publicado" lista reels reales de la cuenta con miniatura y cantidad de
   comentarios; al elegir uno queda guardado con su `ig_media_id` y `origen='existente'`.
7. Al activar la automatización de un reel, `automatizacion_desde` queda con la hora de ese
   momento, y un comentario con fecha anterior **no** dispara nada (queda anotado como
   ignorado).
8. Un aviso del webhook **sin firma válida** responde 403 y no escribe nada.
9. El mismo aviso mandado dos veces (Meta reintenta) deja **una sola** fila en
   `reel_comentarios`.
10. Con el reel en **simulacro**, un comentario que contiene la palabra queda anotado con
    `coincide=true` y `simulado=true`, y **no** se llamó a Instagram.
11. Con los interruptores globales apagados, ningún comentario dispara respuesta ni privado,
    aunque el reel tenga la automatización activa.
12. La palabra se reconoce escrita como `tasacion`, `TASACIÓN` y `Tasación`, y también
    dentro de una frase ("me interesa, tasación por favor").
13. La misma persona comentando tres veces la palabra recibe **un solo** privado
    (`dm_enviado_en` en una sola fila).
14. El cron `/api/cron/reels-publish` sin el secreto responde 403; con el secreto correcto
    responde 200 y deja escrito qué hizo o por qué no hizo nada.
15. Un reel cuya publicación falla queda en `fallido` con el motivo **en castellano** visible
    en la tarjeta, y el botón Reintentar lo vuelve a poner en cola.

## Riesgos

| Riesgo | Gravedad | Mitigación |
|---|---|---|
| `/api/webhooks/instagram` no está en la lista blanca del middleware → Meta recibe una redirección al login y la automatización muere **en silencio** | 🔴 | Se agrega a la lista en la misma tarea, con su comentario |
| Un privado sale a una persona real durante las pruebas | 🔴 | Interruptores globales apagados + simulacro por reel + solo comentarios posteriores al enganche |
| Publicar dentro del request se corta por el límite de Netlify | 🔴 | El request solo anota; publica el cron |
| El privado sigue bloqueado por Meta | 🟡 | Todo lo demás funciona igual; el privado se prende con un interruptor cuando el dueño resuelve `pages_messaging` |
| El identificador del que comenta y el del que escribe por privado podrían no ser el mismo | 🟡 | El botón lleva el identificador del reel adentro: no hace falta cruzar usuarios |
| El cron queda en 403 mudo por el lío de los dos secretos | 🟡 | Autorización doble (entorno o `cron_config`), patrón de `mapa-lugares` |
| Instagram rechaza `webm`/`m4v` y el fallo aparecería recién en el cron | 🟡 | Se restringe a `mp4`/`mov` en el formulario y en el servidor |
| Prefijo de migración duplicado (ya hay 13 en el repo) | 🟢 | Mirar el directorio antes de numerar |

## Variables de entorno nuevas

| Nombre | Para qué |
|---|---|
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | La palabra que Meta devuelve al dar de alta el webhook |
| `META_INSTAGRAM_ACCOUNT_ID` | La cuenta de Instagram. Si falta, se resuelve desde la página |

`META_ACCESS_TOKEN`, `META_APP_SECRET` y `CRON_SECRET` ya existen. Las nuevas las carga el
dueño en Netlify: es lo único que no se puede hacer desde la sesión.
