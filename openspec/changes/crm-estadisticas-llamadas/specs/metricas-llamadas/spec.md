# Spec Delta

## Purpose

Define cómo se mide el contacto telefónico de las solicitudes de tasación: cuánto se tarda en
llamar, cuántos atienden, en qué intento se agenda y qué resultados tienen las llamadas, y
cómo se muestra en el Tablero de Métricas.

## ADDED Requirements

### Requirement: Qué solicitudes se miden
La sección "Llamadas a las solicitudes" SHALL medir las solicitudes de tasación que el
Tablero cuenta en el período elegido (una por persona, sin pruebas, colegas ni pedidos
repetidos) y que se crearon desde el inicio de la medición, el 26/11/2026 a las 21:04 de
Argentina. Las anteriores no cuentan aunque caigan en el período.

#### Scenario: Período que empieza antes de la medición
- **WHEN** el admin elige "Este mes" en noviembre de 2026
- **THEN** la sección mide solo las solicitudes creadas desde el 26/11 a las 21:04 y dice "La medición empieza el 26/11/2026 a las 21:04: las solicitudes anteriores no cuentan."

#### Scenario: Las pruebas no cuentan
- **WHEN** en el período hay una solicitud de un contacto de prueba (Julián Parra o nombre que empieza con "[TEST")
- **THEN** no entra en ninguna cuenta de la sección, igual que en el resto del Tablero

### Requirement: Qué llamadas son de una solicitud
Una llamada o un WhatsApp marcado SHALL contar para una solicitud si está ligado a ese
proceso, o si es del mismo contacto y ocurrió desde que la solicitud se creó. Los anulados
no cuentan. Las llamadas se ordenan por la hora en que ocurrieron: la primera es la
"Llamada 1".

#### Scenario: Llamada anulada
- **WHEN** a una solicitud se le registró una llamada y después se anuló
- **THEN** la solicitud cuenta como sin llamar

#### Scenario: Llamada anterior a la solicitud
- **WHEN** un contacto tuvo una llamada por otro tema antes de pedir la tasación
- **THEN** esa llamada no es la primera llamada de su solicitud

### Requirement: Tiempo a la primera llamada
La sección SHALL mostrar el tiempo desde que la persona se registró hasta su primera llamada,
con la mediana y el promedio, en tiempo de reloj y en horas hábiles (lunes a viernes de 9 a
18), sobre las solicitudes que ya tienen una llamada, y cuántas siguen sin llamar.

#### Scenario: Tres solicitudes
- **WHEN** se llamó a una a la hora de registrarse, a otra a las 3 horas y la tercera sigue sin llamar
- **THEN** se lee la mediana y el promedio de reloj y de hábiles sobre 2 solicitudes, "Pocos casos" y "1 todavía sin llamar no entra en la cuenta"

### Requirement: Tiempo entre la primera y la segunda llamada
La sección SHALL mostrar la mediana y el promedio del tiempo entre la Llamada 1 y la
Llamada 2, de reloj y hábiles, sobre las solicitudes con dos llamadas o más.

#### Scenario: Ninguna con segunda llamada
- **WHEN** ninguna solicitud del período tiene dos llamadas
- **THEN** se lee "Todavía sin casos", no un cero

### Requirement: Contactados y agendados
La sección SHALL mostrar qué parte de las solicitudes fue contactada (al menos una llamada
"Atendió y agendó", "Atendió · volver a llamar" o "Atendió · no le interesa") y qué parte
agendó en una llamada ("Atendió y agendó"), cada una con su cuenta ("12 de 30"). También,
para las que agendaron, en qué llamada fue (1, 2, 3, 4 o más), y para las contactadas, cuántas
llamadas hicieron falta hasta que atendieran (1, 2, 3, 4 o más) y el promedio.

#### Scenario: Agendó en la segunda
- **WHEN** a una persona la Llamada 1 le dio "No atendió" y la Llamada 2 "Atendió y agendó"
- **THEN** cuenta como contactada, como agendada, en "atendió en la llamada 2" y en "agendó en la llamada 2"

#### Scenario: Número equivocado
- **WHEN** la única llamada de una solicitud fue "Número equivocado"
- **THEN** la solicitud no cuenta como contactada

### Requirement: Resultados de las llamadas
La sección SHALL mostrar cuántas llamadas hubo de cada resultado, con su porcentaje sobre el
total de llamadas de esas solicitudes, siempre en el mismo orden: "No atendió", "Atendió y
agendó", "Atendió · volver a llamar", "Atendió · no le interesa", "Número equivocado".

#### Scenario: Reparto
- **WHEN** hubo 10 llamadas, 6 sin atender y 4 que agendaron
- **THEN** se lee "No atendió 6 · 60 %", "Atendió y agendó 4 · 40 %" y los otros tres en 0, sobre "10 llamadas"

### Requirement: Solicitudes sin ningún intento
La sección SHALL mostrar cuántas solicitudes no tienen ninguna llamada ni WhatsApp marcado.

#### Scenario: Solo WhatsApp
- **WHEN** a una solicitud solo se le marcó un WhatsApp enviado
- **THEN** no cuenta como "sin ningún intento", pero sí como "sin llamar" en el tiempo a la primera llamada

### Requirement: Cada número con su base
Cada número de la sección SHALL mostrar sobre cuántos casos se calculó y, con menos de 20,
"Pocos casos". Sin solicitudes en el período la sección SHALL decirlo en vez de mostrar
ceros, y si la lectura de las llamadas falla SHALL decir "No se pudo cargar" sin tapar el
resto del Tablero.

#### Scenario: Sin llamadas registradas
- **WHEN** hay solicitudes en el período y ninguna llamada registrada
- **THEN** se lee "Todavía no hay llamadas registradas para estas N solicitudes." y la cantidad sin ningún intento

#### Scenario: Falla la lectura de llamadas
- **WHEN** la lectura de llamadas falla y el resto del Tablero carga
- **THEN** la sección dice "No se pudo cargar" y las otras secciones se ven

### Requirement: Quién la ve
La sección SHALL verse solo para quienes ya ven Métricas (admin y dueño) y no nombra a
quién hizo cada llamada.

#### Scenario: Coordinación o asesor
- **WHEN** una coordinadora o un asesor pide el Tablero por la red
- **THEN** recibe el mismo rechazo que hoy y ningún dato de llamadas
