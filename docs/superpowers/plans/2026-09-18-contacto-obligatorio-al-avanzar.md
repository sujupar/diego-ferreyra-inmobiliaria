# Plan — Datos del cliente obligatorios para crear y para avanzar

Spec: `docs/superpowers/specs/2026-09-18-contacto-obligatorio-al-avanzar-design.md` (OK del dueño 2026-09-18).
Sin migraciones. Sin variables de entorno nuevas.

## Tarea 1 — Reglas puras (`lib/deals/proceso-manual.ts`)
- `validarDatosCliente({nombre, telefono, email})`: los tres obligatorios; teléfono ≥10 dígitos;
  email con formato; el nombre no puede ser la dirección. La usan todas las rutas.
- `validarClienteNuevo`: email pasa a obligatorio (usa `validarDatosCliente`).
- `camposFaltantes(deal)` → `('nombre'|'telefono'|'email'|'asesor')[]` y
  `faltantesDelProceso` (textos del aviso) derivado de esa lista, ahora con email y con
  teléfono de ≥10 dígitos. El aviso sigue exento en request/clase_gratuita/lost/comprador.
- `exigeDatosParaMover(desde, hacia)`: true hacia scheduled (reagendar), visited,
  appraisal_sent, followup, captured cuando la etapa CAMBIA; false hacia lost / not_visited
  y en la misma etapa.
- Tests: `lib/deals/proceso-manual.test.ts`.
- Consumidores de `faltantesDelProceso`: aviso de la ficha y `lib/deals/reparacion-procesos.ts`
  (cambian los conteos del informe: esperado).

## Tarea 2 — La barrera en el servidor
- `lib/deals/datos-cliente.ts` (I/O): `leerFaltantesDelProceso(dealId)` (proceso + contacto) y
  `respuestaDatosIncompletos(dealId, faltan)` → `422 {code:'DATOS_DEL_CLIENTE', faltan, dealId, error}`.
- `app/api/deals/[id]/advance/route.ts`: antes de mover, si `exigeDatosParaMover` y faltan → 422.
  Se lee la etapa previa ANTES (hoy se lee después del chequeo de vínculo).
- `app/api/deals/[id]/visit-data/route.ts`: con `complete` en etapa pendiente y faltan → guarda los
  datos de la visita y responde 422 sin mover.
- `app/api/properties/route.ts`: si el proceso resuelto (explícito o por la tasación) tiene faltantes
  → 422 antes de crear la ficha.
- Tests: ruta por ruta (`advance/datos-cliente.test.ts`, `visit-data/datos-cliente.test.ts`,
  `properties/captacion-proceso.test.ts`).

## Tarea 3 — Puertas de creación
- `app/api/deals/route.ts` POST ("Coordinar"): `validarDatosCliente` + asesor obligatorio; un asesor,
  forzado a sí mismo. Test: `app/api/deals/route.test.ts`.
- `app/(dashboard)/pipeline/new/page.tsx`: email obligatorio en el formulario.
- `app/api/deals/manual/route.ts` + `components/deals/ElegirCliente.tsx`: email obligatorio.

## Tarea 4 — Guardar los datos del cliente de un proceso
- `PUT /api/deals/[id]/cliente` (`app/api/deals/[id]/cliente/route.ts`): `canAccessDeal`, abogado 403;
  valida con `validarDatosCliente`; actualiza el contacto del proceso o crea uno y lo vincula;
  `asesorId` opcional solo con `puedeReasignarAsesor` y hacia asesor/dueño activo. Test al lado.

## Tarea 5 — La ventana "Completá los datos del cliente para avanzar"
- `components/deals/CompletarDatosCliente.tsx`: muestra lo que falta (precargado), guarda con la
  ruta de la Tarea 4 y llama `onListo()` para reintentar la acción.
- `app/(dashboard)/pipeline/[id]/page.tsx`: `handleAdvance` pre-chequea con la regla pura y, ante un
  422, abre la ventana y reintenta; ahora también avisa cualquier otro error (antes lo tragaba).
  Seguimiento: el chequeo va ANTES de crear la tarea (si no, completar y reintentar duplicaba la
  tarea). El botón del aviso amarillo abre la misma ventana.
- `components/pipeline/VisitDataForm.tsx`: el 422 de "Finalizar Visita" llega como resultado
  propio y la ficha abre la ventana; al guardar, reintenta finalizar.
- `app/(dashboard)/properties/new/page.tsx`: ante 422, la ventana; al guardar, reenvía el alta.

## Tarea 6 — QA, despliegue y documentación
- Revisión adversarial independiente + revisión de permisos.
- Vista previa con datos `[TEST QA]`: criterios 1–9 del spec. Modo prueba de email solo alrededor
  de los pasos que mandan emails (visita realizada, entregada, captada) y revisar el log después.
- Merge, humo en producción, CLAUDE.md, limpieza de datos de prueba.
