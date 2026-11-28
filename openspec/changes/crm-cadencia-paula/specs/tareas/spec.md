# Spec Delta

## MODIFIED Requirements

### Requirement: La tarea de entrada de un lead tiene fecha
La tarea de entrada de una solicitud de tasación SHALL nacer con día y hora: el registro si entró en horario
hábil (lunes a viernes, 10:00 a 13:59 de Argentina, el horario de la coordinación, sin
feriados), ese día a las 10:00 si fue antes, y si no, el día hábil siguiente a las 10:00. MUST completarse sola cuando el proceso
sale de "Solicitud", con el autor de ese cambio.

#### Scenario: En horario
- **WHEN** un lead se registra un martes a las 11:10
- **THEN** su tarea de entrada vence ese martes a las 11:10 y figura "Espera hace N min" en "Vencidas"

#### Scenario: Fuera de horario
- **WHEN** un lead se registra un viernes a las 21:00
- **THEN** su tarea de entrada vence el lunes a las 10:00 y el fin de semana está en "Próximas"

#### Scenario: Madrugada de un día hábil
- **WHEN** un lead se registra un martes a las 7:30
- **THEN** su tarea de entrada vence ese martes a las 10:00

#### Scenario: Después del horario de la coordinación
- **WHEN** un lead se registra un martes a las 15:10
- **THEN** su tarea de entrada vence el miércoles a las 10:00

#### Scenario: Se coordina o se descarta
- **WHEN** la coordinadora coordina o descarta el proceso de un lead
- **THEN** las dos copias de su tarea de entrada quedan completadas y dejan de sonar

#### Scenario: Deshacer perdido
- **WHEN** la coordinadora descarta una solicitud y toca "Deshacer"
- **THEN** las tareas de entrada que se completaron solas vuelven a pendientes; las que alguien había completado antes, no

#### Scenario: Clase gratuita
- **WHEN** alguien se registra a la clase gratuita
- **THEN** su tarea para la coordinación nace sin fecha, como antes, y no suena

#### Scenario: La entrada abre la ficha
- **WHEN** se toca una tarea de entrada en Pendientes o en la campanita
- **THEN** se abre la ficha del contacto, donde se registra la llamada
