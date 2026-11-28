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

## Revisión de código (3.2)

Sin bugs en el núcleo (zona horaria, comparación de horas, bordes de 12:00/14:00, madrugada,
fin de semana, reintentos, "para ahora" solo cuando venció).

| # | Sev. | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | Media | "Tarea creada sola" del historial seguía diciendo "recién"/"hace N" | `vencimientoEnHistorial`: futura relativa, pasada con día y hora exactos; sin el 9:00 muerto como hora de la cadencia |
| 2 | Baja-media | Atajos de "Volver a llamar" a las 16:00, fuera del horario | "Hoy 13:30", "Mañana 10:00", "Mañana 13:00" (D4; deltas de `crm-sistema-diseno` y `crm-registro-actividad`; el nombre del escenario vigente no se puede renombrar en un MODIFIED y queda como estaba) |
| 3 | Baja | Tareas de entrada ya creadas con la hora vieja | Aceptado: transitorio, se ordena solo al cerrarse |
| 4 | Baja | Comentario "un día hábil tiene 9 h" | Corregido |
| 5 | Baja | Reloj del navegador atrasado mostraba "recién" | 60 s de margen en `paraCuando`, con test |

## QA en la vista previa (3.3, deploy-preview-109, sábado 28/11)

Contacto y solicitud `[TEST]` (sin email, origin vacío), tres "No atendió" como coordinación
por `POST /api/contacts/[id]/activities`: Llamada 1 → "Llamada 2" lun 30/11 10:00; Llamada 2 →
"Llamada 3" lun 10:00 (la 2 se completó sola); Llamada 3 → "Enviar WhatsApp" lun 10:00 (la 3
se completó sola). La ficha muestra "Enviar WhatsApp …, lun 30 nov, 10:00". Borrado: 0 filas.
El caso "esa tarde a las 13:30" no se puede ver un sábado: lo cubren los tests de `cadencia.ts`.
