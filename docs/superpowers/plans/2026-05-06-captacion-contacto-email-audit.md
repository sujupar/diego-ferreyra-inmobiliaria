# 2026-05-06 — Captación con prefill, edición de contacto, auditoría email

## Contexto

Tres pedidos del usuario tras testear la app en producción:

1. Al "captar" una propiedad desde una tasación, el form de creación NO precarga los datos que la tasación ya tiene (descripción, fotos, parte de los features).
2. Cuando el asesor crea una tasación SIN contacto, la coordinadora recibe la tarea "actualizar contacto" pero el flujo está roto (no permite editar). Falta un botón "Editar Contacto" desde tasación / pipeline / contacto.
3. Verificar que TODOS los emails transaccionales lleguen correctamente a cada rol y endurecer error handling silencioso.

---

## Item 1 — Prefill completo al captar propiedad

### Estado actual
- `app/(dashboard)/properties/new/page.tsx` ya hace prefill PARCIAL si llega con `?dealId` (lines 47-91, fetcha appraisal del deal).
- Si llega solo con `?appraisalId`, el código "legacy" busca en `/api/pipeline` (lines 93-112) que no devuelve la estructura esperada → no precarga.
- Faltan campos: `property_description` y `property_images` (la tabla `properties` SÍ tiene `photos TEXT[]`, pero el `PropertyInput` interface no los acepta y el form no los muestra).

### Cambios
1. **`lib/supabase/properties.ts`**: extender `PropertyInput` con `description?: string` y `photos?: string[]`.
2. **`app/(dashboard)/properties/new/page.tsx`**:
   - Refactor: un solo useEffect que precarga desde appraisal cuando hay `appraisalId` directo o `dealId.appraisal_id`.
   - Eliminar el path legacy `/api/pipeline`.
   - Precargar también `description` ← `appraisal.property_description` y `photos` ← `appraisal.property_images`.
   - Agregar al form: textarea `Descripción` + grilla de previews de fotos precargadas (read-only, se mandan al submit).
   - Submit: incluir `description` y `photos` en el body.
3. **`app/api/properties/route.ts`** (POST): aceptar y persistir `description` y `photos`.

### Files
- MODIFY `lib/supabase/properties.ts`
- MODIFY `app/(dashboard)/properties/new/page.tsx`
- MODIFY `app/api/properties/route.ts` (verificar que acepta description/photos)

---

## Item 2 — Editar contacto desde tasación / pipeline / tasks

### Estado actual
- Tabla `appraisals` tiene `contact_id` (FK opcional).
- `app/(dashboard)/contacts/[id]/page.tsx` es 100% read-only.
- Task `update_contact` redirige a `/contacts/{contact_id}` — si es NULL la URL es inválida.
- NO existe componente reutilizable `ContactEditor`.
- API `/api/contacts/[id]` PUT funciona (`updateContact`).
- API `/api/contacts` POST funciona (`createContact`).

### Cambios
1. **NEW `components/contacts/ContactEditor.tsx`**: Sheet/Dialog reutilizable con form (`full_name`, `phone`, `email`, `origin`, `notes`).
   - Props: `contactId?` (edit) | `appraisalId?` + `dealId?` (create + associate).
   - Modo create: POST `/api/contacts` → PATCH appraisal/deal con `contact_id` resultante.
   - Modo edit: PUT `/api/contacts/[id]`.
   - Callback `onSaved` para refetch del padre.
2. **NEW endpoint `app/api/appraisals/[id]/contact/route.ts`** (PATCH) — asocia un contacto existente a una tasación. Necesario para el modo create cuando se crea desde una tasación huérfana.
3. **MODIFY `app/(dashboard)/contacts/[id]/page.tsx`**: agregar botón "Editar" en el header del contacto que abre `ContactEditor` en modo edit.
4. **MODIFY `app/(dashboard)/appraisals/[id]/page.tsx`**: en el header, junto a "Editar Tasación", agregar botón "Editar Contacto" (visible solo si `appraisal.contact_id` o si flag `?editContact=1`). Si no hay contact_id, abre en modo create + associate.
5. **MODIFY `app/(dashboard)/pipeline/[id]/page.tsx`**: en el card de Contacto, agregar botón "Editar Contacto" que abre el modal en modo edit.
6. **MODIFY `app/(dashboard)/tasks/page.tsx`**: para tasks de tipo `update_contact`, si `contact_id` es NULL, redirigir al `appraisal_id`/`deal_id` con `?editContact=1`. Si tiene `contact_id`, redirige al contact con `?edit=1`.

### Files
- NEW `components/contacts/ContactEditor.tsx`
- NEW `app/api/appraisals/[id]/contact/route.ts`
- MODIFY `app/(dashboard)/contacts/[id]/page.tsx`
- MODIFY `app/(dashboard)/appraisals/[id]/page.tsx`
- MODIFY `app/(dashboard)/pipeline/[id]/page.tsx`
- MODIFY `app/(dashboard)/tasks/page.tsx`

---

## Item 3 — Auditoría y endurecimiento de email

### Estado actual
- 10 tipos transaccionales (deal_created × 2, visit_completed, appraisal_sent, property_created, docs_ready_for_lawyer, doc_rejected, docs_resubmitted, property_captured × 2) + invitations + admin failure alerts.
- 5 tipos con fire-and-forget que solo loggean error (`deal_created`, `property_created`, `appraisal_sent`, `visit_completed`, `docs_resubmitted`).
- 2 tipos con escalation a admin (`docs_ready_for_lawyer`, `doc_rejected`).
- Modo prueba activable vía tabla `notification_settings`.

### Cambios
1. **Aplicar patrón de escalation** a los 5 tipos sin admin alert. Si el envío falla, llamar `notifyAdminEmailFailure()` con contexto del error.
2. **NEW página admin `app/(dashboard)/admin/email-test/page.tsx`**: visible solo para `admin`/`dueno`. Lista los 10 tipos con botón "Enviar test a mí" y muestra resultado (ok/error + detalle).
3. **NEW endpoint `app/api/admin/email-test/[type]/route.ts`**: dispara el tipo solicitado con data mock + `to=current_user.email`. Bloquea ejecución si el caller no es admin.
4. **Banner de modo prueba** en `app/(dashboard)/layout.tsx`: si `notification_settings.test_mode_enabled=true`, banner sticky amarillo "MODO PRUEBA ACTIVO — emails redirigidos a {recipient}".
5. **NEW `docs/superpowers/specs/2026-05-06-email-flow-audit.md`**: tabla resumen de cobertura por rol + lista de tipos con su estado (ok/needs-hardening).

### Files
- MODIFY `app/api/deals/route.ts` (escalation en notifyDealCreated)
- MODIFY `app/api/properties/route.ts` (escalation en notifyPropertyCreated)
- MODIFY `app/api/deals/[id]/advance/route.ts` (escalation en appraisal_sent + visit_completed)
- MODIFY `app/api/properties/[id]/legal-docs/[itemKey]/route.ts` (escalation en docs_resubmitted)
- NEW `app/(dashboard)/admin/email-test/page.tsx`
- NEW `app/api/admin/email-test/[type]/route.ts`
- MODIFY `app/(dashboard)/layout.tsx` (test mode banner)
- NEW `docs/superpowers/specs/2026-05-06-email-flow-audit.md`

---

## Orden de ejecución

1. Item 1 (prefill) — más simple, alto impacto inmediato.
2. Item 2 (contact editor) — más complejo, fix bug bloqueante de coordinadora.
3. Item 3 (email audit) — endurecimiento + tooling, no bloquea operación.

Cada item = un commit separado. Build + typecheck entre cada uno. Push al final del último, después `/review`.

---

## Verificación

- TypeScript pasa (`npx tsc --noEmit`).
- `npx next build` compila sin errores ni warnings nuevos.
- Manual smoke (post-deploy):
  - Item 1: captar propiedad desde una tasación con descripción + fotos → ver datos precargados.
  - Item 2: tasación sin contacto → ir a /tasks, click en "actualizar contacto" → editor abre, guarda, contacto queda asociado.
  - Item 3: /admin/email-test → enviar cada tipo → confirmar inbox del usuario.

## Out of scope

- Notificación al cliente (contacto) sobre estado del deal — propuesta abierta.
- Cambio de stack de email (sigue Resend).
- Refactor de `ValuationReport` o PDF templates.
