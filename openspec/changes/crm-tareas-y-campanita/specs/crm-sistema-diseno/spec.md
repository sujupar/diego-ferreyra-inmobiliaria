# Spec Delta

## MODIFIED Requirements

### Requirement: Filtros con nombre
Todo filtro de una lista del módulo CRM SHALL llevar su nombre arriba y una opción por defecto
que diga qué abarca. Los filtros puestos SHALL verse como fichas que se sacan de a una, más
"Limpiar filtros". En el celular SHALL quedar a la vista solo el buscador y el resto en la hoja
"Filtros". "Ordenar por" SHALL ir en la cabecera de la lista, no entre los filtros. Pendientes
es la excepción: sigue su maqueta aprobada (botones "Tipo" y "De quién", selectores en celular).

#### Scenario: Opción por defecto con nombre
- **WHEN** se mira un filtro sin elegir nada
- **THEN** dice lo que abarca ("Todas las etapas", "Todos los orígenes", "Todos los asesores", "Cualquier fecha") y nunca solo "Todas" o "Todos"

#### Scenario: Botón de filtros en el celular
- **WHEN** hay dos filtros puestos y se mira la lista a 390 px
- **THEN** el botón "Filtros" muestra un 2

#### Scenario: Ficha de un filtro puesto
- **WHEN** está puesto el origen "Referido"
- **THEN** se ve la ficha "Origen: Referido" con una cruz, y tocarla saca solo ese filtro

#### Scenario: Pendientes
- **WHEN** se mira el filtro de tipo de Pendientes en la compu
- **THEN** son botones "Todas N" y uno por tipo con su cantidad, y en el celular dos selectores ("Todos los tipos" y "De quién"), como en la maqueta aprobada de esa pantalla

### Requirement: Pie de las listas largas
Una lista que muestra solo una parte SHALL tener "Cargar 25 más" al final y decir al pie
cuántas muestra y de cuántas ("Mostrando 25 de 493 procesos abiertos"). Una lista larga
(la última de una vista, o la única) SHALL NOT llevar el total en su cabecera; un grupo de
arriba SHALL llevar su número en una burbuja, en estilo de alerta si es un grupo urgente,
aunque también pagine. "Sin fecha" de Pendientes es la excepción: sigue su maqueta.

#### Scenario: Grupo urgente con elementos
- **WHEN** "Sin primer contacto" tiene 2 procesos
- **THEN** su cabecera muestra una burbuja de alerta con el 2

#### Scenario: Sin fecha de Pendientes
- **WHEN** se abre "Sin fecha" con 300 tareas
- **THEN** su cabecera dice "Sin fecha · 300" y al pie hay "Mostrar 25 más · quedan 275", como en la maqueta aprobada
