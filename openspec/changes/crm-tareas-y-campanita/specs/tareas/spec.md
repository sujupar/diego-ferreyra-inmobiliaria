# Spec Delta

## Purpose

Define cómo se crean, se listan por vencimiento, se completan, se reabren y se posponen las
tareas, y quién puede hacer cada cosa. La forma visual está en `crm-sistema-diseno`.

## ADDED Requirements

### Requirement: Grupos por vencimiento en hora de Argentina
Cada tarea pendiente SHALL caer en un solo grupo, calculado en hora de Argentina: "Vencidas"
(ya pasó su momento), "Hoy" (es de hoy y no pasó), "Próximas" (de mañana en adelante) o
"Sin fecha". Una tarea con hora vence a esa hora; una de todo el día vence al terminar su
día. Dentro de cada grupo con fecha MUST ordenarse por vencimiento, la más próxima primero.

#### Scenario: Con hora
- **WHEN** son las 11:00 y hay una tarea de hoy a las 10:30 y otra de hoy a las 15:00
- **THEN** la de las 10:30 está en "Vencidas" con "Vencida hace 30 min" y la de las 15:00 en "Hoy" con "Hoy 15:00"

#### Scenario: Todo el día
- **WHEN** son las 22:00 y una tarea es de hoy, todo el día
- **THEN** está en "Hoy" con "Hoy, todo el día", y recién mañana pasa a "Vencidas"

#### Scenario: Noche en Argentina
- **WHEN** son las 22:30 de Argentina (ya es otro día en UTC) y una tarea es de mañana a las 9:00
- **THEN** está en "Próximas" con "Mañana 9:00"

### Requirement: Lista completa y cantidades exactas
Pendientes SHALL mostrar todas las tareas pendientes de la selección, sin techo oculto: los
grupos con fecha completos y "Sin fecha" de a 25 con "Mostrar 25 más · quedan N". El
resumen y la cantidad de cada grupo y de cada tipo MUST ser exactos aunque la lista no esté
cargada entera.

#### Scenario: Más de 50
- **WHEN** la coordinadora tiene 300 tareas sin fecha y 4 con fecha
- **THEN** ve las 4 con fecha, "Sin fecha · 300" plegado, y al abrirlo 25 con "Mostrar 25 más · quedan 275"

#### Scenario: Próximas visibles
- **WHEN** una tarea es para la semana que viene
- **THEN** aparece en "Próximas" (antes la lista escondía las futuras)

### Requirement: De quién son las tareas que se ven
Cada persona SHALL ver en Pendientes sus tareas. Coordinación, admin y dueño MUST poder
elegir "Mías", una persona activa o "Todo el equipo"; el admin y el dueño arrancan en "Todo
el equipo". El asesor y el abogado MUST ver solo las suyas, también por la API de la
plataforma, aunque pidan las de otro.

#### Scenario: Coordinación mira a un asesor
- **WHEN** la coordinadora elige "Tomás" en "De quién"
- **THEN** ve las tareas de Tomás con su nombre en cada fila, y el título dice "Pendientes de Tomás"

#### Scenario: Asesor pide las de otro por la red
- **WHEN** un asesor pide por la API de la plataforma las tareas de otra persona o de todo el equipo
- **THEN** recibe solo las suyas

### Requirement: Tipos de tarea
Las tareas SHALL mostrarse con uno de cinco tipos: Llamada, Mensaje, Visita,
Documentación u Otro. El tipo sale del canal de la tarea; las tareas del sistema sin canal
MUST tomar uno fijo según su clase: la de entrada de un lead es Llamada, la de tasación
coordinada es Visita, las de documentos y propiedad son Documentación, y el resto (también
"Actualizar contacto"), Otro.

#### Scenario: Tarea del sistema
- **WHEN** hay una tarea "Revisar documentacion" del abogado
- **THEN** figura como Documentación y se filtra con ese tipo

#### Scenario: Tarea vieja con canal "Email"
- **WHEN** una tarea creada antes tiene el canal email
- **THEN** figura como Otro

### Requirement: Crear una tarea
Desde Pendientes, la ficha y las pantallas de proceso, propiedad y tasación SHALL abrirse el
mismo formulario "Nueva tarea". El título es obligatorio (hasta 120 caracteres). El día es
opcional: sin día queda en "Sin fecha". La fecha mínima y "hoy" MUST calcularse en hora de
Argentina. Coordinación, admin y dueño pueden asignarla a otro; los demás, solo a sí mismos.

#### Scenario: Tarea para hoy a la noche
- **WHEN** a las 22:00 de Argentina se crea una tarea para hoy a las 23:00
- **THEN** se guarda para hoy a las 23:00 y no se rechaza por "fecha pasada"

#### Scenario: Sin día
- **WHEN** se crea una tarea sin elegir día
- **THEN** se guarda sin fecha, queda en "Sin fecha" y el aviso dice "Tarea creada · queda en «Sin fecha»"

#### Scenario: Hora ya pasada
- **WHEN** se elige hoy a una hora que ya pasó
- **THEN** se lee un error y no se crea nada

#### Scenario: Asignar a otra persona sin permiso
- **WHEN** un asesor intenta por la API de la plataforma crear una tarea para otra persona
- **THEN** recibe 403 y no se crea nada

### Requirement: Completar y deshacer
Completar una tarea SHALL ofrecer "Deshacer" en el aviso, que la vuelve a dejar pendiente con
su fecha. Solo puede completar o reabrir quien la tiene asignada, o coordinación, admin o
dueño. "Descartar" MUST NOT ofrecerse en la pantalla.

#### Scenario: Deshacer
- **WHEN** se completa una tarea y se toca "Deshacer" en el aviso
- **THEN** la tarea vuelve a su grupo, pendiente, sin quién la completó

#### Scenario: Ajena
- **WHEN** un asesor intenta por la API de la plataforma completar o reabrir una tarea de otra persona
- **THEN** recibe 403 y la tarea no cambia

#### Scenario: Reabrir una que no se completó
- **WHEN** se pide reabrir una tarea pendiente o descartada
- **THEN** responde 409 y no cambia nada

#### Scenario: Reabrir una que cerró una llamada
- **WHEN** se pide reabrir una tarea que cerró una llamada registrada
- **THEN** responde 409: se reabre deshaciendo la llamada

#### Scenario: Copias de la entrada
- **WHEN** una coordinadora completa la tarea de entrada de un lead
- **THEN** la copia de la otra coordinadora también queda completada

### Requirement: Posponer y poner fecha
Posponer SHALL ofrecer "En 1 hora", "Mañana a las 9:00" (el día siguiente de calendario) y
"Elegir día y hora"; a una tarea sin fecha se le ofrece lo mismo como "Poner fecha". La
tarea queda con día y hora y deja de ser de todo el día. MUST rechazarse un momento ya
pasado. El aviso ofrece "Deshacer", que vuelve a la fecha anterior.

#### Scenario: En una hora
- **WHEN** a las 10:42 se pospone una tarea vencida con "En 1 hora"
- **THEN** queda para hoy 11:45 (la hora redondeada hacia arriba de a 5 minutos), en "Hoy", y el aviso dice "Pospuesta para hoy 11:45" con "Deshacer"

#### Scenario: Poner fecha a una sin fecha
- **WHEN** se elige "Mañana a las 9:00" en una tarea sin fecha
- **THEN** pasa a "Próximas" y el aviso dice "Queda para mañana 9:00"

#### Scenario: Momento pasado
- **WHEN** se elige hoy a una hora que ya pasó
- **THEN** se lee "Elegí un día y una hora que todavía no hayan pasado." y no cambia nada

#### Scenario: Deshacer después de otro cambio
- **WHEN** se pospone una tarea, otra persona la cambia y después se toca "Deshacer"
- **THEN** se lee "Esa tarea cambió mientras tanto: no se pudo deshacer." y queda el cambio de la otra persona

### Requirement: La tarea de entrada de un lead tiene fecha
La tarea de entrada de un lead SHALL nacer con día y hora: el registro si entró en horario
hábil (lunes a viernes, 9:00 a 17:59 de Argentina, sin feriados), ese día a las 9:00 si fue de
madrugada, y si no, el día hábil siguiente a las 9:00. MUST completarse sola cuando el proceso
sale de "Solicitud", con el autor de ese cambio.

#### Scenario: En horario
- **WHEN** un lead se registra un martes a las 15:10
- **THEN** su tarea de entrada vence ese martes a las 15:10 y figura "Espera hace N min" en "Vencidas"

#### Scenario: Fuera de horario
- **WHEN** un lead se registra un viernes a las 21:00
- **THEN** su tarea de entrada vence el lunes a las 9:00 y el fin de semana está en "Próximas"

#### Scenario: Madrugada de un día hábil
- **WHEN** un lead se registra un martes a las 7:30
- **THEN** su tarea de entrada vence ese martes a las 9:00

#### Scenario: Se coordina o se descarta
- **WHEN** la coordinadora coordina o descarta el proceso de un lead
- **THEN** las dos copias de su tarea de entrada quedan completadas y dejan de sonar

#### Scenario: La entrada abre la ficha
- **WHEN** se toca una tarea de entrada en Pendientes o en la campanita
- **THEN** se abre la ficha del contacto, donde se registra la llamada
