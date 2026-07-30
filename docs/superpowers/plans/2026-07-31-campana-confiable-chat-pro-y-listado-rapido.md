# Campaña confiable, chat profesional, teléfono con país y listado rápido

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development.

**Goal:** que publicar una campaña nunca mienta, que el teléfono se capture bien sin
que la persona sepa de indicativos, que cada comprador tenga su número, que el chat
de WhatsApp sea una herramienta de gestión de verdad, y que el listado de
propiedades abra al instante.

## Hallazgos de la auditoría que originan el plan (evidencia dura)

- **A1 · La campaña se creó y el usuario vio un error.** Log de Meta: `14:08:00
  create_campaign_group por Sistema DF` → `14:09:34 [Inactiva→Eliminada] por Julian`.
  El publish tarda más que el límite de la función de Netlify: el navegador corta y
  muestra error mientras el servidor termina bien.
- **A2 · El segundo publish no creó nada y dijo "publicada".** `confirm/route.ts` tiene
  una rama de recuperación que, si `isCampaignComplete(fila_de_la_DB)`, marca el job
  como `published` y devuelve `ok:true` + link — **sin preguntarle a Meta si la
  campaña todavía existe**.
- **A3 · Listado de propiedades = 21.951 KB por request**, 99% en `photos`. Hay fotos
  guardadas como **base64 dentro de la base**: la más larga mide **4.439.566
  caracteres**. Con las columnas justas: **17 KB / 492 ms**.
- **A4 · "John Doe" es un bot.** Dos registros idénticos (mismo nombre, mail,
  `+54 11 1234 5678`, mismo CTA `closing`, `utm={}`), siempre 2-4 min DESPUÉS de crear
  una campaña — no después de que se registre una persona. Ejecuta JS (el honeypot no
  lo agarra).
- **A5 · El webhook de WhatsApp funciona en producción** (token correcto → 200 + desafío;
  token malo → 403; POST sin firma → 403) pero hay **0 entrantes y 0 estados**: falta
  suscribir la URL en el panel de Meta. Eso explica el "Enviando…" eterno y las
  imágenes que no entraron.

## Global Constraints

- **Nada se borra.** Borrado lógico siempre. Migrar datos = mover + respaldar antes.
- Prosa de UI en **español rioplatense** (voseo).
- **Una operación pesada de red por request** (regla de `lib/landing/enrich.ts`): el
  límite de Netlify corta a los ~26s y `maxDuration` de Next NO aplica.
- Commit author `Sujupar <redstyle50@gmail.com>`.
- Verificación: `tsc` con tsconfig acotado (Turbopack roto local por el acento del
  path) + Vitest + probes `renderToStaticMarkup` + pruebas contra la base real.
- **Prohibido crear campañas en Meta.** La cuenta es de producción. Solo lectura, o
  `execution_options:['validate_only']`.
- **Prohibido mandar WhatsApps reales** (`WHATSAPP_TEST_MODE=false` en `.env.local`).

---

### Task 1: Número de comprador (#)

**Files:** `supabase/migrations/20260731000001_lead_number.sql`,
`app/(dashboard)/inbox/InboxClient.tsx`, `app/api/leads/route.ts`

- [ ] Migración aditiva: secuencia + columna.

```sql
CREATE SEQUENCE IF NOT EXISTS property_leads_number_seq START 1000;
ALTER TABLE property_leads
  ADD COLUMN IF NOT EXISTS lead_number BIGINT DEFAULT nextval('property_leads_number_seq');
-- Numerar los existentes por orden de llegada, sin tocar ningún otro dato.
UPDATE property_leads SET lead_number = nextval('property_leads_number_seq')
  WHERE lead_number IS NULL;
ALTER TABLE property_leads ALTER COLUMN lead_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS property_leads_number_key ON property_leads (lead_number);
COMMENT ON COLUMN property_leads.lead_number IS 'Número de comprador visible para el equipo (#1000, #1001...). Sirve para referirse a una persona sin usar su nombre.';
```

- [ ] Mostrarlo como `#1042` en la tarjeta del Inbox, en el detalle y en el header del chat.
- [ ] Incluirlo en el `select` del GET de leads y en la respuesta del POST.
- [ ] Buscar por número en el buscador del Inbox.

---

### Task 2: Publicar campaña sin mentir — verificar contra Meta

**Files:** `app/api/properties/[id]/meta-launch-v2/[jobId]/confirm/route.ts`,
`lib/marketing/meta-sync.ts`, test.

**El bug (A2):** la rama de recuperación confía en la fila de la DB.

- [ ] Antes de devolver "ya estaba creada", llamar a `syncCampaignState(campaignId)`.
      Solo devolver `resumed: true` si Meta confirma que existe y NO está archivada.
- [ ] Si Meta dice archivada/inexistente: marcar la fila `archived` con nota, y seguir
      al flujo normal que crea una campaña limpia.
- [ ] Test de la función pura de decisión: `decidirRecuperacion(filaDB, estadoMeta)` →
      `'recuperar' | 'crear_nueva'`. Casos: DB completa + Meta ACTIVE → recuperar;
      DB completa + Meta ARCHIVED → crear_nueva; DB completa + Meta no existe →
      crear_nueva; DB incompleta → crear_nueva.

---

### Task 3: Publicar por etapas para no pasarse del tiempo

**Files:** el mismo `confirm/route.ts` + `app/(dashboard)/properties/[id]/marketing/meta-ads/`

**El bug (A1):** el navegador corta antes de que el servidor termine, y el usuario ve
un error sobre trabajo que salió bien.

- [ ] Reusar el patrón ya probado de `lib/landing/enrich.ts`: el POST arranca y
      devuelve rápido; el trabajo pesado avanza en llamadas sucesivas con progreso
      visible. `meta_launch_jobs` ya tiene `status`/`current_step`/`progress_percent`
      y ya existe el endpoint `[jobId]/status` — usar eso, no inventar otra cosa.
- [ ] La UI hace el loop mostrando en qué etapa va ("Creando la campaña…",
      "Creando el conjunto…", "Creando los anuncios (3 de 6)…", "Verificando…").
- [ ] Si el navegador se corta igual, al volver a entrar la pantalla RETOMA (mismo
      criterio que la landing) en vez de arrancar de cero o mostrar un error.

---

### Task 4: El copy de los anuncios lleva precio y operación en la primera frase

**Files:** `lib/marketing/meta-campaign-builder.ts` (generación de copy) + test.

- [ ] La primera frase de cada texto principal incluye **la operación** ("En venta")
      y **el precio** formateado (`USD 109.000`), conectado con el ángulo del avatar —
      no pegado como una etiqueta.
- [ ] Fallback determinístico igual: si la IA no lo incluye, se antepone.
- [ ] Test: para 6 textos generados, los 6 contienen el precio y la operación.

---

### Task 5: Teléfono con bandera, indicativo y país automático

**Files:** `components/landing/PhoneField.tsx` (nuevo),
`components/landing/LeadCaptureProvider.tsx`, `app/api/geo/route.ts` (nuevo),
`lib/integrations/whatsapp/phone.ts`, tests.

- [ ] Campo con **bandera + indicativo** a la izquierda; la persona escribe solo su
      número local. Al tocar la bandera se abre la lista de países con su indicativo
      (buscable).
- [ ] **País por defecto automático**: `GET /api/geo` devuelve el país desde el header
      de geolocalización del CDN (Netlify manda `x-nf-geo`; en local, fallback `AR`).
      Nunca bloquea el render: si falla, arranca en `AR`.
- [ ] La normalización usa el país elegido como región (no "adivinar AR").
- [ ] **Argentina:** la persona NO escribe el 9. Si igual lo escribe, o escribe el 15,
      el resultado tiene que ser el mismo número canónico. Tests explícitos:
      `11 6123 4567`, `9 11 6123 4567`, `15 6123 4567`, `011 15 6123 4567` →
      todos `5491161234567`.
- [ ] **No romper** el caso de que alguien pegue un número completo con `+`.

---

### Task 6: Frenar el bot del formulario público

**Files:** `app/api/leads/route.ts`, `components/landing/LeadCaptureProvider.tsx`,
`lib/leads/anti-bot.ts` (nuevo) + tests.

- [ ] **Ficha de un solo uso:** `GET /api/leads/ticket` devuelve un token firmado
      (HMAC con `CRON_SECRET` o similar, TTL 30 min) que el popup pide al abrirse y
      manda en el POST. Sin ficha válida → el lead se guarda igual pero marcado
      `sospechoso` (NUNCA se descarta: perder un lead real es peor que guardar un bot).
- [ ] **Lista de datos de relleno** (`John Doe`, `john.doe@`, `1234 5678`, `test@test`):
      si coincide, se marca `sospechoso`.
- [ ] Columna `property_leads.suspected_bot BOOLEAN DEFAULT false` (aditiva) + insignia
      en el Inbox y filtro para ocultarlos.
- [ ] Marcar como sospechosos y mandar a la papelera los 2 "John Doe" ya existentes
      (borrado LÓGICO, con su `lead_number` intacto).

---

### Task 7: Listado de propiedades instantáneo

**Files:** `supabase/migrations/20260731000002_vw_properties_list.sql`,
`app/api/properties/route.ts`, `app/(dashboard)/properties/page.tsx`

**El bug (A3):** 21.951 KB por request, 99% `photos`.

- [ ] Vista `vw_properties_list` con SOLO las columnas del listado + `photos[1] AS
      thumbnail` + `array_length(photos,1) AS photo_count`. **Nunca** el array completo.
- [ ] El endpoint del listado lee de la vista. El detalle sigue trayendo todo.
- [ ] Paginación de a 24 con scroll infinito o "cargar más".
- [ ] Medir antes/después y dejarlo escrito en el reporte.

---

### Task 8: Sacar las fotos base64 de la base

**Files:** `scripts/migrate-base64-photos.ts`

- [ ] **Respaldo primero**: volcar a un JSON local todos los `properties.id + photos`
      actuales ANTES de tocar nada. Sin respaldo escrito, no se ejecuta.
- [ ] Por cada elemento de `photos` que empiece con `data:`, decodificar, subir a
      Storage (`properties/{id}/photos/`) y **reemplazar** el elemento por la URL.
      El orden del array se preserva (es la portada).
- [ ] Modo `--dry-run` por defecto; `--commit` para escribir. Idempotente.
- [ ] Verificación posterior: 0 elementos `data:` y la misma cantidad de fotos por
      propiedad que antes.

---

### Task 9: Chat de WhatsApp profesional

**Files:** `app/(dashboard)/inbox/WhatsappClient.tsx`, `app/api/whatsapp/*`,
`components/inbox/*` (nuevos)

- [ ] **Estado honesto:** `accepted` deja de decir "Enviando…" (Meta ya lo aceptó) y
      pasa a "Enviado ✓". Si el webhook no está suscrito, un aviso lo explica en vez de
      dejar tildes que nunca avanzan.
- [ ] **Cabecera:** nombre, **#número de comprador**, teléfono y propiedad. A la
      derecha, tarjeta con foto de la propiedad que linkea a su ficha.
- [ ] **Enviar información de la propiedad:** botón que ofrece lo que esa propiedad
      tenga (fotos, video, recorrido, planos, landing). Muestra la vista previa de lo
      que se va a mandar y pide confirmación antes de enviar.
- [ ] **Plantillas:** selector con las aprobadas (`GET` a Meta, cacheado) para reabrir
      conversaciones fuera de las 24h.
- [ ] **Emojis:** selector.
- [ ] **Multimedia entrante:** imágenes/audio/documento se muestran en el hilo, no como
      `[imagen]`. Descarga vía el endpoint de media de Meta, guardando en Storage.
- [ ] **Filtros:** no leídas, más recientes, por propiedad, por asesor. Buscador.
- [ ] Todo con el helper `readJson` (nunca "Unexpected token '<'").

---

## Verificación final

1. `npx vitest run` completo en verde + `tsc` acotado de todo lo tocado.
2. Probes contra la base real (listado antes/después, migración base64 en dry-run).
3. Agente de revisión adversarial sobre la rama completa.
4. **Gates del usuario:** suscribir el webhook en el panel de Meta (`messages`), y
   recién entonces la prueba end-to-end.
