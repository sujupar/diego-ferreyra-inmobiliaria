# Proposal

## Why

Del 13 al 27 de noviembre de 2026 entraron 14 solicitudes de tasación por el embudo, que son
**9 personas** (Valeria se registró 3 veces; Martín, Jorge y Claudio, 2 cada uno). Se
coordinaron 2 visitas. La nota que más repite Paula en esos procesos es **"BUZÓN x2 / x3"**:
la persona no atiende la llamada.

Hoy, a los segundos de registrarse, la persona recibe este WhatsApp (`tasacion_llamada_v1`):

> Hola {{1}}, ¡recibimos tu solicitud de tasación!
> Te llamará Paula desde el número +54 9 11 2292-6434 para coordinarla
> Seguimos en contacto

Es correcto pero plano: no le da a la persona ninguna razón para atender la llamada de un
número que no conoce, ni le muestra con quién está hablando.

La práctica que se copia viene de Ramiro Cubría (Sell Your Knowledge). Su página de
confirmación (`sellyourknowledge.io/confirmacion`, vista el 2026-11-27) es un titular
"Mirá este video antes de tu llamada" seguido de un único video principal. Debajo pone
casos y preguntas frecuentes, y no tiene formulario. Las guías de la industria que
estudian la asistencia a llamadas coinciden en tres cosas:

- un solo video arriba de todo;
- decir qué pasa después y quién llama;
- no vender otra cosa en esa página.

## What Changes

- **Nuevo primer WhatsApp de tasación** (plantilla de UTILIDAD, se pide a Meta). Confirma
  la solicitud y le entrega a la persona un video de Diego con **su enlace personal**. Lleva
  el enlace en un botón para el celular y en el texto para WhatsApp de computadora, donde
  los botones de plantilla no abren nada.
- **Enlace personal por contacto:** un código corto e imposible de adivinar
  (`inmodf.com.ar/t/<código>`, dominio corto de la plataforma) que identifica a la persona sin pedirle
  nada. Un contacto que se registra varias veces conserva el mismo enlace.
- **Página del video** (pública, para celular primero): titular con el nombre de la
  persona, subtítulo y el video. Sin formulario, sin otras propiedades, sin otra oferta.
- **Medición por persona, con nombre:**
  - si se le mandó el enlace;
  - si entró, cuándo y cuántas veces;
  - si le dio play;
  - cuántos segundos vio;
  - hasta qué porcentaje llegó;
  - si lo terminó.

  Se reusa la medición de video que ya existe en las landings (latido cada 5 s, respaldo
  si se cierra el navegador). La diferencia es que acá la visita queda atada al contacto
  desde el primer segundo.
- **Ficha:** "Enlace del video" con "Copiar", y "Crear enlace del video" para quien se
  registró antes del cambio, para que Paula lo mande a mano (decisión 4).
- **Dónde se ve:**
  - en la línea de tiempo de la ficha ("Abrió el enlace del video de bienvenida", "Vio el video de
    bienvenida · 64 %");
  - en la cartera de Paula, una marca en la fila para saber, antes de llamar, si la
    persona vio el video;
  - un panel en `/metrics`: la lista de personas, y la comparación de cuántos atendieron
    la llamada y cuántos coordinaron la tasación, entre los que vieron el video y los que
    no, y antes contra después del cambio.

**Queda afuera:**
- la secuencia de emails (próximo change);
- la reunión semanal con Paula sobre el proceso comercial;
- la edición del video (Diego entrega el editado; esta pieza funciona con el limpio y se
  cambia el archivo sin tocar código);
- prender el agente de IA de tasación (sigue apagado; la plantilla nueva solo informa);
- mandar el video a personas que se registraron antes del cambio, salvo que el dueño lo
  pida (pregunta 4);
- A/B entre el mensaje viejo y el nuevo (con 9 personas cada dos semanas no daría una
  respuesta en meses: se compara antes contra después).

**Roles:**
- La página la ve cualquiera que tenga el enlace, que solo llega por WhatsApp a la persona.
- La medición la ven:
  - admin y dueño en `/metrics` (los que hoy tienen `metrics.view`);
  - Paula (coordinador) en su cartera y en la ficha;
  - quien puede abrir la ficha, en la línea de tiempo, con las reglas de hoy.
- El abogado no ve nada nuevo.

## Capabilities

### New Capabilities
- `tasacion-video-bienvenida`: el enlace personal, la página del video, qué se mide y
  cuándo se manda.

### Modified Capabilities
- `crm-linea-de-tiempo`: dos eventos nuevos (abrió el enlace, vio el video de bienvenida).
- `crm-cartera`: marca "vio el video" en la fila de las solicitudes.

## Impact

- **Base:** tabla nueva de enlaces personales (código, contacto, proceso, aperturas), con
  RLS de solo lectura para el equipo de operaciones; la escritura pasa solo por una
  función atómica. Los datos del video van a las tablas que ya existen
  (`video_view_state`, `anon_identity`).
- **Código:**
  - el trabajo `whatsapp` de la cola del embudo (`primerWhatsappDeTasacion`) crea o reusa
    el enlace y lo manda en la plantilla;
  - ruta pública `app/t/[codigo]`;
  - API pública de apertura;
  - una clave nueva en `VIDEO_KEYS`;
  - lecturas para la ficha, la cartera y el panel.
- **Externo:**
  - plantilla nueva a aprobar en Meta (Utilidad, con botón de URL);
  - el video se sube a Supabase Storage (`funnel-media`), comprimido a 720p; el token de
    Cloudflare solo maneja el dominio y no puede subir a R2;
  - `WHATSAPP_TEMPLATE_TASACION` en Netlify pasa a la plantilla nueva recién cuando Meta
    la apruebe como UTILIDAD.
- **Corte seguro:** si crear el enlace falla, se manda la plantilla de hoy
  (`tasacion_llamada_v1`). Nadie se queda sin el primer mensaje.

## Decisiones del dueño (2026-11-27, "ok a las 5")

1. **El texto del WhatsApp.** Propuesta en `design.md` § D1: una versión sobria (A) y una
   con el gancho de los USD 16.606 (B). **Recomiendo mandar las dos a Meta y usar la B
   solo si sale aprobada como Utilidad.** Si Meta la pasa a Marketing, queda la A.
2. **¿La página dice quién llama y desde qué número, con un botón "Guardar el contacto de
   Paula"?** Recomiendo que sí: ataca directo el "BUZÓN", porque el número deja de ser
   desconocido. Va debajo del video, chico.
3. **¿Botón "Escribinos por WhatsApp" debajo del video?** Recomiendo que sí, chico y al
   final. Si la persona escribe, se abre la conversación y Paula puede coordinar por chat.
4. **Las 9 personas de las últimas dos semanas que no atendieron:** recomiendo NO
   mandarles nada automático. Si querés, Paula les manda el enlace a mano desde la ficha
   (cada contacto tiene su enlace copiable).
5. **Dominio del enlace** (reemplazada por el ajuste de abajo): recomiendo `inmobiliariadiegoferreyra.com/video/<código>`, el
   de las landings públicas, y no `inmodf.com.ar`, que es el de la plataforma interna.

**Ajustes del dueño sobre la maqueta (2026-11-27):**

- Se elige la versión con el caso (B). La sobria queda solo si Meta no aprueba la B como
  Utilidad, y si las dos salen Marketing sigue `tasacion_llamada_v1`.
- El enlace usa el dominio corto de la plataforma, `inmodf.com.ar/t/<código>`, para que no se
  salga del mensaje. La página se sirve directo en esa dirección, sin redirección intermedia.
- No se muestra cuánto dura el video.
- "Qué pasa ahora" aparece recién a los 30 segundos de video reproducido.
- Arriba va el logo de Diego centrado, y el titular y el subtítulo van centrados.
