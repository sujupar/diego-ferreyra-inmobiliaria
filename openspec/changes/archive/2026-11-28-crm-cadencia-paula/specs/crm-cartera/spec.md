# Spec Delta

## MODIFIED Requirements

### Requirement: La fila de un proceso
Cada fila del CRM SHALL mostrar el nombre de la persona con la propiedad y la dirección
debajo, la etapa, el último contacto, el próximo paso y, en las vistas de coordinación y del
dueño, el asesor. Toda la fila SHALL ser un solo enlace a la ficha de contacto de esa persona,
y la etapa SHALL ir como chip neutro: en las filas el color queda para lo vencido y lo de hoy.

#### Scenario: Fila de una solicitud con una llamada sin atender
- **WHEN** la coordinadora mira a Sofía Lanús, una solicitud de un PH de 4 ambientes en Colegiales, Conesa 1250, a la que llamó hace una hora sin que atienda y que tiene la "Llamada 2" para mañana a las 10:00
- **THEN** la fila dice "Sofía Lanús", "PH 4 amb · Colegiales · Conesa 1250", la etapa "Solicitud", el último contacto "hace 1 h" con "Llamada · no atendió", y el próximo paso "Llamada 2" con "Mañana 10:00"

#### Scenario: Proceso sin tipo de propiedad
- **WHEN** un proceso no tiene cargado el tipo de propiedad ni los ambientes, y es de Villa Crespo, Thames 640
- **THEN** el renglón de abajo dice "Villa Crespo · Thames 640"

#### Scenario: Tocar la fila
- **WHEN** se toca cualquier parte de la fila
- **THEN** se abre la ficha de contacto de esa persona; un lector de pantalla la anuncia como "Abrir la ficha de {nombre}"

#### Scenario: Proceso sin contacto vinculado
- **WHEN** se toca la fila de un proceso que no tiene contacto
- **THEN** se abre la pantalla de ese proceso (`/pipeline/<id>`)

#### Scenario: Etapa sin color
- **WHEN** se mira una fila en Coordinada o en Captada
- **THEN** la etapa se muestra con un punto gris y el texto, sin fondo de color
