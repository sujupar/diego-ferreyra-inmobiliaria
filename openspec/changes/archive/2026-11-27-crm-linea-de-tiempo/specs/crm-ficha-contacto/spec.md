# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: La actividad muestra notas, llamadas y WhatsApp marcado`
- TO: `### Requirement: La actividad muestra la línea de tiempo completa`

## MODIFIED Requirements

### Requirement: La actividad muestra la línea de tiempo completa
La zona de actividad SHALL listar las notas, las llamadas y las marcas de "WhatsApp enviado"
no anuladas del contacto junto con los eventos del sistema que define `crm-linea-de-tiempo`,
de la más nueva a la más vieja, de a 50 con "Ver más". Cada registro cumple la anatomía de
evento de `crm-sistema-diseno`. Quien puede abrir la ficha ve la línea completa, salvo lo que
`crm-linea-de-tiempo` reserva a quien lleva cada proceso.

#### Scenario: Orden
- **WHEN** un contacto tiene una nota de ayer y una llamada de hoy
- **THEN** la llamada aparece primera y la nota segunda

#### Scenario: Anatomía de una llamada
- **WHEN** se mira una llamada registrada ayer a las 10:15 por Paula
- **THEN** se lee "Llamada 1 · No atendió" con su ícono, "Paula" y "ayer", y al tocar la fecha se ven el día y la hora exactos

#### Scenario: Título largo
- **WHEN** el título de un registro no entra en un renglón (por ejemplo "Pasó de Solicitud a No realizada" a 390 px)
- **THEN** pasa a un segundo renglón y no se corta con puntos suspensivos

#### Scenario: Toque en el renglón
- **WHEN** en un celular se toca cualquier parte del renglón de un registro, fuera del menú "⋯"
- **THEN** la fecha relativa cambia por el día y la hora exactos, y al tocar de nuevo vuelve la relativa

#### Scenario: Contacto sin actividad
- **WHEN** el contacto no tiene notas, llamadas, WhatsApp ni eventos del sistema
- **THEN** la zona dice "Sin actividad todavía" y no muestra una lista vacía

#### Scenario: Más de 50 registros
- **WHEN** el contacto tiene 60 registros entre notas, llamadas y eventos del sistema
- **THEN** se ven los 50 más nuevos y un botón "Ver más" que trae los 10 restantes

#### Scenario: El asesor ve la historia de la persona, no la del proceso de otro
- **WHEN** un asesor abre la ficha de un contacto suyo que recibió WhatsApp y que también tiene un proceso de otro asesor
- **THEN** ve esos WhatsApp, y no los cambios de etapa, el registro ni las tareas de ese otro proceso (`crm-linea-de-tiempo`)

#### Scenario: Quien no puede abrir la ficha
- **WHEN** un asesor pide por la red la actividad de un contacto ajeno
- **THEN** recibe la misma respuesta 404 que hoy y ningún evento

#### Scenario: Nada que no se mide
- **WHEN** se abre cualquier ficha
- **THEN** no aparece ningún registro del tipo "abrió el email", "hizo clic" o "leyó el WhatsApp"

### Requirement: Filtros de la actividad
La actividad SHALL poder filtrarse por "Todo", "Llamadas" (solo llamadas), "Notas" y
"Actividad" (todo lo que no es llamada ni nota: el WhatsApp marcado y los eventos del
sistema), igual que en la maqueta aprobada. Un filtro sin resultados MUST mostrar su
mensaje de vacío, con la acción para crear el primero cuando existe.

#### Scenario: Filtrar llamadas
- **WHEN** se toca el filtro "Llamadas" en un contacto con dos llamadas, un WhatsApp marcado, un cambio de etapa y una nota
- **THEN** se ven las dos llamadas y nada más

#### Scenario: Filtrar actividad
- **WHEN** se toca el filtro "Actividad" en ese mismo contacto
- **THEN** se ven el WhatsApp marcado y el cambio de etapa

#### Scenario: Sin llamadas
- **WHEN** se toca "Llamadas" en un contacto sin llamadas
- **THEN** se lee "Todavía no hay llamadas", "Cuando registres una, aparece acá con su resultado." y un botón "Registrar llamada" que abre el formulario

#### Scenario: Sin notas
- **WHEN** se toca "Notas" en un contacto sin notas
- **THEN** se lee "Todavía no hay notas" y un botón "Escribir una nota" que abre el campo de nota

#### Scenario: Sin actividad de otro tipo
- **WHEN** se toca "Actividad" en un contacto sin WhatsApp marcado ni eventos del sistema
- **THEN** se lee "Sin actividad todavía"
