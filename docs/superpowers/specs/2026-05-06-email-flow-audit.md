# Auditoría de Notificaciones por Email — 2026-05-06

## Resumen

Stack 100% Resend desde 2026-04-24 (dominio `inmodf.com.ar`). 10 tipos de
notificaciones transaccionales + invitations + admin failure alerts.

Antes de este audit, **5 de 10 tipos** tenían fire-and-forget que solo loggeaba
errores a consola — si Resend fallaba, nadie se enteraba. Después de este
commit, los 10 escalan a admins via `notifyAdminEmailFailure()` cuando fallan.

## Tipos de email transaccionales

| # | Tipo | Trigger | Destinatarios | Escalation |
|---|------|---------|---------------|------------|
| 1 | `deal_created` | `POST /api/deals` | Asesor + admins/dueños | ✓ (post-audit) |
| 2 | `visit_completed` | `POST /api/deals/[id]/advance` (stage=visited) | Coordinador + admins + asesor (CC) | ✓ (post-audit) |
| 3 | `appraisal_sent` | `POST /api/deals/[id]/advance` (stage=appraisal_sent) | Coordinador + admins + asesor (con PDF) | ✓ (post-audit) |
| 4 | `property_created` | `POST /api/properties` | Coordinador + admins + asesor (CC) | ✓ (post-audit) |
| 5 | `docs_ready_for_lawyer` | `PUT /api/properties/[id]` (status=pending_review) | Todos los abogados activos | ✓ (ya existía) |
| 6 | `doc_rejected` | `POST /api/properties/[id]/legal-docs/[itemKey]/review` (approved=false) | Asesor + coordinador | ✓ (ya existía) |
| 7 | `docs_resubmitted` | `POST /api/properties/[id]/legal-docs/[itemKey]` (status anterior=rejected) | Abogado original (o todos) | ✓ (post-audit) |
| 8 | `property_captured_advisor` | Hook interno `firePropertyCapturedNotifications()` | Asesor (felicitación) | Indirecto |
| 9 | `property_captured_admins` | Idem ^^ | Coordinador + admins (KPI) | Indirecto |
| 10 | `invitation` | `POST /api/auth/invite` | Usuario invitado | N/A |

## Cobertura por rol

| Rol | Recibe | Brechas |
|-----|--------|---------|
| Asesor | deal_created, visit_completed, appraisal_sent, property_created (CC), property_captured (felicitación), doc_rejected, invitation | — |
| Coordinador | deal_created, visit_completed, appraisal_sent, property_created, property_captured, doc_rejected, docs_ready_for_lawyer | — |
| Admin/Dueño | deal_created, visit_completed, appraisal_sent, property_created, property_captured, docs_ready_for_lawyer, admin_failure_alert | — |
| Abogado | docs_ready_for_lawyer, docs_resubmitted | Sin SLA / confirmación de lectura — out of scope |
| Cliente (contacto) | (nada) | Decisión de producto: no hay emails al cliente. Documentado, no es bug. |

## Cambios aplicados en este audit

1. **`lib/email/notify-with-escalation.ts`** — helper `notifyWithEscalation()` que envuelve
   un envío y, si falla, dispara `notifyAdminEmailFailure()`. No throwea para no
   romper la response del endpoint.

2. **Aplicado a 5 puntos previamente fire-and-forget**:
   - `app/api/deals/route.ts` (deal_created)
   - `app/api/properties/route.ts` (property_created)
   - `app/api/deals/[id]/advance/route.ts` (appraisal_sent + visit_completed)
   - `app/api/properties/[id]/legal-docs/[itemKey]/route.ts` (docs_resubmitted)

3. **Página `/admin/email-test`** (solo admin/dueño): formulario por cada tipo
   donde el admin pega IDs reales y dispara el envío. Útil para QA en producción.

4. **Endpoint `/api/admin/email-test/[type]`**: re-dispara la notificación con
   los IDs provistos. Gateado a `requireRole('admin', 'dueno')`.

5. **Banner de modo prueba** en el layout del dashboard. Visible para todos
   los usuarios cuando `notification_settings.test_mode_enabled=true`. Evita el
   incidente "olvidé desactivar test mode y los clientes nunca recibieron sus
   emails".

## Cómo verificar

1. Como admin, ir a `/admin/email-test`.
2. Ingresar tu email en "Destinatario de prueba" y "Activar modo prueba".
3. Por cada tipo, pegar IDs de entidades reales (un deal cualquiera, una
   tasación cualquiera, etc.).
4. Click en "Enviar" → revisar tu inbox.
5. Cuando termines, **DESACTIVAR modo prueba**. El banner amarillo en el
   dashboard te recuerda que está activo.

## Out of scope

- Notificación al cliente (contacto) — propuesta de producto, no técnica.
- Confirmación de lectura / SLA en flujo legal — requiere webhook de Resend
  + nueva tabla.
- Retry automático con backoff — actualmente fire-once + escalation, sin retry.
