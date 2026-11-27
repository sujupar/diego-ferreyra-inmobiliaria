# Spec Delta

## Purpose

Define el primer WhatsApp con video que recibe quien pide una tasación: el enlace personal,
la página del video, qué se mide de cada persona, dónde se ve y qué pasa si algo falla.

## ADDED Requirements

### Requirement: Un enlace personal por contacto
Cada contacto que recibe el WhatsApp con video SHALL tener un único enlace personal
`https://inmodf.com.ar/t/<código>`. El código MUST tener 10 caracteres de un alfabeto sin
caracteres confundibles, MUST generarse con un generador criptográfico y MUST NOT derivarse
del nombre, del teléfono ni del id del contacto. Un contacto que se registra más de una vez
MUST conservar el mismo enlace.

#### Scenario: Primer registro
- **WHEN** Ana Pérez se registra por primera vez en la landing de tasación
- **THEN** se crea un enlace con un código de 10 caracteres asociado a su contacto y a ese proceso

#### Scenario: Registro repetido
- **WHEN** Valeria se registra por tercera vez y ya tiene enlace
- **THEN** el WhatsApp lleva el mismo enlace que los anteriores y no se crea otro

#### Scenario: El código no se adivina
- **WHEN** se revisan los códigos creados
- **THEN** ninguno contiene el nombre, el teléfono ni el id de la persona, y no hay dos iguales

#### Scenario: Enlace corto en el mensaje
- **WHEN** se mira el enlace dentro del WhatsApp en un celular de 390 px
- **THEN** ocupa un solo renglón (`inmodf.com.ar/t/` y 10 caracteres)

### Requirement: El primer WhatsApp entrega el video
Cuando la plantilla vigente de tasación es una plantilla con video, el primer WhatsApp
SHALL llevar el nombre de pila de la persona y su enlace personal en el texto y en el botón
"Ver el video". La plantilla con el caso (versión 1) SHALL usarse solo si Meta la aprobó
como UTILIDAD; si no, la sobria (versión 2); si las dos quedaron como MARKETING, MUST
seguir `tasacion_llamada_v1`. El enlace MUST marcarse como enviado solo cuando Meta acepta
el mensaje.

#### Scenario: Envío normal
- **WHEN** Ana se registra con un celular válido y la plantilla vigente es la del video
- **THEN** recibe "Hola Ana, recibimos tu solicitud de tasación.", su enlace en el texto y en el botón, y al final "Te va a llamar Paula desde el +54 9 11 2292-6434 para coordinar.", y su enlace queda marcado como enviado

#### Scenario: Plantilla sin video vigente
- **WHEN** la plantilla vigente sigue siendo `tasacion_llamada_v1`
- **THEN** no se crea ningún enlace y el mensaje sale igual que hoy

#### Scenario: WhatsApp de computadora
- **WHEN** la persona abre el mensaje en WhatsApp de computadora, donde el botón no abre nada
- **THEN** el enlace escrito en el texto abre la página

#### Scenario: El agente de tasación no se prende
- **WHEN** la persona contesta el WhatsApp con video
- **THEN** el agente de IA de tasación no le responde, porque la plantilla con video es de las que solo avisan

### Requirement: Nadie se queda sin el primer mensaje
Si el enlace no se puede crear, o si Meta rechaza la plantilla con video por estar pausada,
deshabilitada o frenada por límite de marketing, el sistema MUST mandar en el mismo intento
`tasacion_llamada_v1`. Esa vuelta atrás MUST quedar visible en `whatsapp_messages`
(plantilla `tasacion_llamada_v1`) y el enlace, si existe, sin marca de enviado.

#### Scenario: Falla el enlace
- **WHEN** la base no responde al crear el enlace de Ana
- **THEN** Ana recibe el mensaje de "Te llamará Paula" y su registro en `whatsapp_messages` dice `tasacion_llamada_v1`

#### Scenario: Meta pausó la plantilla con video
- **WHEN** Meta responde que la plantilla con video está pausada
- **THEN** Ana recibe `tasacion_llamada_v1` en ese mismo intento, sin esperar reintentos

#### Scenario: Otro error de envío
- **WHEN** Meta responde un límite de volumen pasajero
- **THEN** se reintenta como hoy, con la misma plantilla con video

### Requirement: La página del video
La página SHALL mostrar el logo de Diego Ferreyra centrado arriba; debajo, centrados, el
titular "{Nombre}, antes de tu tasación mirá este caso" y el subtítulo; después el video,
que arranca solo cuando la persona toca play; y un botón chico "Escribinos por WhatsApp".
La duración del video MUST NOT mostrarse fuera del propio reproductor.

#### Scenario: Celular
- **WHEN** Ana abre su enlace en un celular de 390 px
- **THEN** ve el logo, el titular con su nombre, el subtítulo y el video sin desplazarse

#### Scenario: Escritorio
- **WHEN** Ana abre su enlace en una pantalla de 1280 px
- **THEN** ve el mismo contenido centrado, con el video de no más de 960 px de ancho

#### Scenario: Sin duración
- **WHEN** Ana mira la portada del video antes de tocar play
- **THEN** no aparece cuánto dura el video

#### Scenario: Escribir
- **WHEN** Ana toca "Escribinos por WhatsApp"
- **THEN** se abre un chat con +54 9 11 3907-0865 y el texto "Hola, ya vi el video. Quiero coordinar la tasación." listo para mandar, y su mensaje entra a la bandeja de la plataforma

#### Scenario: Nombre ausente
- **WHEN** el contacto no tiene nombre cargado
- **THEN** el titular dice "Antes de tu tasación, mirá este caso"

### Requirement: "Qué pasa ahora" aparece a los 30 segundos de video
El bloque "Qué pasa ahora" (quién llama, desde qué número y el botón "Guardar el contacto de
Paula") SHALL aparecer, debajo del video, recién cuando la persona lleva 30 segundos de
video reproducido. Adelantar el video MUST NOT contar como segundos vistos. Si en una visita
anterior ya llegó a los 30 segundos, el bloque SHALL estar visible desde que abre la página.
Con movimiento reducido activado, aparece sin animación.

#### Scenario: Antes de los 30 segundos
- **WHEN** Ana abre el enlace y todavía no tocó play
- **THEN** no ve el bloque "Qué pasa ahora"

#### Scenario: A los 30 segundos
- **WHEN** Ana lleva 30 segundos de video reproducido
- **THEN** aparece debajo del video el bloque con "Paula, de nuestro equipo, te va a llamar…", el número +54 9 11 2292-6434 y el botón "Guardar el contacto de Paula"

#### Scenario: Adelantar no cuenta
- **WHEN** Ana toca play y adelanta el video al minuto 5 en el segundo 3
- **THEN** el bloque no aparece hasta que suma 30 segundos reproducidos

#### Scenario: Vuelve otro día
- **WHEN** Ana ya había visto 2 minutos ayer y hoy vuelve a abrir el enlace
- **THEN** ve el bloque desde que carga la página

#### Scenario: Guardar el contacto
- **WHEN** Ana toca "Guardar el contacto de Paula" en el celular
- **THEN** se descarga una tarjeta de contacto "Paula · Diego Ferreyra Inmobiliaria" con el número +54 9 11 2292-6434

### Requirement: Lo que la página no tiene
La página MUST NOT tener formulario, otras propiedades ni otra oferta, MUST NOT indexarse en
buscadores, MUST NOT cargar el Píxel de Meta y MUST NOT mandar la dirección con el código a
otros sitios. Su título y su vista previa MUST NOT llevar el nombre de la persona. Un código
que no existe SHALL mostrar la página de "no encontrado", sin datos de nadie.

#### Scenario: Sin formulario
- **WHEN** Ana recorre su página hasta el final
- **THEN** no encuentra ningún campo para completar ni otra propiedad

#### Scenario: Código inexistente
- **WHEN** alguien abre `/t/ABCDEFGHJK` y ese código no existe
- **THEN** ve "no encontrado" y no se registra ninguna apertura

#### Scenario: Buscadores
- **WHEN** un buscador pide la página
- **THEN** la respuesta le indica que no la indexe ni siga sus enlaces

#### Scenario: Vista previa sin nombre
- **WHEN** WhatsApp arma la vista previa del enlace
- **THEN** se lee "Diego Ferreyra Inmobiliaria" y no el nombre de Ana

### Requirement: Qué se mide de cada persona
Por cada enlace el sistema SHALL guardar la primera apertura, la última y la cantidad de
aperturas; si la persona tocó play; los minutos vistos, contados como tramos distintos del
video que se reprodujeron; el porcentaje más alto alcanzado; y si terminó el video.

#### Scenario: Abre y mira
- **WHEN** Ana abre el enlace, toca play y mira de corrido los primeros 8 minutos y medio de un video de 13:30
- **THEN** su enlace tiene 1 apertura, play sí, alrededor de 8:30 vistos y 63 % como máximo

#### Scenario: Cierra el navegador de golpe
- **WHEN** Ana cierra WhatsApp con el video corriendo en el minuto 6
- **THEN** quedan registrados al menos los tramos hasta el último aviso de 5 segundos

### Requirement: Una apertura es una persona en un navegador
Una apertura MUST contarse solo cuando la página se carga en un navegador. La vista previa
que arma WhatsApp al recibir el enlace MUST NOT contarse como apertura.

#### Scenario: Vista previa de WhatsApp
- **WHEN** WhatsApp arma la vista previa del enlace al entregar el mensaje
- **THEN** el enlace sigue sin aperturas

### Requirement: Todo queda en el dueño del enlace
Todo lo que se mide desde la página MUST quedar asociado al contacto dueño del enlace, sin
importar el dispositivo ni lo que ese navegador haya visitado antes.

#### Scenario: Dos dispositivos
- **WHEN** Ana mira los minutos 0 a 3 en el celular y después los minutos 3 a 10 en la computadora
- **THEN** queda un solo registro de video de Ana con alrededor de 10 minutos vistos

#### Scenario: Mismo tramo dos veces
- **WHEN** Ana mira los primeros 2 minutos dos veces
- **THEN** cuenta 2 minutos vistos, no 4

#### Scenario: Un celular que ya era de otro contacto
- **WHEN** Ana abre su enlace en un navegador que antes se registró en la landing como otra persona
- **THEN** la apertura y el video quedan en Ana, no en la otra persona

#### Scenario: Abre sin play
- **WHEN** Jorge abre el enlace dos veces y nunca toca play
- **THEN** su enlace tiene 2 aperturas y play no

### Requirement: El video de bienvenida no se mezcla con el de las landings
Las estadísticas de video que ya existen (el panel de video de `/metrics` y los bloques de
video de `/embudos`) MUST NOT incluir el video de bienvenida.

#### Scenario: Embudos
- **WHEN** Ana vio el video de bienvenida y se abre `/embudos`
- **THEN** los bloques de video de las landings no cambian por eso

### Requirement: Panel del video de bienvenida
`/metrics` SHALL tener un panel "Video de bienvenida", visible para quien hoy abre
`/metrics`. Cuenta una persona por contacto, sin datos de prueba (contacto Julian Parra,
`contacto.julianparra@gmail.com`, nombres con `[TEST`), y SHALL mostrar cuántas personas
recibieron el enlace (marcado como enviado), cuántas lo abrieron, cuántas tocaron play y
cuántas vieron la mitad o más. Cada porcentaje MUST mostrar su base (`n`) y avisar cuando es
menor que 20.

#### Scenario: Primera semana
- **WHEN** en la primera semana 6 personas recibieron el enlace, 4 lo abrieron y 3 tocaron play
- **THEN** el panel dice 6 / 4 / 3 con un aviso de que la base es chica

#### Scenario: Enlace creado a mano
- **WHEN** Paula creó el enlace de Mario desde la ficha y nunca se lo mandaron por la plantilla
- **THEN** Mario no suma en "recibieron el enlace"

#### Scenario: Persona registrada tres veces
- **WHEN** Valeria tiene tres procesos y un enlace
- **THEN** aparece una sola vez en la lista y cuenta como una persona

#### Scenario: Datos de prueba
- **WHEN** existe un enlace del contacto Julian Parra
- **THEN** no aparece en el panel ni suma en ningún número

### Requirement: El panel compara llamadas atendidas y tasaciones coordinadas
Para los grupos "Vio el video", "Abrió sin mirar" y "No abrió", y para los registros de los
14 días anteriores al cambio contra los posteriores, el panel SHALL mostrar cuántas
personas son, qué porcentaje atendió alguna llamada y qué porcentaje coordinó la tasación.
"Atendió" excluye "No atendió" y "Número equivocado"; "Coordinó" pide un proceso del embudo,
creado desde el envío, en Coordinada o más allá.

#### Scenario: Atendió
- **WHEN** a Ana se le registraron una llamada "No atendió" y después una "Agendó"
- **THEN** cuenta como que atendió y como que coordinó

#### Scenario: Número equivocado
- **WHEN** la única llamada a Claudio dice "Número equivocado"
- **THEN** Claudio no cuenta como que atendió

#### Scenario: Comparación por grupo
- **WHEN** 5 personas vieron el video y 3 de ellas coordinaron
- **THEN** la fila "Vio el video" dice 5 personas y 60 % coordinó, con aviso de base chica

#### Scenario: Antes y después
- **WHEN** se mira la comparación con el cambio activo hace una semana
- **THEN** se ven los 14 días previos y los días desde el cambio, cada uno con su `n`, y un aviso de que las llamadas se registran recién desde el 26/11/2026

### Requirement: Lista de personas del panel
El panel SHALL listar a cada persona con nombre, fecha de envío, aperturas, minutos vistos,
porcentaje, si atendió y si coordinó.

#### Scenario: Una fila por persona
- **WHEN** Ana recibió el enlace, lo abrió 2 veces, vio 8:30 y coordinó
- **THEN** su fila muestra esos datos y "Atendió: sí", "Coordinó: sí"

#### Scenario: Celular
- **WHEN** se abre el panel a 390 px
- **THEN** la lista de personas pasa a tarjetas apiladas sin desplazamiento horizontal

### Requirement: Copiar o crear el enlace desde la ficha
La ficha de un contacto que tiene enlace SHALL mostrar "Enlace del video" con un botón
"Copiar". Un contacto con un proceso de tasación del embudo y sin enlace SHALL ofrecer
"Crear enlace del video", que crea el enlace sin mandar ningún mensaje. Lo ve quien hoy
puede editar la ficha: coordinación, dueño y admin, y el asesor en sus propios contactos. El
servidor MUST verificar que el contacto tenga un proceso del embudo.

#### Scenario: Copiar
- **WHEN** Paula toca "Copiar" en la ficha de Valeria
- **THEN** se copia `https://inmodf.com.ar/t/<código de Valeria>` y aparece "Copiado"

#### Scenario: Crear sin enviar
- **WHEN** Paula toca "Crear enlace del video" en la ficha de Mario, que se registró antes del cambio
- **THEN** Mario tiene enlace, no se le manda ningún WhatsApp, y Paula lo puede copiar

#### Scenario: Sin proceso del embudo
- **WHEN** alguien pide por la red crear el enlace de un contacto cargado a mano, sin proceso del embudo
- **THEN** recibe 400 y no se crea nada

#### Scenario: El abogado
- **WHEN** el abogado intenta crear un enlace por la red
- **THEN** recibe 403 y no se crea nada

### Requirement: Permisos de la medición
Los enlaces y su medición MUST leerse solo con permiso de operaciones o desde el servidor.
Sin sesión, MUST poder registrarse solo la apertura del propio código, a través de la ruta
de la plataforma, y nunca leerse datos de otro enlace ni preguntar a la base si un código
existe.

#### Scenario: Lectura anónima
- **WHEN** alguien sin sesión pide la tabla de enlaces a la API de la base
- **THEN** recibe cero filas

#### Scenario: Función de apertura cerrada
- **WHEN** alguien sin sesión llama directo a la función de apertura en la API de la base
- **THEN** recibe un error de permiso

#### Scenario: Apertura con un código ajeno
- **WHEN** alguien sin sesión registra una apertura con un código que existe, por la ruta de la plataforma
- **THEN** la respuesta no devuelve nombre, teléfono ni ningún otro dato del contacto
