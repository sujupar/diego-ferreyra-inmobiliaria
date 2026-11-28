# crm-cartera Specification

## Purpose

Define qué ve cada rol al abrir el CRM (`/crm`) y Contactos (`/contacts`), cómo se lee una
fila, el selector "Ver como" de admin y dueño, "Lo que está trabado", los filtros, y quién
puede recibir qué datos por la red. La fuente de verdad visual y de textos es la maqueta
aprobada por el dueño el 2026-11-26 (`maqueta/`, capturas en `maqueta/capturas/`, decisiones
en `maqueta/pantallas/decisiones.html`), con las cuatro respuestas del dueño escritas al
final de `proposal.md`.

Nombres de etapa de toda esta spec (los de la plataforma): Solicitud, Coordinada, No
realizada, Realizada, Entregada, Seguimiento, Clase gratuita, Comprador, Captada y
Descartado. "Abierto" es todo proceso que no está en Captada ni en Descartado; "cerrado", los
que están en una de esas dos. "Contacto registrado" es una llamada registrada, un WhatsApp
marcado como enviado o una visita de tasación hecha; una nota interna o un registro anulado
no lo son. "Fecha de inicio del registro" es el día en que salió a producción la ficha de
contacto de `crm-ficha-y-llamadas`: antes de esa fecha las llamadas no se anotaban.

## Requirements

### Requirement: Cada rol abre el CRM en la vista de su trabajo
Al abrir `/crm`, un coordinador SHALL ver la vista de la coordinación, un asesor la vista del
asesor, y un admin o un dueño la vista del dueño. Un abogado SHALL ser enviado a
`/properties/review`, y cualquier otro rol SHALL NOT recibir ningún proceso. La vista MUST
decidirla el servidor según el rol de la sesión.

#### Scenario: Coordinadora abre el CRM
- **WHEN** una coordinadora abre `/crm`
- **THEN** ve el título "CRM" con el texto "Solicitudes, coordinadas y no realizadas, ordenadas por lo que hay que hacer primero." y la lista agrupada de la coordinación

#### Scenario: Asesor abre el CRM
- **WHEN** un asesor abre `/crm`
- **THEN** ve el título "CRM" con el texto "Tus procesos, ordenados por el próximo paso." y solo procesos asignados a él

#### Scenario: Dueño abre el CRM
- **WHEN** un dueño o un admin abre `/crm`
- **THEN** ve el título "CRM" con el texto "El embudo completo, lo que está trabado y la lista de todos los procesos.", el selector "Ver como" y el bloque "Lo que está trabado"

#### Scenario: Abogado intenta entrar
- **WHEN** un abogado abre `/crm` o pide los datos de la cartera por la red
- **THEN** la pantalla lo lleva a `/properties/review` y el pedido de datos responde 403 sin ningún proceso

#### Scenario: Rol sin vista
- **WHEN** un usuario con un rol que no es coordinador, asesor, admin, dueño ni abogado abre `/crm` o pide los datos de la cartera
- **THEN** la pantalla dice "No tenés acceso al CRM" sin ningún dato, y el pedido responde 403 sin ningún proceso

### Requirement: Qué procesos ve la coordinación
La vista de la coordinación SHALL listar, entre los abiertos, solo los procesos en Solicitud,
Coordinada y No realizada, y entre los cerrados solo los descartados sin asesor. En ninguna
de las dos SHALL aparecer la etapa Clase gratuita ni un proceso cuyo origen es la clase
gratuita (respuesta 3 del dueño, 2026-11-26).

#### Scenario: Las clases gratuitas no aparecen
- **WHEN** hay procesos en la etapa Clase gratuita y procesos cuyo origen es la clase gratuita
- **THEN** la coordinadora no los ve en ninguna lista ni en ningún número de su vista, y la barra de etapas no ofrece "Clase gratuita"

#### Scenario: No realizada para volver a coordinar
- **WHEN** un proceso pasó de Coordinada a No realizada y la coordinadora tiene la tarea "Volver a coordinar" para hoy a las 12:00
- **THEN** figura en su vista con la etapa "No realizada" y el próximo paso "Volver a coordinar" "Hoy 12:00"

#### Scenario: Cerrados de la coordinación
- **WHEN** la coordinadora toca "Cerrados"
- **THEN** ve los procesos descartados sin asesor, sin los de la clase gratuita, y la barra de etapas muestra solo "Descartado"

#### Scenario: Un proceso de un asesor ya avanzado
- **WHEN** un proceso está en Realizada con un asesor asignado
- **THEN** no aparece en la vista de la coordinación

### Requirement: Grupos de la coordinación
Los abiertos de la coordinación SHALL mostrarse en cuatro grupos, en el orden "Sin primer
contacto", "Llamada o mensaje vencido", "Tasaciones de hoy y mañana" y "El resto de las
solicitudes y coordinadas", con cada proceso solo en el primer grupo que le corresponde. Un
grupo sin procesos SHALL NOT mostrarse.

#### Scenario: Textos de los grupos
- **WHEN** la coordinadora mira los cuatro grupos
- **THEN** debajo de cada título dice, en orden, "Nadie las llamó todavía. Primero la que más espera.", "Tenían una tarea para antes de ahora.", "Para confirmar el horario con la persona y con el asesor." y "Ordenadas por el próximo paso. Al final, las que no tienen nada agendado."

#### Scenario: Orden de los grupos
- **WHEN** la coordinadora tiene una solicitud sin ningún contacto registrado, otra con su tarea de llamada vencida y una coordinada con la tasación mañana a las 11:00
- **THEN** ve primero "Sin primer contacto" con la primera, después "Llamada o mensaje vencido" con la segunda, después "Tasaciones de hoy y mañana" con la tercera, y cada una aparece una sola vez

#### Scenario: Sin primer contacto, primero la que más espera
- **WHEN** hay dos solicitudes sin ningún contacto registrado, una que entró ayer y otra hace una hora
- **THEN** en "Sin primer contacto" aparece primero la de ayer

#### Scenario: Tasaciones de hoy y mañana
- **WHEN** hay una coordinada con la tasación hoy a las 15:30 con Florencia Ledesma y otra pasado mañana
- **THEN** "Tasaciones de hoy y mañana" lista solo la de hoy, y la de pasado mañana va en "El resto de las solicitudes y coordinadas"

#### Scenario: Nada urgente
- **WHEN** la coordinadora no tiene solicitudes sin primer contacto ni tareas vencidas
- **THEN** en lugar de esos dos grupos ve "Nada urgente" con el texto "No hay solicitudes sin primer contacto ni llamadas vencidas. Abajo sigue el resto de la cartera."

### Requirement: Vista del asesor
La vista del asesor SHALL listar solo los procesos asignados a ese asesor, en cualquier etapa,
incluidos sus compradores, en los grupos "Tasaciones de hoy", "Tareas vencidas", "Con próximo
paso" y "Sin nada pendiente", en ese orden y con cada proceso en uno solo. SHALL NOT tener
filtro ni columna "Asesor".

#### Scenario: Textos de los grupos del asesor
- **WHEN** el asesor mira sus cuatro grupos
- **THEN** debajo de cada título dice, en orden, "Las que tenés hoy, por hora.", "Tenían que estar hechas antes de ahora.", "Ordenados por fecha." y "No tienen ninguna tarea ni visita. Poneles un próximo paso o cerrá el proceso."

#### Scenario: Tasaciones de hoy por hora
- **WHEN** el asesor tiene dos tasaciones hoy, a las 15:30 y a las 12:30, que todavía no pasaron
- **THEN** "Tasaciones de hoy" las lista en el orden 12:30 y 15:30

#### Scenario: Tarea vencida del asesor
- **WHEN** el asesor tiene la tarea "Entregar la tasación a Mirta Sosa" que venció ayer a las 18:00
- **THEN** ese proceso aparece en "Tareas vencidas" con el próximo paso "Entregar la tasación" y "Vencida hace 1 día" en rojo con ícono

#### Scenario: Proceso sin nada pendiente
- **WHEN** un seguimiento del asesor no tiene ninguna tarea pendiente ni tasación agendada
- **THEN** aparece en "Sin nada pendiente" con el próximo paso "Nada agendado"

#### Scenario: Comprador del asesor
- **WHEN** el asesor tiene un proceso en la etapa Comprador
- **THEN** lo ve en su lista y la barra de etapas incluye "Comprador" con su número

#### Scenario: Asesor sin procesos
- **WHEN** un asesor no tiene ningún proceso asignado
- **THEN** ve "Abiertos 0" y "Todavía no tenés procesos" con el texto "Cuando te asignen una tasación, aparece acá con su próximo paso."

### Requirement: Vista del dueño
La vista del dueño (admin y dueño) SHALL mostrar, en este orden, "Lo que está trabado",
"Abiertos / Cerrados" con la barra de etapas, los filtros y una sola lista "Todos los
procesos" con "Ordenar por" y la columna "Asesor". Admin y dueño SHALL conservar el botón
"Seleccionar" para eliminar varios procesos.

#### Scenario: Barra del dueño
- **WHEN** el dueño mira los abiertos
- **THEN** la barra dice "Embudo de tasación" con Solicitud, Coordinada, No realizada, Realizada, Entregada y Seguimiento, y "Fuera del embudo" con Clase gratuita y Comprador, cada una con su número

#### Scenario: El próximo paso dice de quién es
- **WHEN** el dueño mira un proceso cuya tarea más próxima es de la coordinadora Paula y cuyo asesor es Tomás Agüero
- **THEN** el próximo paso muestra la tarea seguida de "· Paula", y la columna Asesor dice "Tomás Agüero"

#### Scenario: El nombre no se repite
- **WHEN** la tarea más próxima de un proceso es del mismo asesor que figura en la columna Asesor
- **THEN** el próximo paso no repite su nombre

#### Scenario: Seleccionar para eliminar
- **WHEN** el dueño toca "Seleccionar" en "Todos los procesos"
- **THEN** aparece una casilla en cada fila y la barra para eliminar varios procesos juntos, igual que hoy, y tocar una fila con la selección activa la marca en lugar de abrir la ficha

### Requirement: Colegas
En toda vista del CRM, los procesos marcados como colega SHALL quedar ocultos por defecto (de la
lista y de los números) y, si hay alguno en lo que se está mirando, SHALL aparecer arriba de la
lista el rótulo "Colegas" con el botón "Mostrar (N)", que pasa a "Ocultar (N)" al tocarlo,
igual que hoy.

#### Scenario: Colegas en los cerrados de la coordinación
- **WHEN** la coordinadora mira sus cerrados y hay 3 descartados sin asesor marcados como colega
- **THEN** no los ve ni los cuenta hasta tocar "Mostrar (3)", y entonces el botón dice "Ocultar (3)"

#### Scenario: Sin colegas
- **WHEN** no hay ningún proceso de colega en lo que se mira
- **THEN** no aparece el rótulo "Colegas"

### Requirement: Lo que está trabado
En su propia vista y en los abiertos, el dueño SHALL ver arriba el bloque "Lo que está
trabado" con la fecha y hora del cálculo y tres columnas: "Solicitudes sin primer contacto",
"Procesos sin asesor" y "Seguimientos sin movimiento", cada una con su número, su base y un
botón que filtra la lista de abajo. El bloque SHALL NOT aparecer en "Ver como" ni en los
cerrados.

#### Scenario: Bases de cada columna
- **WHEN** el dueño mira "Lo que está trabado"
- **THEN** debajo de cada título dice "De N solicitudes abiertas. Llama la coordinación.", "Ya pasaron la solicitud y nadie los tiene. De N procesos." y "Sin contacto hace 14 días o más. De N seguimientos.", con N contado sobre los abiertos sin colegas; en la primera columna N cuenta solo las solicitudes que entraron desde la fecha de inicio del registro y, si hay anteriores, se agrega "Además, M anteriores al registro de llamadas, sin dato."

#### Scenario: Fecha del cálculo
- **WHEN** el dueño mira "Lo que está trabado" el miércoles 25 de noviembre a las 10:40
- **THEN** al lado del título dice "al mié 25 nov, 10:40"

#### Scenario: Hasta cinco nombres por columna
- **WHEN** una columna tiene 61 procesos
- **THEN** en la computadora lista los 5 más graves (la espera más larga, los más días sin movimiento, y en "Procesos sin asesor" los de etapa más avanzada y después los más viejos) y el botón dice "Ver los 61 en la lista"

#### Scenario: Los filtros no cambian lo trabado
- **WHEN** el dueño pone el origen "Referido" en los filtros de la lista
- **THEN** los números de "Lo que está trabado" no cambian

#### Scenario: Ver en la lista lleva a la lista
- **WHEN** el dueño toca "Ver los 61 en la lista"
- **THEN** la pantalla baja hasta la lista filtrada

#### Scenario: Burbuja de alerta
- **WHEN** una columna tiene uno o más procesos
- **THEN** su número va en una burbuja en estilo de alerta; con cero, en estilo normal

#### Scenario: Espera de una solicitud sin primer contacto
- **WHEN** una solicitud entró hace 16 horas y 20 minutos, de las cuales 1 hora y 40 minutos fueron en horario laboral, y nadie la contactó
- **THEN** figura con "Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles", con ícono de reloj, y primero la que más espera

#### Scenario: Espera sin diferencia
- **WHEN** la solicitud entró y esperó solo dentro del horario laboral
- **THEN** dice solo "Espera hace 28 min"

#### Scenario: Sin asesor
- **WHEN** hay un proceso en Realizada sin asesor que vino del sistema anterior
- **THEN** cuenta en "Procesos sin asesor" y figura como "Realizada · Histórico"

#### Scenario: Seguimiento sin movimiento en lo trabado
- **WHEN** un seguimiento cuenta como sin movimiento y lleva 22 días
- **THEN** figura con "22 días · " y el nombre de su asesor (o "sin asesor"), de más a menos días

#### Scenario: Ver en la lista
- **WHEN** el dueño toca "Ver los 61 en la lista" en "Seguimientos sin movimiento"
- **THEN** la lista "Todos los procesos" queda filtrada a esos 61, aparece el filtro puesto "Seguimiento sin movimiento", el pie dice "Mostrando 25 de 61" y el botón pasa a "Quitar este filtro"

#### Scenario: Uno solo
- **WHEN** una columna tiene un solo proceso
- **THEN** el botón dice "Ver el proceso en la lista"

#### Scenario: En el celular, solo el resumen
- **WHEN** el dueño abre el CRM a 390 px
- **THEN** cada columna muestra solo su título, su número, su base y el botón, sin la lista de nombres

#### Scenario: No se puede contar
- **WHEN** falla la lectura de los contactos registrados con la que se cuenta lo trabado
- **THEN** el bloque dice "No se pudo cargar lo trabado" con el texto "No mostramos ningún número hasta poder contarlo." y "Reintentar", sin ningún número, y la lista de abajo sigue funcionando

### Requirement: Cuándo un proceso está trabado
Una solicitud SHALL contar "sin primer contacto" cuando la persona no tiene ningún contacto
registrado. Un proceso SHALL contar "sin asesor" cuando está en Coordinada, No realizada,
Realizada, Entregada o Seguimiento y no tiene asesor. Un seguimiento SHALL contar "sin
movimiento" cuando su último contacto fue hace 14 días o más, o no tiene ninguno (respuesta 2
del dueño, 2026-11-26). Las tres reglas SHALL ser las mismas en las filas, en los grupos y en
"Lo que está trabado".

#### Scenario: Seguimiento de 13 y de 14 días
- **WHEN** un seguimiento tuvo su última llamada hace 13 días y otro hace 14
- **THEN** el de 14 días cuenta como sin movimiento y el de 13 no

#### Scenario: La misma regla en la fila
- **WHEN** un seguimiento cuenta como sin movimiento en "Lo que está trabado"
- **THEN** su fila muestra el último contacto en rojo con ícono y "Sin movimiento"

#### Scenario: Una solicitud sin asesor no está trabada por eso
- **WHEN** una solicitud no tiene asesor
- **THEN** no cuenta en "Procesos sin asesor"

### Requirement: Contactos sin registro anterior al CRM nuevo
Para no afirmar lo que no se sabe, una solicitud que entró antes de la fecha de inicio del
registro SHALL NOT contar como "sin primer contacto", y los 14 días de "sin movimiento" SHALL
contarse desde el último contacto o desde esa fecha, lo que sea más reciente. Una fila abierta
sin ningún contacto registrado cuyo proceso empezó antes de esa fecha SHALL decir "Sin
contacto registrado" en gris. La fecha SHALL ser una sola constante del código.

#### Scenario: Solicitud anterior a la ficha
- **WHEN** una solicitud entró en septiembre, antes de la fecha de inicio del registro, y no tiene ningún contacto registrado
- **THEN** no figura en "Sin primer contacto" ni en "Lo que está trabado", va en "El resto de las solicitudes y coordinadas", y su último contacto dice "Sin contacto registrado"

#### Scenario: Solicitud posterior a la ficha
- **WHEN** una solicitud entró después de la fecha de inicio del registro y nadie la contactó
- **THEN** figura en "Sin primer contacto" y su último contacto dice "Sin contacto todavía"

#### Scenario: Seguimiento con la visita de hace meses
- **WHEN** un seguimiento tuvo su visita de tasación hace 5 meses, no tiene ninguna llamada registrada y pasaron 10 días desde la fecha de inicio del registro
- **THEN** todavía no cuenta como sin movimiento ni se marca en rojo; a los 14 días desde esa fecha sí

### Requirement: Ver como
En `/crm`, un admin o un dueño SHALL tener el selector "Ver como", con su propia vista y una
opción por cada coordinador y asesor activo, que muestra exactamente lo que esa persona ve en
su CRM, con un aviso y "Volver a mi vista". El servidor MUST validar quién pide y a quién se
elige. Ver como SHALL NOT cambiar permisos ni datos de nadie, ni mostrar "Seleccionar" ni "Lo
que está trabado". La persona elegida SHALL quedar en la dirección.

#### Scenario: Opciones del selector
- **WHEN** el dueño abre "Ver como"
- **THEN** ve "Mi vista (dueño)" (o "Mi vista (admin)") y una opción por persona con la forma "Nombre · coordinación" o "Nombre · asesor"

#### Scenario: El dueño mira la vista de un asesor
- **WHEN** el dueño elige "Florencia Ledesma · asesor"
- **THEN** ve el aviso "Estás viendo el CRM como lo ve Florencia Ledesma (asesor). Es solo para revisar: no cambia nada de lo que esa persona ve.", el texto "Los procesos de Florencia Ledesma, ordenados por el próximo paso." y los grupos del asesor con los procesos y las tareas de ella, sin tareas de otra persona

#### Scenario: El dueño mira la vista de la coordinación
- **WHEN** el dueño elige a la coordinadora Paula
- **THEN** ve los grupos de la coordinación con las tareas de Paula, sin clases gratuitas y sin "Lo que está trabado"

#### Scenario: Volver a mi vista
- **WHEN** el dueño toca "Volver a mi vista"
- **THEN** vuelve a su vista con "Lo que está trabado", y la persona elegida sale de la dirección

#### Scenario: Cambiar de vista limpia algunos filtros
- **WHEN** el dueño tiene puestos la etapa "Seguimiento", el asesor "Lucas", el filtro de lo trabado y la búsqueda "pinto", y elige otra persona en "Ver como"
- **THEN** se sacan la etapa, el asesor y el filtro de lo trabado, la lista vuelve a "Abiertos", y la búsqueda "pinto" sigue puesta

#### Scenario: Recargar la página
- **WHEN** el dueño recarga la página mientras mira la vista de un asesor
- **THEN** sigue viendo la vista de ese asesor, con el aviso

#### Scenario: Su campanita y su menú
- **WHEN** el dueño mira la vista de la coordinadora
- **THEN** la campanita y el menú siguen siendo los suyos

#### Scenario: Un asesor intenta usarlo por la red
- **WHEN** un asesor o un coordinador pide los datos de la cartera con otra persona elegida directamente por la red
- **THEN** la respuesta es 403 y no trae ningún proceso de esa persona

#### Scenario: Un asesor abre un enlace con "Ver como"
- **WHEN** un asesor abre `/crm` con la persona de "Ver como" del dueño en la dirección
- **THEN** ve su propia vista, sin el aviso ni ningún dato de la otra persona

#### Scenario: Persona que no corresponde
- **WHEN** el dueño pide ver como un abogado, un usuario desactivado o un id que no existe
- **THEN** la respuesta es 400 con "Esa persona no tiene una vista del CRM." y la pantalla vuelve a su vista

### Requirement: La fila de un proceso
Cada fila del CRM SHALL mostrar el nombre de la persona con la propiedad y la dirección
debajo, la etapa, el último contacto, el próximo paso y, en las vistas de coordinación y del
dueño, el asesor. Toda la fila SHALL ser un solo enlace a la ficha de contacto de esa persona,
y la etapa SHALL ir como chip neutro: en las filas el color queda para lo vencido y lo de hoy.

#### Scenario: Fila de una solicitud con una llamada sin atender
- **WHEN** la coordinadora mira a Sofía Lanús, una solicitud de un PH de 4 ambientes en Colegiales, Conesa 1250, a la que llamó hace una hora sin que atienda y que tiene la "Llamada 2" para mañana a las 9:00
- **THEN** la fila dice "Sofía Lanús", "PH 4 amb · Colegiales · Conesa 1250", la etapa "Solicitud", el último contacto "hace 1 h" con "Llamada · no atendió", y el próximo paso "Llamada 2" con "Mañana 9:00"

#### Scenario: Proceso sin tipo de propiedad
- **WHEN** un proceso no tiene cargado el tipo de propiedad ni los ambientes, y es de Villa Crespo, Thames 640
- **THEN** el renglón de abajo dice "Villa Crespo · Thames 640"

#### Scenario: Tocar la fila
- **WHEN** se toca cualquier parte de la fila
- **THEN** se abre la ficha de contacto de esa persona; un lector de pantalla la anuncia como "Abrir la ficha de {nombre}"

#### Scenario: Proceso sin contacto vinculado
- **WHEN** se toca la fila de un proceso que no tiene contacto
- **THEN** se abre la pantalla de ese proceso (`/pipeline/<id>`)

#### Scenario: Etapa sin color
- **WHEN** se mira una fila en Coordinada o en Captada
- **THEN** la etapa se muestra con un punto gris y el texto, sin fondo de color

### Requirement: Columna Asesor
Donde hay columna Asesor, SHALL decir el nombre del asesor del proceso, "Sin asesor" en rojo
con ícono cuando el proceso cuenta como sin asesor, o "—" en gris cuando todavía no le
corresponde uno. Un proceso asignado a una persona desactivada SHALL mostrar "Nombre (dado de
baja)" y contar como sin asesor. En el celular, la fila del dato vacío ("—") SHALL NOT mostrarse.

#### Scenario: Asesor que todavía no corresponde
- **WHEN** la coordinadora mira una solicitud sin asesor
- **THEN** la columna Asesor dice "—" en gris, no "Sin asesor"

#### Scenario: Proceso a nombre del dueño
- **WHEN** un proceso está asignado al dueño
- **THEN** la columna Asesor dice el nombre del dueño y el filtro "Asesor" lo ofrece como una opción más

#### Scenario: Asesor dado de baja
- **WHEN** un seguimiento está asignado a una persona que fue desactivada
- **THEN** la columna dice su nombre seguido de "(dado de baja)" en rojo y el proceso cuenta en "Procesos sin asesor"

#### Scenario: Sin asesor después de la solicitud
- **WHEN** el dueño mira un seguimiento sin asesor
- **THEN** la columna Asesor dice "Sin asesor" en rojo, con ícono

### Requirement: Tasación cercana en la fila
En "Tasaciones de hoy y mañana", en "Tasaciones de hoy", en la lista del dueño y en
Contactos, cuando el proceso de la fila (en Contactos, el que muestra la fila) tiene una
tasación agendada para hoy o mañana que no es su próximo paso, SHALL ir como tercer renglón de
la persona, con ícono; la de otro proceso de la persona no se muestra. SHALL decir "con
{asesor}" solo donde no hay columna Asesor, y la dirección solo si es distinta de la del
renglón de arriba.

#### Scenario: Tasación como tercer renglón
- **WHEN** la coordinadora mira, en "Tasaciones de hoy y mañana", a Ernesto Villalba, cuyo próximo paso para ella es "Confirmar el horario" hoy y que tiene la tasación mañana a las 11:00 con Tomás Agüero
- **THEN** el próximo paso dice "Confirmar el horario" y debajo del nombre va el renglón "Tasación mañana 11:00" con ícono, sin "con Tomás Agüero" porque la columna Asesor ya lo nombra

#### Scenario: Cada uno ve su próximo paso
- **WHEN** la coordinadora tiene "Confirmar el horario" hoy para Ernesto Villalba y el asesor Tomás Agüero tiene su tasación mañana a las 11:00
- **THEN** la coordinadora ve "Confirmar el horario" con "Hoy …" y Tomás ve "Tasación" con "Mañana 11:00" en la misma persona

### Requirement: Último contacto
El último contacto de una fila SHALL ser el contacto registrado más reciente de esa persona,
en cualquiera de sus procesos, mostrado como tiempo relativo con la fecha exacta al pasar el
mouse y, debajo, qué fue. Sin ninguno SHALL decir "Sin contacto todavía" en gris si el
proceso está abierto (o "Sin contacto registrado", con la regla de "Contactos sin registro
anterior al CRM nuevo"), y "—" si está cerrado.

#### Scenario: Formato del tiempo
- **WHEN** el último contacto fue hace 22 días, ayer, hace 2 horas o hace 3 días
- **THEN** dice "hace 22 días", "ayer", "hace 2 h" y "hace 3 días": desde los 7 días siempre "hace N días"

#### Scenario: Qué fue
- **WHEN** el último contacto fue una llamada sin atender, un WhatsApp marcado o una visita
- **THEN** debajo dice "Llamada · no atendió", "WhatsApp enviado" o "Visita de tasación"

#### Scenario: Una nota no cuenta
- **WHEN** a una persona se la llamó hace 4 días y hoy se le escribió una nota interna
- **THEN** su último contacto dice "hace 4 días" con la llamada

#### Scenario: Una visita cuenta
- **WHEN** a Mirta Sosa se la llamó por última vez hace 12 días y la visita de tasación fue hace 4 días
- **THEN** su último contacto dice "hace 4 días" con "Visita de tasación"

#### Scenario: Un contacto de otro proceso cuenta
- **WHEN** una persona tiene dos procesos y la última llamada se registró en el otro
- **THEN** el último contacto de la fila de cualquiera de los dos muestra esa llamada

#### Scenario: Seguimiento frío
- **WHEN** un seguimiento sin movimiento tuvo su última llamada hace 22 días, con resultado "volver a llamar"
- **THEN** la fila dice "hace 22 días" en rojo con ícono de alerta y debajo "Sin movimiento · Llamada · volver a llamar"

#### Scenario: Contacto anterior al registro de llamadas
- **WHEN** el último contacto conocido de un seguimiento es una visita de hace 150 días y todavía no pasaron 14 días desde la fecha de inicio del registro
- **THEN** dice "hace 150 días" en gris, con "Visita de tasación · antes del registro de llamadas" debajo, sin alerta

#### Scenario: Cerrado sin contactos
- **WHEN** se mira un proceso cerrado de una persona sin ningún contacto registrado
- **THEN** el último contacto dice "—"

### Requirement: Próximo paso
El próximo paso de una fila SHALL ser lo primero que vence entre las tareas pendientes del
proceso y su tasación agendada (también la que ya pasó sin resultado, salvo en la vista de la
coordinación: ver "Próximo paso en la vista de la coordinación"), contando las tareas de llamada, seguimiento y
asignación y no las de propiedades. Sin nada SHALL decir "Nada agendado" en gris. El
vencimiento SHALL leerse en hora de Argentina y decirse con texto e ícono, además del color.

#### Scenario: De quién son las tareas que cuentan
- **WHEN** un proceso tiene tareas de la coordinadora y del asesor
- **THEN** en la vista de la coordinación cuenta solo la de la coordinadora que mira (o la elegida en "Ver como"), en la del asesor solo la de ese asesor, y en la del dueño y en Contactos del equipo, la de cualquiera

#### Scenario: Vencida
- **WHEN** la tarea más próxima de un proceso venció hace una hora
- **THEN** el próximo paso dice el título y "Vencida hace 1 h" en rojo, con ícono de alerta

#### Scenario: De hoy
- **WHEN** la tarea más próxima es para hoy a las 17:00 y todavía no llegó la hora
- **THEN** dice "Hoy 17:00" con el color de la marca y un ícono de reloj

#### Scenario: Otros vencimientos
- **WHEN** la tarea más próxima es de todo el día de hoy, de mañana a las 9:00, del viernes 27 de noviembre a las 9:00 o no tiene fecha
- **THEN** dice "Hoy, todo el día", "Mañana 9:00", "vie 27 nov, 9:00" o "Sin fecha"

#### Scenario: Tarea de entrada sin fecha de un lead nuevo
- **WHEN** una persona se registró hoy a las 10:12, en horario laboral, nadie la contactó y su única tarea es la de entrada de la coordinación, sin fecha
- **THEN** a las 10:40 el próximo paso dice "Primera llamada" con "Espera hace 28 min" e ícono de reloj, y en el orden va con las vencidas, no con las que no tienen fecha

#### Scenario: Primera llamada que espera
- **WHEN** la tarea más próxima es la primera llamada de una persona que se registró en horario laboral, sin ninguna llamada todavía, y la tarea venció en el momento del registro
- **THEN** dice "Espera hace 28 min" con ícono de reloj

#### Scenario: Tarea sin fecha
- **WHEN** la única tarea pendiente de un proceso no tiene fecha
- **THEN** el próximo paso muestra su título y "Sin fecha", y en el orden va después de todas las que tienen fecha

#### Scenario: La tasación es lo primero
- **WHEN** lo primero que vence de un proceso del asesor es su tasación de hoy a las 12:30
- **THEN** el próximo paso dice "Tasación" con "Hoy 12:30" e ícono de calendario

#### Scenario: Tasación que ya pasó sin resultado
- **WHEN** un proceso sigue en Coordinada y su tasación era hace 3 días
- **THEN** el próximo paso dice "Cargar el resultado de la tasación" con "Vencida hace 3 días" en rojo, y para quien tiene asignado el proceso cuenta como vencida

#### Scenario: Tasación vencida en la vista de la coordinación
- **WHEN** la coordinadora mira una Coordinada cuya tasación con Tomás Agüero era hace 3 días y ella no tiene ninguna tarea en ese proceso
- **THEN** el próximo paso dice "Cargar el resultado de la tasación" con "Vencida hace 3 días · Tomás Agüero", y el proceso no entra en su grupo "Llamada o mensaje vencido"

#### Scenario: Tasación sin hora
- **WHEN** la tasación de un proceso es mañana y no tiene hora cargada
- **THEN** el próximo paso dice "Tasación" con "Mañana, todo el día"

#### Scenario: Tarea repetida de la coordinación
- **WHEN** el dueño mira un proceso cuya tarea de entrada se creó una vez para cada coordinadora y una de ellas ya la completó
- **THEN** esa tarea no aparece como próximo paso; y si sigue pendiente en las dos copias, aparece una sola vez seguida de "· coordinación"

#### Scenario: Cerrado con una tarea pendiente
- **WHEN** un proceso descartado tiene todavía una tarea de llamada pendiente
- **THEN** su fila no muestra próximo paso: muestra la columna "Cierre"

#### Scenario: Tareas de propiedades no cuentan
- **WHEN** un proceso captado tiene pendiente un informe quincenal de su propiedad
- **THEN** esa tarea no aparece como próximo paso de ninguna fila

#### Scenario: Asignación con tasación agendada
- **WHEN** un proceso coordinado tiene la tarea de asignación del asesor y la tasación agendada
- **THEN** la tarea de asignación no es el próximo paso (la tasación ya está en la fila), igual que en la ficha

#### Scenario: Título sin el nombre
- **WHEN** la tarea más próxima se llama "Llamada 2 a Sofía Lanús"
- **THEN** el próximo paso dice "Llamada 2"

#### Scenario: Primera llamada
- **WHEN** la tarea más próxima de una solicitud es una llamada y la persona no tiene ningún contacto registrado
- **THEN** el próximo paso se llama "Primera llamada"

### Requirement: Próximo paso en la vista de la coordinación
En la vista de la coordinación, la tasación que ya pasó sin resultado (trabajo del asesor)
SHALL ser el próximo paso solo si la coordinadora no tiene en el proceso ninguna de las tareas
que cuentan para el próximo paso; si tiene alguna, el próximo paso SHALL ser la primera de
ellas.

#### Scenario: Llamada vencida de la coordinación con la tasación del asesor también vencida
- **WHEN** la coordinadora tiene una llamada vencida ayer en una Coordinada cuya tasación con Tomás Agüero era hace 3 días
- **THEN** el próximo paso de esa fila es su llamada, con "Vencida hace 1 día", y el proceso aparece en su grupo "Llamada o mensaje vencido"

### Requirement: Abiertos y cerrados
Cada lista SHALL abrir en los abiertos y tener el selector "Abiertos N" / "Cerrados N" (en
Contactos, "Con proceso abierto N" / "Sin proceso abierto N"). El total SHALL aparecer en
ese selector y en el pie de la lista, en ningún otro lugar, y respetar los filtros puestos
salvo la etapa. Los cerrados SHALL ir
en una sola lista, del cierre más reciente al más viejo, con la columna "Cierre" (en
Contactos, "Cierre / próximo paso").

#### Scenario: Pasar a cerrados
- **WHEN** el dueño toca "Cerrados"
- **THEN** ve la lista "Cerrados" con el texto "Los más recientes primero. Para volver a abrir uno, entrá a su ficha.", Captada y Descartado en la barra, y el filtro de etapa ofrece "Todos los cerrados"

#### Scenario: Columna Cierre
- **WHEN** se mira un proceso descartado hace 5 días
- **THEN** la columna "Cierre" dice "Descartado hace 5 días"

#### Scenario: El total no se repite
- **WHEN** se mira cualquier vista del CRM
- **THEN** el total de abiertos figura en el botón "Abiertos" y en el pie ("Mostrando X de Y…"), la barra de etapas no lo repite, la lista larga de abajo ("Todos los procesos", "El resto…", "Sin nada pendiente", "Cerrados", "Personas") no lleva número en su cabecera y no hay ninguna tarjeta "Deals"

#### Scenario: Totales con filtros
- **WHEN** el dueño filtra por el origen "Referido"
- **THEN** los números de "Abiertos", "Cerrados" y de cada etapa cuentan solo los procesos de ese origen

### Requirement: Barra de etapas de cada vista
Encima de la lista SHALL ir la barra de etapas de la vista, cuyas etapas filtran la lista al
tocarlas y sacan el filtro al tocarlas de nuevo. Coordinación: Solicitud, Coordinada y No
realizada. Asesor: Coordinada, No realizada, Realizada, Entregada, Seguimiento, Comprador, y
cualquier otra etapa abierta solo si tiene alguna (Solicitud, Clase gratuita). Dueño: las ocho
de los abiertos. En cerrados, Captada y
Descartado (solo Descartado en la coordinación).

#### Scenario: Tocar una etapa
- **WHEN** la coordinadora toca "Coordinada" en la barra
- **THEN** la lista muestra solo las coordinadas, el botón queda marcado y aparece el filtro puesto "Etapa: Coordinada"

#### Scenario: Volver a tocarla
- **WHEN** toca de nuevo "Coordinada"
- **THEN** el filtro de etapa sale y la lista vuelve a mostrar todos los abiertos

#### Scenario: Base de la barra
- **WHEN** la coordinadora o un asesor miran la barra
- **THEN** arriba dice "Por etapa"

### Requirement: Filtros con nombre y búsqueda
Encima de la lista SHALL ir el buscador "Buscar" y los filtros "Etapa", "Origen", "Asesor" (no
en la vista del asesor) y "Entró al CRM", cada uno con su nombre arriba. Los filtros puestos
SHALL verse como fichas que se sacan de a una, con "Limpiar filtros". Filtros, buscador,
orden, segmento y persona de "Ver como" SHALL quedar en la dirección, así volver o recargar
deja la lista como estaba.

#### Scenario: Opciones de los filtros
- **WHEN** se abren los filtros a 1280 px
- **THEN** "Etapa" ofrece "Todas las etapas" y las etapas de la vista; "Origen", "Todos los orígenes", Embudo, Referido e Histórico; "Asesor", "Todos los asesores", cada persona con procesos a su nombre (asesores y dueño, y quien esté dado de baja con "(dado de baja)") y "Sin asesor"; "Entró al CRM", "Cualquier fecha", Hoy, Ayer, "Últimos 7 días", "Últimos 15 días", "Últimos 30 días", "Últimos 90 días" y "Elegir fechas…"

#### Scenario: El buscador
- **WHEN** se mira el buscador
- **THEN** dice "Buscar" arriba y "Nombre, teléfono o calle" adentro

#### Scenario: Buscar sin tildes
- **WHEN** se escribe "echeverria" en el buscador
- **THEN** aparece Ramiro Echeverría

#### Scenario: Buscar por teléfono
- **WHEN** se escribe "55550148" en el buscador
- **THEN** aparece la persona cuyo teléfono es "11 5555-0148"

#### Scenario: Varias palabras
- **WHEN** se escribe "thames crespo"
- **THEN** aparecen solo los procesos que tienen las dos palabras en el nombre, el teléfono, el email, la dirección o el barrio

#### Scenario: Proceso sin origen
- **WHEN** un proceso no tiene origen cargado y se elige un origen en el filtro
- **THEN** ese proceso no aparece; sí aparece con "Todos los orígenes"

#### Scenario: Embudo incluye la clase
- **WHEN** el dueño filtra por el origen "Embudo"
- **THEN** la lista incluye los procesos que vienen de la clase gratuita

#### Scenario: Fichas de los filtros puestos
- **WHEN** están puestos la búsqueda "pinto", la etapa Seguimiento y el origen Referido
- **THEN** se ven las fichas "Busca: «pinto»", "Etapa: Seguimiento" y "Origen: Referido", cada una con su cruz, y "Limpiar filtros"

#### Scenario: Elegir fechas
- **WHEN** se elige "Elegir fechas…", se pone desde el 1 de noviembre hasta el 25 y se toca "Aplicar"
- **THEN** el filtro dice "Entró: Del 01/11 al 25/11" y la lista muestra solo los procesos que entraron en ese rango, contando días de Argentina

#### Scenario: Elegir fechas sin fechas
- **WHEN** en "Elegir fechas" se toca "Aplicar" sin poner ninguna fecha
- **THEN** dice "Elegí al menos una fecha" y no cambia el filtro

#### Scenario: Volver desde la ficha
- **WHEN** con la etapa "Seguimiento" y la búsqueda "Pinto" puestas se abre una ficha y se toca "‹ Volver al CRM"
- **THEN** la lista vuelve con la etapa "Seguimiento" y la búsqueda "Pinto" puestas

#### Scenario: Valor inventado en la dirección
- **WHEN** la dirección trae una etapa o un asesor que no existen
- **THEN** la lista carga sin ese filtro y dice "No se aplicó Etapa: ese valor no es válido." (o el nombre del filtro que corresponda), sin romper la pantalla

### Requirement: Orden de la lista
"Todos los procesos" del dueño y la lista de Contactos SHALL tener el selector "Ordenar por"
con "Próximo paso", "Más tiempo sin contacto", "Más nuevos primero" y "Nombre (A a Z)". Los
demás grupos SHALL ordenarse siempre por "Próximo paso", salvo "Sin primer contacto" (primero
la que más espera) y las tasaciones de hoy (por hora).

#### Scenario: Próximo paso
- **WHEN** hay un proceso con la tarea vencida, otro con una tarea de mañana, otro con una tarea sin fecha y otro sin nada pendiente
- **THEN** aparecen en ese orden; entre dos con el mismo vencimiento, primero el que lleva más tiempo sin contacto, y entre dos sin ningún contacto, primero el que entró antes

#### Scenario: Más tiempo sin contacto
- **WHEN** el dueño elige "Más tiempo sin contacto"
- **THEN** primero aparecen los procesos sin ningún contacto y después los de contacto más viejo

#### Scenario: Nombre
- **WHEN** el dueño elige "Nombre (A a Z)"
- **THEN** "Ángela" va antes que "Bruno"

### Requirement: Listas largas
Cada grupo y cada lista SHALL mostrar al principio hasta 25 filas y, si tiene más, su propio
"Cargar 25 más". Debajo de los grupos de una vista SHALL ir "Mostrando X de Y procesos
abiertos" (o "cerrados", o "personas"). Si una vista supera el tope de lectura del servidor, la
pantalla SHALL decirlo y nunca dar un total que no es cierto.

#### Scenario: Cargar más
- **WHEN** "Todos los procesos" tiene 493 procesos y se toca "Cargar 25 más"
- **THEN** la lista suma 25 filas sin repetir ninguna y el pie dice "Mostrando 50 de 493 procesos abiertos"

#### Scenario: Grupo largo
- **WHEN** "Llamada o mensaje vencido" tiene 40 procesos
- **THEN** muestra 25 con su "Cargar 25 más" al final del grupo, y los grupos de abajo siguen visibles

#### Scenario: Número en la cabecera
- **WHEN** se miran los grupos de las vistas
- **THEN** "Sin primer contacto", "Llamada o mensaje vencido" y "Tareas vencidas" llevan su número en una burbuja de alerta; "Tasaciones de hoy", "Tasaciones de hoy y mañana" y "Con próximo paso" llevan su número en una burbuja neutra; "El resto…", "Sin nada pendiente", "Todos los procesos", "Cerrados" y "Personas" no llevan número

#### Scenario: Pie de cada vista
- **WHEN** la coordinadora, un asesor o el dueño miran sus abiertos
- **THEN** al final dice "Mostrando X de Y procesos abiertos", con X las filas a la vista e Y el total con los filtros puestos

#### Scenario: Con un filtro de lo trabado
- **WHEN** está puesto el filtro "Sin primer contacto" y hay 2
- **THEN** el pie dice "Mostrando 2 de 2 procesos abiertos"

#### Scenario: Más que el tope
- **WHEN** una vista tiene más de 3.000 procesos
- **THEN** arriba de la lista dice "Se muestran los 3.000 más recientes: hay más procesos de los que esta pantalla puede traer." y el pie no da el total como si fuera completo

### Requirement: Contactos por rol
`/contacts` SHALL mostrar a las personas con la misma fila que el CRM, con "Proceso" (etapa y
origen) en lugar de "Etapa" y el teléfono en el renglón de abajo. Coordinación, admin y dueño
SHALL ver a todas las personas; el asesor solo sus contactos, con la misma regla de acceso que
la ficha. Toda la fila SHALL abrir la ficha.

#### Scenario: Textos de Contactos
- **WHEN** una coordinadora y un asesor abren `/contacts`
- **THEN** la coordinadora lee "Todas las personas cargadas, con su proceso, el último contacto y el próximo paso." y el asesor "Tus contactos: asignados a vos, cargados por vos o con un proceso o tasación tuyos."

#### Scenario: Asesor en Contactos
- **WHEN** un asesor abre `/contacts`
- **THEN** ve las personas asignadas a él, las que cargó él y las que tienen un proceso o una tasación a su nombre, y ninguna otra

#### Scenario: Contacto del embudo de un proceso del asesor
- **WHEN** una persona entró por el embudo sin asesor en su contacto y tiene un proceso asignado al asesor
- **THEN** el asesor la ve en Contactos

#### Scenario: Cabecera de Contactos
- **WHEN** se mira la lista de Contactos a 1280 px
- **THEN** las columnas dicen "Persona", "Proceso", "Último contacto", "Próximo paso" y, salvo para el asesor, "Asesor"; en "Sin proceso abierto", la cuarta dice "Cierre / próximo paso"

#### Scenario: Persona sin ningún proceso
- **WHEN** una persona no tiene ningún proceso
- **THEN** su fila dice "Sin proceso" (para el asesor, "Sin proceso tuyo") en la columna Proceso y aparece en "Sin proceso abierto"

#### Scenario: El asesor solo ve sus procesos en Contactos
- **WHEN** un asesor mira a una persona que tiene un proceso suyo y otro más nuevo de otro asesor
- **THEN** la fila muestra el proceso suyo, y la respuesta por la red no trae nada del proceso del otro asesor

#### Scenario: Qué proceso muestra una persona con varios
- **WHEN** una persona tiene un proceso abierto y uno cerrado más nuevo
- **THEN** su fila muestra el abierto; si no tiene ninguno abierto, el cerrado más reciente

### Requirement: Segmentos y filtros de Contactos
Contactos SHALL tener el selector "Con proceso abierto" / "Sin proceso abierto", una sola
lista "Personas" con "Ordenar por", los filtros "Origen", "Asesor" (no para el asesor) y "Se
registró" (las mismas opciones que "Entró al CRM"), sin filtro de etapa, y el botón "Nuevo
contacto" que abre el alta de hoy.

#### Scenario: Sin proceso abierto
- **WHEN** la coordinadora toca "Sin proceso abierto"
- **THEN** ve a las personas cuyo proceso se cerró o que nunca tuvieron uno, con el texto "Su proceso se cerró (captado o descartado) o nunca tuvo uno."

#### Scenario: Sin proceso abierto en los Contactos del asesor
- **WHEN** el asesor ve en sus Contactos a una persona visible para él sin ningún proceso suyo (no tiene ninguno, o el único lo lleva otro asesor)
- **THEN** su fila dice "Sin proceso tuyo", aparece en "Sin proceso abierto" con el texto "Su proceso se cerró (captado o descartado), nunca tuvo uno o lo lleva otro asesor.", y no se muestra nada del proceso ajeno

#### Scenario: Nuevo contacto
- **WHEN** se toca "Nuevo contacto"
- **THEN** se abre el alta de contacto de hoy

#### Scenario: Ningún contacto
- **WHEN** los filtros de Contactos no encuentran a nadie
- **THEN** dice "Ningún contacto coincide con estos filtros" con "Limpiar filtros"

### Requirement: Volver a la lista desde la ficha
La ficha de contacto abierta desde una fila del CRM o de Contactos SHALL mostrar arriba
"‹ Volver al CRM" (o "‹ Volver a Contactos"), que vuelve a la lista con sus filtros; la barra
superior SHALL decir "CRM" o "Contactos" según de dónde se vino y el menú SHALL marcar esa
sección. La vuelta MUST llevar solo a `/crm` o `/contacts` de la misma plataforma.

#### Scenario: Volver al CRM
- **WHEN** se abre una ficha desde una fila del CRM
- **THEN** arriba dice "‹ Volver al CRM", la barra superior dice "CRM" y el menú marca "CRM"

#### Scenario: Ficha abierta desde otro lado
- **WHEN** se abre una ficha desde Pendientes o escribiendo su dirección
- **THEN** no aparece el enlace de volver

#### Scenario: Enlace de vuelta manipulado
- **WHEN** alguien abre una ficha con una vuelta que apunta a otro sitio o a otra pantalla de la plataforma
- **THEN** la ficha no muestra el enlace de volver

### Requirement: Estados de carga, vacío y error de la cartera
La cartera SHALL tener estado de carga, de vacío y de error con reintento, y nunca mostrar un
cero ni "no hay procesos" cuando el dato no se pudo consultar. Si se pudo leer la lista pero no
los contactos registrados o las tareas, SHALL mostrar la lista con "No se pudo cargar" en esa
columna, sin los grupos que dependen de ese dato, y un aviso con "Reintentar".

#### Scenario: Cargando
- **WHEN** la lista todavía no llegó
- **THEN** se ve el esqueleto de la lista y de la barra, sin ningún número

#### Scenario: Falla la lista
- **WHEN** el pedido de la cartera falla o tarda más de lo que permite el servidor
- **THEN** la pantalla dice "No se pudo cargar la lista de procesos" con "Los filtros siguen ahí. El resto de la plataforma funciona." y "Reintentar", la barra dice "No se pudo contar por etapa" y los filtros siguen puestos

#### Scenario: Los filtros no encuentran nada
- **WHEN** los filtros puestos no dejan ningún proceso
- **THEN** dice "Ningún proceso coincide con estos filtros" con "Probá sacar algún filtro o buscar de otra forma." y "Limpiar filtros"

#### Scenario: Sin abiertos
- **WHEN** no hay ningún proceso abierto y no hay filtros puestos
- **THEN** dice "No hay procesos abiertos" con "Cuando entre uno nuevo, aparece acá."

#### Scenario: Falla solo el último contacto
- **WHEN** se pudieron leer los procesos y las tareas pero no los contactos registrados
- **THEN** la lista se ve con el próximo paso, la columna "Último contacto" dice "No se pudo cargar", no aparece "Sin primer contacto" (esas solicitudes van con el resto), ninguna fila se marca sin movimiento, y arriba de la lista dice "No se pudo cargar el último contacto de cada persona." con "Reintentar"

#### Scenario: Fallan solo las tareas
- **WHEN** se pudieron leer los procesos y los contactos registrados pero no las tareas
- **THEN** la columna "Próximo paso" dice "No se pudo cargar", no aparecen "Llamada o mensaje vencido", "Tareas vencidas" ni "Con próximo paso" (las tasaciones sí, salen del proceso), y arriba de la lista dice "No se pudieron cargar las tareas." con "Reintentar"

#### Scenario: Reintentar
- **WHEN** después de un error se toca "Reintentar" y el servidor responde
- **THEN** la lista aparece con los mismos filtros puestos

### Requirement: La cartera en el celular
A 390 px la cartera SHALL verse sin desplazamiento horizontal ni texto cortado, con cada fila
como tarjeta, el buscador a la vista y el resto de los filtros en la hoja "Filtros". Todo lo
tocable SHALL medir al menos 44 px y los campos usar letra de 16 px o más. Cuando la lista
tiene ancho para las columnas SHALL leerse como tabla con cabecera.

#### Scenario: Coordinadora en el celular
- **WHEN** la coordinadora abre el CRM a 390 × 844 px
- **THEN** ve el título, el selector de abiertos y cerrados, la barra de etapas, el buscador y el botón "Filtros", y las filas como tarjetas con "Último contacto", "Próximo paso" y "Asesor" escritos a la izquierda de cada dato, sin desplazamiento horizontal

#### Scenario: Filtros en el celular
- **WHEN** toca "Filtros", elige el origen "Referido" y toca "Ver resultados"
- **THEN** la hoja se cierra, el botón dice "Filtros" con un 1 y la lista muestra solo los referidos; la hoja también tiene "Limpiar filtros"

#### Scenario: Tabla en la computadora
- **WHEN** se abre el CRM a 1280 px con el menú lateral abierto
- **THEN** la lista se lee como tabla, con las columnas "Persona y propiedad", "Etapa", "Último contacto", "Próximo paso" y, donde corresponde, "Asesor"

### Requirement: La red solo trae lo que cada uno puede ver
Los datos de la cartera y de Contactos MUST armarse y recortarse en el servidor según el rol
de la sesión. Un asesor MUST NOT recibir por la red procesos, contactos ni tareas que no son
suyos, y ningún parámetro de la dirección SHALL ensanchar lo que un rol puede ver.

#### Scenario: Asesor con la dirección cambiada
- **WHEN** un asesor pide los datos de la cartera con el filtro de asesor de otra persona en la dirección
- **THEN** la respuesta trae solo sus propios procesos

#### Scenario: La respuesta del asesor
- **WHEN** se mira la respuesta de los datos de la cartera de un asesor
- **THEN** no contiene ningún proceso asignado a otra persona ni sin asesor, ni tareas de otra persona

#### Scenario: Contactos del asesor por la red
- **WHEN** un asesor pide los datos de Contactos
- **THEN** la respuesta trae solo los contactos que cumplen la regla de acceso de la ficha, y el próximo paso de cada uno con solo sus tareas

### Requirement: Los más nuevos primero
La cartera y Contactos SHALL ordenarse por defecto de la entrada más reciente a la más vieja.
El orden elegido SHALL aplicarse a los grupos generales de cada vista; los grupos urgentes
mantienen el suyo.

#### Scenario: Entrar al CRM
- **WHEN** el admin abre el CRM sin elegir orden
- **THEN** el selector dice "Más nuevos primero" y el proceso que entró hoy está arriba de uno que entró la semana pasada

### Requirement: Trabados aparte
Los procesos abiertos con más de 30 días de Argentina sin movimiento (contacto registrado o
tasación; una tasación agendada a futuro cuenta como movimiento) SHALL ir al grupo "Trabados ·
más de 30 días sin movimiento", al final de la lista y antes de los cerrados, y no en los
demás grupos. Si el último contacto no se pudo leer, el proceso no se marca como trabado.

#### Scenario: Coordinada de junio
- **WHEN** un proceso entró el 1 de junio, su tasación fue el 2 de junio y nadie lo movió desde entonces
- **THEN** en diciembre aparece en "Trabados · más de 30 días sin movimiento" y no arriba de los procesos nuevos

#### Scenario: Viejo pero con contacto reciente
- **WHEN** un proceso entró hace dos meses y se lo llamó ayer
- **THEN** no está en "Trabados"
