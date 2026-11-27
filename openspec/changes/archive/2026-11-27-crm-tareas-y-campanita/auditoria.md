# Auditoría

## Ronda 1: artefactos (auditor independiente, 2026-11-27)

Confirmó todos los datos del diseño contra el código y la base, por ejemplo 638 pendientes, 628 sin fecha y el tope de 50. Encontró 22 hallazgos: 3 ALTA, 12 MEDIA y 7 BAJA. Cuando auditó ya estaban hechas las tareas 2.1, 2.2 y 3.1. Todos se corrigieron en `9dcad4fc`, `6d3ca991`, `63fdf275` y en los documentos.

| # | Sev. | Hallazgo | Corrección |
|---|---|---|---|
| 1 | ALTA | No se podía deshacer un "Posponer" (la fecha anterior está vencida o vacía) | `posponer` con `deshacer:true`, que solo escribe si la tarea sigue con lo que se le puso |
| 2 | ALTA | Con la entrada con fecha, la cartera y la ficha perdían el "Espera hace" | Una sola regla (`vencimientoDeEntrada`) en la cartera y Pendientes; la espera se conserva con fecha |
| 3 | ALTA | Las dos copias de la entrada nunca se cierran (1 de 126 en 60 días): la campanita llegaría a "99+" | Decisión 5 al dueño (aplicada): trigger que las completa al salir de Solicitud y completar una completa la otra |
| 4 | MEDIA | La regla de madrugada estaba mal escrita en spec y diseño | Corregida, con escenario |
| 5 | MEDIA | El corte de avisos tenía dos definiciones | 00:00 de Argentina del día de publicación |
| 6 | MEDIA | `esperaDesde` comparaba con la creación de la tarea | Compara con el alta del proceso (`proceso:deal_id(created_at)`) |
| 7 | MEDIA | `registradoEn` sin tarea ni test | Hecho en `construirTrabajos` con su test |
| 8 | MEDIA | Crear con una hora ya pasada no se validaba | 400 en el validador, con test |
| 9 | MEDIA | Propuesta y diseño discrepaban sobre el Inicio | La propuesta dice que el Inicio no crea tareas |
| 10 | MEDIA | Specs vigentes contradichas sin delta | MODIFIED de "Filtros con nombre" y "Pie de las listas largas" con la excepción de Pendientes |
| 11 | MEDIA | El "Seguimiento" del proceso, otro formulario, usa UTC y "Correo" | Tarea 4.6 |
| 12 | MEDIA | La tarea de entrada abría el editor, no la ficha | Abre la ficha |
| 13 | MEDIA | Reabrir y posponer sin guardas | Reabrir no toca lo que cerró una llamada; posponer solo pendientes |
| 14 | MEDIA | "Por la red" ambiguo | "Por la API de la plataforma"; las policies quedan en Risks |
| 15 | MEDIA | Faltaba la lista de quién emite `tareas:cambio` | Listada en D5 |
| 16 | BAJA | El escenario "fuera de horario" estaba mal escrito | Reescrito |
| 17 | BAJA | "Actualizar contacto" se mostraba como Llamada | Pasa a Otro |
| 18 | BAJA | No estaba definido el filtro "De quién" | Activos, incluido el abogado; admin y dueño arrancan en "Todo el equipo" |
| 19 | BAJA | Diferencias no declaradas ("En 1 hora" redondeado, texto de error) | Declaradas |
| 20 | BAJA | Índice y relectura | Anotado en D2 |
| 21 | BAJA | El Inicio va a mostrar otro número | Anotado en Risks hasta `crm-inicio` |
| 22 | BAJA | "Ver como" | La campanita es siempre de quien está conectado |

## Ronda 2: revisión de código (revisor independiente, sobre `302c1a5c`)

No encontró problemas de permisos. Hubo 3 hallazgos MEDIA y 6 BAJA, todos corregidos en `de899b5d`:

1. MEDIA — El "Deshacer" de completar no reabría la copia de la otra coordinadora. Ahora la reabre.
2. MEDIA — "Deshacer perdido" dejaba el lead sin tarea de entrada. Se agregó el camino inverso del trigger.
3. MEDIA — En el celular, el panel de la campanita quedaba abierto después de tocar una tarea. Ahora se cierra al ir.
4. BAJA — La campanita no descartaba respuestas viejas. Se agregó un número de versión.
5. BAJA — Completar cerraba las copias aunque la tarea pedida no estuviera pendiente. Ahora solo las cierra si cambió.
6. BAJA — La hora del "Deshacer" no se validaba bien y podía dar 500. Ahora es estricta y da 400.
7. BAJA — La espera se calculaba distinto en cada pantalla. La cartera usa ±5 min y la ficha, el alta del proceso.
8. BAJA — Pendientes no avisaba si fallaba un filtro, y "Mostrar 25 más" se mezclaba con otro filtro. Ahora hay aviso y número de versión.
9. BAJA — Los chips medían 36 px en pantallas táctiles y el foco no entraba al panel. Ahora miden 44 px y el foco va a "Cerrar los avisos".

## QA en la vista previa (2026-11-27)

Se probó con un contacto `[TEST]`: 34 tareas de cuentas de prueba, dos procesos sin origen y email suprimido.

- **Pendientes:**
  - El resumen es exacto ("2 vencidas · 2 para hoy · 1 próxima · 27 sin fecha") y los grupos coinciden.
  - "Mostrar 25 más" pasó de 25 a 27 filas.
- **Campanita:**
  - Mostró 3, con las vencidas, "Ahora" y "Lo que viene" correctos.
  - Completar desde el panel bajó el número de 3 a 2, y "Deshacer" lo volvió a 3.
- **Acciones:**
  - Posponer "En 1 hora" dejó la tarea para hoy a las 16:35, y "Deshacer" la devolvió a su fecha.
  - Crear sin día mostró «Sin fecha».
- **Permisos:** el asesor no tiene "De quién", recibe 403 sobre la tarea de otro y, si pide las de todo el equipo, recibe las suyas.
- **Tareas de entrada:**
  - Completar una completa la copia.
  - "Deshacer" reabre las dos.
  - Descartar las cierra y "Deshacer perdido" las reabre.
  - En el celular, tocar una tarea cierra el panel, y al abrirlo el foco va a "Cerrar".
- **Pantalla:** a 390 px no hay desplazamiento horizontal.
- **Tiempos:** avisos en ~620 ms y agenda de todo el equipo en ~740 ms.
- **Consola:** sin errores propios. Los 403 son de pantallas que ya existían (`/api/consultas/avisos`, revisión legal) y del 403 provocado a propósito.

## Ronda 3: auditoría de cierre (revisor independiente, sobre `de899b5d`)

Confirmó que los arreglos de la ronda 2 están bien. Encontró 1 ALTA, 1 MEDIA y 9 BAJA, corregidos en `53cef18a` o documentados:

1. ALTA — La tarea de entrada de la clase gratuita sonaría para siempre: su proceso nunca pasa por Solicitud. Ahora nace sin fecha.
2. MEDIA — El camino inverso reabría tareas completadas a mano. Ahora actúa solo en "Deshacer perdido" y solo sobre lo que cerró el trigger. Se agregaron dos casos al script.
3. BAJA — Un 23505 en el camino inverso tiraba abajo el cambio de etapa. Ahora se captura y el cambio sigue.
4. BAJA — `desde_fecha` y `desde_hora` no se validaban. Ahora dan 400, con test.
5. BAJA — El "Deshacer" de completar reabría copias aunque el proceso ya no estuviera en Solicitud. Ahora no las reabre.
6. BAJA — Pedir las tareas de una persona inactiva devolvía sus tareas. Ahora devuelve una lista vacía, con test.
7. BAJA — Si fallaba un filtro, el chip quedaba marcado con una selección que no se veía. Ahora los filtros vuelven al último que se pudo mostrar.
8. BAJA — Si nunca se pudo leer, la campanita decía "todo al día". Ahora dice "Avisos: no se pudieron leer".
9. BAJA — La espera en la ficha se medía desde la creación de la tarea. Ahora se mide desde el alta del proceso.
10. BAJA — Cada cambio vuelve "Sin fecha" a las primeras 25. Queda documentado en Risks.
11. BAJA — Faltaba revisar `INICIO_AVISOS` y borrar los datos de prueba. Son las tareas 6.2 y 6.3.
