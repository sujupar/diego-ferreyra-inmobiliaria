# Spec Delta

## MODIFIED Requirements

### Requirement: Tiempo a la primera llamada
La sección SHALL mostrar el tiempo desde que la persona se registró hasta su primera llamada,
con la mediana y el promedio, en tiempo de reloj y en horas hábiles (lunes a viernes de 10 a
14, el horario de la coordinación), sobre las solicitudes que ya tienen una llamada, y cuántas siguen sin llamar.

#### Scenario: Tres solicitudes
- **WHEN** tres personas se registraron un lunes a las 10:00; a una se la llamó a las 11:00, a otra a las 13:00 y la tercera sigue sin llamar
- **THEN** se lee mediana 2 h y promedio 2 h, de reloj y hábiles, "sobre 2 solicitudes", "Pocos casos" y "1 todavía sin llamar no entra en la cuenta"
