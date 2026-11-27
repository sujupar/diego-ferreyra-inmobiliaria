# Spec Delta

## ADDED Requirements

### Requirement: Marca del video de bienvenida en la fila
En las filas de procesos abiertos en etapa Solicitud, la cartera SHALL mostrar, debajo del
nombre, una marca de cómo está el video de bienvenida de esa persona:
- "▶ Vio {N} %" si tocó play;
- "Abrió el video" si abrió el enlace sin tocar play;
- "No abrió el video" en gris si tiene enlace y nunca lo abrió.

Una persona sin enlace MUST NOT llevar marca. La marca MUST NOT usar rojo ni ámbar, que en
las filas quedan para lo vencido y lo de hoy.

#### Scenario: Vio el video
- **WHEN** la coordinadora mira la fila de Ana, que vio el 63 % del video
- **THEN** debajo del nombre se lee "▶ Vio 63 %"

#### Scenario: No lo abrió
- **WHEN** Mario tiene enlace y no lo abrió
- **THEN** la fila dice "No abrió el video" en gris

#### Scenario: Sin enlace
- **WHEN** una persona se registró antes del cambio y no tiene enlace
- **THEN** su fila no lleva ninguna marca de video

#### Scenario: Ya coordinada
- **WHEN** el proceso de Ana pasa a Coordinada
- **THEN** su fila ya no lleva la marca

### Requirement: Detalle de la marca de video
Al pasar el mouse sobre la marca, o al mantenerla apretada en el celular, SHALL verse
"{minutos} de {total} · abrió {N} veces".

#### Scenario: Detalle
- **WHEN** la coordinadora pasa el mouse sobre "▶ Vio 63 %" de Ana, que abrió 2 veces
- **THEN** se lee "8:30 de 13:30 · abrió 2 veces"

#### Scenario: Celular
- **WHEN** la coordinadora mira la cartera a 390 px
- **THEN** la marca entra en el renglón del nombre o en el siguiente, sin cortarse con puntos suspensivos

#### Scenario: Lo que cada uno puede ver
- **WHEN** un asesor mira su vista
- **THEN** ve la marca solo en filas de procesos que ya ve hoy, y la red no le trae datos de video de otros contactos
