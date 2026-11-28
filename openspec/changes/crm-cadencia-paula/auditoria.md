# Auditoría

## Artefactos (1.3, 2026-11-28)

| # | Sev. | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | Alta | El aviso del WhatsApp "ya" diría "para recién" | "para ahora"; escenario y D3 |
| 2 | Alta | Las tareas "todo el día" pasarían a avisar a las 10:00 | Constante propia `HORA_AVISO_TODO_EL_DIA = '09:00'`; no cambia |
| 3 | Media | "La hora SHALL ser las 10:00" contradice 13:30 y "ya" | Acotado a "cuando va al día hábil siguiente" |
| 4 | Media | Escenarios con "dos no atendidas" en otros requisitos | MODIFIED de «El WhatsApp marcado termina la secuencia» y «Registrar una llamada cierra lo pendiente» |
| 5 | Media | 9:00 / 2 llamadas en otras specs | Deltas de `crm-sistema-diseno`, `crm-cartera` e `inicio` |
| 6 | Media | 13:30 por número o por racha | Por racha; escenario "Llamada 5" |
| 7 | Media | Hora de carga vs hora corregida | Manda la de carga; escrito y con escenario |
| 8 | Baja | La regla del WhatsApp duplica `vencimientoDeEntrada` | Se mueve a `horario-laboral.ts` y se comparte; borde "10:00 a 13:59" |
| 9 | Baja | Bordes de la Llamada 2 y madrugada | Escenarios: 12:00, sábado, madrugada |
| 10 | Baja | El WhatsApp nace vencido | Escenario: es para hacerlo ya |
| 11 | Baja | Textos y comentarios con 9:00 / 9 a 18 | Listados en la tarea 2.4 |
| 12 | Baja | Tests que se rompen | Listados en la tarea 2.4 |
