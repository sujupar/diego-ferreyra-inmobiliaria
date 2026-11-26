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
