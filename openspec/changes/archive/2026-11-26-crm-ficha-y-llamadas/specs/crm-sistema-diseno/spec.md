# Spec Delta

## Purpose

Cambia dos requisitos de la spec vigente `openspec/specs/crm-sistema-diseno/spec.md`.

El primero: cómo se reacomoda la ficha según el ancho. La maqueta aprobada no tenía el menú lateral de
la plataforma; con el menú real, la ficha mira el ancho que le queda libre y no el de la
ventana. Con el menú abierto eso da pestañas también entre 768 y unos 930 px de ventana,
donde antes se pedían dos columnas. El dueño confirmó este cambio el 2026-11-25.

El segundo: "La etapa nunca cambia sola". La spec vigente dice, sin condiciones, que el
aviso ofrece "Coordinar tasación" o "Marcar proceso como perdido". Acá se acota a quien
puede hacerlo y a cuando corresponde, para que no contradiga a `crm-cadencia-llamadas`. La
regla de fondo no cambia: la etapa solo cambia cuando una persona toca un botón.

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
- **THEN** se ve una cabecera fija con nombre, etapa, botón de llamar y hace cuánto fue el último contacto (o "Sin contacto todavía"), y las pestañas Actividad, Datos y Tareas, sin desplazamiento horizontal

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

### Requirement: La etapa nunca cambia sola
Registrar una llamada o marcar un WhatsApp SHALL NOT cambiar la etapa del proceso. La etapa
SHALL cambiar solo cuando la persona toca un botón explícito. El aviso SHALL ofrecer ese
botón solo a quien puede usarlo y solo cuando corresponde a la situación del proceso; cada
caso, con su texto exacto, está en la capacidad `crm-cadencia-llamadas`, requisito "Los
resultados que no agendan ofrecen el paso siguiente".

#### Scenario: Atendió y agendó
- **WHEN** una coordinadora, o el asesor que tiene asignada esa solicitud, guarda una llamada con resultado "Atendió y agendó" en un contacto con una solicitud abierta
- **THEN** la etapa sigue igual y el aviso ofrece el botón "Coordinar tasación"

#### Scenario: Atendió y agendó sin nada para coordinar o sin poder hacerlo
- **WHEN** se guarda "Atendió y agendó" con el proceso activo ya en Coordinada, o lo guarda un asesor sobre una solicitud que no está asignada a él
- **THEN** la etapa sigue igual y el aviso no ofrece "Coordinar tasación"

#### Scenario: No le interesa o número equivocado
- **WHEN** una persona que puede cerrar ese proceso guarda una llamada con resultado "Atendió · no le interesa" o "Número equivocado" en un contacto con un proceso activo
- **THEN** la etapa sigue igual y el aviso ofrece "Marcar proceso como perdido" y "Dejarlo abierto"

#### Scenario: No le interesa sin proceso o sin poder cerrarlo
- **WHEN** se guarda "Atendió · no le interesa" o "Número equivocado" en un contacto sin proceso activo, o lo guarda un asesor y el proceso activo no está asignado a él
- **THEN** la etapa sigue igual y el aviso no ofrece "Marcar proceso como perdido"
