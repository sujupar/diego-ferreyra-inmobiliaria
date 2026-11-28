# Spec Delta

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
- **WHEN** la persona se registró fuera de horario, su primera llamada quedó para las 10:00 del día hábil siguiente y esa hora ya pasó
- **THEN** dice "Vencida hace 1 h", contando desde las 10:00 y no desde que se registró, y figura en el grupo Vencidas

#### Scenario: Etapa en una lista
- **WHEN** se muestra un proceso en Coordinada en una fila del CRM o de Contactos
- **THEN** la etapa se ve con un punto gris y el texto "Coordinada", sin fondo azul

#### Scenario: Seguimiento sin movimiento en una fila
- **WHEN** una fila muestra un seguimiento sin movimiento
- **THEN** el tiempo del último contacto va en rojo con un ícono de alerta y el texto "Sin movimiento", no solo en rojo
