# Plan — Tasaciones y captaciones manuales en el CRM

Spec: `docs/superpowers/specs/2026-09-17-procesos-manuales-en-crm-design.md`.
Rama: `fix/crm-tasaciones-manuales` (worktree `/private/tmp/claude-501/wt-crm-manual`, desde `origin/main` 8a60734).
**No se empieza hasta que el dueño apruebe el spec y las 4 decisiones de la sección 5.**

Orden pensado para que cada tarea sea desplegable sola y no rompa lo anterior:
primero el servidor, después las pantallas, al final la reparación de datos.

## Tarea 0 — SIN MIGRACIÓN
El dueño decidió no agregar orígenes nuevos (2026-09-17): se usan Embudo, Referido e
Histórico, que la base ya acepta. No se toca ningún CHECK ni ninguna tabla de métricas.

## Tarea 1 — Módulo puro de reglas del proceso manual
- `lib/deals/proceso-manual.ts` (+ `.test.ts`):
  - `validarClienteNuevo(input)`: nombre (≥2), teléfono (normalizable con `ultimos10Digitos`), email opcional válido, origen permitido (embudo, referido, historico), asesor, dirección, tipo, barrio, ambientes y fecha de visita. Devuelve errores en castellano.
  - `etapaInicial(motivo)`: `'tasacion'` da `scheduled` (Coordinada, con fecha) y `'captacion'` da `captured`. **Ninguna etapa se saltea:** desde Coordinada el proceso avanza con los botones de siempre (formulario de visita, entregar, captar).
  - `resolverProcesoDeCaptacion({ dealId, appraisalId, dealsDeLaTasacion, propiedadesDelProceso })`: devuelve `{ dealId }`, `{ requiereElegir }` o `{ duplicado: propertyId }`.
  - `debeNotificarCreacion(motivo)`: `false` para los procesos creados después del hecho.
- Casos borde: teléfono con +54/sin 9, tildes NFD en el nombre, tasación con 2 procesos, propiedad descartada (no cuenta como duplicado).

## Tarea 2 — Servidor: crear/buscar proceso manual
- `POST /api/deals/manual` (nuevo):
  - Auth `pipeline.create` (o el permiso que use `/pipeline/new`); abogado 403.
  - Para rol asesor, `assigned_to` se fuerza al propio asesor.
  - Crea o encuentra el contacto (misma deduplicación por email/teléfono que `POST /api/deals`) y crea el proceso con `etapaInicial`.
  - **No** llama `notifyDealCreated`. Crea la tarea `new_assignment` si hay asesor.
  - Devuelve `{ dealId }`.
- `GET /api/deals/buscar?q=` (nuevo): busca por nombre de contacto, teléfono o dirección, respetando `resolverAlcanceAsignado` (el asesor solo ve los suyos). Reusar `lib/filters/busqueda-texto.ts` (imatch sin unaccent, ya probado).
- Tests de ruta con Supabase mockeado: asesor forzado a sí mismo, abogado 403, sin email de creación.

## Tarea 3 — Vincular ≠ entregar
- `lib/supabase/deals.ts` `linkAppraisalToDeal`: quitar `stage: 'appraisal_sent'` (solo `appraisal_id`).
- **Consumidores verificados:** el único llamador es `advance/route.ts:23`, y la única pantalla que lo dispara es la creación automática que se elimina en la Tarea 4. Volver a correr el grep antes de tocar.
- Test: vincular no cambia la etapa; "Marcar Tasación Entregada" (sin `appraisal_id`) sigue mandando N3 solo en transición real.

## Tarea 4 — "Nueva tasación": primero el cliente
- `components/deals/ElegirCliente.tsx` (compartido con la Tarea 5): buscador de procesos + formulario "Cliente nuevo" (usa `validarClienteNuevo`).
- `app/(dashboard)/appraisal/new/page.tsx`:
  - Sin `dealId`/`editId`, mostrar `ElegirCliente`.
  - Con un proceso existente, redirigir a `?dealId=`.
  - Con cliente nuevo: `POST /api/deals/manual` (motivo `tasacion`, proceso en Coordinada con su fecha), luego abrir el formulario de visita del proceso nuevo, que al finalizar lo deja en "Visita Realizada", y recién después la tasación con `?dealId=`.
  - **Borrar** el bloque de creación desde el navegador (`page.tsx:871-961`).
- Formulario de visita reutilizable fuera de la ficha: extraer el modal de `pipeline/[id]/page.tsx:747-774` a `components/pipeline/VisitDataModal.tsx`.
- Tests: componente (happy-dom) de `ElegirCliente`; probe de la página sin el bloque borrado (grep test como `no-hereda-fotos.test.ts`).

## Tarea 5 — Captación vinculada en el servidor
- `app/api/properties/route.ts` POST acepta `deal_id`:
  - Llama `resolverProcesoDeCaptacion`.
  - Con duplicado: 409 con `{ propertyId }`.
  - Con proceso: después del INSERT hace `linkPropertyToDeal` en el mismo request y hereda `visit_data` (expensas, `portal_data`, `landing_answers`) leyéndolo del proceso en el servidor, no del navegador.
  - Sin proceso, desde cero: 400 "Elegí el cliente".
- `app/(dashboard)/properties/new/page.tsx`:
  - Sin `dealId`, mostrar `ElegirCliente` (motivo `captacion`).
  - Con `appraisalId`, resolver el proceso de la tasación (`GET /api/appraisals/[id]` ya trae el vínculo, o un endpoint chico).
  - Sacar el `advance` posterior del navegador (`page.tsx:325-333`) y mandar `deal_id` en el alta.
  - La herencia de `datosDifusion` pasa a resolverse en el servidor.
- `appraisals/[id]/page.tsx:716` y `scheduled-appraisals/[id]/page.tsx:53-54`: el link lleva `dealId` cuando la tasación tiene proceso.
- Tests: ruta (duplicado 409, vínculo y herencia), módulo puro, y el test existente `app/api/properties/route.test.ts` sigue verde.

## Tarea 6 — Datos de la visita después de la visita
- `pipeline/[id]/page.tsx`: botón "Datos de la visita" para `visited`/`appraisal_sent`/`followup` que abre `VisitDataModal` en modo edición (sin `complete`).
- `VisitDataForm.tsx`:
  - Prop `modo: 'finalizar' | 'editar'`.
  - `handleFinalize` chequea `res.ok` y deja el modal abierto con el error.
- `VisitDataView.tsx`: mostrar expensas, atributos marcados y respuestas de la landing.
- Tests: `VisitDataForm.test.tsx` (falla de red, sin cambio de etapa en modo editar).

## Tarea 7 — Reasignar asesor y completar contacto
- `PUT /api/deals/[id]`:
  - Acepta `assigned_to` con permiso `pipeline.view_all` (admin/dueño/coordinador) y valida que sea un perfil asesor activo.
  - Acepta `contact` (nombre/teléfono/email) con la misma normalización.
- UI en la tarjeta "Contacto" de la ficha del proceso.
- Aviso "Completá propietario, teléfono, origen y asesor" cuando el nombre del contacto coincide con la dirección y no hay teléfono (función pura `pareceProcesoIncompleto`).
- `ContactEditor.tsx` / `appraisals/[id]/page.tsx:736`: quitar la precarga `origin: 'tasacion'`.

## Tarea 8 — Reparación de datos (después del deploy, con OK del dueño)
- `scripts/reparar-procesos-manuales.ts` (modo informe por defecto, `--commit` para escribir):
  - Vincula las captaciones cuyo proceso de tasación no tiene propiedad: `linkPropertyToDeal` y herencia de `visit_data` si falta.
  - **Hipólito Yrigoyen 1550:** conserva la ficha más nueva (17/9) y la vincula al proceso; la del 14/9 pasa a `commercial_status='descartada'` con motivo, sin borrar. Avisa en el informe que la landing publicada cuelga de la ficha vieja y que la nueva necesita la suya.
  - Lista los procesos incompletos (contacto = dirección, sin teléfono o sin asesor), las tasaciones sin proceso y las direcciones con más de un proceso abierto.
  - Imprime el estado previo de cada fila que toca.
- Verificación con `select` después de `--commit`.

## Tarea 9 — QA y despliegue (protocolo, Etapas 5 y 6)
- Revisión adversarial (`/code-review`) y `/security-review` (toca permisos por rol).
- Vista previa del PR, con el modo prueba de email prendido y datos `[TEST`:
  1. Tasación manual con cliente nuevo como **asesor** y como admin: CRM, ficha, visita 08/09, entregar, captar.
  2. Tasación manual eligiendo un proceso existente.
  3. Captar desde la tasación: vínculo, "Captada", herencia y freno de duplicado.
  4. Captación desde cero.
  5. Reabrir los datos de la visita en "Entregada".
  6. Reasignar asesor.
  7. Regresión: landing → solicitud → coordinada → visita → tasación → entregada → captada.
- Emails: `email_notifications_log` sin "Tasación agendada" falsos y con "Tasación entregada" solo al marcarla.
- Migración (Tarea 0) antes del merge. Script de reparación después del deploy, con el informe mostrado al dueño.
- `CLAUDE.md`: sección nueva con el diagnóstico y las reglas ("todo trabajo manual tiene proceso real", "vincular ≠ entregar", "el vínculo propiedad↔proceso vive en el servidor").

## Riesgos (pre-flight)
- 🔴 **Emails:** hoy se mandan "Tasación agendada" falsos. El cambio los corta y además hace que "Tasación entregada" salga cuando el asesor la marca en procesos manuales. Es solo interno (va al equipo, no al cliente).
- 🟡 **Mailchimp apagado:** si se prende, los clientes manuales con email entran en secuencias según etapa. Anotar en `CLAUDE.md`.
- 🟡 **Permisos:** las rutas nuevas usan el cliente de servicio. La ruta es la barrera, con rol forzado (lección del 2026-09-14).
- 🟡 **Métricas:** con orígenes correctos, los procesos manuales dejan de sumar a "Histórico" cuando el asesor elige Referido. `get_funnel_stage_timings` ya incluye `referido`. El embudo de pago no cambia. Sin migración.
- 🟢 **Un pedido de IA por request:** no aplica (no hay IA en este flujo).
- 🟢 **Sin cambios destructivos:** la migración solo amplía un CHECK y el script no borra nada.
