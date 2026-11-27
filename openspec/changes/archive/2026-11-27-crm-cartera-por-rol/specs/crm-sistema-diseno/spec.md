# Spec Delta

## Purpose

Suma al sistema de diseño del CRM las piezas de lista que aprobó el dueño el 2026-11-26 con
la maqueta de `crm-cartera-por-rol` (`maqueta/pantallas/cartera.css` y las capturas): la fila
de proceso, la barra de etapas, los filtros con nombre, el selector de vista con su aviso, y
el pie de las listas largas. Y cambia un requisito vigente, "Identidad visual existente", para
que diga que en una lista la etapa es un dato neutro y el color queda para lo urgente.

## ADDED Requirements

### Requirement: Fila de proceso
Toda lista de procesos o de personas del módulo CRM SHALL usar la misma fila: avatar con
iniciales, nombre con un renglón secundario, un tercer renglón opcional con ícono para la
tasación cercana, y las columnas etapa, último contacto, próximo paso y, si la vista lo pide,
asesor. Toda la fila SHALL ser un único enlace, sin botones adentro (con el modo de
selección activo pasa a ser un único botón que la marca), y leerse como tabla cuando entran
las columnas y como tarjeta cuando no.

#### Scenario: Una sola forma de fila
- **WHEN** se comparan las filas del CRM de la coordinación, del asesor, del dueño y de Contactos
- **THEN** usan la misma pieza, con el mismo orden de datos: persona, etapa (o proceso), último contacto, próximo paso y asesor

#### Scenario: Datos de la fila
- **WHEN** se mira una fila
- **THEN** cada dato tiene un texto principal y uno secundario más chico, y la fila termina en una flecha

#### Scenario: Fila en el celular
- **WHEN** se mira una fila a 390 px
- **THEN** se ve como tarjeta, con "Último contacto", "Próximo paso" y "Asesor" escritos a la izquierda de cada dato, sin texto cortado

### Requirement: Barra de etapas
La cantidad de procesos por etapa SHALL mostrarse como una barra chica y secundaria: botones
de texto con el nombre de la etapa y su número, sin fondos de color ni tarjetas, agrupados
bajo una base escrita ("Por etapa", "Embudo de tasación", "Fuera del embudo"). La etapa
elegida SHALL marcarse con un borde y `aria-pressed`, no solo con color.

#### Scenario: Ninguna etapa pesa más que otra
- **WHEN** se mira la barra con "Descartado 472" y "Coordinada 15"
- **THEN** las dos tienen el mismo tamaño y el mismo color de texto, y ninguna tiene fondo de color

### Requirement: Filtros con nombre
Todo filtro de una lista del módulo CRM SHALL llevar su nombre arriba y una opción por defecto
que diga qué abarca. Los filtros puestos SHALL verse como fichas que se sacan de a una, más
"Limpiar filtros". En el celular SHALL quedar a la vista solo el buscador y el resto en la hoja
"Filtros". "Ordenar por" SHALL ir en la cabecera de la lista, no entre los filtros.

#### Scenario: Opción por defecto con nombre
- **WHEN** se mira un filtro sin elegir nada
- **THEN** dice lo que abarca ("Todas las etapas", "Todos los orígenes", "Todos los asesores", "Cualquier fecha") y nunca solo "Todas" o "Todos"

#### Scenario: Botón de filtros en el celular
- **WHEN** hay dos filtros puestos y se mira la lista a 390 px
- **THEN** el botón "Filtros" muestra un 2

#### Scenario: Ficha de un filtro puesto
- **WHEN** está puesto el origen "Referido"
- **THEN** se ve la ficha "Origen: Referido" con una cruz, y tocarla saca solo ese filtro

### Requirement: Selector de vista
Cuando una pantalla puede mostrarse como la ve otra persona, SHALL tener un selector con
nombre ("Ver como") y, mientras se mira la vista de otra persona, un aviso discreto (borde,
sin fondo de color fuerte) con ícono de ojo que diga de quién es la vista y que es solo para
revisar, con el botón "Volver a mi vista".

#### Scenario: Aviso visible
- **WHEN** se elige otra persona en "Ver como"
- **THEN** arriba de la lista aparece el aviso con su nombre y "Volver a mi vista", y sigue ahí (en su lugar, sin quedar fijo en la pantalla) mientras se cambian los filtros o se pasa de abiertos a cerrados

### Requirement: Pie de las listas largas
Una lista que muestra solo una parte SHALL tener "Cargar 25 más" al final y decir al pie
cuántas muestra y de cuántas ("Mostrando 25 de 493 procesos abiertos"). Una lista larga
(la última de una vista, o la única) SHALL NOT llevar el total en su cabecera; un grupo de
arriba SHALL llevar su número en una burbuja, en estilo de alerta si es un grupo urgente,
aunque también pagine.

#### Scenario: Grupo urgente con elementos
- **WHEN** "Sin primer contacto" tiene 2 procesos
- **THEN** su cabecera muestra una burbuja de alerta con el 2

## MODIFIED Requirements

### Requirement: Identidad visual existente
Las pantallas SHALL usar únicamente los colores, tipografía, radios e íconos que la
plataforma ya define, y ningún significado SHALL depender solo del color. En una lista, la
etapa de un proceso SHALL mostrarse como dato neutro (punto gris y texto, sin fondo de
color): el color en una fila queda para lo vencido (rojo) y lo de hoy (color de la marca),
siempre acompañado de texto e ícono.

#### Scenario: Resultado de llamada
- **WHEN** se muestra una llamada en la línea de tiempo
- **THEN** su resultado se lee con ícono y texto ("No atendió", "Agendó"…), además del color

#### Scenario: Tarea vencida
- **WHEN** una tarea está vencida
- **THEN** lo dice con texto ("Vencida hace 2 días"), además del color

#### Scenario: Primera llamada de un lead que entró en horario hábil
- **WHEN** la tarea es la primera llamada de una persona sin llamadas, y esa tarea venció en el mismo momento en que la persona se registró (entró en horario hábil)
- **THEN** dice "Espera hace 28 min" con ícono de reloj, contando desde que se registró, y figura en el grupo Vencidas

#### Scenario: Primera llamada de un lead que entró fuera de horario
- **WHEN** la persona se registró fuera de horario, su primera llamada quedó para las 9:00 del día hábil siguiente y esa hora ya pasó
- **THEN** dice "Vencida hace 1 h", contando desde las 9:00 y no desde que se registró, y figura en el grupo Vencidas

#### Scenario: Etapa en una lista
- **WHEN** se muestra un proceso en Coordinada en una fila del CRM o de Contactos
- **THEN** la etapa se ve con un punto gris y el texto "Coordinada", sin fondo azul

#### Scenario: Seguimiento sin movimiento en una fila
- **WHEN** una fila muestra un seguimiento sin movimiento
- **THEN** el tiempo del último contacto va en rojo con un ícono de alerta y el texto "Sin movimiento", no solo en rojo
