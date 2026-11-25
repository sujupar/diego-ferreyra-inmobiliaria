# Spec Delta

## Purpose

Cambia un solo requisito de la spec vigente `openspec/specs/crm-sistema-diseno/spec.md`:
cómo se reacomoda la ficha según el ancho. La maqueta aprobada no tenía el menú lateral de
la plataforma; con el menú real, la ficha mira el ancho que le queda libre y no el de la
ventana. Con el menú abierto eso da pestañas también entre 768 y unos 930 px de ventana,
donde antes se pedían dos columnas. El dueño confirmó este cambio el 2026-11-25.

## MODIFIED Requirements

### Requirement: La ficha se reacomoda según el ancho
La ficha de contacto SHALL acomodarse según el ancho que le queda libre después del menú
lateral, y no según el ancho de la ventana: tres columnas (persona, actividad, tareas y
procesos) con 960 px libres o más, dos columnas entre 640 y 959 px libres, y una sola
columna con pestañas con menos de 640 px libres, sin desplazamiento horizontal en ningún
ancho.

#### Scenario: Escritorio
- **WHEN** se abre la ficha a 1280 px de ancho con el menú lateral abierto
- **THEN** se ven a la vez los datos de la persona a la izquierda, el cuadro de nota/llamada con la línea de tiempo al centro, y tareas, tasaciones y procesos a la derecha

#### Scenario: Celular
- **WHEN** se abre la ficha a 390 px de ancho
- **THEN** se ve una cabecera fija con nombre, etapa, botón de llamar y hace cuánto fue la última llamada (o "Sin llamar todavía"), y las pestañas Actividad, Datos y Tareas, sin desplazamiento horizontal

#### Scenario: Tablet
- **WHEN** se abre la ficha a 1024 px de ancho con el menú lateral abierto
- **THEN** el contenido de la columna derecha aparece debajo de los datos de la persona y la actividad ocupa la otra columna

#### Scenario: 768 px con el menú abierto
- **WHEN** se abre la ficha a 768 px de ancho con el menú lateral abierto
- **THEN** se ve la vista de una columna con cabecera fija y pestañas, y no dos columnas, sin desplazamiento horizontal ni texto cortado

#### Scenario: 768 px con el menú colapsado
- **WHEN** se abre la ficha a 768 px de ancho con el menú lateral colapsado
- **THEN** se ven dos columnas, sin desplazamiento horizontal ni texto cortado

#### Scenario: Tres columnas antes de 1280 px con el menú colapsado
- **WHEN** se abre la ficha a 1100 px de ancho con el menú lateral colapsado
- **THEN** se ven tres columnas, sin desplazamiento horizontal ni texto cortado

#### Scenario: Sin enviar mensajes desde la ficha
- **WHEN** se mira la ficha en cualquier ancho
- **THEN** el email se muestra como texto y no hay ningún botón ni enlace para enviar un email o un WhatsApp
