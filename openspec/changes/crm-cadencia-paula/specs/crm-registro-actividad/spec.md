# Spec Delta

## MODIFIED Requirements

### Requirement: Volver a llamar exige día y hora
El resultado "Atendió · volver a llamar" SHALL pedir el día y la hora en que hay que volver
a llamar, y MUST rechazar el guardado si faltan o si ese momento no es posterior al actual
en hora de Argentina. Los campos marcados en rojo por faltantes SHALL dejar de verse en
rojo en cuanto se completan.

#### Scenario: Con atajo
- **WHEN** se elige "Atendió · volver a llamar", se toca el atajo "Mañana 10:00" y se guarda
- **THEN** la llamada se guarda con resultado `volver_a_llamar`

#### Scenario: Sin día ni hora
- **WHEN** se elige "Atendió · volver a llamar" y se toca "Guardar llamada" sin elegir día ni hora
- **THEN** se lee "Elegí día y hora para volver a llamar" y no se guarda nada

#### Scenario: Los campos dejan el rojo al completarse
- **WHEN** después de leer "Elegí día y hora para volver a llamar" se toca un atajo o se completan el día y la hora
- **THEN** los campos Día y Hora dejan de verse en rojo y el mensaje de error desaparece, sin tocar "Guardar llamada" otra vez

#### Scenario: En escritorio "Guardar llamada" queda a la vista
- **WHEN** a 1280 px se elige "Atendió · volver a llamar" y el bloque de día y hora empuja el formulario hacia abajo
- **THEN** la página se acomoda y el botón "Guardar llamada" se ve entero

#### Scenario: Día y hora ya pasados
- **WHEN** se eligen un día y una hora anteriores al momento actual
- **THEN** se lee "Tiene que ser más adelante que ahora" y no se guarda nada

#### Scenario: Pedido por la red sin fecha
- **WHEN** llega un pedido con resultado `volver_a_llamar` sin día u hora
- **THEN** responde 400 y no se guarda la llamada ni se crea ninguna tarea

#### Scenario: Atajo "Hoy 16:00" cuando ya pasaron las 16:00
- **WHEN** a las 17:00 se elige "Atendió · volver a llamar", se toca el atajo de hoy ("Hoy 13:30" desde crm-cadencia-paula) y se toca "Guardar llamada"
- **THEN** se lee "Tiene que ser más adelante que ahora" y no se guarda nada

#### Scenario: El día y la hora pedidos quedan guardados con la llamada
- **WHEN** se guarda "Atendió · volver a llamar" para mañana a las 10:00
- **THEN** en la base la fila de la llamada tiene ese día y esa hora en `callback_at`, y las llamadas con otro resultado lo tienen vacío

#### Scenario: Día y hora pedidos en un resultado que no los usa
- **WHEN** se intenta insertar en la base una llamada "No atendió" con `callback_at` cargado, o una "volver a llamar" sin él
- **THEN** la base rechaza la fila
