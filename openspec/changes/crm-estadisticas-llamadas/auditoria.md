# Auditoría

## Artefactos (1.3, 2026-11-28)

Auditoría independiente de proposal, design y spec contra el código. Nota: la tarea 2.1 se
adelantó a esta auditoría; sus hallazgos se aplicaron también al código ya escrito.

| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1 | Llamada ligada con hora corregida antes del registro contaba como "al instante" | No cuenta (ninguna llamada anterior a la solicitud); escenario nuevo |
| 2 | "Mismo contacto" juntaba llamadas de otros procesos y rompía la numeración de la ficha | Por proceso: `deal_id` igual, o sin proceso del mismo contacto; escenario nuevo |
| 3 | "Sin ningún intento" ignora los WhatsApp del Inbox | Renombrado "Sin llamada ni WhatsApp registrado"; la fuente lo dice |
| 4 | El Inicio ya tiene "Tiempo medio a la primera llamada" con otra población | Documentado en el diseño; nombre distinto en el Tablero ("Primera llamada") |
| 5 | "Agendados" no cuadra con "Agendadas" del embudo | "Agendaron en una llamada" con escenario que lo aclara |
| 6 | Persona con varios contactos o procesos | Cubierto por la regla por proceso (2); documentado |
| 7 | "Contactados" mide otra cosa | "Atendieron una llamada" |
| 8 | "Nada de adorno": secciones vacías | Una línea sin solicitudes; sin llamadas, solo la cuenta |
| 9 | Error sin "Reintentar" en el bloque | "Reintentar" dentro de la sección |
| 10 | Período anterior a la medición y el corte del 26/11 | Texto propio para períodos anteriores; recorte por hora exacta |
| 11 | Sesgo de supervivencia en la mediana | El cuadro dice cuántas siguen sin llamar |
| 12 | Renumerar las secciones aprobadas | Va como sección 5; dice "Sin comparar" |
| 13 | Orden y piso de la lectura | Orden por `id` (único); piso por `created_at` desde el día anterior al período |
| 14 | Período en curso | La fuente avisa que todavía pueden avanzar |
| 15 | Escenarios imprecisos | Horas concretas; "Pocos casos" en el reparto; clase e históricas afuera |

## Revisión de código (4.2)

Sin bugs de lógica (exclusiones, orden, mediana, horas hábiles, frontera de la medición,
paginación, fallas aisladas, divisiones y plurales verificados).

| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1 | Horas hábiles mostradas en días de 24 h ("1 día 21 h" para una semana hábil) | `horasHabiles`: solo horas y minutos ("45 h"), con test |
| 2 | Llamada sin resultado entraría en el total y en ninguna fila | No aplica: el CHECK `contact_activities_outcome_solo_llamadas_check` y `_outcome_check` exigen uno de los cinco resultados en toda llamada |
| 3 | Persona sin su proceso en `deals` se saltea | No aplica: las personas salen de esas mismas filas de `deals` |

Script de reglas sobre la base real (`_qa-llamadas-reglas.ts`, dentro de una transacción que se
deshace): 6 casos `[TEST]` (agendó en la 1, agendó en la 2 con una anulada, sin proceso, solo
WhatsApp, nada, hora corregida antes del registro) → los números esperados; 0 filas después.
