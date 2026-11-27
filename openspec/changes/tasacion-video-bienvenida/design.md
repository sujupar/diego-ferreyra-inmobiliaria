# Design

## Context

### El primer WhatsApp de tasación
- Lo manda el trabajo `whatsapp` de la cola del embudo, con `primerWhatsappDeTasacion` en
  `lib/funnel/side-effect-handlers.ts`.
- La plantilla sale de `WHATSAPP_TEMPLATE_TASACION`. Hoy es `tasacion_llamada_v1` (UTILIDAD,
  sin botones, con un parámetro: el nombre de pila).
- `buildTemplatePayload` (`lib/integrations/whatsapp/core.ts`) ya arma a la vez los
  parámetros del cuerpo y un botón de URL dinámica (`urlButtonParam`, índice 0). Lo usa así
  `lib/leads/send-recorrido-whatsapp.ts:60-61`.
- El texto que guarda el Inbox sale de `textoDePlantilla` si la cantidad de parámetros
  coincide.
- `ResultadoTrabajo` es `'done' | 'skipped'`: el trabajo no tiene dónde guardar una nota.
- En el worker la cola la dispara **pg_cron contra producción**
  (`20260808000002_cron_funnel_side_effects.sql`). Un registro hecho en la vista previa lo
  atiende el código de producción.

### La medición de video
- **Piezas:**
  - el reproductor `components/funnel/FunnelClickToPlayVideo.tsx` (latido cada 5 s,
    `sendBeacon` al cerrar, respaldo en `localStorage`);
  - la API `app/api/track/video/route.ts` (Zod: `anonId` de 8 a 64 caracteres);
  - la RPC `upsert_video_view`, que guarda una fila por `(anon_id, video_key)`.
- **Cómo combina:** `watch_seconds` se queda con el **máximo** (`greatest`), no la suma,
  porque cada carga de página arranca su contador de cero. `watched_buckets` (100 tramos) se
  une con `|` y es lo único que acumula entre visitas.
- **El contacto:** `contact_id` sale de `anon_identity` y solo se escribe si la fila no
  tenía uno.
- **Una unión anterior manda:** `link_anon_to_contact` nunca pisa una unión previa
  (`coalesce(viejo, nuevo)`). Con el `anon_id` del navegador, un celular que ya estaba unido
  a otro contacto le atribuiría el video a esa persona. Por eso D4 usa un `anon_id` propio
  del enlace.
- **Dos lectores ya cuentan todas las claves sin filtrar:**
  - `get_panel_video` (`20261104000003…sql:176-193`), que lee `lib/metrics/panel/servidor.ts`;
  - `funnel_video_stats` (`app/api/funnels/metrics/route.ts:250`).

### Otros datos verificados
- **Patrón de token a copiar:** la encuesta de visita (`/encuesta/<token>`) marca la
  apertura desde el navegador, así la vista previa de WhatsApp no cuenta.
- **Agente de tasación:** usa `modoDePlantilla` con `PLANTILLAS_QUE_SOLO_AVISAN` /
  `PLANTILLAS_QUE_CONVERSAN` (`lib/ai/tasacion-agent.ts:87`, sin exportar). Una plantilla
  que no está en ninguna de las dos listas cae en `'desconocida'` y avisa por consola en
  cada mensaje.
- **Cartera:** `cargarCartera` (`lib/supabase/cartera.ts`) trae todos los procesos del
  alcance, no una página. Los ids por URL ya desbordaron la cabecera una vez: por eso
  `leerUltimos` va por RPC con los ids en el cuerpo (cartera.ts:314).
- **Línea de tiempo:** `lib/crm/linea-de-tiempo.ts` (puro) más
  `lib/supabase/linea-de-tiempo.ts`. `FilaVideo` no lee hoy `watch_seconds`, `duration_s`
  ni `watched_buckets`. Íconos en `ItemEvento.tsx:15`.
- **Números de teléfono:**
  - el de la empresa, que manda las plantillas, es +54 9 11 3907-0865 (leído de Meta el
    2026-11-27);
  - Paula llama desde +54 9 11 2292-6434.
- **Permisos:**
  - `/metrics` exige `metrics.view`, que tienen admin y dueño;
  - `is_operations_user()` = admin, dueño y coordinador;
  - editar la ficha usa `alcanceContactos`: el abogado queda en `'ninguno'` y el asesor
    edita solo sus contactos.
- **Storage:** el límite de archivo del proyecto es de 500 MB (Management API,
  2026-11-27), así que el video de ~110 MB entra en `funnel-media`. El token de Cloudflare
  es solo de DNS y no sube a R2.
- **Dominio:** `inmodf.com.ar` sirve la plataforma. `/t/` está libre: hoy redirige al
  login, sin ruta propia.

## Goals / Non-Goals

**Goals:**
- Que la persona reciba en segundos un mensaje humano con un video de Diego, y que Paula
  deje de ser un número desconocido.
- Medir con nombre quién entró, cuánto vio y cómo cambia la atención de las llamadas.

**Non-Goals:**
- Emails.
- A/B del mensaje.
- Prender el agente de tasación.
- Editar el video.
- Una pantalla para cambiar los textos (viven en un módulo de contenido).

## Decisions

### D1. Plantillas y textos

Se piden a Meta dos plantillas UTILIDAD en `es_AR`:

| | `tasacion_video_caso_v1` (elegida) | `tasacion_video_sobria_v1` (respaldo) |
|---|---|---|
| `{{1}}` | nombre de pila (ej. "Ana") | igual |
| `{{2}}` | enlace completo (ej. `https://inmodf.com.ar/t/k7Hq2mXb9T`) | igual |
| Botón URL | "Ver el video" → `https://inmodf.com.ar/t/{{1}}` (ej. `k7Hq2mXb9T`) | igual |

Cuerpo de la elegida:
```
Hola {{1}}, recibimos tu solicitud de tasación.

Antes de coordinar la visita, mirá este caso: la dueña de una casa terminó con USD 16.606 más en mano por cómo se publicó, cómo se negoció y cómo se calcularon los impuestos de la venta.

Diego te lo cuenta acá: {{2}}

Te va a llamar Paula desde el +54 9 11 2292-6434 para coordinar.
```

Cuerpo de respaldo:
```
Hola {{1}}, recibimos tu solicitud de tasación.

Antes de coordinar la visita, Diego Ferreyra te comparte un video donde cuenta, con un caso real, cómo trabajamos la venta de una propiedad.

Lo ves acá: {{2}}

Te va a llamar Paula desde el +54 9 11 2292-6434 para coordinar.
```

- **Regla de elección.** `scripts/create-whatsapp-template-tasacion-video.ts` crea las dos y,
  con `--estado`, lee de Meta el `status` y la `category` de cada una:
  - elegida en UTILITY → se usa la elegida;
  - si no, la de respaldo, si está en UTILITY;
  - si ninguna está en UTILITY → sigue `tasacion_llamada_v1`.
- **Meta puede reclasificar después de aprobar.** Por eso el chequeo de estado también se
  corre una semana después de activar.
- **El enlace va también en el texto:** en WhatsApp de computadora el botón no abre nada.
- **Al aprobarse,** se suman a `cuerpos-aprobados.ts` con
  `scripts/sincronizar-cuerpos-plantillas.ts`, y las dos van a `PLANTILLAS_QUE_SOLO_AVISAN`.
  `modoDePlantilla` se testea con la función, no con la constante.

### D2. Tabla `video_bienvenida_enlaces`

| columna | tipo | regla |
|---|---|---|
| `codigo` | `text` PK | `CHECK (codigo ~ '^[A-HJ-NP-Za-km-z2-9]{10}$')`: el alfabeto de `lead_access_tokens` (sin I, O, l, 0, 1) |
| `contact_id` | `uuid` NOT NULL UNIQUE | FK `contacts(id)` ON DELETE CASCADE |
| `deal_id` | `uuid` | FK `deals(id)` ON DELETE SET NULL; el proceso que lo originó |
| `nombre` | `text` | nombre de pila congelado al crear |
| `origen` | `text` NOT NULL | `CHECK (origen IN ('whatsapp','manual'))` |
| `creado_por` | `uuid` | FK `profiles(id)` ON DELETE SET NULL; NULL si lo creó la cola |
| `created_at` | `timestamptz` | default `now()` |
| `enviado_at` | `timestamptz` | se escribe cuando Meta acepta la plantilla con video |
| `primera_apertura`, `ultima_apertura` | `timestamptz` | |
| `aperturas` | `int` NOT NULL | default 0, `CHECK (aperturas >= 0)` |

- **RLS:** activada, con una policy de `SELECT` para `is_operations_user()`. Sin policies de
  escritura.
- **Índices:** el PK y el UNIQUE cubren las lecturas.
- **RPC `video_bienvenida_obtener_o_crear(p_contact uuid, p_deal uuid, p_nombre text,
  p_origen text, p_creado_por uuid, p_codigo text) returns text`:**
  - `SECURITY DEFINER`, `search_path=public`;
  - `INSERT … ON CONFLICT (contact_id) DO NOTHING`, después `SELECT` del código vigente, y
    **siempre** `link_anon_to_contact('bv:' || codigo, p_contact)` (es idempotente, así un
    enlace viejo sin unión se repara solo);
  - el código lo genera la app (`randomInt` en Node) y lo pasa. Si choca con otro PK, la
    app reintenta con otro hasta 3 veces.
- **RPC `video_bienvenida_registrar_apertura(p_codigo text) returns boolean`:** `UPDATE`
  atómico (`aperturas + 1`, `coalesce(primera_apertura, now())`, `ultima_apertura = now()`).
- **RPC `video_bienvenida_marcar_enviado(p_codigo text)`:**
  `enviado_at = coalesce(enviado_at, now())`.
- **Permisos de las tres RPC:** `REVOKE ALL … FROM PUBLIC, anon, authenticated` y
  `GRANT EXECUTE … TO service_role`. Solo las llama el servidor.
- **Migración:** `20261128000001_video_bienvenida.sql`. Antes de crearla, revisar el
  directorio de todas las ramas: `feat/crm-tareas-y-campanita` ya usa `20261127000003`.
- **Verificación** con `scripts/apply-video-bienvenida-pg.ts`, en una transacción con
  ROLLBACK, contra `mncsnastmcjdjxrehdep`:
  - tabla con RLS;
  - el CHECK rechaza 9 caracteres y acepta un código con `o`;
  - el UNIQUE rechaza dos enlaces del mismo contacto;
  - `anon` lee 0 filas y no puede ejecutar las RPC;
  - `obtener_o_crear` dos veces devuelve el mismo código y deja `anon_identity` escrita;
  - la apertura suma 1 y devuelve false con un código inexistente.

### D3. Envío (cola del embudo)

- `lib/video-bienvenida/plantillas.ts` (puro) define:
  - `PLANTILLAS_CON_VIDEO`;
  - `parametrosDelEnvio(plantilla, nombre, url, codigo)`, que devuelve
    `{ bodyParams, urlButtonParam }` o `null`;
  - `esRechazoDePlantilla(error)`: `true` para los códigos 132000–132999 (plantilla
    pausada, deshabilitada o inexistente) y para 131049 / 131050 (frenos de marketing).
- En `primerWhatsappDeTasacion`, si la plantilla vigente está en `PLANTILLAS_CON_VIDEO`:
  1. `obtenerOCrearEnlace` (`lib/video-bienvenida/enlaces.ts`, llama a la RPC). Si falla →
     paso 4.
  2. Envío con `bodyParams: [nombre, url]` y `urlButtonParam: codigo`.
  3. Si Meta acepta → `marcar_enviado`. Si responde `esRechazoDePlantilla` → paso 4.
     Cualquier otro error se propaga como hoy (los límites de volumen siguen reintentando
     con la misma plantilla).
  4. Vuelta atrás: `tasacion_llamada_v1` con `[nombre]`, en el mismo intento. Queda
     visible en `whatsapp_messages.template_name` y deja `console.warn` con el motivo.
- El mensaje cierra con "Te va a llamar Paula desde el +54 9 11 2292-6434 para coordinar."
  (decisión del dueño): lo lee todo el que lo recibe, aunque no abra la página.

### D4. Página `app/t/[codigo]`

- **Página:**
  - componente de servidor, `dynamic = 'force-dynamic'`;
  - metadatos con `robots: { index: false, follow: false }`, `referrer: 'no-referrer'` y
    título y Open Graph fijos ("Diego Ferreyra Inmobiliaria"), nunca con el nombre;
  - sin Píxel de Meta;
  - lee el enlace y la fila de video (`anon_id = 'bv:<codigo>'`) con el rol de servicio;
  - un código que no existe o con formato inválido → `notFound()`.
- **Layout propio** (está fuera de `app/(funnels)`), con la estética de la landing de
  tasación:
  - Montserrat y Lato, azul `#0d2d49`, verde `#00BF63` para el play;
  - franja blanca con el logo centrado (`funnel-media/raw/682c6cc8e10a088724d26be6.png`);
  - titular y subtítulo centrados.
- **Contenido** en `lib/video-bienvenida/contenido.ts`: `titular(nombre)`, `subtitulo`,
  `video: { src, poster, trackKey }`, `paula`, `whatsappEmpresa`.
- **Reproductor:** `FunnelClickToPlayVideo` con `trackKey="bienvenida-tasacion-v1"`,
  `funnel={null}`, `context="bienvenida"` y dos props nuevas:
  - `anonId="bv:<codigo>"`: no lee ni crea la cookie `df_anon`;
  - `onSegundosReproducidos(n)`: avisa cada segundo de reproducción real, contado con
    `timeupdate` mientras no está en pausa y sin sumar saltos de más de 1,5 s.

  Sin las props, el componente es idéntico al de hoy (test).
- **No se muestra la duración.** El póster no lleva el chip de minutos. El reproductor
  nativo, una vez en marcha, muestra su propia barra.
- **"Qué pasa ahora":**
  - `lib/video-bienvenida/mostrar-bloque.ts` (puro): visible si
    `segundosEnEstaVisita >= 30` o si `segundosPrevios >= 30`;
  - `segundosPrevios` = tramos encendidos de `watched_buckets` × `duration_s` / 100, que
    se leen en el servidor;
  - aparece con una transición de opacidad de 300 ms, que se desactiva con
    `prefers-reduced-motion`.
- **Apertura:** `POST /api/public/video/[codigo]`, una vez por carga, con marca en
  `sessionStorage`. Llama a la RPC con el rol de servicio y responde solo `{ ok: true }`.
- **Rutas públicas:** `/t/` va en `middleware.ts` y `/api/public/` ya es pública. Hay un
  test que lo fija.
- **Contacto y archivos:**
  - `app/t/paula.vcf/route.ts`: vCard 3.0, `text/vcard`;
  - "Escribinos": `https://wa.me/5491139070865?text=Hola%2C%20ya%20vi%20el%20video.%20Quiero%20coordinar%20la%20tasaci%C3%B3n.`.
    La respuesta entra al Inbox como cualquier mensaje entrante, y el agente de tasación
    no contesta;
  - el video va a `funnel-media/bienvenida/tasacion-v1.mp4`: 720p H.264 + AAC,
    `+faststart`, ~110 MB. El póster es un JPG.
- **`VIDEO_KEYS`:** suma `'bienvenida-tasacion-v1'` sin `pagina` y con
  `nombreEnLinea: 'el video de bienvenida'`. Cuando llegue el video editado, la clave pasa a
  `-v2` y la `-v1` queda `retirada`.
- **Fuera de los paneles de landings:** `get_panel_video` y `funnel_video_stats` excluyen
  `video_key LIKE 'bienvenida-%'`. El cambio va en la misma migración, y hay un test de la
  parte de JS que filtra.

### D5. Línea de tiempo

- `lib/supabase/linea-de-tiempo.ts`:
  - suma la lectura de `video_bienvenida_enlaces` por `contact_id` con `aperturas > 0`,
    respetando `limiteDeCursor`;
  - amplía `FilaVideo` con `watch_seconds`, `duration_s` y `watched_buckets`.
- `lib/crm/linea-de-tiempo.ts`:
  - nueva clase `enlace_video` (ícono en `ItemEvento.tsx`);
  - `eventoDeAperturaDeEnlace` arma "Abrió el enlace del video de bienvenida" con el
    detalle "{N} veces · la última {relativa}" cuando `N > 1`;
  - `eventosDeVideo` usa `nombreEnLinea` y el detalle `mm:ss de mm:ss` (tramos × duración).

### D6. Marca en la cartera

- RPC `cartera_video_bienvenida(p_contactos uuid[])`, con los ids en el cuerpo. Devuelve por
  contacto: `enviado_at`, `aperturas`, `playback_started` y `max_percent`. Es
  `SECURITY DEFINER` y solo la ejecuta `service_role`.
- Se llama una vez por carga, con los contactos de las filas en Solicitud que el usuario ya
  ve. Es una fuente opcional: si falla, no hay marcas.
- `marcaVideo(enlace, vista)` (puro) devuelve `{ texto }` o `null`. Va en gris, debajo del
  nombre.

### D7. Panel en `/metrics`

- `lib/metrics/panel/video-bienvenida.ts` (puro, con tests) recibe:
  - enlaces con `enviado_at`;
  - vistas;
  - procesos `origin='embudo'` (`created_at`, `scheduled_at`, `stage`);
  - llamadas (`contact_activities`, `kind='call'`, `voided_at IS NULL`).
- **"Atendió":** `call_outcome IN ('agendo','volver_a_llamar','no_interesa')`.
- **"Coordinó":** un proceso del embudo creado desde `enviado_at` con `scheduled_at` no nulo
  o una `stage` de Coordinada en adelante.
- **Grupos:**
  - "Vio el video": `playback_started`;
  - "Abrió sin mirar": aperturas sin play;
  - "No abrió".
- **Antes/después:** respecto de `CAMBIO_DESDE` (constante con la fecha de activación).
  Aviso de que las llamadas existen desde el 26/11/2026.
- **Exclusiones:** Julian Parra, `contacto.julianparra@gmail.com` y `[TEST`. Una persona por
  contacto.
- **UI:** `components/metrics/panel/VideoBienvenida.tsx`.

### D8. Ficha: copiar o crear el enlace

- `POST /api/contacts/[id]/video-bienvenida`:
  - usa `alcanceContactos` (abogado 403; asesor solo en sus contactos);
  - valida que el contacto tenga un proceso `origin='embudo'` (si no, 400);
  - llama a la RPC con `origen: 'manual'` y `creado_por` = la persona;
  - no manda mensajes.
- La ficha lee el enlace y muestra "Enlace del video" con "Copiar", o "Crear enlace del
  video".

## Risks / Trade-offs

- **Meta reclasifica la plantilla:** se cubre con la regla de D1 y la vuelta atrás de D3.
- **Enlace reenviado:** lo que mire otra persona suma a Ana. Se acepta: sigue siendo
  interés de ese hogar.
- **Navegadores dentro de apps que cortan el video:** el latido y el respaldo cubren lo
  visto.
- **Peso del video:** ~110 MB, que se baja por partes con `faststart` y pedidos por rango.
- **Base chica durante semanas:** se muestra con su aviso, no se esconde.
- **El código en la URL:** quien lo tenga ve solo el nombre de pila.
- **QA del envío:** la cola corre con el código de producción, así que el envío con video
  se prueba llamando al manejador por script contra el teléfono de Julián. La prueba real va
  después del merge, con la variable cambiada.

## Migration Plan

1. Aplicar la migración con el script de verificación y deployar. Con
   `WHATSAPP_TEMPLATE_TASACION` sin cambiar, el envío sigue igual.
2. Crear las dos plantillas en Meta.
3. Probar el manejador por script contra el número de Julián (contacto `[TEST]`): recibir,
   abrir, mirar 40 s y verificar que aparezca el bloque de Paula, la ficha y la cartera (el
   panel excluye `[TEST]` y se prueba con sus tests). Borrar los datos de prueba.
4. Con la aprobación: `WHATSAPP_TEMPLATE_TASACION` según la regla de D1, y `CAMBIO_DESDE`.
   Verificar el primer envío real en `whatsapp_messages`.
5. **Vuelta atrás:** `WHATSAPP_TEMPLATE_TASACION=tasacion_llamada_v1`. Los enlaces siguen
   abriendo.

## Open Questions

- ~~¿Sumar la línea de Paula al mensaje?~~ **Resuelto por el dueño (2026-11-27): sí.**
  Reemplaza a "Seguimos en contacto." en las dos plantillas.
- **Video editado:** cuando llegue, `tasacion-v2.mp4`, clave `-v2` y la `-v1` retirada.
