# Email propio para "Solicitud de tasación" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un registro en la campaña de tasación dispare un email propio ("Nueva solicitud de tasación", con los datos que SÍ existen) en vez de reusar el de "Tasación agendada" que llega con todos los campos vacíos.

**Architecture:** Replica exacta del patrón que ya resolvió este mismo problema para la clase gratuita (`notifyClassRegistration` + `ClassRegistrationAdminsEmail` + guard de origen). Se agrega una tercera rama de notificación al funnel; `notifyDealCreated` queda intacto para la coordinación real desde `/api/deals`.

**Tech Stack:** Next.js 16 + React Email (`emails/_components/EmailLayout`) + Resend (`lib/email/resend-client`) + vitest.

## Global Constraints

- **Rama de trabajo: `feat/campana-y-chat-pro`** (la rama activa del usuario). NO commitear en `main` ni mergear — el merge y el deploy los decide el usuario.
- Commit author DEBE ser `Sujupar <redstyle50@gmail.com>` (ya configurado); todo commit termina con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **NO TOCAR** (invariantes del pedido): `lib/email/notifications/deal-created.ts`, `app/api/deals/route.ts`, ni ninguna vista/RPC de métricas. La coordinación manual de tasaciones sigue mandando "Tasación agendada" igual que hoy, y las métricas siguen contando igual.
- **Sin migración de base de datos**: `email_notifications_log.notification_type` es texto libre (verificado: no tiene CHECK constraint), así que el tipo nuevo `appraisal_request_admins` se acepta sin cambios de esquema.
- **Destinatarios**: coordinador + admins/dueños. **NO** se notifica al asesor (en un registro del embudo todavía no hay asesor asignado) — mismo criterio que `notifyClassRegistration`.
- **Typecheck**: `npx tsc --noEmit` arroja **4 errores PREEXISTENTES** en archivos de test ajenos a este trabajo (`lib/landing/enrich.test.ts`, `lib/marketing/copy-templates.test.ts`, `lib/portals/mercadolibre/mapping.test.ts`, `lib/portals/validation.test.ts`, todos por un cambio de esquema de otra sesión). El gate es **"siguen siendo 4, no más"**, no "cero".
- **Tests**: correr SIEMPRE con `--pool=threads` (`npx vitest run <archivo> --pool=threads`); sin ese flag el runner se cuelga por el acento en la ruta del proyecto.
- Prosa, subjects y labels de UI en **español (es-AR)**.
- Los comandos con rutas van entre comillas por el espacio/acento: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"`.

---

## Contexto del bug (para el implementador)

Cuando alguien completa el formulario de la landing de tasación:

`app/api/funnel/submit` → `createFunnelLead()` → crea contacto + deal (`stage='request'`, `origin='embudo'`) → **`notifyDealCreated()`**.

`notifyDealCreated` es la notificación de una tasación **coordinada**: su plantilla muestra Barrio, Fecha y hora, Tipo y Asesor, y su subject dice `Tasación agendada: {dirección}`. Un registro del embudo no tiene nada de eso todavía → el email llega con `—` en todos los campos, "Asesor: Sin asignar", y afirmando algo falso.

El mismo problema ya se resolvió para la clase gratuita: tiene su propio `notifyClassRegistration`, su propia plantilla, y `notifyDealCreated` incluso tiene un guard que **tira error** si lo llaman con `origin='clase_gratuita'` (`deal-created.ts:29-31`). Este plan hace lo mismo para las solicitudes de tasación.

## Archivos

**Nuevos:**
- `emails/AppraisalRequestAdminsEmail.tsx` — la pieza HTML del email (patrón: `emails/ClassRegistrationAdminsEmail.tsx`).
- `lib/email/notifications/appraisal-request.ts` — `notifyAppraisalRequest()` (patrón: `lib/email/notifications/class-registration.ts`).

**Modificados:**
- `lib/email/notifications/index.ts` — exportar el notificador nuevo.
- `lib/funnel/create-funnel-lead.ts` — `FunnelMapping.notify` gana `'appraisal_request'`; tasación rutea al notificador nuevo.
- `lib/funnel/create-funnel-lead.test.ts` — el test de `resolveFunnelMapping` espera el valor nuevo.
- `app/api/admin/email-test/[type]/route.ts` — poder reenviar el tipo nuevo para verificarlo en el inbox.
- `CLAUDE.md` — dejar asentada la distinción (solicitud ≠ agendada) para que nadie la vuelva a mezclar.

---

### Task 1: Plantilla del email + notificador

**Files:**
- Create: `emails/AppraisalRequestAdminsEmail.tsx`
- Create: `lib/email/notifications/appraisal-request.ts`
- Modify: `lib/email/notifications/index.ts`

**Interfaces:**
- Consumes: `EmailLayout, Heading, Paragraph, DataBlock, Callout, Button, BASE_URL` de `@/emails/_components/EmailLayout`; `sendEmail` de `../resend-client`; `renderEmail` de `../render`; `getDealStakeholders, dedupEmails, emailsOf` de `../recipients`; `applyTestMode` de `../test-mode`; `formatDateTime` de `../format`.
- Produces: `AppraisalRequestAdminsEmail(props: AppraisalRequestAdminsEmailProps)` y `notifyAppraisalRequest({ dealId }: NotifyAppraisalRequestOptions): Promise<void>`, exportado también desde `lib/email/notifications/index.ts`. La Task 2 llama a `notifyAppraisalRequest`.

No hay tests unitarios de plantillas de email en este repo (ninguna de las 18 los tiene): la verificación es renderizar el HTML y **mirarlo**, igual que se hizo con las otras piezas.

- [ ] **Step 1: Crear la plantilla**

Crear `emails/AppraisalRequestAdminsEmail.tsx` con exactamente este contenido:

```tsx
import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Callout, Button, BASE_URL } from './_components/EmailLayout'

export interface AppraisalRequestAdminsEmailProps {
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  /** Ubicación que el interesado escribió en el formulario. null = no la dejó. */
  propertyLocation: string | null
  /** Mensaje libre del formulario, si dejó uno. */
  message: string | null
  requestedAt: string
  /** Campaña de Meta que trajo al lead (meta_campaign_name del deal). */
  campaignName: string | null
  dealId: string
  testMode?: boolean
  originalRecipients?: string[]
}

export function AppraisalRequestAdminsEmail(props: AppraisalRequestAdminsEmailProps) {
  const preheader = `${props.contactName} pidió una tasación desde la campaña. Falta contactarlo y coordinar la visita.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="administrador/dueño">
      <Heading>Nueva solicitud de tasación</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.contactName}</strong> se registró desde la campaña pidiendo una tasación de su propiedad.
      </Paragraph>
      <Callout variant="info">
        Todavía <strong>no hay una tasación agendada</strong>: esto es una solicitud. Hay que contactar al interesado,
        asignarle un asesor y coordinar día y hora de la visita.
      </Callout>
      <DataBlock rows={[
        { label: 'Nombre', value: props.contactName },
        { label: 'Teléfono', value: props.contactPhone || '—' },
        { label: 'Email', value: props.contactEmail || '—' },
        { label: 'Ubicación indicada', value: props.propertyLocation || '— (no la dejó en el formulario)' },
        { label: 'Mensaje', value: props.message || '—' },
        { label: 'Fecha de la solicitud', value: props.requestedAt },
        { label: 'Campaña', value: props.campaignName || '—' },
      ]} />
      <Button href={`${BASE_URL()}/pipeline/${props.dealId}`}>Ver el deal y coordinar</Button>
    </EmailLayout>
  )
}
```

- [ ] **Step 2: Crear el notificador**

Crear `lib/email/notifications/appraisal-request.ts` con exactamente este contenido:

```ts
import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getDealStakeholders, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { AppraisalRequestAdminsEmail } from '@/emails/AppraisalRequestAdminsEmail'
import { formatDateTime } from '../format'

export interface NotifyAppraisalRequestOptions {
  dealId: string
}

/**
 * Notifica a coordinador + admins + dueños que alguien SOLICITÓ una tasación
 * desde la campaña (registro de la landing) — NO que haya una tasación agendada.
 *
 * Por qué existe (2026-07-30): el registro del embudo usaba `notifyDealCreated`,
 * cuyo subject dice "Tasación agendada" y cuya pieza muestra Barrio/Fecha/Hora/
 * Tipo/Asesor. Un registro no tiene NADA de eso todavía → el email llegaba con
 * todos los campos vacíos afirmando algo falso. Mismo criterio (y mismo patrón)
 * que `notifyClassRegistration`.
 *
 * NO se notifica al asesor: en una solicitud recién entrada todavía no hay
 * asesor asignado. El asesor se entera cuando el coordinador agenda la visita
 * (ahí sí dispara `notifyDealCreated`, intacto).
 */
export async function notifyAppraisalRequest({ dealId }: NotifyAppraisalRequestOptions) {
  const { coordinador, adminsOwners, contact, dealRow } = await getDealStakeholders(dealId)
  if (!dealRow) return

  if (dealRow.origin !== 'embudo') {
    throw new Error(`notifyAppraisalRequest called for deal ${dealId} with origin="${dealRow.origin}" (expected "embudo")`)
  }

  const recipients = dedupEmails(
    coordinador?.email ? [coordinador.email] : [],
    emailsOf(adminsOwners),
  )
  if (recipients.length === 0) return

  const contactName = contact?.full_name || 'Lead sin nombre'

  // `property_address` es NOT NULL: cuando el interesado no deja la ubicación,
  // createFunnelLead guarda el placeholder "Solicitud de tasación — {nombre}".
  // Mostrarlo como si fuera una dirección real confundiría, así que lo tratamos
  // como "no la dejó" (la plantilla imprime el texto correspondiente).
  const rawAddress = dealRow.property_address ?? ''
  const propertyLocation = rawAddress.startsWith('Solicitud de tasación —') ? null : rawAddress || null

  const subject = `Nueva solicitud de tasación: ${contactName}`
  const testCtx = await applyTestMode(recipients, subject)

  const html = await renderEmail(
    AppraisalRequestAdminsEmail({
      contactName,
      contactEmail: contact?.email || null,
      contactPhone: contact?.phone || null,
      propertyLocation,
      message: dealRow.notes || null,
      requestedAt: formatDateTime(dealRow.created_at),
      campaignName: (dealRow as { meta_campaign_name?: string | null }).meta_campaign_name || null,
      dealId,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
    }) as any
  )

  await sendEmail({
    notificationType: 'appraisal_request_admins',
    entityType: 'deal',
    entityId: dealId,
    to: recipients,
    subject,
    html,
  })
}
```

- [ ] **Step 3: Exportarlo**

En `lib/email/notifications/index.ts`, agregar esta línea inmediatamente después de la línea `export { notifyDealCreated } from './deal-created'`:

```ts
export { notifyAppraisalRequest } from './appraisal-request'
```

- [ ] **Step 4: Renderizar el email y MIRARLO**

Crear el script temporal `scripts/tmp-render-appraisal-request.tsx`:

```tsx
import { renderEmail } from '../lib/email/render'
import { AppraisalRequestAdminsEmail } from '../emails/AppraisalRequestAdminsEmail'
import fs from 'node:fs'

async function main() {
  // Caso 1: el interesado dejó ubicación y mensaje, y vino de una campaña.
  const completo = await renderEmail(
    AppraisalRequestAdminsEmail({
      contactName: 'María Gómez',
      contactEmail: 'maria.gomez@example.com',
      contactPhone: '+54 9 11 5555 4444',
      propertyLocation: 'Av. Cabildo 2000, Belgrano',
      message: 'Quiero vender el departamento este año.',
      requestedAt: '30/07/2026 11:45',
      campaignName: '🟡 CONV: [Tasación Gratuita] | Primer Nivel',
      dealId: '00000000-0000-0000-0000-000000000001',
    }) as any
  )
  fs.writeFileSync('/tmp/email-solicitud-completo.html', completo)

  // Caso 2: mínimo — sin ubicación, sin mensaje, sin campaña.
  const minimo = await renderEmail(
    AppraisalRequestAdminsEmail({
      contactName: 'Juan Pérez',
      contactEmail: null,
      contactPhone: '+54 9 11 3333 2222',
      propertyLocation: null,
      message: null,
      requestedAt: '30/07/2026 12:10',
      campaignName: null,
      dealId: '00000000-0000-0000-0000-000000000002',
    }) as any
  )
  fs.writeFileSync('/tmp/email-solicitud-minimo.html', minimo)

  console.log('OK — /tmp/email-solicitud-completo.html y /tmp/email-solicitud-minimo.html')
  console.log('completo tiene "Nueva solicitud de tasación":', completo.includes('Nueva solicitud de tasación'))
  console.log('completo NO dice "agendada":', !completo.includes('agendada'))
  console.log('mínimo muestra el aviso de ubicación:', minimo.includes('no la dejó en el formulario'))
}
main().catch(e => { console.error(e); process.exit(1) })
```

Run: `npx tsx scripts/tmp-render-appraisal-request.tsx`
Expected: imprime `OK — ...` y las tres líneas de verificación en `true`.

Después abrir `/tmp/email-solicitud-completo.html` y `/tmp/email-solicitud-minimo.html` en el navegador (`open /tmp/email-solicitud-completo.html`) y confirmar visualmente: título "Nueva solicitud de tasación", el recuadro azul aclarando que NO está agendada, la tabla de datos sin campos fantasma, y el botón "Ver el deal y coordinar". Si algo se ve roto, corregir la plantilla y volver a renderizar.

- [ ] **Step 5: Borrar el script temporal y hacer typecheck**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
rm -f scripts/tmp-render-appraisal-request.tsx
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: `4` (los preexistentes; si sale más, hay un error introducido — corregirlo).

- [ ] **Step 6: Commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add emails/AppraisalRequestAdminsEmail.tsx lib/email/notifications/appraisal-request.ts lib/email/notifications/index.ts
git commit -m "feat(email): pieza y notificador propios para solicitudes de tasación

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Rutear el registro del embudo al notificador nuevo (TDD)

**Files:**
- Modify: `lib/funnel/create-funnel-lead.ts`
- Test: `lib/funnel/create-funnel-lead.test.ts`

**Interfaces:**
- Consumes: `notifyAppraisalRequest` de `@/lib/email/notifications/appraisal-request` (Task 1).
- Produces: `FunnelMapping.notify` pasa de `'deal' | 'class'` a `'appraisal_request' | 'class'`. `resolveFunnelMapping('tasacion').notify === 'appraisal_request'`. Nadie fuera de este archivo consume ese campo (verificado: solo se usa dentro de `createFunnelLead` y en su test).

- [ ] **Step 1: Actualizar el test (RED)**

En `lib/funnel/create-funnel-lead.test.ts`, en el test `'tasacion → stage request, origin embudo, notify deal'`, cambiar el nombre del test y el valor esperado. El bloque completo queda:

```ts
  it('tasacion → stage request, origin embudo, notify appraisal_request', () => {
    expect(resolveFunnelMapping('tasacion')).toEqual({
      stage: 'request',
      origin: 'embudo',
      placeholderLabel: 'Solicitud de tasación',
      notify: 'appraisal_request',
    })
  })
```

(El test de `clase` no se toca.)

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx vitest run lib/funnel/create-funnel-lead.test.ts --pool=threads`
Expected: FAIL — el objeto recibido trae `notify: 'deal'` y se espera `'appraisal_request'`.

- [ ] **Step 3: Implementar (GREEN)**

En `lib/funnel/create-funnel-lead.ts`, tres ediciones:

(a) El import de `notifyDealCreated` se reemplaza por el del notificador nuevo. La línea

```ts
import { notifyDealCreated } from '@/lib/email/notifications/deal-created'
```

queda:

```ts
import { notifyAppraisalRequest } from '@/lib/email/notifications/appraisal-request'
```

(b) El tipo del campo `notify` en la interfaz `FunnelMapping`:

```ts
interface FunnelMapping {
  stage: 'request' | 'clase_gratuita'
  origin: 'embudo' | 'clase_gratuita'
  placeholderLabel: string
  notify: 'appraisal_request' | 'class'
}
```

(c) El return de tasación en `resolveFunnelMapping` (última línea de la función):

```ts
  return { stage: 'request', origin: 'embudo', placeholderLabel: 'Solicitud de tasación', notify: 'appraisal_request' }
```

(d) El bloque de notificación (paso 4 de `createFunnelLead`) queda:

```ts
  // 4) Notificación con escalación (rama correcta según funnel).
  //    Tasación = SOLICITUD recién entrada (no hay fecha ni asesor todavía) →
  //    notifyAppraisalRequest. El email de "Tasación agendada" (notifyDealCreated)
  //    es exclusivo de la coordinación manual desde /api/deals.
  await notifyWithEscalation(
    () => (map.notify === 'class' ? notifyClassRegistration({ dealId }) : notifyAppraisalRequest({ dealId })),
    { failedNotificationType: map.notify === 'class' ? 'class_registration' : 'appraisal_request', entityType: 'deal', entityId: dealId },
  )
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npx vitest run lib/funnel/create-funnel-lead.test.ts --pool=threads`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `4` (los preexistentes).

- [ ] **Step 6: Commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add lib/funnel/create-funnel-lead.ts lib/funnel/create-funnel-lead.test.ts
git commit -m "fix(funnel): el registro de tasación notifica solicitud, no 'tasación agendada'

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Reenvío de prueba, documentación y verificación en producción

**Files:**
- Modify: `app/api/admin/email-test/[type]/route.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `notifyAppraisalRequest` exportado desde `@/lib/email/notifications` (Task 1).
- Produces: `POST /api/admin/email-test/appraisal_request` con body `{ dealId }` reenvía la pieza nueva a los destinatarios reales (o al de prueba, si `test_mode_enabled` está activo).

- [ ] **Step 1: Agregar el tipo al endpoint de prueba**

En `app/api/admin/email-test/[type]/route.ts`, dos ediciones.

(a) En el bloque de imports desde `@/lib/email/notifications`, agregar `notifyAppraisalRequest` inmediatamente después de `notifyDealCreated,`:

```ts
import {
    notifyDealCreated,
    notifyAppraisalRequest,
    notifyVisitCompleted,
    notifyAppraisalSent,
    notifyPropertyCreated,
    notifyDocsReadyForLawyer,
    notifyDocRejected,
    notifyDocsResubmitted,
    notifyPropertyCaptured,
} from '@/lib/email/notifications'
```

(b) En el `switch (type)`, agregar este case inmediatamente después del bloque `case 'deal_created': { ... }`:

```ts
            case 'appraisal_request': {
                const dealId = requireField('dealId', body.dealId)
                await notifyAppraisalRequest({ dealId })
                break
            }
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `4`.

- [ ] **Step 3: Documentar la distinción en CLAUDE.md**

En `CLAUDE.md`, dentro de la sección `## Operational Gotchas / Lessons Learned`, agregar este bloque inmediatamente ANTES de la línea `### Foreign keys a \`profiles(id)\` deben ser \`ON DELETE SET NULL\``:

```markdown
### "Solicitud de tasación" ≠ "Tasación agendada" (emails del embudo)

- **Symptom:** por cada registro en la landing de tasación llegaba un email "Tasación agendada: …" con Barrio/Fecha/Hora/Tipo en `—` y "Asesor: Sin asignar".
- **Root cause:** `createFunnelLead` reusaba `notifyDealCreated`, que es la pieza de una tasación YA COORDINADA (muestra fecha, hora, tipo y asesor). Un registro del embudo no tiene nada de eso todavía.
- **Fix (2026-07-30):** `lib/email/notifications/appraisal-request.ts` (`notifyAppraisalRequest`) + `emails/AppraisalRequestAdminsEmail.tsx`, con subject `Nueva solicitud de tasación: {nombre}` y un callout que aclara que NO está agendada. Guard: exige `origin='embudo'`. Va a coordinador + admins/dueños, NUNCA al asesor (todavía no hay).
- **Regla general:** cada evento del embudo tiene su propia notificación. Ya son tres y no se mezclan: registro de clase → `notifyClassRegistration`; solicitud de tasación → `notifyAppraisalRequest`; tasación coordinada (`/api/deals`) → `notifyDealCreated`. Reusar una pieza "parecida" hace que el email afirme cosas falsas.
- **Métricas:** no cambian — el deal sigue siendo `origin='embudo'`, `stage='request'` y cuenta igual en el embudo. Este fix es SOLO del email.
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add "app/api/admin/email-test/[type]/route.ts" CLAUDE.md
git commit -m "feat(email): reenvío de prueba del tipo appraisal_request + gotcha documentado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Suite completa**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx vitest run --pool=threads 2>&1 | tail -6`
Expected: todos los tests pasan salvo los **6 fails preexistentes** en `video/*/node_modules` (ajenos al repo). Si falla algo en `lib/` o `components/`, corregirlo antes de seguir.

- [ ] **Step 6: Push de la rama**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git push origin feat/campana-y-chat-pro
```

(No mergear a `main`: el deploy lo decide el usuario.)

- [ ] **Step 7: ⛔ CHECKPOINT — verificación con un lead real (requiere deploy)**

Este paso solo se puede completar DESPUÉS de que el usuario mergee a `main` y Netlify deploye. Avisarle e indicarle:

1. Completar el formulario en `https://inmobiliariadiegoferreyra.com/tasacion-directa` con datos marcados (ej. nombre "PRUEBA E2E — ignorar").
2. Verificar que el email que llega dice **"Nueva solicitud de tasación: PRUEBA E2E — ignorar"**, muestra teléfono/email/ubicación reales y el recuadro que aclara que todavía no está agendada.
3. Verificar en SQL que quedó registrado con el tipo nuevo:
   ```sql
   SELECT notification_type, recipient_email, status, sent_at
     FROM email_notifications_log
    ORDER BY sent_at DESC LIMIT 5;
   ```
   Esperado: filas `appraisal_request_admins` (ya NO `deal_created_admins` para este caso).
4. Verificar que la coordinación manual sigue intacta: agendar una tasación desde el CRM y confirmar que ESE email sigue diciendo "Tasación agendada" con fecha, hora y asesor completos.
5. Borrar el deal/contacto de prueba del CRM.

---

## Self-review (hecho al escribir el plan)

- **Cobertura del pedido:** email propio para el registro del embudo → Tasks 1-2; "sin dañar lo existente" → constraint global de no tocar `notifyDealCreated`/`/api/deals`/métricas, más el paso 4 del checkpoint que lo verifica en vivo; claridad del concepto → subject, callout y gotcha en CLAUDE.md.
- **Sin placeholders:** todos los pasos con código traen el contenido literal; los comandos traen su salida esperada (incluido el `4` de errores preexistentes).
- **Consistencia de tipos:** `notifyAppraisalRequest({ dealId })` (Task 1) es exactamente lo que invocan Task 2 y Task 3; `notify: 'appraisal_request'` se define en Task 2 y no lo consume nadie más (verificado con grep); las props de `AppraisalRequestAdminsEmail` coinciden 1:1 entre la plantilla, el notificador y el script de render.
- **Decisión registrada:** el guard de `notifyAppraisalRequest` valida `origin='embudo'` (no `stage`), porque `/api/deals` puede crear deals sin fecha y un guard por `scheduled_date` rompería la coordinación manual.
