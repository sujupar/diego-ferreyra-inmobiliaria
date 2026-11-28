# metricas-llamadas Specification

## Purpose
Define cómo se mide el contacto telefónico de las solicitudes de tasación: cuánto se tarda en
llamar, cuántos atienden, en qué intento se agenda y qué resultados tienen las llamadas, y
cómo se muestra en el Tablero de Métricas.

## Requirements

### Requirement: Qué solicitudes se miden
La sección "Llamadas a las solicitudes" SHALL medir las solicitudes de tasación que el
Tablero cuenta en el período elegido (una por persona, sin pruebas, colegas ni pedidos
repetidos) y que se crearon desde el inicio de la medición, el 26/11/2026 a las 21:04 de
Argentina. Las anteriores no cuentan aunque caigan en el período. Las solicitudes de la clase
gratuita y las históricas quedan afuera.

#### Scenario: Período que empieza antes de la medición
- **WHEN** el admin elige "Este mes" en noviembre de 2026
- **THEN** la sección mide solo las solicitudes creadas desde el 26/11 a las 21:04 y dice "La medición empieza el 26/11/2026 a las 21:04: las solicitudes anteriores no cuentan."

#### Scenario: Período anterior a la medición
- **WHEN** el admin elige "Mes pasado" en noviembre de 2026 (octubre)
- **THEN** la sección dice "La medición de llamadas empieza el 26/11/2026 a las 21:04: este período es anterior." y no muestra números

#### Scenario: Las pruebas no cuentan
- **WHEN** en el período hay una solicitud de un contacto de prueba (Julián Parra o nombre que empieza con "[TEST")
- **THEN** no entra en ninguna cuenta de la sección, igual que en el resto del Tablero

### Requirement: Qué llamadas son de una solicitud
Una llamada o un WhatsApp marcado en la ficha SHALL contar para una solicitud si ocurrió
desde que la solicitud se creó y está ligado a ese proceso, o no está ligado a ningún proceso
y es del mismo contacto. Los anulados no cuentan, ni los ligados a otro proceso (como en la
ficha, la numeración es por proceso). Las llamadas se ordenan por la hora en que ocurrieron:
la primera es la "Llamada 1". Los mensajes del Inbox, las plantillas y el agente de IA no son
intentos de esta sección.

#### Scenario: Llamada anulada
- **WHEN** a una solicitud se le registró una llamada y después se anuló
- **THEN** la solicitud cuenta como sin llamar

#### Scenario: Llamada anterior a la solicitud
- **WHEN** un contacto tuvo una llamada por otro tema antes de pedir la tasación
- **THEN** esa llamada no es la primera llamada de su solicitud

#### Scenario: Hora corregida antes del registro
- **WHEN** una llamada ligada al proceso se cargó con una hora anterior a la creación de la solicitud
- **THEN** no cuenta para esa solicitud

#### Scenario: Llamada de otro proceso del mismo contacto
- **WHEN** el contacto tiene también un proceso de compra y se lo llamó por ese proceso
- **THEN** esa llamada no cuenta para su solicitud de tasación

### Requirement: Tiempo a la primera llamada
La sección SHALL mostrar el tiempo desde que la persona se registró hasta su primera llamada,
con la mediana y el promedio, en tiempo de reloj y en horas hábiles (lunes a viernes de 10 a
14, el horario de la coordinación), sobre las solicitudes que ya tienen una llamada, y cuántas siguen sin llamar.

#### Scenario: Tres solicitudes
- **WHEN** tres personas se registraron un lunes a las 10:00; a una se la llamó a las 11:00, a otra a las 13:00 y la tercera sigue sin llamar
- **THEN** se lee mediana 2 h y promedio 2 h, de reloj y hábiles, "sobre 2 solicitudes", "Pocos casos" y "1 todavía sin llamar no entra en la cuenta"

### Requirement: Tiempo entre la primera y la segunda llamada
La sección SHALL mostrar la mediana y el promedio del tiempo entre la Llamada 1 y la
Llamada 2, de reloj y hábiles, sobre las solicitudes con dos llamadas o más.

#### Scenario: Ninguna con segunda llamada
- **WHEN** ninguna solicitud del período tiene dos llamadas
- **THEN** se lee "Todavía sin casos", no un cero

### Requirement: Atendieron y agendaron en una llamada
La sección SHALL mostrar qué parte de las solicitudes "Atendieron una llamada" (al menos una
"Atendió y agendó", "Atendió · volver a llamar" o "Atendió · no le interesa") y qué parte
"Agendaron en una llamada" ("Atendió y agendó"), cada una con su cuenta ("12 de 30"), y en qué
llamada pasó (1, 2, 3, 4 o más) con el promedio.

#### Scenario: No es lo mismo que "Agendadas"
- **WHEN** una persona agendó por WhatsApp o desde su enlace, sin una llamada "Atendió y agendó"
- **THEN** cuenta en "Agendadas" del embudo y no en "Agendaron en una llamada", y la sección lo aclara

#### Scenario: Agendó en la segunda
- **WHEN** a una persona la Llamada 1 le dio "No atendió" y la Llamada 2 "Atendió y agendó"
- **THEN** cuenta en "Atendieron una llamada", en "Agendaron en una llamada", en "atendió en la llamada 2" y en "agendó en la llamada 2"

#### Scenario: Número equivocado
- **WHEN** la única llamada de una solicitud fue "Número equivocado"
- **THEN** la solicitud no cuenta en "Atendieron una llamada"

### Requirement: Resultados de las llamadas
La sección SHALL mostrar cuántas llamadas hubo de cada resultado, con su porcentaje sobre el
total de llamadas de esas solicitudes, siempre en el mismo orden: "No atendió", "Atendió y
agendó", "Atendió · volver a llamar", "Atendió · no le interesa", "Número equivocado".

#### Scenario: Reparto
- **WHEN** hubo 10 llamadas, 6 sin atender y 4 que agendaron
- **THEN** se lee "No atendió 6 · 60%", "Atendió y agendó 4 · 40%" y los otros tres en 0, sobre "10 llamadas", con "Pocos casos"

### Requirement: Solicitudes sin intento registrado
La sección SHALL mostrar cuántas solicitudes no tienen ninguna llamada ni WhatsApp marcado en
la ficha, con el nombre "Sin llamada ni WhatsApp registrado".

#### Scenario: Solo WhatsApp
- **WHEN** a una solicitud solo se le marcó un WhatsApp enviado
- **THEN** no cuenta en "Sin llamada ni WhatsApp registrado", pero sí como "sin llamar" en el tiempo a la primera llamada

### Requirement: Cada número con su base
Cada número de la sección SHALL mostrar sobre cuántos casos se calculó y, con menos de 20,
"Pocos casos". La sección no se compara con otro período y lo dice ("Sin comparar"), y avisa
que las solicitudes del período en curso todavía pueden avanzar. Sin solicitudes en el
período SHALL mostrar una sola línea en vez de ceros; si la lectura de las llamadas falla
SHALL decir "No se pudo cargar" con "Reintentar" dentro de la sección, sin tapar el resto del
Tablero.

#### Scenario: Sin llamadas registradas
- **WHEN** hay solicitudes en el período y ninguna llamada registrada
- **THEN** se lee solo "N solicitudes · todavía no hay llamadas registradas" y "Sin llamada ni WhatsApp registrado: N"

#### Scenario: Sin solicitudes
- **WHEN** en el período no hay solicitudes de tasación desde el inicio de la medición
- **THEN** la sección es una sola línea: "No hay solicitudes de tasación en este período."

#### Scenario: Falla la lectura de llamadas
- **WHEN** la lectura de llamadas falla y el resto del Tablero carga
- **THEN** la sección dice "No se pudo cargar" con "Reintentar" y las otras secciones se ven

### Requirement: Quién la ve
La sección SHALL verse solo para quienes ya ven Métricas (admin y dueño) y no nombra a
quién hizo cada llamada.

#### Scenario: Coordinación o asesor
- **WHEN** una coordinadora o un asesor pide el Tablero por la red
- **THEN** recibe el mismo rechazo que hoy y ningún dato de llamadas
