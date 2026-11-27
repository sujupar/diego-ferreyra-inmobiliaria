# Spec Delta

## Purpose

Define cuándo una tarea avisa en la campanita, qué cuenta el número, cuándo se actualiza y
qué se puede hacer desde el panel. La forma visual está en `crm-sistema-diseno`.

## ADDED Requirements

### Requirement: Cuándo suena una tarea
Una tarea pendiente asignada a quien mira SHALL sonar en la campanita desde su momento: a su
hora si tiene hora, o desde las 9:00 de su día si es de todo el día. Las vencidas suenan en
"Vencidas" y las que sonaron sin vencer en "Ahora". Las tareas sin fecha MUST NOT sonar
nunca, y las tareas de otras personas tampoco.

#### Scenario: Todo el día
- **WHEN** a las 9:05 hay una tarea de hoy, todo el día
- **THEN** suma al número y aparece en "Ahora"

#### Scenario: Antes de las 9
- **WHEN** a las 8:30 hay una tarea de hoy, todo el día
- **THEN** no suma al número y aparece en "Lo que viene"

#### Scenario: Con hora que pasó
- **WHEN** a las 11:00 hay una tarea de hoy a las 10:30
- **THEN** suma al número y aparece en "Vencidas"

#### Scenario: Tarea de la coordinación vista por un asesor
- **WHEN** hay tareas vencidas de la coordinación y un asesor mira su campanita
- **THEN** no las cuenta

### Requirement: Las vencidas antes de este cambio no suenan
Las tareas cuyo momento es anterior a las 00:00 de Argentina del día en que se publica este
cambio MUST NOT sonar en la campanita, aunque sigan pendientes: se ven en Pendientes.

#### Scenario: Tarea vieja vencida
- **WHEN** el dueño tiene una tarea vencida de octubre
- **THEN** la campanita no la cuenta y Pendientes la muestra en "Vencidas"

### Requirement: Número y panel
El número SHALL ser la cantidad de tareas que suenan, con "99+" como tope. El panel MUST
listar "Vencidas" y "Ahora" con "Completar" y "Posponer" en cada una, y debajo "Lo que viene":
las 3 próximas que todavía no sonaron, sin acciones y sin sumar al número.

#### Scenario: Completar desde el panel
- **WHEN** se toca "Completar" en un aviso
- **THEN** la tarea se completa, el número baja en uno y el aviso ofrece "Deshacer"

#### Scenario: Posponer desde el panel
- **WHEN** se pospone un aviso para mañana a las 9:00
- **THEN** deja de sumar y pasa a "Lo que viene"

### Requirement: Se actualiza sola
La campanita SHALL volver a leer los avisos cada minuto mientras la pestaña está a la vista,
al volver a la pestaña y después de completar, posponer o crear una tarea en cualquier
pantalla. Si la lectura falla, MUST conservar el último número leído y no mostrar un cero.

#### Scenario: Llega la hora
- **WHEN** la página está abierta y llega la hora de una tarea de hoy a las 15:00
- **THEN** a más tardar un minuto después la campanita la cuenta, sin recargar

#### Scenario: Falla la red
- **WHEN** la lectura de los avisos falla
- **THEN** la campanita sigue mostrando el último número y el panel avisa "No se pudieron actualizar los avisos" con "Reintentar"
