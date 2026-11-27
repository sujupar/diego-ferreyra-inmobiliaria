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
