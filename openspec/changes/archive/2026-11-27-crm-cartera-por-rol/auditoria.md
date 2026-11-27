# Auditoría de la maqueta · CRM por rol y Contactos

Maqueta: `maqueta/index.html` (fuentes en `maqueta/pantallas/`, capturas en `maqueta/capturas/`).
Método: auditor nuevo contra propuesta + spec `crm-sistema-diseno` + capturas; después un segundo
auditor revisa la maqueta y los hallazgos del primero. Cada hallazgo se verificó antes de aplicarlo.

## Ronda 1 · auditor 1 (2026-11-25)

23 hallazgos: 3 altos, 14 medios, 6 bajos. Veredicto: "la estructura por rol cumple el pedido y es
coherente con la maqueta aprobada; arreglar 1, 2 y 3 antes de mostrarla".

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | ALTA | Ernesto Villalba tenía un próximo paso distinto en el CRM de Paula («Tasación mañana») y en Contactos/dueño («Confirmar el horario · Hoy»): el grupo de tasaciones lo reemplazaba. | Aplicado. El próximo paso sale siempre de la misma regla; en el grupo de tasaciones, la tasación va debajo del nombre («Tasación mañana 11:00 con Tomás Agüero · Bacacay 2450»). |
| 2 | ALTA | El total aparecía 3 veces (pestaña, «207 abiertos en tu cartera», pie), lo mismo que se criticó de «Deals 984». | Aplicado. El total queda en «Abiertos / Cerrados»; la barra dice «Por etapa» (dueño: «Embudo de tasación» / «Fuera del embudo»), sin repetirlo. Las listas paginadas no llevan número en la cabecera; el pie dice «Mostrando X de Y». |
| 3 | ALTA | Cerrados (Alicia Moreno, Osvaldo Ríos) decían «Sin contacto todavía». | Aplicado. Se les cargaron llamadas y visitas; un cerrado sin contactos mostraría «—». |
| 4 | MEDIA | «Todos los procesos 29» debajo de «Abiertos 493» se lee como el total. | Aplicado (sin número en listas paginadas). La nota de paginar solo el último grupo queda para el diseño técnico. |
| 5 | MEDIA | Totales de Contactos sin cerrar con el CRM (Tomás: 48 cerrados y 9 contactos sin proceso). | Aplicado: Tomás 56 / 46, Florencia 50 / 41, Martín 52 / 39; el texto ahora dice «se cerró o nunca tuvo uno». |
| 6 | MEDIA | Comprador en la lista del asesor pero no en su barra. | Aplicado: Comprador es una etapa más en la barra del asesor (2 por asesor, suman los 6). |
| 7 | MEDIA | La pregunta 3 ocultaba que hoy Paula sí ve las clases gratuitas. | Aplicado (verificado en `crm/page.tsx`: solo el asesor las tiene ocultas). Pregunta reescrita. |
| 8 | MEDIA | Se caían «Colegas» y «Seleccionar» sin decirlo. | Aplicado: botón «Seleccionar» en la lista del dueño; colegas anotado en «Lo que dimos por hecho». |
| 9 | MEDIA | La barra de abajo del celular cambió (sale Pendientes). | Aplicado: anotado en «Qué cambia» (Pendientes sigue en el menú y la campanita). |
| 10 | MEDIA | El rojo del último contacto no decía por qué y no coincidía con «sin movimiento». | Aplicado: misma regla en los dos lados (seguimiento, 14 días) y texto «hace 22 días · sin movimiento» con ícono. |
| 11 | MEDIA | Etiquetas Coordinada/Captada rellenas de azul: el color volvía a pesar más que la urgencia. | Aplicado: en las listas la etapa va neutra (punto + texto); el color queda para vencido/hoy. |
| 12 | MEDIA | Doble rojo en «Sin primer contacto». | Aplicado: «Sin contacto todavía» en gris; el rojo, solo en el vencimiento. |
| 13 | MEDIA | Columna Asesor llena de «Sin asignar todavía» en coordinación. | Aplicado: «—» en gris (en celular la fila se oculta); «Sin asesor» en rojo solo pasada la solicitud. |
| 14 | MEDIA | «Sin primer contacto 2» parecía real al lado de totales reales. | Descartado con argumento: en el ejemplo, las 2 son todas las que hay (lista completa); los otros dos bloques sí avisan que muestran solo algunos. |
| 15 | MEDIA | El texto fijo de Contactos no cambiaba con el orden. | Aplicado: se sacó; el selector «Ordenar por» lo dice. |
| 16 | MEDIA | Al abrir la ficha desde el CRM se perdía el contexto. | Aplicado: «‹ Volver al CRM» (o a Contactos) arriba de la ficha, la barra superior dice de dónde viene y el menú marca la sección de origen. |
| 17 | MEDIA | «Visitas y tasaciones de hoy» solo mostraba tasaciones. | Aplicado: «Tasaciones de hoy»; las visitas con compradores siguen en Visitas (anotado). |
| 18 | BAJA | Tasación + asesor o dirección repetidos en la misma fila. | Aplicado: «Tasación · Hoy 12:30», el asesor solo si no está en su columna. |
| 19 | BAJA | Formatos de fecha mezclados. | Aplicado: mayúscula solo en «Hoy/Mañana»; 7 días o más, siempre «hace N días». |
| 20 | BAJA | Orden de datos distinto entre celular y computadora. | Aplicado: el mismo orden que pide la propuesta (último contacto, después próximo paso). |
| 21 | BAJA | «como lo ve Asesor (Florencia Ledesma)». | Aplicado: «Florencia Ledesma (asesora)» y opciones «Nombre · rol». |
| 22 | BAJA | Faltaba el error de «Lo que está trabado». | Aplicado: tarjeta nueva en «Cargando, vacío y error». |
| 23 | BAJA | Pregunta del Kanban innecesaria. | Descartado con argumento: la propuesta deja explícitamente al dueño decidir si se conserva el tablero; es una decisión suya, no un supuesto. |

## Ronda 1 · auditor 2 (revisa la maqueta corregida y los hallazgos del primero)

Confirmó que las correcciones están bien salvo tres, que sostienen los dos descartes (#14 y #23), y trajo 7 nuevos.
Veredicto: «una cosa de peso: los nombres viejos de las etapas en la línea de tiempo de la ficha; el resto son arreglos de texto chicos».

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | MEDIA | #1 a medias: Ernesto sigue con distinto próximo paso según quién mire (Paula: confirmar el horario; Tomás: la tasación). | Aplicado: es la regla (cada uno ve sus tareas) y queda escrita en decisiones con ese ejemplo; en la lista del dueño y en Contactos la tasación también va debajo del nombre. |
| 2 | MEDIA | Ficha «Sin llamar todavía» (rojo) vs lista «Sin contacto todavía» (gris). | Aplicado junto con la pregunta de abajo: la diferencia ficha/lista queda escrita con la propuesta de unificar en «Último contacto» al programar. La ficha aprobada no se tocó. |
| 3 | BAJA | «hace 31 días · sin movimiento» en dos renglones. | Aplicado: arriba «hace 31 días» en rojo con ícono; «Sin movimiento» pasa al subtítulo. |
| 4 | ALTA | La línea de tiempo de la ficha usaba los nombres viejos («Pasó de Solicitud a Tasación agendada») mientras el chip dice «Coordinada/Realizada». | Aplicado: los eventos de etapa se pasan a los nombres de la plataforma al cargar y al registrar uno nuevo (también el que arma la ficha al coordinar). |
| 5 | MEDIA | En «trabado», «Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles» contra «Vencida hace 1 h» en la fila. | Descartado con argumento: la spec aprobada (escenario «Espera de un lead sin primer contacto») pide exactamente eso para el dueño, y aclara que es una cuenta distinta del vencimiento de la tarea. |
| 6 | MEDIA | «· vos» en Contactos y nada en el CRM. | Aplicado: la tarea de quien mira no se rotula en ninguna de las dos. |
| 7 | MEDIA | En el celular, lo trabado ocupa más de 1,5 pantallas antes de la lista. | Aplicado: en el celular cada bloque es un resumen (título, número, base y «Ver los N en la lista»), sin los nombres. |
| 8 | BAJA | Con el filtro de trabado, el pie no decía de cuántos. | Aplicado: «Mostrando 5 de 61». |
| 9 | BAJA | «Sin primer contacto» y «vencido» con burbuja gris en coordinación y roja en el dueño. | Aplicado: burbuja de alerta en los dos cuando hay alguno. |
| 10 | BAJA | En «Ver como», la campanita sigue siendo la del dueño. | Aplicado: anotado en decisiones. |
| — | MEDIA | Pregunta: ficha «Última llamada: hace 12 días» vs fila «Último contacto: hace 4 días · visita» (Mirta Sosa). | Escrito en «Lo que dimos por hecho» con ese ejemplo y la propuesta de unificar en «Último contacto» al programar (cambia una línea de la spec aprobada: se le avisa al dueño). |
| — | BAJA | La propuesta dice «el tablero Kanban (se revisa si se conserva)», pero hoy no existe tablero (solo fichas/tabla). | Anotado para quien edite la propuesta; la maqueta ya lo dice bien. |

## Ronda 2 · auditor 1

Verificó en código y capturas que todo lo «Aplicado» está bien y no rompió nada; los totales cierran entre
pantallas (493 = barra; sin asesor 9 = 2+2+2+3; seguimientos 100; descartados 472 = 358 + 114; captadas 19).
Sostiene los tres descartes. Veredicto: **nada de peso**; 1 medio y 3 bajos.

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | MEDIA | Con la tasación debajo del nombre, Ernesto perdía su renglón (propiedad en el CRM, teléfono en Contactos) y repetía «con Tomás Agüero» al lado de la columna Asesor. | Aplicado: la tasación es un tercer renglón (ícono + texto) y «con <asesor>» solo donde no hay columna Asesor. |
| 2 | BAJA | «1 h 40 min hábiles» en lo trabado y «Vencida hace 1 h» en la fila de Marcela. | Descartado con argumento: los dos textos son los de la spec aprobada (Inicio del admin, mismo caso de Marcela); cambiar el redondeo del vencimiento tocaría pantallas ya aprobadas. |
| 3 | BAJA | Con el filtro «Sin primer contacto», el pie no decía «de 2». | Aplicado. |
| 4 | BAJA | «Tasaciones de hoy» del asesor sin línea explicativa. | Aplicado: «Las que tenés hoy, por hora.» |
| — | BAJA | (Al mirar la captura) El renglón de la tasación repetía la dirección cuando es la misma de la persona. | Aplicado: la dirección solo va si es distinta. |

## Ronda 2 · auditor 2

Confirmó las tres correcciones de la ronda 2 en código y capturas, sostuvo el descarte del redondeo (la spec
aprobada pide los dos textos en el mismo escenario) y volvió a sumar los totales: cierran. Único punto: tres
capturas eran anteriores al último guardado (`crm-dueno-1280`, `crm-asesor-1280`,
`crm-dueno-vercomo-coordinacion-1280`): se volvieron a sacar. **Veredicto: nada de peso.**

## Cierre

Dos rondas. La ronda 2 no trajo nada de peso: la auditoría se cierra acá.

# Auditoría de los artefactos (spec, diseño y tareas) · 2026-11-26

Artefactos: `specs/crm-cartera/spec.md`, `specs/crm-sistema-diseno/spec.md` (delta), `design.md`,
`tasks.md`. Método: tres auditores nuevos en paralelo (cobertura de propuesta y maqueta; técnica
y base contra el código real; producto y claridad para el dueño), después un auditor del
auditor. Cada hallazgo se verificó contra el código, la maqueta o la base (consultas de solo
lectura) antes de aplicarlo.

## Ronda 1

Verificado antes de corregir: 13 de las 15 Coordinadas con fecha ya pasada y 3 sin hora; el
dueño tiene 46 procesos a su nombre (Lucas 16, otro asesor 1); `createTaskForRole` crea una
copia por coordinador (`lib/supabase/tasks.ts:99`); `useFiltrosUrl` exige claves de texto y
opciones estables (`use-filtros-url.ts:186-201`); los tests viejos son 23 y 13; la ficha oculta
los procesos ajenos al asesor (`app/api/contacts/[id]/tasks/route.ts:36`); `ultima-llamada.ts`
existe; 0 procesos sin origen hoy.

### Auditor técnico (código y base)

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | ALTA | En Contactos, el asesor recibía el proceso más nuevo de la persona aunque fuera de otro asesor (48 personas con más de un abierto). | Aplicado: `procesoDeContacto(procesos, quienMira)` elige solo entre los suyos; escenario en la spec; casos en 3.8, 4.2 y 5.3. |
| 2 | MEDIA | Coordinadas con fecha pasada sin regla (13 de 15) y criterio de "agendada" distinto al de la ficha. | Aplicado: mismo criterio que la ficha; tasación pasada = "Cargar el resultado de la tasación" vencida para el asesor y el dueño (Diferencia 12, escenario, tests). |
| 3 | MEDIA | Tasación sin hora sin regla (3 casos). | Aplicado: todo el día; escenario y test. |
| 4 | MEDIA | 8 s por lectura con paginación + RPC podía sumar 32 s; `rpcPaginado` sin señal. | Aplicado: un solo plazo de 15 s y opción `senal` en `rpcPaginado` con test (4.1). |
| 5 | MEDIA | La dirección no encajaba con `useFiltrosUrl` (boolean, opciones dinámicas, parámetros viejos, nombre `leerFiltros` repetido, `ver` por fuera). | Aplicado: claves de texto, `normalizar` de módulo con `ref`, `redirect` del servidor para los parámetros viejos, `leerFiltrosCartera`, `ver` por `aplicar`. |
| 6 | MEDIA | La receta esperaba "sin movimiento" con una llamada de hace 15 días, que la regla del corte anula. | Aplicado: la receta verifica que NO se marca; la regla de 14 días se prueba en los tests puros. |
| 7 | MEDIA | D1 no nombraba `ultima-llamada.ts`: quedaban dos formatos de "hace cuánto". | Aplicado: pasa a envoltorio de `ultimoContacto` + `textos-tiempo`; `FechaRelativa` usa `textos-tiempo`. |
| 8 | MEDIA | Validar `ver_como` necesita el perfil antes de leer. | Aplicado: lectura previa solo con `ver_como`, contada en D4. |
| 9 | MEDIA | No se decía qué grupos se arman si falla la RPC. | Aplicado: sin "Sin primer contacto" ni sin movimiento; escenario y test. |
| 10 | BAJA | La RPC y `contact_activities` no están en los tipos. | Aplicado: patrón de Consultas (cliente sin tipar). |
| 11 | BAJA | `DROP`+`CREATE` deja un instante sin función; `EXPLAIN` sin `ANALYZE`; `coalesce` se quedaba con la fecha vieja. | Aplicado: `CREATE OR REPLACE`, `EXPLAIN ANALYZE`, `greatest`. |
| 12 | BAJA | Consulta a `appraisals` sin `contact_id` no nulo. | Aplicado. |
| 13 | BAJA | Conteos de tests y consumidor del `POST` mal; `/contacts` no redirigía al abogado. | Aplicado (23/13, `FormCoordinarTasacion`, redirección nueva declarada). |
| 14 | BAJA | `AppSidebar.test.tsx` simula solo `usePathname`. | Aplicado en 6.6. |
| 15 | BAJA | Falta test de cerrado con tarea pendiente. | Aplicado (escenario y 3.5). |
| 16 | BAJA | `borrar` de la receta tiene que borrar tareas antes que procesos. | Aplicado en 8.1. |

### Auditor de cobertura (propuesta y maqueta)

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | ALTA | La ficha cambiaba de "Última llamada" a "Último contacto" sin delta de su spec. | Aplicado: requisito previo en 1.1 — se corrige en `crm-ficha-y-llamadas` (spec y código) antes de empezar; este change no toca esa spec. |
| 2 | MEDIA | Solicitud/Clase gratuita en la barra del asesor, no declarado. | Aplicado: regla escrita y Diferencia 11. |
| 3 | MEDIA | "Mostrar colegas" quedó solo para el dueño. | Aplicado: requisito "Colegas" para todas las vistas, con el texto de hoy. |
| 4 | MEDIA | Número en la cabecera sin regla para todos los grupos y en contradicción con la paginación. | Aplicado: grupo por grupo (alerta, neutro, ninguno) y delta del sistema de diseño reescrito. |
| 5 | MEDIA | Dónde va el pie y qué suma "Cargar 25 más". | Aplicado: "Cargar 25 más" por grupo, un pie por vista, escenarios de las tres vistas. |
| 6 | MEDIA | "Lo que está trabado" sin tope de nombres. | Aplicado: 5 por columna con su orden. |
| 7 | MEDIA | Procesos sin origen en el filtro. | Aplicado: no entran en ningún origen (hoy 0). |
| 8 | MEDIA | Falta el estado "fallan solo las tareas". | Aplicado: escenario con grupos y texto. |
| 9 | MEDIA | Textos sin fijar (tope, valor inventado, avisos, fecha de lo trabado, rol sin vista). | Aplicado: textos exactos en la spec. |
| 10 | MEDIA | "Seleccionar" sin test ni QA. | Aplicado: test de componente y paso de QA sin tocar "Eliminar". |
| 11 | BAJA | Barra inferior sin requisito. | Descartado por ahora con argumento: depende de la pregunta 2 al dueño; la tarea 7.4 escribe el escenario con la respuesta. |
| 12 | BAJA | Comportamientos sin escenario (limpieza al cambiar de vista, bajar a la lista, filtros que no tocan lo trabado, varias palabras, cabecera "Persona", contacto sin procesos). | Aplicado: un escenario por cada uno. |
| 13 | BAJA | Diferencia 4 sin escenario y requisito atado a una pregunta abierta. | Aplicado. |
| 14 | BAJA | El aviso de "Ver como" parecía fijo. | Aplicado: "en su lugar, sin quedar fijo". |

### Auditor de producto y claridad

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | ALTA | Los 14 días se eligieron con "61 de 100"; con los datos reales y el corte, los 100 seguimientos pasan juntos a rojo a las dos semanas. | Aplicado: la pregunta 1 lo dice con los números reales y vuelve a ofrecer la decisión. |
| 2 | ALTA | Las copias de la tarea de coordinación (una por coordinador, una es cuenta de prueba) mostrarían tareas ya hechas como vencidas. | Aplicado: se cuentan una vez con "· coordinación" y ninguna si una copia se completó (D3, escenario, Diferencia 13). |
| 3 | ALTA | La base "De 185 solicitudes" sugería que se llamó a casi todas. | Aplicado: la base son las nuevas y aparte "Además, M anteriores al registro de llamadas, sin dato." |
| 4 | MEDIA | "hace 150 días" en gris al lado de "hace 14 días" en rojo. | Aplicado: "antes del registro de llamadas" debajo (Diferencia 14). |
| 5 | MEDIA | Los 113 sin asesor del sistema anterior se decidieron sin preguntar. | Aplicado: pregunta 4 al dueño con opción por defecto. |
| 6 | MEDIA | 185 solicitudes viejas al final sin orden útil. | Aplicado: de la más vieja a la más nueva, y la pregunta 1 lo explica y ofrece una limpieza aparte. |
| 7 | MEDIA | Diferencia 8 (Comprador) contradecía "decir lo mismo". | Aplicado: explica qué ve cada pantalla y por qué son dos preguntas distintas. |
| 8 | MEDIA | Filtro "Asesor" sin procesos del dueño ni dados de baja. | Aplicado (verificado: 46 procesos del dueño): ofrece a toda persona con procesos; "(dado de baja)" cuenta como sin asesor. |
| 9 | MEDIA | "El total una sola vez" contra el pie. | Aplicado: la regla admite el pie. |
| 10 | BAJA | Referencias internas en las preguntas. | Aplicado: marcadas "para quien construye" y la tarea 1.5 las saca al presentarlas. |
| 11 | BAJA | Textos mejorables ("Espera hace … de reloj", "· coordinación"). | Descartado con argumento: son los textos de la maqueta aprobada y de la spec vigente del Inicio. |
| 12 | BAJA | Rol sin vista sin escenario de pantalla. | Aplicado. |
| 13 | BAJA | 53 coordinadas sin día se ven como Solicitud. | Aplicado: Diferencia 15. |

`openspec validate crm-cartera-por-rol --strict`: válido después de las correcciones.

### Auditor del auditor (ronda 1)

Confirmó la mayoría de las correcciones; marcó cuatro incompletas (firma de
`procesoDeContacto`, tasación pasada en la vista de la coordinación, restos de `leerFiltros` y
`colegas: true`, orden de las 185 viejas) y un descarte que no se cumplía (la tarea 7.4 no
escribía el escenario de la barra). Verificado: en este mismo worktree, otra sesión ya
renombró `ultima-llamada.ts` a `lib/crm/ultimo-contacto.ts` con `masReciente` y
`ultimoContacto(ultimoEn, ahora, etapaCRM)`, y cuenta la visita con `deals.visited_at`.

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | ALTA | El diseño creaba en `ultimo-contacto.ts` nombres que ya existen con otra forma, y usaba otra fuente de la visita (`greatest(visit_completed_at, visited_at)`) que la ficha (`visited_at`): ficha y lista dirían fechas distintas. | Aplicado: este change **extiende** el módulo de la ficha con `contactoRegistrado`, `ContactoRegistrado`, `textoQueFue`, `anteriorAlRegistro` y la fecha de inicio, elige con su `masReciente`, y la función SQL usa `deals.visited_at` como la ficha (D1, D2, D5, 1.2, 3.2). Revierte la corrección técnica 11 sobre `greatest`. |
| 2 | MEDIA | "Los 3.000 más recientes" con lectura ordenada por `id`. | Aplicado: procesos y contactos por `created_at desc, id`. |
| 3 | MEDIA | La página no decía qué hace con un `ver` prohibido o inválido. | Aplicado: prohibido → se ignora y vista propia sin leer nada ajeno; inválido → vista propia con el mensaje (D6 y test en 6.4). |
| 4 | MEDIA | Coordinada vencida en la vista de la coordinación sin regla. | Aplicado: "Cargar el resultado de la tasación" con el asesor, sin entrar en su grupo de vencidas (D3 y escenario). |
| — | MEDIA | Correcciones incompletas de la ronda (firma, `colegas`, `leerFiltros`, orden de las viejas, "tasación futura" en el requisito, 7.4). | Aplicado todo; el escenario no verificable "Depende de la pregunta 1" se sacó. |
| 5 | BAJA | "diez diferencias" en 10.5. | Aplicado (quince). |
| 6 | BAJA | D4 no listaba la lectura de tareas completadas. | Aplicado. |
| 7 | BAJA | El delta exigía "único enlace" también en modo selección. | Aplicado: excepción escrita. |
| 8 | BAJA | Base de "sin asesor" ambigua; dado de baja en el filtro. | Aplicado: base con las cinco etapas; el filtro lo ofrece con "(dado de baja)". |
| 9 | BAJA | "Sin contacto todavía" y "Sin contacto registrado" sin referencia cruzada. | Aplicado. |

`openspec validate crm-cartera-por-rol --strict`: válido.

## Ronda 2 (auditor nuevo, todo el change)

Verificado antes de corregir: la cadencia crea "Llamar a…" y "Enviar WhatsApp a…" repetidas
en el mismo proceso (`lib/crm/cadencia.ts:150` y `:185`); la tarea de entrada del embudo es
`update_contact` sin fecha (`lib/funnel/side-effect-handlers.ts:45`); la cabecera de la ficha
devuelve "Sin contacto todavía" con alerta en Solicitud (`lib/crm/ultimo-contacto.ts:44`).

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | ALTA | Juntar copias por mismo título escondía tareas reales de la cadencia (una "Enviar WhatsApp" completada anulaba la pendiente de hoy). | Aplicado: copias = solo las de `createTaskForRole` (sin `source_activity_id`, mismo proceso, tipo, título y minuto); la lectura suma `created_at` y `source_activity_id`; test en 3.5. |
| 2 | MEDIA | La primera llamada real no tiene fecha: toda solicitud nueva diría "Sin fecha" y quedaría al final. | Aplicado: regla de vencimiento desde el registro (o las 9:00 del día hábil siguiente) para solicitudes desde la fecha de inicio, con escenario y test; las anteriores siguen "Sin fecha". |
| 3 | MEDIA | La tarea 4.1 seguía con orden por `id`. | Aplicado: el orden de D4 y un test. |
| 4 | MEDIA | Ficha y lista dirían cosas distintas de las solicitudes anteriores al registro. | Aplicado: Diferencia 16 y pedido a `crm-ficha-y-llamadas` en la tarea 1.2 (que la cabecera use `anteriorAlRegistro`). |
| 5 | BAJA | `traducirParametrosViejos` podía redirigir en bucle. | Aplicado: solo `origin`, `from`, `to`; `etapa=descartado` suma `seg=cerrados`; idempotente con test. |
| 6 | BAJA | La spec decía 403 desde la dirección y el diseño, vista propia. | Aplicado: dos escenarios (dirección → vista propia; red → 403). |
| 7 | BAJA | "Una sola vez" contra el pie. | Aplicado. |

`openspec validate crm-cartera-por-rol --strict`: válido.

## Ronda 3 (auditor nuevo, verificación de la ronda 2 y búsqueda final)

Confirmó bien hechas las correcciones 2, 3, 4 y 6 de la ronda 2 contra el código (la ficha y
la función SQL leen las mismas fuentes del último contacto) y marcó 1, 5 y 7 a medias.

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | MEDIA | La regla de las copias pedía `source_activity_id` y `created_at`, que la lectura de pendientes y el texto de D3 no traían. | Aplicado: D3, D4 (b) y (d) con las mismas columnas; test en 4.2. |
| 2 | MEDIA | La ventana fija de 90 días dejaba afuera la copia completada de un lead viejo: la copia de la cuenta de prueba aparecería pendiente. | Aplicado (verificado por la regla de `createTaskForRole`): la lectura de completadas arranca en la copia pendiente más vieja; test de una hermana de hace 120 días. |
| 5 | MEDIA | "Tasación cercana" por persona podía mostrarle al asesor la tasación de otro asesor (horario, dirección, nombre). | Aplicado: es la del proceso de la fila; el test 4.2 busca también horario, dirección y asesor de la tasación ajena. |
| 3 | BAJA | "Ninguna lista paginada lleva número" contra grupos que paginan con número. | Aplicado: se nombra la lista larga de abajo. |
| 4 | BAJA | Parámetros viejos: D9 seguía con `etapa` y `asesor`; `?etapa=descartado` caía en abiertos. | Aplicado: viejos = `origin`, `from`, `to` o etapa cerrada sin `seg`; D5, D9 y 3.9 iguales. |
| 6 | BAJA | `proximoPaso` sin `ahora` ni etapa. | Aplicado: firma con objeto que los incluye. |
| 7 | BAJA | 8.2 esperaba "sin marcar" sin condicionar al plazo de 14 días. | Aplicado. |
| 8 | BAJA | D1 decía "sin commitear". | Aplicado (commit `3af9e1db`). |

`openspec validate crm-cartera-por-rol --strict`: válido.

## Cierre de la auditoría de los artefactos

Tres rondas (el máximo pedido). La ronda 3 todavía trajo tres hallazgos medios, los tres
corregidos y verificados contra el código; ninguno cambia la arquitectura (eran columnas de una
lectura, el borde de una ventana de tiempo y de qué proceso sale un renglón). Como no hubo una
ronda limpia después de esas correcciones, la auditoría doble del código (grupo 11 de
`tasks.md`) tiene que revisar expresamente: las copias de las tareas de coordinación, la
tasación cercana en Contactos del asesor y la lectura de completadas.

Ajuste posterior, encontrado al cerrar (no lo trajo un auditor): la sesión de la ficha creó en
este worktree `lib/crm/formato-fecha.ts` (`fechaRelativa`, `fechaExacta`, `cuandoEs`,
`textoVencimiento`). El diseño ya no crea `textos-tiempo.ts`: amplía ese módulo con
`haceCuanto` y `duracion` (D5 y tarea 3.3), para que haya un solo módulo de fechas.

## Ronda 4 (2026-11-26, verificación de la ronda 3 contra el código)

Cada hallazgo se verificó contra el código antes de aplicarlo; ninguno resultó falso.

| # | Gravedad | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | ALTA | La lectura (d) de completadas de coordinación estaba en la tanda 1, en paralelo con (b), de la que depende (el corte sale de la copia pendiente más vieja). Y el corte `created_at >= más vieja pendiente` dejaba afuera a la hermana que `createTaskForRole` inserta milisegundos antes en el mismo bucle (`lib/supabase/tasks.ts:99-118`, verificado). Además "mismo minuto", truncado, separaba un par 12:00:59,9 / 12:01:00,1. | Aplicado: (d) pasa a la tanda 2 (en paralelo con la RPC), con corte = copia pendiente más vieja **menos 60 s**; copias = 60 s o menos de diferencia entre instantes, sin truncar (D3, D4); (d) respeta el tope, avisa `truncado` y su falla cuenta como falla de las tareas; tests en 3.5 (el par 59,9/00,1 y uno a 61 s) y 4.1 (hermana completada creada segundos antes; columnas `source_activity_id` y `created_at`); medición de (d) en 4.3. |
| 2 | ALTA | `cargarContactos` no hacía la lectura (d): en Contactos del equipo una copia ya completada por la otra coordinadora aparecería pendiente. | Aplicado: D3 y D6 lo dicen; tarea 4.2 con la misma lectura, el mismo corte y el test "hermana completada → no aparece". |
| 3 | ALTA | Borrar `crm-stages.ts` rompía `lib/crm/ficha.ts:9`, que lo importa para `etapaDelCRM` (~línea 132, verificado); D9 decía que solo lo importaba `crm/page`. Y sus etiquetas ("No Realizada", "Clase Gratuita") no son las de `NOMBRE_ETAPA` ("No realizada", "Clase gratuita"). | Aplicado: D9 suma `lib/crm/ficha.ts` (y `DealsList`/`StagePipeline`) a los consumidores y saca "lo importan solo…"; la tarea 6.4 pasa primero `etapaDelCRM` a `etapaCRM` + `NOMBRE_ETAPA` con el test antes (ficha y lista escriben igual cada etapa) y recién después borra. |
| 4 | BAJA | D1 decía que la spec de la ficha "todavía dice Última llamada" y que `formato-fecha.ts` estaba sin commitear; la tarea 1.1 frenaba por eso. | Aplicado: verificado que spec y cabecera ya dicen "Último contacto" y que `formato-fecha.ts` está en la rama (commit `30acc591`); D1, D5 y 1.1 corregidos (1.1 solo confirma). |
| 5 | BAJA | La tarea 1.5, la 7.4 y las Diferencias 6 y 10 seguían condicionadas a respuestas del dueño que ya llegaron ("Ok a las 4", 2026-11-26). | Aplicado: quedan con la opción por defecto elegida; 7.4 pasa a "no se toca, se verifica". |
| 6 | BAJA | Faltaba aceptar por escrito que en Contactos un asesor ve "hace N días · Visita de tasación" de una visita hecha en un proceso de otro asesor. | Aplicado: en Risks, como aceptado (solo viaja el instante y coincide con la ficha). |

`openspec validate crm-cartera-por-rol --strict`: válido.

## Auditoría del código — Auditor 1 (2026-11-27)

Agente nuevo, sin contexto, en solo lectura sobre `feat/crm-cartera-por-rol` (92f83abf). Revisó
cada `#### Scenario` de `crm-cartera` y del delta de `crm-sistema-diseno` contra el código
(tabla completa en el informe del auditor: todos "Cumple" salvo cuatro "Parcial", que son M1,
M2/B5, B4 y B2), más permisos y seguridad. Corridas: vitest 2249 en verde, `tsc` sin errores.

**Permisos y seguridad: sin hallazgos.** Asesor por la red (`/api/crm/cartera` y
`/api/crm/contactos`), `ver_como` desde asesor o coordinación (403 antes de leer; en la página se
ignora), abogado, `?volver=` (lista blanca de caminos, sin redirector abierto ni XSS), frontera
servidor→cliente (solo datos planos), `appraisals` (tres columnas, nunca `select('*')`) y
`crm_ultimos_contactos` (INVOKER, `search_path` fijo, solo `service_role`).

| # | Nivel | Hallazgo (verificado) | Qué se hizo |
|---|---|---|---|
| M1 | MEDIA | En la vista de la coordinación, una tasación vencida del asesor competía por fecha con las tareas de la coordinadora: si vencía antes, una llamada vencida de ella quedaba fuera de "Llamada o mensaje vencido". Reproducido. | Aplicado: `proximoPaso` recibe `tasacionVencidaSoloSinTareas` (solo vista de coordinación); la tasación vencida cede si ella tiene alguna tarea en el proceso. Tests: el par del auditor (→ tarea, grupo `vencidas`) y el mismo caso para el asesor (sigue la tasación). Contactos no agrupa por vencidas: sin cambio. |
| M2 | MEDIA (latente) | `truncado` juntaba todas las fuentes: un corte de tareas, de (d) o de la RPC decía "hay más procesos…" (falso) y dejaba filas con "Nada agendado" al azar. | Aplicado: `tareasOError` — tareas o (d) cortadas = error de tareas; RPC cortada = error de último contacto; `truncado` queda solo para procesos/contactos/tasaciones/perfiles. Tests: (d) cortada y pendientes cortadas → `fuentes.tareas = 'error'`, `truncado = false`. |
| B1 | BAJA | (d) se leía en vistas que no la usan (coordinación, asesor; Contactos con alcance propio): una falla de (d) marcaba error sin motivo. | Aplicado: (d) solo en la vista del dueño y en Contactos con alcance `todos`. Test: la coordinación no lee (d). |
| B2 | BAJA | Si `/crm?ver=<id>` fallaba en la primera carga, "Reintentar" perdía la persona. | Aplicado: sin datos, `ver` se acepta con forma de uuid (el servidor lo valida). |
| B3 | BAJA | En Contactos del asesor, una persona visible cuyo único proceso es de otro asesor sale "Sin proceso abierto". Sin fuga de datos. | Pregunta al dueño (texto neutro "Sin proceso tuyo" o aceptarlo). Un booleano "tiene otro proceso" revelaría lo que la ficha oculta. |
| B4 | BAJA | En "Sin proceso abierto" de Contactos la cabecera de la tabla dice "Cierre" y la tarjeta "Próximo paso". | Pregunta al dueño junto con B3 (ver PR). |
| B5 | BAJA | Contactos usaba el aviso de tope que habla de "procesos". | Aplicado: `TEXTO_TOPE_CONTACTOS` ("…más personas…"). |
| B6 | BAJA | "Nada urgente" se calculaba sobre lo filtrado: con una etapa elegida lo afirmaba aunque hubiera urgentes fuera del filtro. | Aplicado: no se muestra con etapa ni con lo trabado elegidos. |
| B7 | BAJA | (a) El racimo de copias se encadenaba contra la última tarea y podía abarcar más de 60 s; (b) en Contactos, tareas solo de contacto con el mismo título se tratarían como copias (hoy no ocurre: todo `createTaskForRole` lleva `deal_id`). | (a) Aplicado: se compara contra la primera del racimo, con test. (b) Aceptado como riesgo latente, anotado. |

Después de las correcciones: vitest 2254 en verde, `tsc -p tsconfig.crm.json` y `eslint` sin
errores. Como son cambios posteriores al QA, vuelven a pasar por la vista previa (tarea 11.2).

## QA en pantalla después del Auditor 1 (2026-11-27, tareas 9.2–9.7 y 11.2)

QA completo sobre 92f83abf: 132 criterios, 81 capturas (`~/Dev/crm-cartera-qa/`). Hallazgos:
la fila de la tabla se desarmaba a partir de 44rem (Tailwind v4: `row-span-1` pisaba
`row-start-1`; el avatar perdía la fila 1 y las columnas se corrían), "Seleccionar" sin
casillas, el próximo paso repetía el nombre en títulos "X: Nombre" (385 tareas), y la hoja de
filtros del celular con "Ver resultados" en negro y "Limpiar filtros" sin borde. Corregidos en
f10bc085 y vueltos a probar en la vista previa nueva (dueño, coordinación y asesor, a 1280 y a
390, Contactos, "Seleccionar" y la hoja): celdas alineadas bajo su cabecera, tarjeta intacta,
consola limpia. Red con rol asesor: el proceso del otro asesor no viaja; abogado y `viewer`,
403. Medición 9.4: `/api/crm/cartera` 0,9–1,1 s y 537 KB (101 KB comprimido) para el dueño;
0,8–0,9 s y 323 KB para la coordinación; lejos de 1 MB. Limpieza 9.7: 0 filas, 0 emails, 0
WhatsApp, Mailchimp limpio, cuenta en `admin`.

## Auditoría del código — Auditor 2 (2026-11-27)

Agente nuevo, solo lectura sobre f10bc085. Verificó 15 "Cumple" del Auditor 1 (8 de permisos):
los 15 se cumplen. Compiló las clases nuevas de la fila con el Tailwind 4.1.18 del repo:
correctas. Sin hallazgos de permisos ni de seguridad. Resultado: **No conforme** (1 MEDIA).

| # | Nivel | Hallazgo (verificado) | Qué se hizo |
|---|---|---|---|
| H1 | MEDIA | M1 cambió una regla normativa sin anotarla: la spec decía "lo primero que vence entre tareas y tasación". | Aplicado: requisito nuevo "Próximo paso en la vista de la coordinación" con su escenario; D3 corregido; Diferencia 17. |
| H2 | BAJA | Con la primera carga fallida, tras "Reintentar" el selector "Ver como" quedaba sin personas y el primer cambio de filtro sacaba `ver` de la dirección. | Aplicado: las opciones van en estado y se toman de la primera respuesta buena (o la persona mirada); la persona mirada siempre es un `ver` válido. Test de componente que falla sin el arreglo. |
| H3 | BAJA | B6 incompleto: con búsqueda, origen, asesor o fechas puestos seguía afirmando "Nada urgente". | Aplicado: `!hayFiltros(filtros)`. Test que falla sin el arreglo. |
| H4 | BAJA | B7(a) cambió un error por el opuesto: anclar el racimo en la primera dejaba viva una pendiente con una cerrada a ≤60 s. | Aplicado: regla por pares de D3 (una pendiente se anula si hay una cerrada a ±60 s de ELLA; las vivas se cuentan juntas a ≤60 s de la primera). Tests ajustados a D3. |
| H5 | BAJA | Un corte de tareas/(d)/RPC por tope dejaba un error permanente sin ningún log. | Aplicado: `console.warn('[crm] tope de 3000 filas en …')` y línea en la Detección de `CLAUDE.md`. |
| H6 | BAJA | En Contactos `TEXTO_TOPE_CONTACTOS` decía "más personas" también cuando se cortaban procesos o tasaciones. | Aplicado: "Esta lista quedó incompleta: hay más personas o procesos…". |
| H7 | BAJA | Diseño y `CLAUDE.md` seguían describiendo el `truncado` y la (d) de antes de M2/B1. | Aplicado: D4, D6 y `CLAUDE.md` actualizados. |
| H8 | BAJA | Un título que fuera solo ": {nombre}" quedaba vacío. | Aplicado: si el recorte queda vacío, se devuelve el título original. Test. |
| H9 | BAJA | Faltaban las diferencias que marcó el QA, tests de B2/B6 y el registro del re-QA. | Aplicado: Diferencias 18–20, tests de H2/H3 (cubren B2/B6) y la sección de QA de arriba. |

Después: vitest 2258 en verde, `tsc` y `eslint` sin errores, `openspec validate --strict` válido.

## Auditoría de cierre — Auditor 3 (2026-11-27)

Agente nuevo, solo lectura sobre f6c24cfc: verificó H1–H9 contra el código. Sin hallazgos de
permisos ni de seguridad; H1 (código), H2 (un no dueño no puede tener opciones; el servidor
valida `ver_como`), H3, H4, H5 y H8 cumplen. Resultado: **No conforme** (1 MEDIA de proceso).

| # | Nivel | Hallazgo | Qué se hizo |
|---|---|---|---|
| A3-1 | MEDIA | El cuerpo del PR seguía siendo el del borrador: sin Diferencias, pre-flight, grep de D9, respuestas a 9.1, QA, mediciones ni preguntas al dueño, aunque las tareas las daban por anotadas. | Aplicado: cuerpo del PR completo (ver PR #96). |
| A3-2 | BAJA | Tras un "Reintentar" mirando a alguien, el selector se quedaba con una sola persona aunque después llegara la lista completa. | Aplicado: la lista completa gana siempre; si no llega, se suma la persona mirada. Test: volver a "Mi vista" lista a todos. |
| A3-3 | BAJA | El requisito "Próximo paso" seguía sin salvedad; el nuevo decía "ninguna tarea" (el código mira solo las que cuentan); espaciado. | Aplicado: salvedad con remisión, "ninguna de las tareas que cuentan para el próximo paso", espaciado. |
| A3-4 | BAJA | Nombre de un test contradictorio; D3 no describía la regla por pares; D3 seguía diciendo que (d) avisa `truncado`. | Aplicado: test renombrado; D3 con la regla por pares y con "cortada = error + `console.warn`". |
| A3-5 | BAJA | El aviso de Contactos nombraba "personas o procesos" aunque el corte pudiera ser de tasaciones o perfiles. | Aplicado: "hay más datos de los que esta pantalla puede traer". |
| A3-6 | BAJA | 11.3 sin marcar. | Aplicado. |

Además (10.2): `scripts/apply-crm-cartera-pg.ts` vuelto a correr — aplicada y verificada, 900
ids en 3,8 ms, 0 filas de prueba; `git diff --name-only origin/main...HEAD` lista solo archivos
de este change, `CLAUDE.md` y la propuesta de `crm-inicio`; rama al día con `origin/main`.

Después del Auditor 3 se aplicó además la recomendación de B3 y B4 (f93555b2): "Sin proceso
tuyo" en los Contactos del asesor y la cabecera "Cierre / próximo paso" (Diferencias 21 y 22).
vitest 2260, `tsc`, `eslint` y `openspec validate --strict` sin errores.

## Auditoría de cierre — Auditor 4 (2026-11-27)

Agente nuevo, solo lectura sobre f93555b2. A3-1..A3-6 bien hechos; cifras del PR contrastadas.
"Sin proceso tuyo" solo con alcance propio (asesor) y sin revelar nada del proceso ajeno. Sin
hallazgos de permisos ni de seguridad. Resultado: **No conforme** (1 MEDIA de proceso).

| # | Nivel | Hallazgo | Qué se hizo |
|---|---|---|---|
| A4-1 | MEDIA | Tres commits con cambios de pantalla (f6c24cfc, de320bcd, f93555b2) sin re-QA en la vista previa. | Aplicado: re-QA en la vista previa de f93555b2 con los datos de la receta. Contactos del asesor a 1280 y 390: texto "…o lo lleva otro asesor.", cabecera "Cierre / próximo paso", tarjeta que rotula "Cierre" por fila. Contactos de la coordinación: texto de siempre. `/crm` con una búsqueda sin resultados: no dice "Nada urgente". Consola sin errores. "Ver como" tras un "Reintentar" depende de una primera carga fallida del servidor, que no se puede provocar desde el navegador: lo cubren dos tests de componente que fallan sin el arreglo. Después: `borrar` y `verificar`, con 0 filas. |
| A4-2 | BAJA | Los escenarios de Contactos y D5 seguían diciendo "Sin proceso" para el asesor sin ningún proceso. | Aplicado: "Sin proceso" (para el asesor, "Sin proceso tuyo"); escenario nuevo ampliado; D5 corregido. |
| A4-3 | BAJA | "Abiertos y cerrados" decía "Cierre" para toda lista. | Aplicado: salvedad de Contactos. |
| A4-4 | BAJA | Cuatro frases inexactas en el PR. | Aplicado: corregidas en el cuerpo del PR. |
| A4-5 | BAJA | `auditoria.md` no registraba f93555b2. | Aplicado (párrafo de arriba). |
| A4-6 | BAJA | 10.5 decía "dieciséis diferencias"; `CLAUDE.md` omitía `perfiles` en el tope. | Aplicado. |

**Cierre de la auditoría del código (11.4):** cuatro rondas. Ningún auditor encontró problemas
de permisos ni de seguridad. Todos los hallazgos MEDIA quedaron corregidos y verificados: M1 y
M2 de código, H1 de spec, A3-1 y A4-1 de proceso. Los BAJA están aplicados, salvo B7(b), que
queda aceptado como riesgo latente. `openspec validate --strict`: válido.

## Pasada final contra producción (11.5, 2026-11-27)

Después del merge (f2873d09 en `main`, autor Sujupar) y del deploy, con los datos de la receta
creados en la misma sesión (`borrar` → `verificar` → `crear`) en `https://inmodf.com.ar`:

| Criterio | Cómo se probó | Resultado |
|---|---|---|
| Pantalla nueva en producción | `/crm` como admin | OK: "Lo que está trabado", "Ver como", barra y lista |
| Vista de la coordinación | rol coordinador, `/crm?q=cartera qa` | OK: "Sin primer contacto" y "Llamada o mensaje vencido" |
| Ficha y vuelta | abrir una fila desde `/crm` | OK: "‹ Volver al CRM" |
| Contactos | `/contacts` como admin | OK: "Con proceso abierto / Sin proceso abierto" |
| Asesor por la red | rol asesor: `/api/crm/cartera` y `/api/crm/contactos` | 200, sin el proceso ni el contacto del caso 10 (de otro asesor); tampoco en el HTML de `/crm` |
| Control del anterior | rol admin: `/api/crm/cartera` | el proceso del caso 10 SÍ viaja (la prueba mide algo) |
| "Ver como" desde un asesor | `/api/crm/cartera?ver_como=<uuid>` | 403, sin filas |
| Abogado | `/crm` y las dos rutas | redirige a `/properties/review`; 403 y 403 |
| Celular | rol asesor a 390 px | OK |
| Consola | todo el recorrido | 0 errores, 0 respuestas 5xx |

Cierre (10.4): `borrar` y `verificar` → 0 filas; cuenta "Claude · pruebas" en `admin`
(verificado con un select); navegador de Claude cerrado.
