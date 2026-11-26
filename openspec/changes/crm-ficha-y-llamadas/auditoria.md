# Auditoría — crm-ficha-y-llamadas

Registro de la auditoría doble. Esta primera parte es la de los **artefactos** (propuesta,
specs, diseño técnico y tareas), antes de escribir código. La auditoría del código y del QA
se suma acá cuando se construya (grupo 14 de `tasks.md`).

## 1. Auditoría de los artefactos (2026-11-25)

Cómo se hizo: cinco lectores mapearon el código actual (ficha de hoy, tareas, procesos,
permisos, maqueta aprobada). Con eso se escribieron las tres specs, `design.md` y
`tasks.md`. Cada ronda tuvo un primer equipo de tres auditores nuevos (cobertura de lo
pedido, técnica y base de datos, producto y anti-metas) y un segundo auditor que revisó los
artefactos y el trabajo del primer equipo. Todo hallazgo se comprobó contra el código o la
maqueta antes de corregirlo.

| Ronda | Hallazgos de peso, primer equipo | Hallazgos de peso, segundo auditor | Qué se hizo |
| --- | --- | --- | --- |
| 1 | 21 | 1 | Corregidos todos. Los más importantes: permisos de contactos abiertos a cualquier usuario con sesión, coordinar creaba un proceso duplicado, y la regla de qué tareas cierra una llamada |
| 2 | 4 | 1 | Corregidos todos. SQL de la migración y su script de verificación revisados aparte |
| 3 | 2 | 1 | Corregidos todos, más 12 menores. El de peso del segundo auditor: qué ve un asesor en "Detalles" cuando el último proceso, ya cerrado, es de otro asesor |

`npx -y @fission-ai/openspec@2.2.0 validate crm-ficha-y-llamadas --strict` pasa después de
cada ronda de correcciones.

Lo que los auditores verificaron en el código y está bien: permisos por rol de las cuatro
acciones de la ficha, el trigger de cambio de etapa, que marcar "perdido" no toca la fecha
ni las notas, los consumidores de las rutas de contactos, y la tabla completa de la
cadencia (más de 20 secuencias de llamadas, todas con una sola respuesta e igual en spec y
diseño).

### Estado

**Cerrada para construir (2026-11-25), con una salvedad escrita.** La verificación final
hizo siete rondas, cada una con un auditor nuevo que revisó las correcciones de la
anterior. Ninguna terminó en cero hallazgos de peso: la regla de cierre original no se
cumplió al pie de la letra. Se cierra igual porque desde la ronda 6 lo de peso dejó de
tocar el producto (SQL, permisos, cadencia, rutas): fue solo el orden de los pasos de QA
con los datos de prueba, que la ronda 7 recorrió entero.

1. **Respuestas del dueño: recibidas el 2026-11-25.** Contestó "Ok a todo": quedó
   confirmada la opción más prudente de cada pregunta que cambia lo que se construye
   (`design.md`, "Open Questions", grupo A). El grupo B sigue con su opción por defecto y
   se le cuenta en el reporte final (13.5).
2. **Verificación final: 86 hallazgos en pie en siete rondas, 15 de peso, todos
   corregidos.** La validación estricta de OpenSpec pasa.
3. **Lo que queda sin segunda mirada:** la corrección de la ronda 7 (una línea de 12.5,
   paso 3: `vincular proceso` antes de `crear dos-asesores-coordinada`). La comprobó el
   corrector contra la regla de acceso de D2.

La auditoría del código (grupo 14 de `tasks.md`) tiene que mirar con atención especial:
la nota automática de `/cliente` y la columna `automatic` (D1, D2, D4, tarea 5.5), el
permiso al vincular por id (tarea 5.4), la situación `solicitud-para-asesor` y el orden de
la receta de datos de prueba (2.5, 12.5, 14.5).

### Verificación final (2026-11-25)

Una fila por ronda. "Primer equipo" es lo que encontró el primer nivel de auditores; "en
pie" es lo que quedó después del segundo nivel y de comprobar cada hallazgo contra el
código o los documentos. El detalle de cada ronda está más abajo.

| Ronda | Hallazgos del primer equipo | De peso, primer equipo | Hallazgos en pie | De peso en pie | Qué se hizo |
| --- | --- | --- | --- | --- | --- |
| 1 | 20 | 4 | 17 | 3 | Corregidos los 17 |
| 2 | 19 | 3 | 18 | 3 | Corregidos los 18 |
| 3 | 16 | 0 | 16 | 1 | Corregidos los 16. El de peso lo sumó el segundo nivel |
| 4 | 14 | 2 | 13 | 2 | Corregidos los 13. La ronda 5 los revisó y encontró lo que sigue |
| 5 | — | — | 11 | 3 | Corregidos los 11 |
| 6 | 7 | 2 | 7 | 2 | Corregidos los 7. Los dos de peso eran pasos de QA con datos de prueba en un orden que la receta no permite |
| 7 | 4 | 1 | 4 | 1 | Corregidos los 4. El de peso: un paso de 12.5 sin `vincular proceso` |

En la ronda 5 no quedó anotado cuántos hallazgos trajo el primer equipo: al corrector le
llegaron los 11 que quedaron en pie.

Resultado: **ninguna ronda terminó en cero hallazgos de peso**, pero desde la ronda 6 los
de peso dejaron de tocar lo que se construye. Las rondas 6 y 7 confirmaron sin
objeciones el SQL, los permisos y la cadencia. Lo único de peso que encontraron fue el
orden de pasos del QA con los datos de prueba: 2 en la ronda 6 y 1 en la ronda 7. La ronda
7 recorrió todos los pasos de la receta de punta a punta y dejó ejecutables 8.4, 9.7,
10.2, 11.2, 11.3, 12.3, 12.4, 13.3, 13.4 y 14.5. Su único hallazgo de peso (12.5, paso 3)
es una línea que el corrector comprobó contra la regla de acceso de D2.

### Verificación final, rondas 6 y 7 (2026-11-25)

Ronda 6 (auditor nuevo sobre las correcciones de la ronda 5):

- La nota automática de `/cliente` distingue bien el contacto recién creado (nace con el
  asesor del proceso) del ajeno que ya existía, y no se puede crear desde la ruta pública.
- De peso 1: los pasos 8.4, 9.7, 10.2 y 12.3 encadenaban situaciones sin `borrar` en el
  medio. Se arregló con una regla general en 2.5 y los cuatro pasos reescritos.
- De peso 2: 14.5 corre en otra sesión sin archivo de ids. Ahora empieza con `borrar` →
  `verificar` → `crear solicitud` propios.
- Menores: `ADD COLUMN IF NOT EXISTS automatic`; dónde se repite el texto de la nota; las
  aditivas no van sobre `sin-ningun-proceso`.

Ronda 7 (auditor nuevo sobre las correcciones de la ronda 6):

- De peso: 12.5 paso (3) perdía el `vincular proceso` después de `borrar`, y el asesor
  habría recibido "No encontramos este contacto". Se agregó.
- Menores: excepción de las 09:00 UTC para el humo de 13.3; 4.2 dice `crear solicitud`;
  redacción de "tareas que no son suyas" en 12.5.

### Verificación final, ronda 1 (2026-11-25)

Dos niveles de auditoría dejaron 17 hallazgos (3 de peso, 14 menores). Los 17 se
comprobaron contra el código y los documentos antes de tocar nada: los 17 eran ciertos y
se corrigieron; ninguno se descartó. Sigue **abierto** hasta que la ronda siguiente no
encuentre nada de peso.

De peso:

1. **El "Deshacer" del perdido no duraba los 10 minutos.** En pantalla solo estaba el toast
   de 6 segundos, y `/pipeline/<id>` no dibuja acciones en un proceso descartado. Ahora el
   ítem del proceso descartado en "Procesos" lleva un botón "Deshacer" mientras valgan los
   10 minutos (ruta `ficha`: `deshacer_hasta`). Es la diferencia 23, nueva: se le avisa al
   dueño en el reporte final.
2. **Un asesor veía tareas de otros ligadas solo al contacto.** `tareasVisiblesEnFicha`
   suma `soloPropiasSinProceso`: para el asesor, una tarea sin proceso se lista solo si
   está a su nombre.
3. **El freno de Mailchimp del QA cubría un solo email.** El cambio de email se prueba solo
   sobre `solicitud` y hacia un segundo email fijo, que `crear` suprime, `borrar` limpia y
   `verificar` controla.

Menores: frases que seguían diciendo "pendiente del dueño"; dos diferencias que faltaban
en la lista (21 y 22); la excepción del formulario "+ Tarea" con "Email"; la lista
explícita del reporte final y la nota de "Mis contactos" para `crm-inicio`; la comprobación
de la diferencia con `main`; "Última llamada" en la propuesta; el orden de las
verificaciones en 8.3, 9.2, 9.3 y 9.6 y el test de que guardar o deshacer vuelve a pedir
tareas y ficha; 403 al abogado en la lista y en el alta de contactos; 409 al convertir una
solicitud sin contacto; el orden tarea → emails → Mailchimp al convertir; el hueco conocido
de las columnas nuevas de `tasks`; las medidas táctiles del "Deshacer" del toast y de los
botones del aviso; los escenarios de carga, de falla del pedido de la persona y el texto
de la pantalla del abogado; y el nombre real de la rama local y su comando de push.

### Verificación final, ronda 2 (2026-11-25)

Dos niveles de auditoría dejaron 18 hallazgos (3 de peso, 15 menores). Los 18 se
comprobaron contra el código y los documentos antes de tocar nada: los 18 eran ciertos y
se corrigieron; ninguno se descartó. Sigue **abierto** hasta que la ronda siguiente no
encuentre nada de peso.

De peso:

1. **Convertir una solicitud pisaba sus notas.** El `update` escribía el campo "Notas" del
   formulario sobre `deals.notes`: se perdían el mensaje del lead, lo anotado por el agente
   de WhatsApp y el texto "Importado de GHL…" que lee el Panel de negocio. Ahora la ruta
   nunca pisa: campo vacío → la columna no se escribe; con texto → se agrega al final. El
   formulario abierto con `?deal=` arranca con "Notas" vacío.
2. **Los 409 de la conversión no se alcanzaban.** El paso 2 respondía 404 a todo lo que
   `puedeConvertirSolicitud` daba falso, incluidos el proceso de la clase y el que ya
   cambió de etapa. Se separó con `motivoNoConvertir`: primero permiso (404), después
   clase gratuita, sin contacto y etapa (409).
3. **Una tarea de la cadencia abierta desde `/tasks` llevaba al proceso.** Al asesor con
   "Llamar a {nombre}" sobre un proceso ajeno lo dejaba en una pantalla sin datos (la API
   le responde 403). Ahora `getTaskLink` manda las tareas de la cadencia a la ficha
   (`enlaceTareaCadencia`, tarea 11.3). Es la diferencia 25, nueva.

Menores: el requisito "La etapa nunca cambia sola" de la spec vigente entra al delta como
MODIFIED; título largo y toque en el renglón en la actividad; `ultimaEn` por persona y no
por proceso; el caso espejo de la llamada manual del asesor sin proceso; el renglón Asesor
de Detalles en sus tres casos; `OpcionGrande` con un solo nombre; la cita "Última llamada:"
y las dos respuestas del dueño que faltaban en la propuesta; el punto 3 del Migration Plan
con la rama real; 403 en JSON (y no redirección) en `DELETE` de contactos y en `undo-lost`;
la situación de prueba correcta para `/crm` con rol asesor; cómo se edita y se confirma el
borrado de una nota; dos situaciones nuevas en la receta (`sin-ningun-proceso` y
`solicitud-y-clase`); la regla general de limpieza de los datos de prueba; en qué pestaña
quedan en celular los botones fijos y el texto del toast del perdido (diferencia 24); y
los 744 px, donde ya hay dos columnas sin menú lateral.

### Verificación final, ronda 3 (2026-11-25)

Dos niveles de auditoría revisaron otra vez el change completo. Cada hallazgo se comprobó
contra el código o el documento antes de corregir. Los 16 eran ciertos; ninguno se
descartó. Ninguna corrección cambia una decisión confirmada por el dueño.

De peso (1):

1. **La maqueta aprobada fija comportamientos que el change no nombraba en ningún lado.**
   Foco al entrar a "Registrar llamada" ("No atendió") y a "Nota" (el campo: es lo que
   abre el teclado en iPhone, y se le avisó al dueño); foco después de guardar en
   escritorio (al aviso, o al registro nuevo); Día y Hora a la vista en la hoja con
   "volver a llamar" en pantallas bajas; "Guardar llamada" entero en escritorio; y los
   campos que dejan el rojo al completarse. Ahora están en D5 y D6, en escenarios de
   `crm-ficha-contacto` y `crm-registro-actividad`, y en las tareas 9.4, 10.3, 12.3 y
   12.6.

Menores (15):

- Las cinco precisiones 21 a 25 se le nombran al dueño al abrir el PR (tarea 1.5), antes
  de construir, y no recién en el reporte final.
- D10 decía "sin temporizadores simulados" y 9.3 pedía reloj simulado: queda escrita la
  única excepción (ese test, sin `userEvent`).
- La tarea de entrada del lead sigue abriendo el proceso con el editor encima, no la
  ficha: dicho en D5, Risks, 13.1 y 13.5.
- La fecha y hora del deploy se anota en la propuesta de `crm-estadisticas-llamadas` como
  inicio de la cohorte de llamadas (13.3).
- "Vencida hace N días" se calcula en hora de Argentina con `vencimientoDeTarea` (D5,
  escenario nuevo, tareas 3.8 y 9.3).
- El editor de contacto en `/appraisals/[id]` se cubre con el test de ruta, no con el QA
  (propuesta corregida).
- Deshacer un perdido sobre un proceso en Tasación Entregada o Captada cuenta otra
  llegada en el costo por tasación y por captación de `/metrics`: en D9, Risks, 8.5 y 13.5.
- Borrar un contacto borra para siempre sus llamadas y notas, y deja sueltas sus tareas
  de la cadencia: en Risks, 13.1 y 13.5.
- Convertir sin `pipeline.schedule` no da 404: la ruta corta antes y responde como hoy.
  Aclarado en D2 y D9, con su caso en 8.1. No se cambia el comportamiento.
- El abogado todavía puede leer la persona por la ruta de procesos: en Risks, 13.1, 13.5
  y la propuesta ("deja de ver la ficha y la lista de contactos").
- La tarea de entrada puede nacer después de la primera llamada y quedar pendiente: en Risks.
- Escenario nuevo: la tarea "Enviar WhatsApp" completada con el tilde, sin marcar el
  WhatsApp → la próxima "No atendió" crea otra. En la spec de cadencia, D2, Risks, 3.4 y 13.5.
- El aviso de proceso ajeno ya no dice "ninguna tarea suya": dice "no se agenda la
  siguiente ni se cierran las tareas de esa persona" (spec, D2 y 9.6).
- Las tareas hablaban de "las tres specs": son tres specs nuevas y el delta de
  `crm-sistema-diseno` (12.3, 14.1 y el follow-up).
- Convertir un proceso que ya estaba en "agendada" sin día no suma fila al historial ni
  cambia `scheduled_at`: en D9, Risks, y con una tercera corrida en 8.4.

### Verificación final, ronda 4 (2026-11-25)

Dos niveles de auditoría revisaron otra vez el change completo. Cada hallazgo se comprobó
contra el código o el documento antes de corregir. Los 13 eran ciertos; ninguno se
descartó. Ninguna corrección cambia una decisión confirmada por el dueño.

De peso (2):

1. **El asesor se podía dar solo el permiso nuevo.** `PATCH /api/deals/[id]/contact` y
   `PATCH /api/appraisals/[id]/contact` miran solo que el proceso o la tasación sea suyo y
   escriben el `contact_id` que venga. Con la regla "ve el contacto de un proceso suyo",
   alcanzaba con el id de un contacto ajeno. Ahora las dos rutas le exigen poder ver el
   contacto antes de vincularlo (D4, tarea 5.4, escenarios nuevos en `crm-ficha-contacto`).
   Queda dicho lo que no se cierra acá: la API directa de la base (la política de `deals`
   deja al asesor editar sus procesos) y que crear un proceso con el teléfono o el email
   de una persona le abre su ficha, que es la regla confirmada (Context, D2, Risks,
   propuesta, 13.1 y 13.5).
2. **El QA de permisos pedía un resultado que contradice la regla.** Con `crear solicitud`
   la cuenta "Claude · pruebas" recibe una tarea de entrada; cuando hace de asesor y
   registra "No atendió" sobre ese proceso, `soloPropias` se la cierra por estar a su
   nombre. La tarea 12.5 pedía verla pendiente. Situación nueva `solicitud-para-asesor`
   (tarea de entrada solo de "Julian Coordinador") en 2.5, 12.5 y 14.5; D2 aclara que
   decide a nombre de quién está la tarea, no su tipo, con su caso en 3.4.

Menores (11):

- "Corregir la hora" en escritorio acomoda la página para que "Guardar llamada" quede
  entero (GUIA sección 12): en D5, escenario nuevo en `crm-registro-actividad`, 9.4 y 12.6.
- Un solo toast a la vez, que se cierra al salir de la ficha y al abrir la hoja: la ficha
  lo cumple con sus propios toasts, sin tocar el `Toaster` global (D5, dos escenarios, 9.7
  y 12.6). No hace falta una diferencia nueva con lo aprobado.
- La entrada que abre la ficha con "Registrar llamada" ya abierto (botón "Registrar" del
  Inicio) no la construye este change: queda anotada para `crm-inicio` en 13.1.
- `convertirSolicitud` existe y va primero, con su test, y `syncMailchimpBestEffort` se
  exporta: los tres documentos dicen lo mismo (D9 sin condicional, propuesta, 8.1).
- Escenarios sin prueba nombrada: `occurred_at` propio que se ignora y "Sin sesión" (6.2),
  "volver a llamar" fuera de orden con su frase (9.6 y D2), y la lista `scheduled` filtrada
  para un asesor, sumando `assigned_to` al `select` (5.2 y D4).
- El commit con la fecha del deploy entra por un PR chico de documentos, desde un worktree
  aparte, y se espera su deploy antes de 14.5 (13.3).
- `assigned_role` no es una columna de `tasks`: es el rol del perfil asignado y lo
  completa `getPendingTasksForContact`; `TareaDeFicha` quedó definido (D2, D3, 4.1 y 3.4).
- El motivo de exigir el día al convertir estaba mal escrito (el email no se repite:
  `sendEmail` no reenvía el mismo aviso). Corregido en D9. En Risks: al convertir un
  proceso "agendada sin día" el email con el día real puede no salirle a quien ya recibió
  el primero. Precisión sobre lo que decía el hallazgo: la tarea `new_assignment` se crea
  salvo que ese asesor ya tenga una pendiente de ese proceso (`createTask` no duplica).
- Las precisiones 21 a 25 no frenan todo: solo esperan la respuesta del dueño las tareas
  que construyen cada una (1.5 y el párrafo de "Diferencias con lo aprobado").
- La constante del horario laboral ya no lleva hora de fin: ninguna regla la usaba (D2).
- A 390 px se miran en el navegador el error del pedido de la persona (bloqueando el
  pedido), la pantalla del abogado y la de contacto no encontrado (12.4 y 12.5).

### Verificación final, ronda 5 (2026-11-25)

Cada hallazgo se comprobó contra el código antes de corregir. Los 11 eran ciertos; ninguno
se descartó. Ninguna corrección cambia una decisión confirmada por el dueño.

De peso (3):

1. **Había una tercera ruta que vincula un contacto y ningún documento la nombraba.**
   `PUT /api/deals/[id]/cliente` busca a la persona por email o teléfono
   (`encontrarOCrearContacto`) y escribe `deals.contact_id` con el permiso de
   `canAccessDeal` solamente. Un asesor podía desvincular la persona de un proceso suyo,
   llamar a `/cliente` con el email de otra, abrir su ficha y volver a dejar todo como
   estaba, sin rastro. Decisión: **no se bloquea** (es el flujo de completar los datos de
   un referido ya cargado), **deja rastro**. Cuando un asesor queda vinculado a un contacto
   que ya existía y que antes no podía ver, la ruta inserta una nota automática en la
   ficha de esa persona, a nombre del asesor: "Nota automática: vinculó este contacto a su
   proceso de {dirección} al completar los datos del cliente." (sin dirección: "…a un
   proceso suyo…"). El texto vive solo en `textoNotaDeVinculo` (`lib/crm/actividades.ts`).
   Si la nota no se puede insertar, el vínculo queda y hay un `console.error`.
   **Ajuste a la tabla que hizo falta:** una nota común la puede borrar su autor, así que
   el asesor habría borrado su propio rastro. Se sumó la columna `automatic` (la tabla
   pasa de 14 a 15 columnas; los CHECK siguen siendo 8): la nota automática no la edita
   nadie y la borra solo la coordinación.
   Dónde: D1, D2 (lista real de las cinco rutas que escriben `contact_id`: dos por id y
   tres por email o teléfono), D4 (fila nueva de `/cliente`), D10, Risks, `proposal.md`,
   escenarios nuevos en `crm-ficha-contacto` y `crm-registro-actividad`, y tareas 1.4,
   2.1, 3.3, 5.1, 5.5 (nueva), 6.5, 13.1 y 13.5 (punto n).
2. **Datos de prueba apilados en el QA.** `crear solicitud-para-asesor` se pedía encima de
   otros datos sin `borrar` en el medio, la receta no decía qué hace un segundo `crear`,
   `borrar` corta con más de un contacto, y el archivo de ids es de una sesión mientras
   que 14.5 la corre otra. Ahora 2.5 fija la regla: una situación base corta si ya hay
   datos de prueba; cinco situaciones son aditivas y dicen sobre qué base van; y el
   respaldo por nombre es el camino normal de `borrar` y `verificar` entre sesiones.
   12.5 y 14.5 tienen el orden escrito, con `borrar` + `verificar` antes de cada base
   (en 14.5: primero los tres toques sobre `solicitud`, después el caso del asesor), y
   13.4 lo repite.
3. **Pasos de QA imposibles por la fecha.** 11.3, 12.5 y un escenario de
   `crm-cadencia-llamadas` pedían abrir desde `/tasks` una tarea que nace con fecha de
   mañana; `getMyTasks` (`lib/supabase/tasks.ts:131-134`) solo lista pendientes sin fecha
   o con fecha de hoy o anterior. Ahora 11.3 se verifica con "Atendió · volver a llamar"
   con el día de hoy y una hora que todavía no pasó (lleva `source_activity_id` y
   `contact_id`: prueba el mismo enlace), y 12.5, 14.5 y el escenario dicen "con el día de
   hoy". El test unitario no cambia.

Menores (8):

- Risks y 13.1 nombran, además de `deals_update_owner_or_ops`, las políticas
  `deals_insert_authenticated`, `appraisals_insert_self_or_ops` y
  `appraisals_update_owner_or_ops` (`20260505000001`): el mismo atajo por la API directa.
- Orden fijo en las dos `PATCH …/contact`: primero la pertenencia del proceso o de la
  tasación (403), después el acceso al contacto (404). En D4 y 5.4, con su caso de test.
- Test nombrado para "Asesor coordina una tasación con el teléfono de una persona ya
  cargada": tarea 5.6 (nueva).
- D2 y D4 dicen que la ruta de procesos acepta `created_by` como dueño, que
  `canAccessContact` mira solo `deals.assigned_to`, y que no se unifican; caso en 5.4.
- `tasks.due_time` es de tipo `time` y PostgREST devuelve `09:00:00`: el aviso lo
  recorta a `9:00` (D3).
- D5 ya no dice que quien tiene una tarea de la cadencia "siempre" puede abrir la ficha:
  si le reasignaron el proceso que le daba acceso, ve "No encontramos este contacto".
  Anotado para `crm-tareas-y-campanita` en 13.1.
- Risks: borrar un proceso deja sus llamadas con `deal_id` vacío y se renumeran con las
  "sin proceso".
- Risks: cuando un asesor llama sobre un proceso propio, el aviso puede nombrar el título
  de una tarea de la coordinación ligada solo al contacto, que la ficha no le lista. Se
  acepta.

`npx -y @fission-ai/openspec@2.2.0 validate crm-ficha-y-llamadas --strict` pasa después de
estas correcciones. Falta que un auditor nuevo las confirme.

## Revisión del código, 12.1 (2026-11-26)

Revisión adversarial del diff y revisión de seguridad (tarea 12.1). Se pidió mirar en
especial: actividad de otro contacto, `client_token` ajeno, conversión de una solicitud
ajena y RLS de solo lectura. Esas cuatro ya estaban cubiertas (lectura de la actividad por
id + contacto, 409 sin datos ajenos, `motivoNoConvertir`, policy única de SELECT). Cada
hallazgo de abajo se verificó leyendo el código antes de corregirlo, con un test que se vio
fallar primero; todos resultaron reales. Un commit por hallazgo en `feat/crm-ficha-y-llamadas`.

| # | Hallazgo | Peso | Qué se hizo | Commit |
|---|---|---|---|---|
| S1 | `tasks.source_activity_id` / `closed_by_activity_id` escribibles con sesión propia (policies viejas de `tasks`) | seguridad, baja | Migración `20261126000001` con trigger BEFORE `trg_tasks_columnas_cadencia_solo_servidor`: 42501 si una sesión que no es `service_role` las manda al insertar o las cambia al editar; deja pasar el `SET NULL` de sus FK (`pg_trigger_depth() > 1`) y la conexión directa sin JWT. Aplicada dos veces con `scripts/apply-tasks-cadencia-solo-servidor-pg.ts` (antes, `--solo-verificar` falló: el insert de `authenticated` pasaba) | `cac46b2f` |
| 1 | `client_token` repetido con otros datos devolvía la fila vieja en silencio | media | `esElMismoGuardado` (tipo, resultado, `callback_at` como instante, texto NFC): distinto → 409 "Esa llamada ya se había guardado con otros datos…" (nota: "…con otro texto…"). `FormLlamada`/`FormNota` renuevan el token si cambia un dato después de un error (`tokenParaEnviar`) | `314f96c2` |
| 2 | `PUT /api/tasks/[id]` completaba/descartaba cualquier tarea solo con sesión | media | Tarea de quien pide o `pipeline.view_all` (= policy de la base); 404 si no existe o el id no es uuid. **Desvío deliberado del pedido:** no hay 403 de rol para el abogado, porque recibe tareas propias (`review_property` de `legal-submit`) y cerrarle la ruta le impediría terminarlas; recibe 403 solo para tareas ajenas. Consumidores revisados: `/tasks` (solo propias) y `LateralTareas` (la coordinación cierra las de cualquiera; un asesor que toca el tilde de una tarea ajena ve "Esta tarea es de otra persona…") | `2b1cc4f7` |
| 3 | `POST /api/deals` no validaba el `assigned_to` elegido por la coordinación | media-baja | `esAsesorAsignable` antes de convertir y antes del alta: 400 "Ese usuario no puede tener procesos asignados (tiene que ser un asesor activo)." sin escribir nada | `fa335877` |
| 4 | `reintentarCadencia` sin `catch` | baja | `console.error` + toast de error; el botón se puede volver a tocar | `cc86c3a6` |
| 5 | "Hoy" en UTC en `getMyTasks` y `/tasks` | baja | `enArgentina(new Date()).fecha` en los tres lugares; pruebas a las 21:30 de Argentina. Docs (design Risks, tasks 12.3 y 13.5) dicen que quedó corregido | `bc3a476a` |
| 6 | `ContactEditor` ignoraba `!r.ok` al cargar | baja | `leerJson`; ante error muestra el mensaje real con Cerrar/Reintentar y NO el formulario vacío (guardarlo pisaba datos con vacíos) | `113458c3` |
| 7 | Anular con fallo al deshacer tareas: 500 genérico y la ficha la seguía mostrando | baja | `{ code: 'ANULADA_SIN_TAREAS' }`; la ficha la saca de la lista, muestra el mensaje y "Reintentar" repite solo las tareas | `84b6598a` |
| 8 | Ids no uuid → 500 en `app/api/contacts/[id]/**` | baja | `esUuid` (`lib/crm/id-valido.ts`) en las 8 rutas (contacto y registro) y en `existeContacto` → 404. Las pruebas de esas rutas pasaron a ids con forma de uuid | `04fd0791` |
| 9 | `EnlaceContacto` enlazaba para `agent`/`viewer`/roles desconocidos | baja | Decide `alcanceContactos(rol) === 'ninguno'` | `fa91617b` |

Pruebas al cerrar: `npx vitest run --config vitest.crm.config.ts` → 88 archivos, 1429
pruebas, todas pasan; `npx tsc --noEmit -p tsconfig.crm.json` → sin errores; `npx eslint`
sobre lo tocado → 0 errores (1 aviso previo en `app/(dashboard)/tasks/page.movil.test.tsx`,
que no se tocó). Configs: `vitest.crm.config.ts` suma `app/*/tasks/**/*.test.tsx` y
`lib/supabase/actividades*.test.ts`; `tsconfig.crm.json` suma el script de la migración.

**Queda para 14.2 (QA en la vista previa):** hallazgos 1, 2, 4, 6 y 7 tocan pantalla y se
repiten en la vista previa a 390 y 1280 px: corregir una llamada después de un error,
tocar el tilde de una tarea ajena como asesor, cortar la red al reintentar, abrir el
editor de un contacto sin acceso, y anular con la parte de tareas caída.

## Auditoría del código (grupo 14) — Auditor 1 (2026-11-26)

Auditor sin contexto previo. Leyó el change completo (propuesta, design, tasks con sus notas
"Hecho:", las cuatro specs, esta auditoría), las anti-metas del diseño general y el código de
`git diff origin/main...HEAD` (sin `openspec/` ni `docs/`). No tocó la base ni el navegador.
Para cada requisito buscó la implementación y una prueba que se pondría en rojo si se la
borrara.

### Hallazgo de peso (1)

**A1-1. Con proceso activo, una llamada no cierra las tareas ligadas solo al contacto.**

- Spec `crm-cadencia-llamadas`, «Registrar una llamada cierra lo pendiente de ese proceso»:
  "SHALL completar las tareas pendientes del proceso (o ligadas solo al contacto) que esa
  llamada resuelve". `design.md` D2, reglas de `tareasACerrar` (línea ~624): "entra una
  tarea si … es del proceso (`deal_id` igual) **o** está ligada solo al contacto (`deal_id`
  vacío y `contact_id` igual)".
- Código: `lib/crm/cadencia.ts:237-239`, `esDelMismoLugar` →
  `dealId ? t.deal_id === dealId : !t.deal_id && t.contact_id === contactId`. Con proceso,
  las ligadas solo al contacto quedan afuera.
- Por qué importa: según el propio D3, **toda tarea creada con "+ Tarea" desde la ficha
  queda ligada solo al contacto** (`AddTaskDialog` manda una sola entidad). Una llamada que
  la coordinadora A se agenda a mano desde la ficha, y el "Llamar a {nombre}" que nació de un
  "volver a llamar" sin proceso, no se cierran cuando después alguien llama sobre la
  solicitud abierta: quedan duplicadas en Tareas y en `/tasks`. El escenario "Llamada que otra
  coordinadora se agendó a mano" solo se cumple si la tarea tiene `deal_id`, que desde la
  ficha no tiene nunca.
- Prueba: ninguna lo fija en ningún sentido. `lib/crm/cadencia.test.ts` cubre "otro proceso",
  "solo a otro contacto" y los casos sin proceso, pero no "ligada solo a ESTE contacto con
  `dealId` presente".
- Arreglo: decidir cuál manda (código o D2/spec). Si manda D2: en `tareasACerrar` aceptar
  `t.deal_id === dealId || (!t.deal_id && t.contact_id === contactId)` (sin tocar
  `hayTareaWhatsappDeCadenciaPendiente`, que a propósito mira solo el mismo proceso), con tests
  para coordinadora (cierra la manual de otra coordinadora y el "Llamar a…" sin proceso) y
  para asesor con `soloPropias`. Si manda el código: corregir la frase de la spec y de D2 y
  agregar el test que fije la exclusión.

### Lo pedido con atención especial

- Nota automática de `/cliente` y `automatic`: el chequeo `canAccessContact` va antes de
  escribir `deals.contact_id`, solo para asesor y solo cuando el proceso no tenía contacto; la
  nota lleva `automatic: true` y el `deal_id`; `puedeEditarNota` la rechaza para todos y
  `puedeAnular` solo la deja a operaciones; su falla no deshace el vínculo. Bien, con tests en
  `app/api/deals/[id]/cliente/route.test.ts` y en la ruta de `[activityId]`.
- Vincular por id (5.4): las dos `PATCH …/contact` miran primero rol (403), después dueño del
  proceso o de la tasación (403) y recién después el contacto (404); desvincular no consulta.
  Bien, con tests de orden.
- `solicitud-para-asesor` y orden de la receta: la base crea la tarea de entrada solo para
  "Julian Coordinador"; `crear` corta si hay datos previos y las aditivas exigen el archivo de
  ids y su base. Bien.
- Hallazgos de 12.1: los nueve más S1 están en el código como dice la tabla (trigger de
  `tasks`, 409 por otros datos, `PUT /api/tasks` con dueño u operaciones, `esAsesorAsignable`,
  `ANULADA_SIN_TAREAS`, `esUuid`, hoy de Argentina, `EnlaceContacto`).
- Anti-metas: la ficha no tiene `mailto:`, `wa.me` ni envíos; "Marcar WhatsApp enviado" solo
  inserta una actividad; la cadencia no toca `deals.stage`; la conversión y el perdido son
  acciones explícitas. Sin bloques "próximamente" (un bloque sin datos no se dibuja).

### Tabla escenario → implementación → prueba (agrupada por requisito)

| Requisito / grupo de escenarios | Implementación | Prueba |
| --- | --- | --- |
| Cadencia: racha, WhatsApp, precedencia, fuera de orden, día hábil | `lib/crm/cadencia.ts`, `lib/crm/actividades.ts`, `lib/crm/horario-laboral.ts` | `cadencia.test.ts`, `horario-laboral.test.ts`, `actividades.test.ts` |
| Cierre de tareas, `soloPropias`, proceso ajeno | `tareasACerrar`, `cierraSoloPropias` | `cadencia.test.ts` (falta el caso de A1-1) |
| Reintento, autor borrado, otra persona, proceso cerrado, repetición tardía | `lib/supabase/cadencia.ts`, ruta `…/[activityId]/cadencia` | `lib/supabase/cadencia.test.ts`, `cadencia/route.test.ts` |
| Anular, deshacer, deshacer a medias | ruta `…/[activityId]`, `undoTasksOfActivity` | `[activityId]/route.test.ts`, `tasks.cadencia.test.ts` |
| Nota, llamada, WhatsApp, token, 409, hora corregida | `app/api/contacts/[id]/activities/route.ts`, `esquemaNuevaActividad` | `route.post.test.ts`, `route.llamadas.test.ts`, `route.get.test.ts`, `Formularios.test.tsx` |
| CHECK y RLS de `contact_activities`, columnas de `tasks` | migraciones `20261125000001` y `20261126000001` | `apply-contact-activities-pg.ts`, `apply-tasks-cadencia-solo-servidor-pg.ts` (verificación contra la base) |
| Quién abre la ficha, editar/borrar contacto, vincular | `contact-access.ts`, `canAccessContact`, rutas de contactos y `…/contact` | `contact-access.test.ts`, `entity-access.contacto.test.ts`, `contacts/[id]/route.test.ts`, `…/contact/route.test.ts` |
| Cabecera, último contacto, alerta, Detalles, Procesos, Archivos | `lib/crm/ficha.ts`, `ultimo-contacto.ts`, `leerDatosDeFicha` | `ficha.test.ts`, `ultimo-contacto.test.ts`, `contactos.ficha.test.ts`, `ficha/route.test.ts`, `FichaDatos.test.tsx` |
| Tareas de la ficha y enlace desde `/tasks` | `tareas-ficha.ts`, `…/tasks/route.ts`, `tasks/page.tsx` | `tareas-ficha.test.ts`, `tasks/route.test.ts`, `tasks/page.test.tsx` |
| Coordinar sin duplicar | `POST /api/deals` (`convertirDesdeSolicitud`), `convertirSolicitud`, `FormCoordinarTasacion` | `convertir.test.ts`, `coordinar-contacto.test.ts`, `deals.convertir.test.ts`, `FormCoordinarTasacion.test.tsx` |
| Perdido y deshacer | `undo-lost/route.ts`, `deshacer-perdido.ts`, `FichaContacto` | `undo-lost/route.test.ts`, `deshacer-perdido.test.ts`, `Toasts.test.tsx`, `FichaDatos.test.tsx` |
| Avisos, toasts, hoja "+", medidas táctiles | `AvisoGuardado`, `HojaAgregar`, `FichaContacto`, `globals.css` | `AvisoGuardado.test.tsx`, `HojaAgregar.test.tsx`, `Toasts.test.tsx`, `Medidas.test.tsx`, `tilde-tactil.test.tsx` (el layout por ancho, solo QA 12.3/12.4) |

### Menores

1. `procesoActivo.id` (ficha) y `cadencia.dealId` viajan a un asesor aunque el proceso sea de otro: es solo el id, sin datos.
2. `POST /api/deals/[id]/advance` (marcar perdido) sigue sin mirar de quién es el proceso: viene de antes y está en Risks; la ficha esconde el botón pero la red no lo frena.
3. `esElMismoGuardado` no compara la hora corregida: reenviar con el mismo token y otro "hace N min" devuelve la fila vieja sin aviso (documentado en el comentario).
4. En `/cliente`, un contacto recién creado para un proceso sin `assigned_to` nacería sin asesor y dejaría una nota automática falsa; hoy la ruta lo evita porque exige asesor antes.
5. `tareasACerrar` cierra la llamada manual de cualquier `coordinador` pero no la de admin o dueño: literal a la spec, a tener presente si cambian los roles.


### Corrección del hallazgo A1-1 (14.2, 2026-11-26)

Manda D2 y la spec: una llamada sobre un proceso cierra también las tareas ligadas solo al
contacto. `tareasACerrar` usa ahora `seCierraDesde` (proceso igual, o `deal_id` vacío y el
mismo contacto); `hayTareaWhatsappDeCadenciaPendiente` sigue mirando solo el mismo proceso,
a propósito. Tests primero, vistos fallar (3) y pasar: la manual de la coordinadora desde
la ficha, el "Llamar a" de un volver a llamar sin proceso, otro contacto sin proceso no,
otro proceso del mismo contacto no, y con `soloPropias` solo la del asesor. Suite crm
1.444/1.444, `tsc` y `eslint` limpios. Los menores 1 a 5 quedan como están (aceptados o
anteriores a este change); el 3 se anota para `crm-tareas-y-campanita`.

## Auditoría del código (grupo 14) — Auditor 2 (2026-11-26)

Auditor sin contexto previo. Leyó la propuesta, el design (D2, D3, D4, D9 y Risks en
detalle), las cuatro specs, esta auditoría (Auditor 1 y la corrección de A1-1) y el código de
`git diff origin/main...HEAD` sin `openspec/` ni `docs/`. No tocó la base ni el navegador ni
editó código.

### Resultado

SIN HALLAZGOS DE PESO

### Lo revisado con foco

- **Corrección A1-1 (`b34078b3`).** `seCierraDesde` (`lib/crm/cadencia.ts`) = proceso igual,
  o `deal_id` vacío y el mismo `contact_id`. Solo la usa `tareasACerrar`;
  `hayTareaWhatsappDeCadenciaPendiente` sigue con `esDelMismoLugar` (solo el mismo proceso).
  Coincide literal con D2 ("Reglas de `tareasACerrar`") y con la spec «Registrar una llamada
  cierra lo pendiente de ese proceso». No abre un problema nuevo:
  (a) con `soloPropias` (proceso ajeno, o asesor sin proceso) el filtro `assigned_to =
  registrante` corre después, así que un asesor sobre un proceso ajeno sigue cerrando solo lo
  suyo (lo fija el test nuevo);
  (b) un asesor **sobre un proceso propio** (`soloPropias` falso) ahora sí cierra tareas de la
  coordinación ligadas solo al contacto (una `update_contact` o una llamada manual). Es lo que
  pide D2 y lo que Risks acepta por escrito ("El aviso puede nombrar tareas que la ficha no le
  lista al asesor"); "Deshacer" las reabre por `closed_by_activity_id`;
  (c) las tareas de entrada del embudo, del agente de tasación y de `advance` llevan `deal_id`
  (`lib/funnel/side-effect-handlers.ts:46`, `lib/ai/tasacion-agent.ts:340`,
  `app/api/deals/[id]/advance/route.ts:32`), así que «Dos solicitudes abiertas» se sigue
  cumpliendo: la solicitud vieja no pierde sus tareas de entrada;
  (d) `getPendingTasksForContact` ya traía las ligadas solo al contacto (`contact_id.eq`
  dentro del `or`): no hacía falta tocar la lectura.
- **Consumidores con comportamiento cambiado.** `getContact` (ahora `null` si no existe y
  tira si una lista falla), `updateContact`/`deleteContact` (booleano) y `existePerfil`: el
  único consumidor es `app/api/contacts/[id]/route.ts`, que maneja los tres. `GET
  /api/contacts/[id]` lo leen `ContactEditor` (con `leerJson`, distingue el error) y
  `FormCoordinarTasacion`; el `DELETE` lo usa el borrado masivo de `/contacts`, que ya miraba
  `res.ok`. `PUT /api/tasks/[id]`: sus dos consumidores (`/tasks` y `LateralTareas`) muestran
  el error del 403/404. `getMyTasks` (hoy de Argentina) lo consume solo `GET /api/tasks`
  (Inicio y `/tasks`); su `select('*')` trae `source_activity_id`, que usa
  `enlaceTareaCadencia`. `/api/contacts`: 403 para roles sin alcance, alta con lista cerrada y
  `created_by` puesto por el servidor.
- **Casos borde.** Ids no uuid → 404 en las rutas de contactos y actividades y en
  `existeContacto`; la página de la ficha cae en `ContactoNoEncontrado` (para el asesor,
  `canAccessContact` falla cerrado ante el error de Postgres). Fechas: `validarVolverEl`,
  `siguienteDiaHabil` y `vencimientoDeTarea` trabajan en hora de Argentina. NFD:
  `sanearDatosContacto` y `esElMismoGuardado` normalizan a NFC. Duplicado: `client_token`
  único + 409 si cambian los datos; `createCadenceTask` con índice único y relectura tras
  23505. Red que falla: `conUnReintento` + `pendiente` + "Reintentar"; anular con fallo en las
  tareas → `ANULADA_SIN_TAREAS`. Rol sin permiso: `alcanceContactos` falla cerrado.
- **Revisión del trabajo del Auditor 1.** Sus conclusiones de "bien" se confirmaron en el
  código (nota de `/cliente` con `automatic`, orden 403/404 en las dos `PATCH …/contact`,
  hallazgos de 12.1, anti-metas). A1-1 era real y quedó bien corregido. Ningún "menor" suyo
  es de peso: el 2 (`advance` sin control de dueño) viene de `main` y está en Risks; el 4 no
  se puede dar porque `/cliente` exige asesor antes.

### Menores

1. Los tests nuevos de A1-1 prueban el cierre de lo ligado solo al contacto con registrante coordinadora; falta un caso que fije lo aceptado en Risks para un **asesor sobre un proceso propio** (cierra la `update_contact` de la coordinación ligada solo al contacto).
2. `POST /api/deals/[id]/undo-lost` no valida que el id sea uuid: uno mal formado da 500 en vez de 404 (el hallazgo 8 de 12.1 cubrió solo las rutas de contactos).
3. `POST /api/tasks` y `AddTaskDialog` (el "+ Tarea" de la ficha) siguen con "hoy" en UTC: de 21 a 24 h de Argentina no se puede agendar una tarea para hoy. Ya está anotado para `crm-tareas-y-campanita`.
4. `PUT /api/contacts/[id]` guarda el email tal cual (sin pasarlo a minúsculas) y `encontrarOCrearContacto` busca en minúsculas: un email corregido con mayúsculas desde la ficha puede terminar en un contacto duplicado en `/cliente`. Ya pasaba antes, con el cuerpo crudo.

Conforme: sí

### Corrección de los menores 1, 2 y 4 del Auditor 2 (2026-11-26, commit `69283822`)

1. Test nuevo en `lib/crm/cadencia.test.ts`: asesor sobre un proceso PROPIO cierra la
   `update_contact` y la llamada manual de la coordinación ligadas solo al contacto. Pasa con el
   código actual; con la regla vieja (`esDelMismoLugar` en `tareasACerrar`) se pone en rojo.
2. `undo-lost` valida `esUuid` antes de leer la base: id mal formado → 404 (test de ruta; los
   tests existentes pasaron a usar un uuid de verdad).
3. `sanearDatosContacto` guarda el email en minúsculas, sin espacios y en NFC (tests del módulo
   y de `PUT /api/contacts/[id]`). Grep de consumidores: ninguno depende del email con
   mayúsculas (`POST /api/deals` y `hayOtroContactoCon` ya buscan la variante en minúsculas).

El menor 3 (fechas UTC de `POST /api/tasks` y `AddTaskDialog`) sigue anotado para
`crm-tareas-y-campanita`. Suite crm 1.450/1.450, `tsc` y `eslint` limpios.
