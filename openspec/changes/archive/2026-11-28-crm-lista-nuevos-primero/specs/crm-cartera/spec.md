# Spec Delta

## ADDED Requirements

### Requirement: Los más nuevos primero
La cartera y Contactos SHALL ordenarse por defecto de la entrada más reciente a la más vieja.
El orden elegido SHALL aplicarse a los grupos generales de cada vista; los grupos urgentes
mantienen el suyo.

#### Scenario: Entrar al CRM
- **WHEN** el admin abre el CRM sin elegir orden
- **THEN** el selector dice "Más nuevos primero" y el proceso que entró hoy está arriba de uno que entró la semana pasada

### Requirement: Trabados aparte
Los procesos abiertos con más de 30 días de Argentina sin movimiento (contacto registrado o
tasación; una tasación agendada a futuro cuenta como movimiento) SHALL ir al grupo "Trabados ·
más de 30 días sin movimiento", al final de la lista y antes de los cerrados, y no en los
demás grupos. Si el último contacto no se pudo leer, el proceso no se marca como trabado.

#### Scenario: Coordinada de junio
- **WHEN** un proceso entró el 1 de junio, su tasación fue el 2 de junio y nadie lo movió desde entonces
- **THEN** en diciembre aparece en "Trabados · más de 30 días sin movimiento" y no arriba de los procesos nuevos

#### Scenario: Viejo pero con contacto reciente
- **WHEN** un proceso entró hace dos meses y se lo llamó ayer
- **THEN** no está en "Trabados"
