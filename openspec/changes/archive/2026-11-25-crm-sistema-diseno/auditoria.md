# Auditoría del change crm-sistema-diseno

Registro de las auditorías de la maqueta, en orden. Todas se hicieron con Chrome sin ventana manejado por CDP, con toques y clics reales, a 390, 1024 y 1280 px (y 360 px como control). Ninguna se hizo en un teléfono real.

## 1. Auditoría previa a la revisión del dueño (2026-11-25)

**Auditor 1** = tres auditores independientes, cada uno con una mirada: la spec, el celular y el producto. Encontraron 10 hallazgos de peso (9 distintos; uno lo marcaron dos auditores) y 23 menores.

| # | Hallazgo de peso | Qué se corrigió | Cómo se verificó |
| --- | --- | --- | --- |
| 1 | «Posponer» desde la campanita no respondía: su hoja se abría detrás | Las hojas se apilan; Esc cierra la de arriba | Toque real a 390 y clic a 1280: la tarea se pospuso al primer intento y la campanita bajó de 6 a 5 |
| 2 | «Deshacer» del aviso medía 84 × 36 px en celular | Mide 84 × 44 | Medido |
| 3 | Había dos formularios distintos para crear una tarea (ficha y Pendientes) | Queda uno solo, con un único catálogo de tipos | Mismos tipos y misma hora por defecto desde los dos caminos |
| 4 | El aviso tapaba el «+» de la ficha | El aviso va arriba del «+»; hay uno solo a la vez | Aviso en 639–704, «+» en 716–772 |
| 5 | Con «volver a llamar», «Guardar llamada» quedaba fuera de la pantalla | En la hoja del celular queda pegado abajo | Visible a 390 y 360; guarda con un toque |
| 6 | Las fechas tocables eran chicas | En pantallas táctiles toda la fila muestra la fecha exacta | Toque real lejos de la fecha, en la ficha y en el Inicio |
| 7 | «Registrar» del Inicio solo abría la ficha | Abre la ficha con «Registrar llamada» ya abierto | 2 toques hasta guardar |
| 8 | El texto de alerta se veía magenta, un color que la plataforma no tiene | Rojo oscuro (mezcla en srgb) | Color medido: rgb(156, 53, 53) |
| 9 | La ficha mostraba «abrió el email», «hizo clic» y «leyó el WhatsApp», que hoy no se miden | Salieron de la ficha; quedan solo en Sistema de diseño, con la aclaración | Revisado en la captura y en el código |

De los 23 menores se aplicaron 14 (nombre único «Pendientes», filtros con 0 ocultos, tiempos de espera aclarados, conmutador de rol visible en celular, datos coherentes entre pantallas, entre otros) y 2 se dejaron a propósito; el resto eran repetidos entre auditores o decisiones para el dueño.

**Auditor 2** = un auditor nuevo que revisó la maqueta corregida y el trabajo del auditor 1. Veredicto: **conforme, cero hallazgos de peso**. Verificó una por una las nueve correcciones y la cadencia completa a 390 y 1280. Dejó 11 menores de texto y pulido, que se resolvieron después de la aprobación (sección 3).

## 2. Aprobación del dueño (2026-11-25)

El dueño aprobó la maqueta tal como estaba publicada. Ver `aprobacion.md`.

## 3. Pulido después de la aprobación del dueño (2026-11-25)

El dueño aprobó la maqueta tal como estaba. Después se corrigieron los 11 hallazgos menores que dejó el segundo auditor de la ronda 1. No se tocó estructura, layout ni comportamiento. Verificado con Chrome sin ventana manejado por CDP, con toques y clics reales.

| # | Hallazgo | Qué se hizo | Cómo se verificó |
| --- | --- | --- | --- |
| 1 | «Vencida / Espera hace 28 min» según la pantalla | «Espera hace N min» en el Inicio, la campanita y Pendientes para la primera llamada de un lead recién entrado | Texto leído en los tres lugares a 390 y 1280: «Espera hace 28 min». Marcela sigue «Vencida hace 1 h». Cero «Vencida hace N min» en pantalla |
| 2 | Día y Hora seguían en rojo tras el atajo | Se saca el error al elegir un atajo o completar los campos | Tras Guardar vacío: borde rojo. Tras «Mañana 10:00»: sin `aria-invalid` y borde gris normal. Con hora pasada sigue marcando error |
| 3 | Foco perdido al llegar desde «Registrar» (celular) | El foco va a la primera opción de la hoja | A 390, `document.activeElement` = «No atendió». Un toque más guarda la llamada |
| 4 | «Guardar llamada» cortado 6 px a 1280×800 | La página se acomoda al elegir «volver a llamar» | Botón en 748–784 de 800, entero |
| 5 | «Recibió el email» afirmaba algo que no se mide | Ahora dice «Se le envió el email …» (ficha y Sistema de diseño) | Cero «Recibió el email» en todo el documento |
| 6 | Tarjeta «Error» seguía titulada así con datos | Se titula «Con datos» cuando muestra tareas (también la de «Vacío») | Reintentar → «Con datos»; «Ver el error otra vez» → «Error»; crear → «Con datos»; vaciar → «Vacío» |
| 7 | Inicio del asesor dice 1 y Pendientes «1 vencida · 1 para hoy» | El primer bloque aclara «Además tenés 1 visita hoy: está en «Mis visitas y tasaciones de hoy»» | Texto leído a 390 y 1280 |
| 8 | «…como vista del dueño» y una persona «Dueño» | «Ahora ves la plataforma como la ve el dueño.» y nombre ficticio Raúl Maidana | Aviso leído tras el clic; selectores: «Paula · Tomás Agüero · Raúl Maidana» |
| 9 | «Mis tareas» en el selector del celular | Dice «Mías», como el chip de escritorio | Opciones leídas a 390 |
| 10 | Tablet táctil con botones de 36 px y letra de 14 px | Con dedo (`pointer: coarse`) se mantienen 44 px y 16 px desde 768 | Con táctil emulado a 768, 1024 y 1280: campos a 16 px, sin scroll horizontal y botones, pestañas y filtros a 44 px. **Corrección posterior:** esta fila decía «ningún tocable bajo 44 px» y era falso a 1024 y 1280: los ítems del menú lateral fijo quedaban en 32 px. Se corrigió en la sección 5, hallazgo 1. Con mouse: todo igual que antes (36 px, 14 px) |
| 11 | Faltaban `auditoria.md` y `aprobacion.md` | Este archivo ya existe; se creó `aprobacion.md` con la aprobación | Archivos presentes en el change |

Prueba de punta a punta repetida: cadencia completa a 390 y 1280 (Llamada 2 → Enviar WhatsApp → WhatsApp marcado → tercera «No atendió» sin tarea), sin scroll horizontal a 390, 1024 y 1280 en las seis vistas, cero errores de consola y cero diálogos nativos. Las 43 capturas de `maqueta/capturas/` se regeneraron; 14 quedaron idénticas byte a byte a las anteriores (pantallas que no cambiaron).

No se probó en un iPhone ni en un iPad reales: el táctil de tablet se verificó emulado.

## 4. Auditoría final, tras la aprobación (2026-11-25)

Tres auditores nuevos (spec, celular y producto) revisaron la maqueta aprobada y pulida. Resultado: **cero hallazgos de peso** y 26 menores, varios repetidos entre auditores. Los tres confirmaron que se cumplen los escenarios de la spec: tres toques para «No atendió», sin desplazamiento horizontal, la cadencia completa, la etapa que nunca cambia sola y los números que cierran entre pantallas.

Regla de esta ronda: la maqueta aprobada manda. Donde la spec decía otra cosa, se corrigió la spec. En la maqueta solo se tocó pulido, sin cambiar estructura, layout ni comportamiento.

### Correcciones de la ronda 1

| # | Hallazgo | Qué se hizo | Cómo se verificó |
| --- | --- | --- | --- |
| 1 | La spec decía «título en una línea» y en la ficha hay títulos de dos renglones (3 auditores) | Spec corregida: título corto de hasta dos renglones, y en táctil toda la fila muestra la fecha. En Sistema de diseño los títulos largos ahora también pasan a dos renglones en vez de cortarse con «…» | A 360 y 390: ningún título cortado en Sistema de diseño; «Pasó de Solicitud a Tasación agendada» se lee entero |
| 2 | Al tocar «+» → «Registrar llamada» el foco quedaba perdido (2 auditores) | El foco va a «No atendió» | A 390 y 360, con toques reales: elemento activo = «No atendió»; el tercer toque guarda |
| 3 | Al tocar «+» → «Nota» el foco no iba al campo | El foco va al campo de la nota en el mismo toque | Texto escrito sin tocar el campo, guardado y primero en la línea de tiempo |
| 4 | En escritorio, tras guardar una llamada el foco quedaba perdido | El foco va al aviso de lo que pasó | A 1280: elemento activo = el aviso «Llamada 1 · No atendió» |
| 5 | En el Inicio el nombre respondía en 41 px de alto y la fecha en 34 × 25 | 3 px más de aire bajo el nombre (solo táctil) y la zona de la fecha ya no sube sobre él. La fecha exacta se ve tocando cualquier parte del bloque de la persona | Nombre: 44 px de alto en toda su zona. Bloque que muestra la fecha: 324 × 46 o más a 390 y 294 × 46 o más a 360. Toque real lejos de la fecha: muestra «lun 23 nov 2026, 11:30»; toque al borde del nombre: abre la ficha |
| 6 | En la línea de tiempo la fecha respondía en 44 × 40 | **Sin cambio.** Lo tocable es el renglón entero del evento, no la fecha sola (así quedó desde la ronda previa) | Renglón más bajo de la ficha: 65 px. Toque real en el ícono del evento: cambia solo la fecha de ese evento |
| 7 | A 360 × 740, Día y Hora quedaban a medias detrás de «Guardar llamada» | Al elegir «volver a llamar» el cuerpo de la hoja se desplaza lo justo | A 360: Día y Hora en 612–656, «Guardar» en 680–724, las cuatro esquinas de cada campo a la vista. A 390 no cambia nada |
| 8 | Tres textos de Sistema de diseño ya no coincidían con la maqueta | Corregidos: tablets táctiles a 44 px, título de hasta dos renglones, y «No atendió» primero como único resultado que guarda con un toque | Textos y orden leídos de la pantalla |
| 9 | La captura `campanita-390` mostraba 5 avisos y las demás 6 | `campanita-390` y `campanita-1280` salen del estado inicial (6 avisos). La de después de la llamada pasa a llamarse `flujo-campanita-tras-llamada-*` | «Avisos · 6» leído en las dos capturas. Se regeneraron todas; ahora son 45 |
| 10 | La spec no describía varias cosas aprobadas (campanita, Pendientes, Inicio de asesor y admin, registro de llamadas, métricas, táctil en tablet, cabecera de la ficha, «Espera hace N min») | Spec ampliada: 4 requisitos nuevos y 24 escenarios nuevos (14 requisitos y 39 escenarios en total) | `openspec validate crm-sistema-diseno --strict`: válido |
| 11 | «Se le envió el email …» puede no existir hoy | Spec: ese evento se muestra solo si el inventario de emails de `crm-linea-de-tiempo` lo confirma. La maqueta no se tocó | Escenario «Email enviado a la persona» |
| 12 | `auditoria.md` tenía un volcado técnico ilegible y `tasks.md` casillas sin tildar | Este archivo se reescribió en castellano; se tildaron 3.2, 3.3 y 4.1 a 4.3 | Archivos revisados |

### Hallazgos que no llevan cambio en la maqueta

- **El aviso negro tapa unos segundos lo que queda debajo** (filtros, un renglón de «Lo que viene», «Mostrar 25 más» a 360). Se deja así: se va solo, no tapa el «+» ni «Deshacer», y moverlo arriba taparía la cabecera fija.
- **Celular acostado (740 × 360):** quedan unos 77 px para la línea de tiempo. Está fuera de los anchos de la spec; se anota abajo para la ficha real.
- **`openspec validate` «no instalado»:** no hace falta instalarlo. Corre con `npx -y @fission-ai/openspec@2.2.0 validate crm-sistema-diseno --strict` y da válido.

### Para los changes siguientes (no se resuelve acá)

1. **`crm-ficha-y-llamadas` — tildar una tarea de la cadencia sin registrar qué pasó.** Hoy, si se tilda «Llamada 2 a …» o «Enviar WhatsApp a …» (desde Pendientes, la campanita o el Inicio), la persona sale de todas las listas del Inicio sin que quede anotada ninguna llamada ni WhatsApp. Hay que decidir: que el tilde abra «Registrar llamada» o «Marcar WhatsApp enviado», o que la persona siga en una lista del Inicio.
2. **`crm-ficha-y-llamadas` — celular acostado.** Con menos de 480 px de alto, que la cabecera de la ficha no quede fija.
3. **`crm-linea-de-tiempo` — nombres.** Toda tarea automática debería decir «Tarea creada sola» (la primera, que crea el embudo, hoy dice «Tarea creada»). Evaluar otro nombre para el filtro «Actividad», que en celular queda dentro de la pestaña «Actividad».
4. **`crm-linea-de-tiempo` — inventario de emails.** Confirmar si existe el email «Recibimos tu solicitud de tasación» que se le manda a la persona; si no existe, el evento no se muestra.
5. **`crm-inicio` — orden del Inicio del admin.** En celular los bloques se ven en un orden distinto al del HTML. En la pantalla real, ordenarlos en el HTML igual que se ven, para teclado y lector de pantalla.
6. **`crm-ficha-y-llamadas` — qué puede hacer el admin en la ficha.** En el Inicio del admin los bloques de coordinación son de solo lectura (sin llamar ni registrar), pero al tocar el nombre se abre la ficha con «Llamar» y el «+». No contradice esta spec, que habla solo de los bloques del Inicio. Las specs de `crm-ficha-y-llamadas` ya lo permiten (admin y dueño abren cualquier ficha y registran llamadas: «Coordinación y dueños nunca son ajenos»); falta que el dueño lo confirme al revisar ese change.
7. **`crm-ficha-y-llamadas` o `crm-inicio` — proceso abierto que quedó sin tarea.** Es el mismo problema del punto 1, por otro camino: si después de «Número equivocado» o «No le interesa» se elige «Dejarlo abierto», el proceso sigue abierto, sin tarea y fuera de todas las listas del Inicio (en la maqueta: Nélida Ferrari). Hay que decidir dónde se ve. La propuesta de `crm-ficha-y-llamadas` ya nombra una «lista de solicitudes sin tarea» para `crm-inicio`: confirmar que cubre este caso.
8. **`crm-ficha-y-llamadas` — texto del bloque «Procesos».** Junto a la etiqueta «Perdida», «Abierto 17 nov» se lee como si el proceso siguiera abierto. Usar «Se abrió el 17 nov» o «Desde el 17 nov».
9. **`crm-ficha-y-llamadas` — una sola constante de horario.** La métrica del admin dice «Hábiles: lunes a viernes de 9 a 13» y los atajos de «volver a llamar» ofrecen las 16:00. Cuando Paula confirme el horario real, los atajos y el texto de la métrica tienen que salir de la misma constante.
10. **`crm-inicio` — aire sobre los botones y teléfono del admin.** (a) En «Para llamar ahora», dejar 12 px o más entre el último renglón de texto y los botones: a 360 px, un toque en ese renglón a unos 10 px del botón «Registrar» abrió la ficha en 2 de 3 corridas en vez de mostrar la fecha exacta (a 390 nunca pasó; no se pierde nada). (b) En el Inicio del admin el teléfono se muestra con ícono pero es solo texto: decidir si va sin ícono o como enlace para llamar.
11. **Todos los changes que construyen pantallas — prueba en un teléfono real.** Todo lo táctil de esta maqueta (44 px, letra de 16 px, hojas, tablet con dedo) se midió con la emulación de Chrome, nunca en un teléfono ni una tablet reales, y nunca con el teclado en pantalla abierto. El zoom automático del iPhone solo se ve en un iPhone: el QA de la ficha real se hace en uno.

## 5. Segunda auditoría de la ronda final (2026-11-25)

Un auditor nuevo revisó la maqueta, la spec y las correcciones de la sección 4. Encontró **2 hallazgos de peso** y 6 menores. Los ocho se atendieron. La maqueta aprobada manda: no se tocó estructura, layout ni comportamiento.

| # | Peso | Hallazgo | Qué se hizo | Cómo se verificó |
| --- | --- | --- | --- | --- |
| 1 | De peso | En tablet táctil a 1024 y 1280 los 6 ítems del menú lateral medían y respondían en 32 px. La sección 3 (fila 10) afirmaba lo contrario | Una línea en el bloque táctil de `base.css`: `.menu__item` vuelve a 44 px cuando lo que apunta es un dedo. Se corrigió la frase de la fila 10 | Táctil emulado a 1024 y 1280: los 6 ítems miden 223 × 44 y responden en 44 px (punto por punto). Toque real a 41 px del borde superior de «Pendientes»: abre Pendientes. Con mouse siguen en 32 px. Sin scroll horizontal |
| 2 | De peso | El escenario «Primera llamada de un lead sin llamar» decía «Espera hace 28 min» para toda persona sin llamadas. La maqueta aprobada muestra «Vencida hace 1 h» para Marcela Ibáñez, que entró fuera de horario | **Maqueta sin cambio.** El escenario se partió en dos: quien entró en horario hábil (la tarea vence al registrarse) dice «Espera hace…»; quien entró fuera de horario (tarea a las 9:00 del día hábil siguiente) dice «Vencida hace…» contando desde las 9:00 | Leído en Inicio, Pendientes, campanita y ficha: Marcela «Vencida hace 1 h» (se registró ayer 18:20, tarea hoy 9:00); Patricia «Espera hace 28 min» (registro y tarea 10:12). `openspec validate --strict`: válido |
| 3 | Menor | La spec dice que «Se le envió el email» no se muestra si el inventario no lo confirma; la maqueta lo muestra | **Maqueta sin cambio.** La spec aclara que en la maqueta ese evento es un ejemplo y que en la ficha real depende del inventario de `crm-linea-de-tiempo` | Texto de la spec |
| 4 | Menor | En Sistema de diseño a 360 el título de tarea «Pedir la escritura del departamento de Belgrano» se cortaba con «…» | En `#estados` el título de una tarea pasa a dos renglones, igual que en Pendientes | A 360 y 390: 0 textos cortados en la pantalla; ese título ocupa dos renglones (captura revisada) |
| 5 | Menor | A 1280 × 800, al abrir «Corregir la hora» con «volver a llamar», «Guardar llamada» quedaba fuera de la vista (851–887 de 800) | Al abrir «Corregir la hora» en escritorio la página se acomoda | «Guardar llamada» en 748–784 de 800, entero; clic real: guarda la llamada. Con «Atendió y agendó»: 678–714. En la hoja del celular no cambia |
| 6 | Menor | El admin no puede llamar ni registrar desde su Inicio, pero sí desde la ficha | Sin cambio en la maqueta. Anotado para `crm-ficha-y-llamadas` (punto 6 de la lista de arriba) | Inicio del admin: 0 enlaces de llamar y 0 «Registrar»; la ficha abre con «Llamar» y «+» |
| 7 | Menor | La spec no decía que el asesor completa tareas con un tilde desde el Inicio ni que hay un sub-bloque «Para mañana» | Sumado al escenario «Asesor» | En la maqueta: el primer bloque del asesor tiene tildes; un toque real completa la tarea sin salir del Inicio; debajo figura «Para mañana · 1» |
| 8 | Menor | La tarea 4.4 seguía abierta | Sigue abierta: falta la verificación corta de esta sección | Ver «Estado» |

La spec queda con 14 requisitos y 40 escenarios. `index.html` se volvió a armar con `armar.py` y las 45 capturas se regeneraron: son iguales a la vista a las anteriores (ninguna muestra el menú en modo táctil ni el título de tarea a 360). Cadencia completa repetida a 390 y 1280 con el mismo resultado que en la ronda anterior, cero errores de consola y cero diálogos nativos.

No se probó en un iPad real: el táctil de tablet se verificó emulado.

## 6. Tercera auditoría de la ronda final (2026-11-25)

Tres auditores nuevos (spec, celular y producto) hicieron la verificación que faltaba. Los tres comprobaron por su cuenta que los 2 hallazgos de peso de la sección 5 están resueltos: el menú lateral mide y responde en 44 px con dedo a 1024 y 1280, y Marcela dice «Vencida hace 1 h» y Patricia «Espera hace 28 min» en Inicio, campanita, Pendientes y ficha.

Encontraron **1 hallazgo de peso** (el auditor de spec; los de celular y producto, ninguno) y 13 menores, varios repetidos. Ninguno pedía tocar la maqueta: todos eran diferencias entre la spec y la maqueta aprobada, o notas para los changes siguientes. **La maqueta no se tocó**: `armar.py` volvió a generar un `index.html` idéntico byte a byte al anterior, así que las 45 capturas siguen valiendo y no se regeneraron.

| # | Peso | Hallazgo | Qué se hizo | Cómo se verificó |
| --- | --- | --- | --- | --- |
| 1 | De peso | El escenario «Filtro por tipo» decía, sin distinguir ancho, que cada tipo muestra su cantidad. A 390 el filtro es un selector sin cantidades | **Maqueta sin cambio.** Spec corregida: en escritorio cada tipo es un botón con su cantidad; en celular el selector lista solo los nombres; en los dos casos un tipo sin tareas no se muestra | Leído de la pantalla. A 1280: «Todas 634 · Llamada 129 · Mensaje 65 · Documentación 64 · Otro 376». A 390: «Todos los tipos · Llamada · Mensaje · Documentación · Otro». Con el asesor, en los dos anchos, quedan solo Llamada, Visita y Otro |
| 2 | Menor | La spec no decía que el asesor no tiene filtro «De quién» | Escenario «Filtro por persona» acotado a coordinadora y admin; escenario nuevo «El asesor ve solo lo suyo»; «Celular» dice dos selectores para coordinadora y admin, uno para el asesor | Asesor a 1280: «Todas 4 · Llamada 1 · Visita 2 · Otro 1», sin el renglón «De quién». A 390: el selector de persona no se ve. Coordinadora y admin: «Mías · … · Todo el equipo» en los dos anchos |
| 3 | Menor | La spec decía que todo bloque que un rol solo consulta dice «Solo lectura»; en el Inicio del admin lo dicen solo los tres de coordinación | Frase afinada: dicen «Solo lectura» los bloques que en otro rol tienen botones de llamar, registrar o completar. El escenario «Admin o dueño» nombra los tres | Inicio del admin a 390 y 1280: 7 bloques; «Para llamar ahora», «Sin respuesta tras WhatsApp» y «Tareas de hoy · coordinación» con la etiqueta; los otros 4 sin ella; 0 botones y 0 enlaces de llamar en los 7 |
| 4 | Menor (2 auditores) | La spec decía solo «con el tiempo de espera» para «Leads sin primer contacto» | Escenario nuevo «Espera de un lead sin primer contacto»: se cuenta desde el registro, en reloj y, si difiere, en horas hábiles, con quién la llama; y aclara que es otra cuenta que el vencimiento de la tarea | Leído: Marcela «Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles · la llama Paula»; Patricia «Espera hace 28 min · la llama Paula» |
| 5 | Menor | Seis piezas aprobadas no figuraban en la spec | Escenario nuevo con los bloques de la coordinadora («Tareas de hoy» con tilde y «Para mañana», «Tasaciones · hoy y mañana», los tres números del día) y requisito nuevo «Piezas aprobadas que se detallan en otros changes», con 5 escenarios cortos: filtros de la línea de tiempo, Background, corregir la hora, formulario único de nueva tarea con cinco tipos, y «Tasaciones agendadas» solo cuando hay | Bloques de la coordinadora leídos a 390 y 1280; el resto confirmado en el código de la maqueta (`ficha.html`, `ficha.js`, `base.js`) |
| 6 | Menor | «Abierto 17 nov» junto a «Perdida» se lee al revés | Sin cambio en la maqueta. Anotado: punto 8 de la lista de arriba | — |
| 7 | Menor | Nélida Ferrari: proceso abierto, sin tarea y fuera de todas las listas | Sin cambio en la maqueta. Anotado: punto 7 | — |
| 8 | Menor | «Hábiles de 9 a 13» y atajos a las 16:00 | Sin cambio en la maqueta. Anotado: punto 9 | — |
| 9 | Menor | A 360, un toque a 10 px del botón «Registrar» abrió la ficha en 2 de 3 corridas | Sin cambio en la maqueta. Anotado: punto 10 (a) | No se volvió a reproducir en esta ronda; se toma tal como lo informó el auditor |
| 10 | Menor | En el Inicio del admin el teléfono parece tocable y es texto | Sin cambio en la maqueta. Anotado: punto 10 (b) | 0 enlaces `tel:` en el Inicio del admin |
| 11 | Menor | Nunca se probó en un teléfono ni una tablet reales | Anotado: punto 11. La prueba en el celular es la del dueño | — |
| 12 | Menor (3 auditores) | Faltaba registrar esta verificación y tildar 4.4 | Esta sección; «Estado» actualizado; 4.4 tildada | Ver «Estado» |

Ningún hallazgo se rechazó: todos se comprobaron en la maqueta antes de tocar la spec.

La spec queda con 15 requisitos y 48 escenarios. `npx -y @fission-ai/openspec@2.2.0 validate crm-sistema-diseno --strict`: válido. En la corrida de verificación: cero errores de consola y cero diálogos nativos.

### Estado

**Cerrado.** Los 2 hallazgos de peso de la sección 5 fueron verificados por tres auditores nuevos. El único hallazgo de peso de la sección 6 era una línea de la spec que no describía la maqueta aprobada; se corrigió la spec, la maqueta no cambió y la validación estricta pasa. Esa última corrección la verificó quien la hizo, leyendo la pantalla a 390 y 1280; no pasó por otro auditor. La tarea 4.4 queda tildada. Sigue pendiente la 4.5 (PR).
