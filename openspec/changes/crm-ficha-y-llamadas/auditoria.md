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

**Abierto.** Falta una cosa antes de construir (la 2):

1. **Respuestas del dueño: recibidas el 2026-11-25.** Contestó "Ok a todo": quedó
   confirmada la opción más prudente de cada pregunta que cambia lo que se construye
   (`design.md`, "Open Questions", grupo A). El grupo B sigue abierto y no frena.
2. **Verificación final.** Las correcciones de la ronda 3 las verificó quien las hizo
   (validación estricta incluida), no un auditor nuevo. Con las respuestas del dueño
   aplicadas, pasa una última ronda de dos auditores y recién ahí se cierra esta sección.

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
