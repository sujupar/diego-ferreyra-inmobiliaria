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
