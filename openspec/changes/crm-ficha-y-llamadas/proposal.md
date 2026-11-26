# Proposal

## Why

Entre la solicitud de tasación y la tasación agendada no queda registro de nada: lo que
pasa en las llamadas de la coordinación solo existe en lo que ella cuenta. Sin registro no
hay tiempos, ni tasas, ni forma de mejorar ese paso.

## What Changes

- La ficha de contacto (`/contacts/[id]`) se reemplaza por la ficha aprobada en
  `crm-sistema-diseno`: persona a la izquierda, nota/llamada y actividad al centro, tareas,
  tasaciones, procesos y archivos a la derecha; pestañas en celular.
- Nota rápida sobre el contacto. La edita solo quien la escribió; la borra quien la
  escribió o la coordinación (coordinador, admin, dueño). Lo borrado queda guardado en la
  base con quién y cuándo.
- Registrar llamada con resultado: agendó, volver a llamar, no le interesa, no atendió,
  número equivocado. Marca de "WhatsApp enviado" como tercer contacto (no envía nada).
  Una llamada o una marca mal cargada se anula desde un menú en cada registro.
- Cadencia automática: tras no atender una vez, tarea de llamada al día hábil siguiente;
  tras dos seguidas, tarea de enviar WhatsApp; "volver a llamar" pide día y hora.
  Registrar una llamada cierra las tareas de entrada del lead y las de llamada pendientes
  de ese proceso, también las de otro coordinador.
- "Última llamada" en la cabecera de la ficha: hace cuánto fue la última ("Última llamada:
  hace 2 días") o "Sin llamar todavía".
- **Coordinar convierte la solicitud.** Desde la ficha, "Coordinar tasación" abre el
  formulario de hoy con los datos cargados y, al guardar, la misma solicitud pasa a
  Coordinada. Hoy ese formulario siempre crea un proceso nuevo y la solicitud queda abierta.
  Las notas que la solicitud ya tenía no se pisan: lo que se escribe al coordinar se agrega
  al final.
  El botón está en el aviso de la llamada y también fijo en el bloque "Procesos" de la
  ficha, en cada solicitud, para que no se pierda al cerrar el aviso. Coordinar desde el
  menú sigue exactamente igual.
- **"Marcar proceso como perdido" con "Deshacer"**, que deja el proceso como estaba y no lo
  cuenta como perdido en las métricas. Se puede deshacer durante 10 minutos: en el aviso
  recién marcado y, cuando el aviso se fue, con un botón en ese proceso dentro de "Procesos".
- **Permisos de los contactos.** Hoy cualquier usuario con sesión, incluido el abogado,
  puede leer y editar cualquier contacto si conoce su dirección. Se cierra: el abogado deja
  de ver la ficha y la lista de contactos, y el asesor ve solo los suyos. **Cambia algo que
  hoy "funciona":** un asesor ya no puede abrir un contacto con el que no tiene ningún
  vínculo. (Lo que no se cierra acá: con la dirección de un proceso, el abogado todavía
  puede leer los datos de esa persona por la pantalla de procesos; es anterior a este
  cambio y queda anotado.) También se cierra el atajo por el que un asesor se daba ese
  vínculo solo: las dos rutas que vinculan un contacto a un proceso o a una tasación por
  su id le exigen que ya pueda ver ese contacto. Y la que completa los datos del cliente
  de un proceso (`PUT /api/deals/[id]/cliente`), que busca a la persona por email o
  teléfono, no se bloquea pero deja rastro: si un asesor queda enganchado así a un
  contacto que ya existía y que no podía ver, queda una nota automática en la ficha de esa
  persona, a su nombre, que él no puede borrar. (Dos cosas más que quedan dichas: por la API
  directa de la base un asesor todavía puede cambiar el contacto de un proceso suyo, y
  eso queda para el change que revise los permisos de procesos; y un asesor que crea un
  proceso con el teléfono o el email de una persona ya cargada pasa a ver su ficha,
  porque ese proceso queda a su nombre: es la regla confirmada.)
- Se llega a la ficha tocando el nombre de la persona en el CRM, en el proceso y en la
  lista de contactos. Una tarea de llamada o de WhatsApp creada por la cadencia, abierta
  desde `/tasks`, también abre la ficha (hoy abriría el proceso, donde la llamada no se
  registra).
- En este change la actividad del centro muestra solo notas, llamadas y WhatsApp marcado;
  el resto de los eventos llega con `crm-linea-de-tiempo`.
- **Queda afuera:** enviar WhatsApp o email, llamar desde la plataforma, cambiar la etapa
  del proceso de forma automática, feriados en el horario laboral, estadísticas, la
  campanita y la página de tareas (salvo a dónde lleva una tarea de la cadencia), el bloque "Sin respuesta" del Inicio (hasta que exista,
  ningún texto de la ficha lo nombra), y asignarle asesor a los contactos viejos.

Roles: coordinador, admin y dueño ven todos los contactos. El asesor ve los suyos: los
asignados a él, los que creó, y los de un proceso o una tasación a su nombre. El abogado,
ninguno.

**Decisiones confirmadas por el dueño (2026-11-25)** (cambian o precisan lo decidido en
la sección 8 del diseño general o lo aprobado en la maqueta; el detalle está en
`design.md`, "Diferencias con lo aprobado"):

1. El asesor ve también el contacto de un proceso o una tasación a su nombre (la sección
   8.8 decía solo asignados o creados por él). Sin esto se rompe el editor de contacto que
   hoy usa en sus procesos.
2. Sin proceso abierto no hay secuencia, pero "volver a llamar" igual agenda su tarea
   (interpretación de 8.2 y 8.3).
3. Una llamada cierra también las tareas que crea el agente de tasación por WhatsApp, y no
   toca la llamada que un asesor se agendó a mano (precisión de 8.1).
4. Una llamada atendida cierra la tarea "Enviar WhatsApp" pendiente (en la maqueta quedaba).
5. Entre 768 y unos 930 px de ancho con el menú abierto, la ficha usa pestañas y no dos
   columnas (la spec `crm-sistema-diseno` dice dos columnas desde 768 px).
6. Los avisos no nombran «Sin respuesta» del Inicio hasta que ese bloque exista.
7. A un lead de la clase gratuita que acepta una tasación se le abre un proceso nuevo, como hoy.
8. **Cambia una ruta que ya existe:** a un asesor, la ficha y `GET /api/contacts/[id]` le
   devuelven solo los procesos, tasaciones, archivos y tareas que están a su nombre. Lo de
   otros asesores, los procesos sin asesor y las tareas de otras personas ligadas solo al
   contacto no se le listan (sí ve la persona, la etapa del proceso activo y toda la
   actividad). Una tarea asignada a él la ve siempre.
9. Al convertir una solicitud en Coordinada se completa "quién coordinó" (`created_by`) del
   proceso si estaba vacío, para que el email de confirmación salga igual que hoy.
10. Si un asesor registra una llamada y el proceso activo no es suyo (es de otro asesor o
    todavía no tiene asesor), la llamada queda guardada pero no agenda la siguiente ni
    cierra tareas de la coordinación o de otro asesor. "Volver a llamar" sí le agenda su
    propia tarea.
11. Tres diferencias más con la maqueta: el número de la llamada se cuenta por proceso y no
    por persona; una tercera "No atendió" no duplica la tarea "Enviar WhatsApp" pendiente; y
    "Tarea creada sola" se lee dentro del registro de la llamada.

Dos respuestas más del dueño, del mismo día, que no están en la lista de arriba (el detalle
está en `design.md`, "Open Questions", grupo A): sin proceso abierto, la llamada de un
asesor cierra solo las tareas que están a su nombre; y se acepta que, al deshacer un
"perdido", Mailchimp pueda volver a mandarle a la persona la secuencia desde el primer email.

## Capabilities

### New Capabilities
- `crm-ficha-contacto`: qué muestra la ficha de un contacto, cómo se llega, quién puede verla y editarla, y cómo se coordina o se cierra un proceso desde ahí.
- `crm-registro-actividad`: notas, llamadas con resultado y marca de WhatsApp sobre un contacto.
- `crm-cadencia-llamadas`: qué tarea se crea o se cierra sola según el resultado de cada intento.

### Modified Capabilities

- `crm-sistema-diseno` (archivada y vigente en `openspec/specs/crm-sistema-diseno/spec.md`):
  cambia el requisito "La ficha se reacomoda según el ancho". La ficha mira el ancho que le
  queda después del menú lateral y no el de la ventana: entre 768 y unos 930 px con el menú
  abierto usa pestañas y no dos columnas (decisión 5), y con el menú colapsado pasa a tres
  columnas antes de los 1280 px. El cambio está en `specs/crm-sistema-diseno/spec.md` de
  este change y el dueño lo confirmó el 2026-11-25.
- `crm-sistema-diseno`, requisito "La etapa nunca cambia sola": la spec vigente dice, sin
  condiciones, que tras "Atendió y agendó" el aviso ofrece "Coordinar tasación" y tras "No
  le interesa" ofrece "Marcar proceso como perdido". Se acota a quien puede coordinar o
  cerrar ese proceso y a cuando corresponde (no con el proceso ya coordinado, ni sobre un
  proceso ajeno, ni sin proceso), como ya dice `crm-cadencia-llamadas`. Sin este cambio, al
  archivar quedarían dos specs vigentes que se contradicen. El requisito modificado está en
  el mismo archivo del delta.
- **Excepción temporal, sin cambio de spec:** la spec vigente de `crm-sistema-diseno` dice
  que "+ Tarea" abre el formulario con cinco tipos (Llamada, Mensaje, Visita, Documentación
  y Otro). En este change la ficha usa el formulario de tareas de hoy sin tocarlo, que
  además muestra "Email" (diferencia 7 de `design.md`, confirmada). Ese escenario no se
  modifica: se cumple cuando `crm-tareas-y-campanita` unifique el formulario, y queda
  anotado en su propuesta (tarea 13.1).

## Impact

- Base (migración antes del deploy):
  - tabla nueva `contact_activities`, con CHECK, índices y RLS de solo lectura;
  - `tasks`: **dos columnas nuevas opcionales** (`source_activity_id`,
    `closed_by_activity_id`) y **cuatro índices**. No se toca ningún CHECK ni índice existente.
- Rutas nuevas: `app/api/contacts/[id]/ficha`, `…/activities`, `…/tasks`,
  `app/api/deals/[id]/undo-lost`.
- Rutas que ya existen y cambian (caminos críticos):
  - `app/api/contacts` y `app/api/contacts/[id]`: permiso por rol (el abogado recibe 403
    también en la lista y al crear), lista cerrada de campos, y el borrado responde 403 a
    quien no es admin ni dueño (hoy responde 500);
  - `app/api/deals` (`POST`): acepta `from_deal_id` (convierte la solicitud) y `contact_id`
    (usa ese contacto). Sin esos dos campos no cambia nada.
  - `app/api/deals/[id]/contact` y `app/api/appraisals/[id]/contact` (`PATCH`): a un
    asesor le exigen poder ver el contacto que vincula (404 si no). Desvincular, y todo
    lo que hace la coordinación, sigue igual.
- Mailchimp: convertir una solicitud y deshacer un "perdido" avisan a Mailchimp del cambio
  de etapa, igual que cualquier cambio de etapa de hoy, para que la persona reciba la
  secuencia de emails que le corresponde. No se agrega ningún envío nuevo.
- Las tareas de la cadencia que queden pendientes cuando un proceso se cierra no se
  completan solas: se ven en la ficha y se cierran a mano (limpiarlas queda para
  `crm-tareas-y-campanita`).
- Pantallas: `app/(dashboard)/contacts/[id]` (reemplazo), `app/(dashboard)/pipeline/new`
  (precarga con `?deal=` y `?contact=`), el enlace del nombre en `/crm`, `/pipeline/[id]`
  y `/contacts`, y en `app/(dashboard)/tasks` solo a dónde lleva una tarea de la cadencia.
- Código: `lib/crm/`, `lib/auth/` (`contact-access`, `entity-access`), `components/crm/`,
  `lib/supabase/tasks.ts` (cinco funciones nuevas), `lib/supabase/cadencia.ts` (nuevo:
  `aplicarCadencia`), `lib/supabase/deals.ts` (función nueva `convertirSolicitud`, y se exporta
  `syncMailchimpBestEffort`),
  `app/globals.css` (dos tokens).
- Efecto sobre otras pantallas: `ContactEditor` en `/pipeline/[id]` y `/appraisals/[id]`
  usa las rutas de contactos; con la regla de acceso de este change sigue funcionando para
  el asesor. En `/pipeline/[id]` se prueba en el QA (tarea 11.2); en `/appraisals/[id]`
  se cubre con el test de ruta (asesor con solo una tasación a su nombre, tarea 5.2),
  porque la receta de datos de prueba no crea tasaciones. Cuando `ContactEditor` crea un
  contacto y lo vincula a un proceso o a una tasación, también sigue funcionando: el
  contacto queda creado por él (tarea 5.3) y por eso lo puede vincular (tarea 5.4).
- No hay variables de entorno nuevas ni procesos programados.
- Depende de `crm-sistema-diseno`, aprobado y archivado (maqueta en
  `openspec/changes/archive/2026-11-25-crm-sistema-diseno/maqueta/`). Deja anotado trabajo para
  `crm-tareas-y-campanita` (permiso de completar tareas, fechas en UTC) y para `crm-inicio`
  (bloque "Sin respuesta" y lista de solicitudes sin tarea).
