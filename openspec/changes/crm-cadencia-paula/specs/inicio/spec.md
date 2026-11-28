# Spec Delta

## MODIFIED Requirements

### Requirement: Lo del dueño
"Leads sin primer contacto" SHALL listar las solicitudes desde el 26/11 sin primer contacto,
con "Espera hace X de reloj · Y hábiles · la llama la coordinación". "Tiempo medio a la
primera llamada" SHALL promediar, para los leads registrados desde el lunes (y desde el 26/11),
el tiempo hasta su primera llamada en horas de reloj y hábiles (lunes a viernes de 10 a 14, el horario de la coordinación),
con la cantidad de leads, "Pocos casos" debajo de 20 y cuántos siguen sin llamar.

#### Scenario: Pocos casos
- **WHEN** desde el lunes 3 leads recibieron su primera llamada y 2 siguen sin llamar
- **THEN** se leen los dos promedios con "3 leads", el aviso "Pocos casos" y "Otros 2 todavía sin llamar no entran en el promedio."

#### Scenario: Sin datos
- **WHEN** ningún lead de la semana recibió todavía su primera llamada
- **THEN** se lee "Todavía sin datos esta semana"

#### Scenario: Solo lectura
- **WHEN** el dueño mira "Para llamar ahora"
- **THEN** el bloque dice "Solo lectura", no tiene botones y muestra el teléfono como texto
