# Spec Delta

## Purpose

Define cómo se registra lo que una persona del equipo hace con un contacto: notas, llamadas
con su resultado y la marca de "WhatsApp enviado", y quién puede cargarlo, corregirlo o anularlo.

## ADDED Requirements

### Requirement: Nota rápida
Quien puede ver un contacto SHALL poder guardarle una nota de texto de hasta 2.000
caracteres. Una nota vacía o solo con espacios MUST rechazarse.

#### Scenario: Guardar una nota
- **WHEN** se escribe "Prefiere que la llamen a la tarde" y se toca "Guardar nota"
- **THEN** aparece "Nota guardada." con "Deshacer", la nota queda primera en la actividad con el nombre de quien la escribió, y en la base hay una fila `note` con ese texto y ese autor

#### Scenario: Nota vacía
- **WHEN** se toca "Guardar nota" con el campo vacío o solo con espacios
- **THEN** se lee "Escribí algo para guardar la nota" y no se guarda nada

#### Scenario: Nota demasiado larga
- **WHEN** se intenta guardar una nota de más de 2.000 caracteres
- **THEN** la pantalla avisa el límite, no se guarda nada y el texto escrito no se pierde

#### Scenario: Deshacer una nota recién guardada
- **WHEN** se toca "Deshacer" en el aviso "Nota guardada."
- **THEN** la nota desaparece de la actividad y aparece "Listo, se deshizo."

### Requirement: Editar una nota
Una nota SHALL poder editarla únicamente quien la escribió. Una nota editada MUST mostrar
que fue editada.

#### Scenario: El autor edita su nota
- **WHEN** el autor abre el menú de su nota, toca "Editar", cambia el texto y guarda
- **THEN** la nota muestra el texto nuevo y la palabra "editada", y en la base la fila conserva su autor y su fecha original

#### Scenario: Otra persona no puede editarla
- **WHEN** una coordinadora mira una nota escrita por un asesor
- **THEN** el menú de esa nota no ofrece "Editar", y un pedido de edición hecho por la red responde 403 sin cambiar la base

#### Scenario: Editar y dejarla vacía
- **WHEN** el autor edita su nota y borra todo el texto
- **THEN** se lee "Escribí algo para guardar la nota" y la nota conserva el texto anterior

### Requirement: Borrar una nota
Una nota SHALL poder borrarla quien la escribió, y también un coordinador, un admin o un
dueño. La nota borrada desaparece de la ficha pero MUST conservarse en la base con quién y
cuándo la borró.

#### Scenario: El autor borra su nota
- **WHEN** el autor toca "Borrar" en el menú de su nota y confirma
- **THEN** la nota desaparece de la actividad, y en la base la fila sigue existiendo con `voided_at` y `voided_by` completos

#### Scenario: Un asesor no puede borrar la nota de otro
- **WHEN** un asesor mira, en un contacto suyo, una nota escrita por la coordinadora
- **THEN** el menú de esa nota no ofrece "Borrar", y el pedido hecho por la red responde 403

#### Scenario: La coordinación borra una nota ajena
- **WHEN** una coordinadora toca "Borrar" en una nota escrita por un asesor
- **THEN** la nota desaparece y en la base `voided_by` es la coordinadora

### Requirement: Registrar una llamada con su resultado
Quien puede ver un contacto SHALL poder registrar una llamada eligiendo uno de cinco
resultados: "No atendió", "Atendió y agendó", "Atendió · volver a llamar", "Atendió · no le
interesa" y "Número equivocado", con un comentario opcional. No se guarda una llamada sin resultado.

#### Scenario: Atendió y agendó con comentario
- **WHEN** se elige "Atendió y agendó", se escribe "Quiere el jueves" y se toca "Guardar llamada"
- **THEN** la llamada aparece primera en la actividad como "Llamada 1 · Agendó" con el comentario, y en la base hay una fila `call` con resultado `agendo`

#### Scenario: Resultado desconocido
- **WHEN** llega por la red un pedido de llamada sin resultado o con un resultado que no es uno de los cinco
- **THEN** responde 400 con un mensaje en castellano y no se guarda nada

#### Scenario: El resultado se lee sin depender del color
- **WHEN** se mira una llamada en la actividad
- **THEN** su resultado se lee con ícono y texto, además del color

### Requirement: "No atendió" se guarda con un toque
El resultado "No atendió" SHALL guardarse al tocarlo, sin botón adicional ni texto
obligatorio. En celular, registrar una llamada no atendida MUST llevar como máximo tres
toques desde la ficha.

#### Scenario: Tres toques en celular
- **WHEN** en la ficha a 390 px se toca "+", después "Registrar llamada", después "No atendió"
- **THEN** la hoja se cierra, la llamada queda guardada y aparece primera y resaltada en la actividad, con el filtro en "Todo"

#### Scenario: Escritorio
- **WHEN** en la ficha a 1280 px se toca la pestaña "Registrar llamada" y después "No atendió"
- **THEN** la llamada queda guardada sin tocar ningún otro botón

#### Scenario: Doble toque
- **WHEN** se toca "No atendió" dos veces seguidas muy rápido
- **THEN** queda una sola llamada en la actividad y una sola fila en la base

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
- **WHEN** a las 17:00 se elige "Atendió · volver a llamar", se toca el atajo "Hoy 16:00" y se toca "Guardar llamada"
- **THEN** se lee "Tiene que ser más adelante que ahora" y no se guarda nada

#### Scenario: El día y la hora pedidos quedan guardados con la llamada
- **WHEN** se guarda "Atendió · volver a llamar" para mañana a las 10:00
- **THEN** en la base la fila de la llamada tiene ese día y esa hora en `callback_at`, y las llamadas con otro resultado lo tienen vacío

#### Scenario: Día y hora pedidos en un resultado que no los usa
- **WHEN** se intenta insertar en la base una llamada "No atendió" con `callback_at` cargado, o una "volver a llamar" sin él
- **THEN** la base rechaza la fila

### Requirement: La hora de la llamada se puede corregir hacia atrás
Al registrar una llamada o un WhatsApp, SHALL poder indicarse que ocurrió antes ("Hace 15
min", "Hace 30 min", "Hace 1 hora"), hasta siete días atrás como máximo y nunca en el
futuro. La hora real de carga MUST guardarse aparte. En escritorio, al abrir esa
corrección el botón "Guardar llamada" SHALL quedar entero a la vista.

#### Scenario: Por defecto es ahora
- **WHEN** se guarda una llamada sin tocar "¿Fue hace un rato? Corregir la hora"
- **THEN** en la base `occurred_at` y `created_at` son el mismo momento (los dos los pone la base al insertar)

#### Scenario: Hace 30 minutos
- **WHEN** se elige "Hace 30 min" y se guarda
- **THEN** la actividad muestra la llamada con la hora de hace 30 minutos, y en la base `occurred_at` es 30 minutos anterior a `created_at`

#### Scenario: En escritorio "Guardar llamada" queda a la vista al corregir la hora
- **WHEN** a 1280 px se toca "¿Fue hace un rato? Corregir la hora" y las opciones empujan el formulario hacia abajo
- **THEN** la página se acomoda y el botón "Guardar llamada" se ve entero

#### Scenario: Más de siete días atrás
- **WHEN** llega por la red un pedido que indica que la llamada fue hace más de siete días
- **THEN** responde 400 y no se guarda nada

#### Scenario: En el futuro
- **WHEN** llega por la red un pedido que indica una cantidad negativa de minutos, o sea una hora futura
- **THEN** responde 400 y no se guarda nada

#### Scenario: Fecha suelta en el pedido
- **WHEN** llega por la red un pedido que trae una fecha y hora propias para la llamada en vez de "hace cuántos minutos"
- **THEN** esa fecha se ignora y la llamada se guarda con la hora del servidor

#### Scenario: La base también lo impide
- **WHEN** se intenta insertar directo en la base una actividad con `occurred_at` un día posterior a `created_at`, o más de siete días anterior
- **THEN** la base rechaza la fila

### Requirement: El número de intento se calcula
El número que se muestra en cada llamada ("Llamada 1", "Llamada 2"…) SHALL calcularse como
el orden, por fecha en que ocurrió, de las llamadas no anuladas de ese contacto dentro del
mismo proceso. El número no se guarda, y un WhatsApp marcado o una nota no lo ocupan.

#### Scenario: Tres llamadas
- **WHEN** un contacto tiene tres llamadas no anuladas en su proceso
- **THEN** se leen "Llamada 1", "Llamada 2" y "Llamada 3" de la más vieja a la más nueva

#### Scenario: Anular la del medio
- **WHEN** se anula la segunda de tres llamadas
- **THEN** quedan "Llamada 1" y "Llamada 2", sin hueco

#### Scenario: WhatsApp entre llamadas
- **WHEN** hay una llamada, después un WhatsApp marcado y después otra llamada
- **THEN** las llamadas se leen "Llamada 1" y "Llamada 2"

#### Scenario: Proceso nuevo
- **WHEN** un contacto con tres llamadas en un proceso ya cerrado recibe la primera llamada de un proceso nuevo
- **THEN** esa llamada se lee "Llamada 1"

#### Scenario: Llamada cargada con hora corregida
- **WHEN** se carga una llamada "Hace 1 hora" y ya había otra registrada hace 30 minutos
- **THEN** la recién cargada se lee "Llamada 1" y la otra pasa a "Llamada 2"

#### Scenario: Llamadas sin proceso
- **WHEN** un contacto sin ningún proceso abierto recibe dos llamadas, que se guardan sin proceso
- **THEN** se leen "Llamada 1" y "Llamada 2": las llamadas sin proceso se numeran entre sí, aparte de las de cualquier proceso

### Requirement: Marcar WhatsApp enviado
Dentro de "Registrar llamada" SHALL existir la acción "Marcar WhatsApp enviado", que deja
anotado que la persona del equipo le escribió al cliente desde su propio teléfono. La
plataforma MUST NOT enviar ningún mensaje. La acción SHALL guardar junto con la marca el
comentario y la hora corregida que estén elegidos en ese momento en el formulario de la
llamada, y no el resultado ni el día y la hora de "volver a llamar".

#### Scenario: Marcar
- **WHEN** se toca "Marcar WhatsApp enviado"
- **THEN** aparece "WhatsApp marcado como enviado. No se crea ninguna tarea más." con "Deshacer", la actividad muestra "WhatsApp enviado" con quién lo marcó, y en la base hay una fila `whatsapp_sent`

#### Scenario: Con comentario y hora corregida
- **WHEN** con el comentario "le mandé el link" escrito y "Hace 30 min" elegido se toca "Marcar WhatsApp enviado"
- **THEN** en la base la fila `whatsapp_sent` tiene ese texto y un `occurred_at` 30 minutos anterior a `created_at`, y el formulario queda limpio

#### Scenario: Con un resultado ya marcado
- **WHEN** con "Atendió · volver a llamar" marcado y su día y hora elegidos se toca "Marcar WhatsApp enviado"
- **THEN** se guarda solo la marca de WhatsApp: no se guarda ninguna llamada ni se crea la tarea "Llamar a {nombre}"

#### Scenario: No sale ningún mensaje
- **WHEN** se marca un WhatsApp como enviado
- **THEN** no se crea ninguna fila nueva en `whatsapp_messages` y el cliente no recibe nada

#### Scenario: Se explica en pantalla
- **WHEN** se mira la acción antes de tocarla
- **THEN** debajo se lee "No manda nada: deja anotado que le escribiste desde tu teléfono."

### Requirement: Anular una llamada o un WhatsApp marcado
Una llamada o un WhatsApp marcado SHALL poder anularlo quien lo registró, y también un
coordinador, un admin o un dueño. Lo anulado desaparece de la ficha y MUST conservarse en
la base con quién y cuándo lo anuló; su texto y su resultado no se pueden modificar.

#### Scenario: Deshacer recién guardada
- **WHEN** se toca "Deshacer" en el aviso "Llamada 1 guardada."
- **THEN** la llamada desaparece de la actividad, aparece "Listo, se deshizo." y en la base la fila tiene `voided_at` y `voided_by`

#### Scenario: Anular más tarde
- **WHEN** quien registró una llamada ayer abre su menú y toca "Anular"
- **THEN** la llamada desaparece de la actividad y las demás se renumeran

#### Scenario: Un asesor no anula lo de otro
- **WHEN** un asesor intenta anular por la red una llamada registrada por la coordinadora en un contacto suyo
- **THEN** responde 403 y la llamada sigue en la actividad

#### Scenario: No se puede cambiar el resultado
- **WHEN** llega por la red un pedido para cambiar el resultado o el comentario de una llamada ya guardada
- **THEN** responde 400 y la fila no cambia

#### Scenario: Registro de otro contacto
- **WHEN** alguien que puede ver el contacto X pide editar o anular, por la red, un registro que pertenece a otro contacto usando la dirección del contacto X
- **THEN** responde 404 y ese registro no cambia

#### Scenario: Anular dos veces
- **WHEN** llega por segunda vez el pedido de anular un registro ya anulado
- **THEN** responde 200, y en la base `voided_at` y `voided_by` conservan los valores de la primera vez

### Requirement: Cada registro queda ligado a su autor y al proceso activo
Todo registro SHALL guardar como autor al usuario de la sesión, sin importar lo que diga el
pedido, y como proceso al proceso activo del contacto en ese momento. Si no hay proceso
activo, se guarda sin proceso.

#### Scenario: Autor forzado
- **WHEN** llega un pedido de nota que incluye el identificador de otro usuario como autor
- **THEN** la fila guardada tiene como `created_by` al usuario de la sesión

#### Scenario: Con proceso activo
- **WHEN** se registra una llamada a un contacto con una solicitud abierta
- **THEN** la fila tiene el `deal_id` de esa solicitud

#### Scenario: Sin proceso activo
- **WHEN** se registra una llamada a un contacto que no tiene ningún proceso abierto
- **THEN** la fila se guarda con `deal_id` vacío y aparece en la actividad igual

### Requirement: Solo registra quien puede ver el contacto
Registrar, editar, borrar o anular actividad SHALL estar permitido solo a quien puede abrir
la ficha de ese contacto (la regla está en la spec `crm-ficha-contacto`). La base MUST
aplicar esa misma regla de lectura a quien la consulte con su propia sesión, y MUST NOT
permitir ninguna escritura con sesión propia: toda escritura pasa por la plataforma.

#### Scenario: Asesor en un contacto ajeno
- **WHEN** un asesor envía por la red una nota o una llamada para un contacto que no tiene asignado, no creó y del que no tiene ningún proceso ni tasación a su nombre
- **THEN** responde 404 y no se guarda nada

#### Scenario: Asesor en el contacto de un proceso suyo
- **WHEN** un asesor registra una llamada en un contacto sin asesor asignado, que tiene un proceso asignado a él
- **THEN** la llamada se guarda con él como autor

#### Scenario: Abogado
- **WHEN** un abogado envía por la red una nota o una llamada para cualquier contacto
- **THEN** responde 403 y no se guarda nada

#### Scenario: Asesor en su contacto
- **WHEN** un asesor registra una llamada en un contacto asignado a él
- **THEN** la llamada se guarda con él como autor

#### Scenario: La base con sesión de asesor
- **WHEN** se consulta `contact_activities` en la base con la sesión de un asesor
- **THEN** solo vuelven filas de contactos asignados a él, creados por él, o con un proceso o una tasación a su nombre

#### Scenario: La base con sesión de abogado
- **WHEN** se consulta o se intenta insertar en `contact_activities` con la sesión de un abogado
- **THEN** la consulta devuelve cero filas y la inserción es rechazada

#### Scenario: La base con sesión de coordinador
- **WHEN** se consulta `contact_activities` con la sesión de un coordinador
- **THEN** vuelven las filas de todos los contactos

#### Scenario: Insertar directo en la base
- **WHEN** un coordinador, un asesor o un abogado intentan insertar una fila en `contact_activities` con su propia sesión, sin pasar por la plataforma
- **THEN** la base rechaza la inserción

#### Scenario: Cambiar una llamada directo en la base
- **WHEN** un coordinador intenta, con su propia sesión, cambiar el resultado, el comentario, la hora o la marca de anulada de una llamada, o borrarla
- **THEN** no cambia ni se borra ninguna fila

### Requirement: Un reintento no duplica el registro
Si el mismo guardado llega dos veces (doble toque, o reintento porque se cortó la red), SHALL
quedar un solo registro y la segunda respuesta SHALL devolver el registro ya guardado.

#### Scenario: Se corta la red al guardar
- **WHEN** se guarda una llamada, la respuesta no llega y la pantalla reintenta el mismo guardado
- **THEN** en la base hay una sola fila y la pantalla la muestra una sola vez

#### Scenario: Dos pedidos iguales a la vez
- **WHEN** llegan al mismo tiempo dos pedidos de "No atendió" con el mismo identificador de guardado
- **THEN** queda una sola llamada y una sola tarea "Llamada 2", y las dos respuestas traen la misma llamada, la misma tarea creada y las mismas tareas cerradas

#### Scenario: Se repite el guardado de la segunda "No atendió"
- **WHEN** se guarda la segunda "No atendió" seguida, que crea la tarea "Enviar WhatsApp a {nombre}", y el mismo guardado llega otra vez con el mismo identificador
- **THEN** hay una sola llamada y una sola tarea "Enviar WhatsApp", la segunda respuesta trae esa misma tarea como creada, y el aviso dice "Se agendó Enviar WhatsApp para …", nunca "Ya hay una tarea pendiente de enviarle WhatsApp"

#### Scenario: Llega tarde el reintento de un guardado ya deshecho
- **WHEN** se guarda una llamada, se toca "Deshacer", y después llega un reintento de red del guardado original con el mismo identificador
- **THEN** responde 200 con la llamada anulada, no se crea ni se cierra ninguna tarea, las tareas que el deshacer reabrió siguen pendientes y la llamada no vuelve a aparecer en la actividad

#### Scenario: Identificador de guardado de otro registro
- **WHEN** llega un pedido cuyo identificador de guardado ya lo usó otra persona o se usó en otro contacto
- **THEN** responde 409, no se guarda nada y no se devuelve ningún dato del otro registro

#### Scenario: Falla el guardado
- **WHEN** se toca "Guardar llamada" y el servidor responde con error
- **THEN** la pantalla avisa que no se pudo guardar, el formulario conserva el resultado y el comentario elegidos, y no aparece ningún registro en la actividad

### Requirement: Qué pasa en pantalla después de guardar
Después de guardar una llamada o un WhatsApp, la ficha SHALL limpiar el formulario, cerrar
la hoja en celular, volver a la actividad con el filtro en "Todo", mostrar el registro nuevo
primero y resaltado, y mostrar un aviso con lo que pasó y lo que falta hacer. Los textos y
botones para cada situación están en la spec `crm-cadencia-llamadas`. En escritorio, el
foco SHALL pasar al aviso o, si no hay aviso, al registro nuevo.

#### Scenario: Aviso tras "No atendió"
- **WHEN** se guarda la primera llamada como "No atendió"
- **THEN** se lee "Llamada 1 guardada." con "Deshacer" y un aviso titulado "Llamada 1 · No atendió" que dice qué tarea se agendó y para cuándo

#### Scenario: Aviso tras "Agendó"
- **WHEN** una coordinadora guarda una llamada como "Atendió y agendó" en un contacto con una solicitud abierta
- **THEN** el aviso dice "Falta coordinar día, hora y asesor de la tasación." con el botón "Coordinar tasación"

#### Scenario: Aviso tras "No le interesa" o "Número equivocado"
- **WHEN** una coordinadora guarda una llamada con uno de esos dos resultados en un contacto con proceso activo
- **THEN** el aviso dice "El proceso sigue abierto. Si no hay nada más que hacer, podés cerrarlo." con "Marcar proceso como perdido" y "Dejarlo abierto"

#### Scenario: En escritorio el cuadro vuelve a "Nota"
- **WHEN** a 1280 px se guarda una llamada desde la pestaña "Registrar llamada"
- **THEN** el cuadro vuelve a mostrar la pestaña "Nota", vacía

#### Scenario: En escritorio el foco va al aviso
- **WHEN** a 1280 px se guarda una llamada
- **THEN** el foco queda en el aviso de lo que pasó; y al guardar una nota, que no tiene aviso, en el registro nuevo de la lista

#### Scenario: "Ver en Tareas" en celular
- **WHEN** en celular se guarda una llamada que agendó una tarea y se toca "Ver en Tareas" en el aviso
- **THEN** la ficha pasa a la pestaña "Tareas" y la tarea nueva está en la lista

#### Scenario: "Ver en Tareas" no aparece en escritorio
- **WHEN** a 1280 px se guarda una llamada que agendó una tarea
- **THEN** el aviso no muestra el botón "Ver en Tareas", porque las tareas ya están a la vista

#### Scenario: Cerrar el aviso
- **WHEN** se toca la X del aviso
- **THEN** el aviso desaparece y la actividad queda como estaba

### Requirement: Un solo aviso con "Deshacer" a la vista
El aviso breve con "Deshacer" (el de una nota, una llamada, un WhatsApp o un proceso
perdido) SHALL ser uno solo a la vez en la ficha, y SHALL cerrarse al salir de la ficha y,
en celular, al abrir la hoja "+". Que se cierre MUST NOT deshacer nada.

#### Scenario: Un solo aviso con "Deshacer" a la vista
- **WHEN** se guarda una nota y, antes de que "Nota guardada." se vaya, se guarda una llamada
- **THEN** queda a la vista solo "Llamada 1 guardada." con su "Deshacer"; la nota sigue guardada y se puede borrar desde su menú "⋯"

#### Scenario: El aviso con "Deshacer" se cierra al salir o al abrir la hoja
- **WHEN** con "Nota guardada." a la vista se pasa a otra pantalla, o en celular se toca "+"
- **THEN** ese aviso se cierra y lo guardado no cambia

### Requirement: Registrar no envía mensajes ni cambia etapas
Guardar una nota, una llamada o una marca de WhatsApp SHALL NOT enviar ningún mensaje ni
email, ni cambiar la etapa de ningún proceso.

#### Scenario: Llamada "Atendió y agendó"
- **WHEN** se guarda una llamada con resultado "Atendió y agendó"
- **THEN** el proceso sigue en la misma etapa, no hay fila nueva en el historial de etapas y no salió ningún email ni WhatsApp

#### Scenario: Llamada "No le interesa"
- **WHEN** se guarda una llamada con resultado "Atendió · no le interesa" y no se toca nada más
- **THEN** el proceso sigue en la misma etapa
