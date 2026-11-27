# Pre-Flight Report: tasacion-video-bienvenida

Se corrió con la skill `anticipating-implementation-conflicts`. Esa skill viene de otro
proyecto: las dimensiones de FUB, apps nativas (Capacitor), WordPress y el remoto
`sujupar` no aplican acá.

## Dimensiones aplicables

- **[#1] Base:** la migración es aditiva.
  - Agrega una tabla nueva y 5 funciones nuevas.
  - No toca triggers ni funciones existentes; el filtro SQL de `get_panel_video` se
    descartó.
  - Se aplica con `scripts/apply-video-bienvenida-pg.ts`, por el pooler.
- **[#2] Permisos:**
  - La tabla tiene RLS de solo lectura para operaciones.
  - Las RPC son solo de `service_role`, con `REVOKE` explícito.
  - La ruta pública `POST /api/public/video/[codigo]` no recibe datos ni devuelve datos:
    solo suma una apertura a un código de 58 bits.
  - La página detecta la sesión con `getUser()` (validación real), no con la presencia de
    la cookie.
- **[#3] pg_cron:** no hay cron nuevo. El envío reusa la cola existente
  (`funnel_lead_jobs`), que ya dispara pg_cron.
- **[#4] APIs externas:**
  - WhatsApp Cloud API: una plantilla más en el mismo envío, y en el webhook como mucho una
    llamada a Meta por estado `failed`, en la misma rama que la encuesta (con techo de 8 s,
    antes del presupuesto de IA).
  - Supabase Storage: 500 MB por archivo (verificado).
  - Costo por mensaje: no tengo el precio verificable de la tarifa de Utilidad en Argentina;
    no se estima.
- **[#5] Secretos:** ninguno nuevo. `WHATSAPP_TEMPLATE_TASACION` ya existe; solo cambia su
  valor al final.
- **[#7] Ruteo:** `/t/` es nueva en `middleware.ts`. No toca la navegación del panel.
- **[#9] Mensajes a clientes:**
  - Hay idempotencia, porque el enlace es único por contacto.
  - `marcar_enviado` es best-effort, para no reenviar.
  - El respaldo se toma de forma atómica, para que salga una sola vez.
  - La plantilla vigente no cambia hasta que Meta la aprueba.
- **[#10] Storage:** se usa el bucket público existente `funnel-media`, carpeta
  `bienvenida/`.
- **[#11] Caché:** la página es `force-dynamic`. El video puede quedar en caché en el CDN
  de Supabase: cuando llegue el editado, va con nombre nuevo (`-v2`).
- **[#12] Deploy:**
  - `git push origin <rama>` + PR + merge, con autor `Sujupar <redstyle50@gmail.com>`
    (CLAUDE.md de este repo).
  - Migración antes del deploy.
- **[#13] Aprobaciones:** mandar las plantillas a Meta lo pidió el dueño. Activarlas
  (cambiar la variable en Netlify) se hace recién con la aprobación de Meta.

## Riesgos detectados

- 🟡 **ALTO.** El webhook suma trabajo en la rama de estados.
  - **Mitigación:** misma rama `failed` que la encuesta. Un `wamid` es de un solo mensaje,
    así que como mucho uno de los dos respaldos llama a Meta. El test lo fija.
- 🟡 **ALTO.** La sesión del CRM sigue tocando `cartera.ts`, `FichaContacto.tsx` y
  `side-effect-handlers.ts` en main.
  - **Mitigación:** antes del merge, `git fetch` + rebase, y revisar con
    `git diff --name-only origin/main...` que estén solo los archivos propios.
- 🟢 **BAJO.** El video pesa ~110 MB.
  - **Mitigación:** se sube con TUS, y `faststart` sirve por partes.

## Recomendación

PROCEDER-CON-MITIGACIONES.
