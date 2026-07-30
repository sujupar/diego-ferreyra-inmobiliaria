# Visibilidad de WhatsApp y sincronización con Meta — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development.
> Spec: `docs/superpowers/specs/2026-07-30-visibilidad-whatsapp-y-sync-meta-design.md`

**Goal:** que ningún WhatsApp se pierda en silencio, que el equipo vea todas las
conversaciones, que se puedan borrar leads sin perder datos, y que el panel de
campañas nunca muestre un estado que Meta ya no tiene.

**Architecture:** una tabla de mensajes como fuente de verdad del WhatsApp
(salientes + entrantes + estados), alimentada por el cliente de envío y por un
webhook de Meta; un chat en el Inbox que lee de ahí; borrado lógico en leads; y un
sincronizador que consulta el estado real de Meta antes de renderizar el panel.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase, `libphonenumber-js` (nueva), Vitest.

## Global Constraints

- **Prosa al usuario en español rioplatense.** Todo texto de UI usa voseo.
- **Nada se borra.** `deleted_at` lógico; migraciones solo aditivas. Ninguna
  migración puede hacer DROP ni DELETE de datos existentes.
- **El log nunca rompe el envío.** Toda escritura de `whatsapp_messages` va en
  try/catch y solo hace `console.warn` al fallar.
- **El código tiene que funcionar ANTES de que la migración se aplique** (el
  usuario la corre a mano en el Dashboard). Si la tabla no existe, el log falla en
  silencio y el resto sigue.
- **Commit author `Sujupar <redstyle50@gmail.com>`** o el deploy de Netlify falla.
- **Una llamada de IA/red pesada por request** (regla de `lib/landing/enrich.ts`):
  nada de encadenar varias dentro de un mismo handler.
- **Verificación:** `tsc` con tsconfig acotado (Turbopack está roto local por el
  acento del path) + Vitest + probes con `renderToStaticMarkup` o contra la base real.
- `normalizePhone` **jamás** devuelve un número inventado: ante duda, `null`.

---

### Task 1: Migración SQL (tabla de mensajes + papelera de leads)

**Files:**
- Create: `supabase/migrations/20260730000001_whatsapp_messages_y_leads_papelera.sql`

**Interfaces:**
- Produce: tabla `whatsapp_messages`, columna `property_leads.deleted_at`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 1. Mensajes de WhatsApp: fuente de verdad de TODO lo que entra y sale.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction      TEXT NOT NULL CHECK (direction IN ('out','in')),
  -- Teléfono en E.164 SIN '+' (formato de la Cloud API). Es la clave de la conversación.
  phone_e164     TEXT NOT NULL,
  -- El número canónico que devuelve Meta en contacts[].wa_id. Puede diferir del
  -- que mandamos (Meta le agrega el 9 a los móviles argentinos, por ejemplo).
  wa_id          TEXT,
  wa_message_id  TEXT UNIQUE,
  contact_name   TEXT,
  lead_id        UUID REFERENCES property_leads(id) ON DELETE SET NULL,
  property_id    UUID REFERENCES properties(id) ON DELETE SET NULL,
  template_name  TEXT,
  body_preview   TEXT,
  payload        JSONB,
  status         TEXT NOT NULL DEFAULT 'accepted',
  error_code     TEXT,
  error_message  TEXT,
  sent_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN whatsapp_messages.status IS 'skipped|accepted|sent|delivered|read|failed. Texto libre a propósito: Meta agrega estados nuevos sin avisar y un CHECK haría fallar el webhook.';

CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx   ON whatsapp_messages (phone_e164, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_lead_idx    ON whatsapp_messages (lead_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_created_idx ON whatsapp_messages (created_at DESC);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
-- Solo operaciones (admin/dueño/coordinador): las filas tienen teléfono y texto de
-- clientes. Mismo criterio que property_leads; el abogado queda afuera.
DROP POLICY IF EXISTS whatsapp_messages_ops_read ON whatsapp_messages;
CREATE POLICY whatsapp_messages_ops_read ON whatsapp_messages
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- 2. Papelera de leads: borrado lógico, nada se pierde.
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS property_leads_not_deleted_idx
  ON property_leads (created_at DESC) WHERE deleted_at IS NULL;
COMMENT ON COLUMN property_leads.deleted_at IS 'Borrado lógico desde el Inbox. NULL = visible. Se restaura poniéndolo en NULL.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260730000001_whatsapp_messages_y_leads_papelera.sql
git commit -m "feat(db): tabla de mensajes de WhatsApp + papelera de leads"
```

---

### Task 2: `normalizePhone` que no inventa números

**Files:**
- Modify: `lib/integrations/whatsapp/core.ts` (función `normalizePhone`)
- Create: `lib/integrations/whatsapp/phone.ts`
- Test: `lib/integrations/whatsapp/phone.test.ts`
- Dep: `npm i libphonenumber-js`

**Interfaces:**
- Produce: `normalizeWhatsappPhone(raw: string | null | undefined): string | null`
  (E.164 sin `+`), `isWhatsappUsable(raw): boolean`.
- `normalizePhone` en `core.ts` pasa a delegar en `normalizeWhatsappPhone` para no
  romper a sus 3 consumidores actuales.

- [ ] **Step 1: Test que falla** (`lib/integrations/whatsapp/phone.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { normalizeWhatsappPhone, isWhatsappUsable } from './phone'

describe('normalizeWhatsappPhone', () => {
  it('respeta el indicativo explícito del exterior (el bug que rompió la prueba real)', () => {
    // Este número colombiano se convertía en 543107822955 (argentino inexistente).
    expect(normalizeWhatsappPhone('+57 310 782 2955')).toBe('573107822955')
    expect(normalizeWhatsappPhone('+573107822955')).toBe('573107822955')
  })

  it('asume Argentina cuando NO hay indicativo', () => {
    expect(normalizeWhatsappPhone('11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('1161234567')).toBe('5491161234567')
  })

  it('emite el 9 canónico de los móviles argentinos', () => {
    expect(normalizeWhatsappPhone('+54 11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('+54 9 11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('+54 351 555 1234')).toBe('5493515551234')
  })

  it('saca el 15 de los móviles escritos a la vieja usanza', () => {
    expect(normalizeWhatsappPhone('011 15 6123 4567')).toBe('5491161234567')
  })

  it('devuelve null en vez de inventar cuando no es un número válido', () => {
    expect(normalizeWhatsappPhone('3107822955')).toBeNull() // 10 dígitos que no son AR válido
    expect(normalizeWhatsappPhone('+54 11 1234 5678')).toBeNull() // relleno, no existe
    expect(normalizeWhatsappPhone('123')).toBeNull()
    expect(normalizeWhatsappPhone('no es un teléfono')).toBeNull()
    expect(normalizeWhatsappPhone('')).toBeNull()
    expect(normalizeWhatsappPhone(null)).toBeNull()
  })

  it('isWhatsappUsable es el mismo criterio', () => {
    expect(isWhatsappUsable('+57 310 782 2955')).toBe(true)
    expect(isWhatsappUsable('3107822955')).toBe(false)
  })
})
```

Los valores esperados de arriba **ya están verificados** contra la librería con el
algoritmo del Step 3. No hace falta redescubrirlos. Si algún caso no da, es un bug
de la implementación, no del test.

- [ ] **Step 2: Correr y ver fallar**

`npx vitest run lib/integrations/whatsapp/phone.test.ts` → falla (módulo inexistente).

- [ ] **Step 3: Implementar `phone.ts`** con este algoritmo exacto, ya validado:

```ts
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

// Tipos que pueden tener WhatsApp. Verificado empíricamente: AR/ES/BR/UY dan
// 'MOBILE', pero US/MX/CL dan 'FIXED_LINE_OR_MOBILE' — hay que aceptar los dos o
// se rechazan clientes reales del exterior.
const CON_WHATSAPP = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE'])

export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const x = parsePhoneNumberFromString(raw, 'AR')
  if (!x || !x.isValid()) return null
  if (CON_WHATSAPP.has(String(x.getType()))) return x.number.replace('+', '')
  // Argentina: un móvil escrito sin el 9 se parsea como FIXED_LINE. Probamos
  // insertar el 9 y RE-VALIDAMOS — no adivinamos, confirmamos con la librería.
  if (x.country === 'AR') {
    const y = parsePhoneNumberFromString(`+549${x.nationalNumber}`)
    if (y?.isValid() && CON_WHATSAPP.has(String(y.getType()))) return y.number.replace('+', '')
  }
  return null
}

export const isWhatsappUsable = (raw: string | null | undefined): boolean =>
  normalizeWhatsappPhone(raw) !== null
```

**Dos detalles críticos, verificados a mano:**
1. **Hay que importar de `libphonenumber-js/max`, NO de `libphonenumber-js`.** El
   build por defecto trae metadata mínima: `getType()` devuelve `undefined` y
   `3107822955` pasa como válido argentino — o sea, el bug original seguiría vivo.
   Con `/max`, ese número da `isValid() === false`, que es lo que queremos.
2. La librería sola **no** agrega el 9 de los móviles argentinos
   (`+54 11 6123 4567` → `+541161234567`), pero **sí** entiende el 15 viejo
   (`011 15 6123 4567` → `+5491161234567`). De ahí el paso de re-validación.

Documentar arriba del archivo el bug real que lo originó (el número colombiano
convertido en argentino inexistente).

- [ ] **Step 4: Delegar desde `core.ts`** — `normalizePhone` ahora llama a
      `normalizeWhatsappPhone`. Verificar que los 3 consumidores
      (`send-recorrido-whatsapp.ts`, `portal-inquiries/notify.ts`,
      `cron/portal-inquiries/route.ts`) siguen compilando.

- [ ] **Step 5: Tests + tsc + commit**

---

### Task 3: Registrar TODOS los mensajes que salen

**Files:**
- Create: `lib/integrations/whatsapp/log.ts`
- Modify: `lib/integrations/whatsapp/core.ts` (`sendWhatsappTemplate`, y el envío de texto si existe)
- Test: `lib/integrations/whatsapp/log.test.ts`

**Interfaces:**
- Consume: tabla `whatsapp_messages` (Task 1).
- Produce: `logOutbound(input): Promise<void>` — NUNCA lanza.
  `mapMetaStatus(s: string): string` (pura, testeable).

- [ ] **Step 1: Test de la parte pura** — `mapMetaStatus` traduce los estados de Meta
      y deja pasar los desconocidos tal cual (Meta agrega estados sin avisar).

- [ ] **Step 2: Implementar `log.ts`.** Cliente service-role. `logOutbound` recibe
      `{ phone, waId, waMessageId, templateName, bodyPreview, payload, status,
      errorCode, errorMessage, leadId, propertyId, sentBy }`, inserta y traga
      cualquier error con `console.warn`.

- [ ] **Step 3: Cablear en `sendWhatsappTemplate`.** Registrar en los TRES caminos:
      (a) `skipped` (modo prueba / sin credenciales), (b) éxito — capturando
      `json.contacts?.[0]?.wa_id` **y** `json.messages?.[0]?.id`, (c) error — con
      `json.error.code` y `message`. Parsear `contacts` (hoy se descarta).
      El log va DESPUÉS de tener la respuesta y nunca cambia el valor devuelto.

- [ ] **Step 4:** pasar `leadId`/`propertyId` desde `sendRecorridoWhatsapp` y desde
      `portal-inquiries/notify.ts` para que el chat sepa a qué operación pertenece
      cada mensaje. Agregar los campos opcionales a las firmas.

- [ ] **Step 5: Tests + tsc + commit**

---

### Task 4: El formulario de la landing no acepta teléfonos inservibles

**Files:**
- Modify: `components/landing/LeadCaptureProvider.tsx` (validación en el submit)
- Modify: `app/api/leads/route.ts` (validación de servidor + guardar el E.164)
- Modify: `app/(dashboard)/inbox/InboxClient.tsx` (insignia de teléfono inservible)
- Test: `lib/integrations/whatsapp/phone.test.ts` (ampliar)

**Interfaces:** consume `isWhatsappUsable` / `normalizeWhatsappPhone` (Task 2).

- [ ] **Step 1:** en el submit del popup, si hay teléfono y no es usable, error en
      línea: *"Revisá el número: puede que falte la característica o el indicativo del país (ej. +57 para Colombia)."*
      No bloquear si el campo está vacío y hay email (la regla actual es nombre + email **o** teléfono).
- [ ] **Step 2:** en `POST /api/leads`, guardar además el teléfono normalizado. **No
      rechazar** el lead por teléfono inválido (un lead con email sigue sirviendo):
      guardarlo tal cual y dejar que la insignia lo marque.
- [ ] **Step 3:** en el Inbox, insignia ámbar "Teléfono no válido para WhatsApp" en
      los leads cuyo teléfono no pasa `isWhatsappUsable`.
- [ ] **Step 4:** probe con `renderToStaticMarkup` + tsc + commit.

---

### Task 5: Webhook de entrada de WhatsApp

**Files:**
- Create: `app/api/webhooks/whatsapp/route.ts`
- Create: `lib/integrations/whatsapp/webhook.ts` (parseo puro + verificación de firma)
- Test: `lib/integrations/whatsapp/webhook.test.ts`

**Interfaces:**
- Produce: `parseWebhookPayload(body): { inbound: InboundMessage[]; statuses: StatusUpdate[] }` (pura),
  `verifySignature(raw: string, header: string | null, appSecret: string): boolean`.

- [ ] **Step 1: Tests** con payloads reales de Meta (mensaje de texto entrante y
      actualización de estado `delivered`). Casos: firma válida / inválida / ausente;
      payload sin `entry`; mensaje que no es de texto (imagen/audio → se guarda con
      `body_preview` describiendo el tipo, no se pierde).
- [ ] **Step 2:** implementar `webhook.ts`. Firma: HMAC-SHA256 del cuerpo **crudo**
      con `WHATSAPP_APP_SECRET`, comparación en tiempo constante
      (`crypto.timingSafeEqual`). Sin `WHATSAPP_APP_SECRET` configurado → devolver
      `false` (fail closed).
- [ ] **Step 3:** ruta. `GET` responde `hub.challenge` si
      `hub.verify_token === WHATSAPP_WEBHOOK_VERIFY_TOKEN`. `POST` lee el cuerpo con
      `await req.text()` (la firma necesita el crudo), valida, y persiste: entrantes
      como filas nuevas `direction='in'`; estados como UPDATE por `wa_message_id`.
      **Siempre responder 200** ante payload válido aunque el guardado falle: si no,
      Meta reintenta en loop.
- [ ] **Step 4:** atar el entrante al lead por teléfono (buscar el lead más reciente
      con ese `phone_e164` normalizado). Si no hay, la fila queda sin `lead_id` — no
      se descarta nunca.
- [ ] **Step 5: Tests + tsc + commit**

---

### Task 6: API del chat

**Files:**
- Create: `app/api/whatsapp/conversations/route.ts` (GET lista)
- Create: `app/api/whatsapp/conversations/[phone]/route.ts` (GET hilo)
- Create: `app/api/whatsapp/send/route.ts` (POST respuesta)
- Create: `lib/integrations/whatsapp/window.ts` (ventana de 24h, pura)
- Test: `lib/integrations/whatsapp/window.test.ts`

**Interfaces:**
- Produce: `serviceWindow(lastInboundAt: string | null, now: Date): { open: boolean; msRemaining: number }`

- [ ] **Step 1: Tests de `serviceWindow`** — abierta a las 23h59, cerrada a las 24h01,
      cerrada si nunca hubo entrante (`null`).
- [ ] **Step 2:** implementar `window.ts` (24h desde el último entrante).
- [ ] **Step 3:** GET de conversaciones: agrupa por `phone_e164`, devuelve último
      mensaje, hora, conteo de no leídos (entrantes sin `read`), nombre del contacto
      y lead/propiedad si hay. Gate: `requireAuth` + rol de operaciones (403 al abogado).
- [ ] **Step 4:** GET del hilo: mensajes ordenados + estado de la ventana de 24h.
- [ ] **Step 5:** POST de envío: **rechaza texto libre con 409 si la ventana está
      cerrada** (mensaje explicando que solo se puede plantilla). Envía por
      `sendWhatsappText`; si no existe esa función en `core.ts`, agregarla siguiendo
      el patrón de `sendWhatsappTemplate` (incluido el log de Task 3). Registra con
      `sent_by = user.id`.
- [ ] **Step 6: Tests + tsc + commit**

---

### Task 7: UI del chat en el Inbox

**Files:**
- Create: `app/(dashboard)/inbox/WhatsappClient.tsx`
- Modify: `app/(dashboard)/inbox/InboxTabs.tsx` (tercera pestaña)

- [ ] **Step 1:** pestaña "WhatsApp" con icono `MessageCircle`, mismo estilo que las
      dos existentes (copiar el patrón exacto de los botones actuales).
- [ ] **Step 2:** dos columnas: lista de conversaciones a la izquierda, hilo a la
      derecha. En móvil, una sola columna con vuelta atrás.
- [ ] **Step 3:** burbujas: salientes a la derecha, entrantes a la izquierda, con
      tilde de estado (enviado/entregado/leído/**falló con el motivo visible**).
      Que un fallo se VEA es el punto de toda esta tarea.
- [ ] **Step 4:** caja de respuesta con el estado de la ventana de 24h: si está
      abierta, cuánto queda; si está cerrada, deshabilitada con la explicación.
- [ ] **Step 5:** todas las respuestas con el helper `readJson` (mismo patrón que
      `LandingSection.tsx`) para no mostrar nunca "Unexpected token '<'".
- [ ] **Step 6:** probe con `renderToStaticMarkup` + tsc + commit.

---

### Task 8: Papelera de leads con selección múltiple

**Files:**
- Modify: `app/api/leads/route.ts` (DELETE + excluir borrados de los listados)
- Create: `app/api/leads/restore/route.ts`
- Modify: `app/(dashboard)/inbox/InboxClient.tsx`

- [ ] **Step 1:** `DELETE /api/leads` con `{ ids: string[] }` → `deleted_at = now()`.
      `requireAuth` + rol de operaciones. Validar que `ids` sea un array no vacío de
      UUIDs y cortar en 200 por request.
- [ ] **Step 2:** excluir `deleted_at IS NOT NULL` de TODOS los listados de leads
      (grepear `from('property_leads')` y revisar cada uno; también los conteos del
      badge del Inbox y las métricas).
- [ ] **Step 3:** `POST /api/leads/restore` con `{ ids }` → `deleted_at = null`.
- [ ] **Step 4:** UI: casilla por lead + "seleccionar todos", barra de acciones con
      "Eliminar seleccionados" y confirmación que dice **cuántos** se van a eliminar
      y que se pueden recuperar.
- [ ] **Step 5:** filtro nuevo "Papelera" que lista los borrados con botón "Restaurar".
- [ ] **Step 6:** probe + tsc + commit.

---

### Task 9: Sincronización con Meta — que el panel no mienta

**Files:**
- Create: `lib/marketing/meta-sync.ts`
- Test: `lib/marketing/meta-sync.test.ts`
- Modify: `app/(dashboard)/properties/[id]/marketing/meta-ads/page.tsx`
- Modify: `components/marketing/MetaAdsWizard.tsx` (panel v1: estado real + link)
- Create: `app/api/marketing/meta/reconcile/route.ts`

**Interfaces:**
- Produce: `mapMetaCampaignStatus(metaStatus: string | null, exists: boolean): 'active'|'paused'|'archived'` (pura),
  `syncCampaignState(campaignId): Promise<{ status; adsetCount; adCount; changed: boolean }>`,
  `adsManagerUrl(campaignId): string`

- [ ] **Step 1: Tests de `mapMetaCampaignStatus`** — `ACTIVE`→active, `PAUSED`→paused,
      `ARCHIVED`/`DELETED`→archived, inexistente (`exists:false`)→archived,
      desconocido→`paused` (conservador: no decimos que gasta si no sabemos).
- [ ] **Step 2:** implementar `syncCampaignState`: `GET /{id}?fields=status,effective_status`
      + contar conjuntos y anuncios. Si Meta devuelve error de objeto inexistente,
      tratar como archivada. Actualizar la fila solo si cambió, y anotar en
      `last_error` cuando el cambio vino de afuera (ej.
      `'Sincronizado con Meta: la campaña fue eliminada desde Ads Manager'`).
      **Nunca** borra la fila: es historia.
- [ ] **Step 3:** `adsManagerUrl` incluye el filtro que hace visibles las archivadas
      para que un ID borrado se pueda encontrar.
- [ ] **Step 4:** la página de meta-ads sincroniza antes de renderizar (una sola
      llamada, respetando la regla de una operación de red pesada por request).
- [ ] **Step 5:** el panel v1 muestra el estado real y distingue explícitamente
      **"Borrador — pausada, todavía no gasta"** de **"Activa — está gastando"**, y
      si la campaña ya no existe en Meta lo dice y ofrece crear una nueva.
- [ ] **Step 6:** `POST /api/marketing/meta/reconcile` (solo admin) que recorre las
      no archivadas y sincroniza. Correrlo una vez para arreglar las 4 filas rancias.
- [ ] **Step 7: Tests + tsc + commit**

---

## Verificación final

1. `npx vitest run` completo en verde.
2. `tsc` con tsconfig acotado sobre todos los archivos tocados.
3. Probe contra la base real: sincronizar las 4 campañas rancias y confirmar que
   quedan en `archived`.
4. Agentes independientes revisan el circuito completo (ver el paso de revisión
   final de subagent-driven-development).
5. **Gates del usuario:** correr la migración, y pegar URL + token del webhook en el
   panel de Meta.
