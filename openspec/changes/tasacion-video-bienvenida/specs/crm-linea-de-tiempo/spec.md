# Spec Delta

## ADDED Requirements

### Requirement: Enlace del video de bienvenida abierto
La primera apertura del enlace personal del video de bienvenida SHALL mostrarse como
"Abrió el enlace del video de bienvenida", en el momento de esa apertura. Si lo abrió más
de una vez, el detalle MUST decir "{N} veces · la última {fecha relativa}". Una vista previa
de WhatsApp no es una apertura (`tasacion-video-bienvenida`). Sin aperturas no aparece nada.

#### Scenario: Una apertura
- **WHEN** Ana abrió su enlace una vez hoy a las 10:05
- **THEN** se lee "Abrió el enlace del video de bienvenida" a las 10:05, sin detalle

#### Scenario: Varias aperturas
- **WHEN** Jorge abrió su enlace el lunes y otra vez el miércoles
- **THEN** aparece un solo evento el lunes, con el detalle "2 veces · la última hace 2 días"

#### Scenario: Nunca lo abrió
- **WHEN** Mario recibió el enlace y no lo abrió
- **THEN** no aparece ningún evento de apertura

## MODIFIED Requirements

### Requirement: Video visto
Cada video que la persona empezó a reproducir, vinculado a su contacto, SHALL mostrarse
como "Vio el video {de cuál} · {porcentaje} %", con el porcentaje más alto alcanzado, en la
fecha en que abrió la página del video por primera vez. El video de bienvenida SHALL
nombrarse "el video de bienvenida" y SHALL llevar como detalle los minutos vistos sobre el
total ("8:30 de 13:30"). Un video que solo cargó sin reproducirse MUST NOT aparecer.

#### Scenario: Video de la landing
- **WHEN** la persona reprodujo el video de la landing de tasación hasta el 62 %
- **THEN** se lee "Vio el video de la landing de tasación · 62 %"

#### Scenario: La clase completa
- **WHEN** la persona vio el 12 % de la clase completa
- **THEN** se lee "Vio el video de la clase completa · 12 %"

#### Scenario: El video de bienvenida
- **WHEN** Ana vio 510 segundos del video de bienvenida, de 810, y llegó al 63 %
- **THEN** se lee "Vio el video de bienvenida · 63 %" con el detalle "8:30 de 13:30"

#### Scenario: Sin reproducir
- **WHEN** la página cargó el video pero la persona nunca le dio play
- **THEN** no aparece ningún evento de video
