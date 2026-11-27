# Spec Delta

## ADDED Requirements

### Requirement: Marca del video de bienvenida en la fila
En las filas de procesos abiertos en etapa Solicitud, la cartera SHALL mostrar, debajo del
nombre, una marca de cómo está el video de bienvenida de esa persona:
- "▶ Vio {N} %" si tocó play;
- "Abrió el video" si abrió el enlace sin tocar play;
- "No abrió el video" si tiene enlace marcado como enviado y nunca lo abrió.

Una persona sin enlace, o con un enlace que no le llegó por WhatsApp y nunca se abrió, MUST
NOT llevar marca. La marca va en gris neutro, sin rojo ni ámbar.

#### Scenario: Vio el video
- **WHEN** la coordinadora mira la fila de Ana, que vio el 63 % del video
- **THEN** debajo del nombre se lee "▶ Vio 63 %"

#### Scenario: No lo abrió
- **WHEN** Mario tiene el enlace enviado y no lo abrió
- **THEN** la fila dice "No abrió el video" en gris

#### Scenario: Sin enlace
- **WHEN** una persona se registró antes del cambio y no tiene enlace
- **THEN** su fila no lleva ninguna marca de video

#### Scenario: Enlace creado a mano y abierto
- **WHEN** Paula creó el enlace de Mario desde la ficha, se lo mandó por su cuenta y Mario lo abrió sin tocar play
- **THEN** la fila de Mario dice "Abrió el video"

#### Scenario: Ya coordinada
- **WHEN** el proceso de Ana pasa a Coordinada
- **THEN** su fila ya no lleva la marca

#### Scenario: Celular
- **WHEN** la coordinadora mira la cartera a 390 px
- **THEN** la marca entra en el renglón de debajo del nombre, sin cortarse con puntos suspensivos

### Requirement: La marca no rompe la cartera
La lectura de la marca SHALL hacerse en un solo pedido para todos los contactos de la
lista, con los ids en el cuerpo del pedido. Si esa lectura falla, la cartera MUST mostrarse
igual, sin marcas. Cada uno MUST recibir datos de video solo de los procesos que ya ve.

#### Scenario: Falla la lectura del video
- **WHEN** la lectura de la marca devuelve un error
- **THEN** la cartera se ve completa y ninguna fila lleva marca

#### Scenario: Lo que cada uno puede ver
- **WHEN** un asesor mira su vista
- **THEN** ve la marca solo en filas de procesos que ya ve hoy, y la red no le trae datos de video de otros contactos

#### Scenario: Muchas solicitudes
- **WHEN** la coordinación tiene 150 solicitudes abiertas
- **THEN** la marca se carga en un solo pedido y la cartera no da error
