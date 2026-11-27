# Auditoría

## Auditoría de artefactos (tarea 1.3)

Revisión independiente de propuesta, specs, diseño y del código de las tareas 2.x. 20 hallazgos.

| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1 | La cola era por coordinadora: la llamada vencida de Julia no le aparecía a Paula | Cola única: se leen las tareas de TODAS las coordinadoras |
| 2 | Las tareas solo del contacto (agendadas desde la ficha) no contaban | Las pendientes se cruzan por proceso y por contacto |
| 3 | Las solicitudes contactadas sin WhatsApp y sin tarea no aparecían en ningún lado | Bloque nuevo "Sin próximo paso" (requisito nuevo) |
| 4 | El filtro "desde el registro" sacaba también las llamadas vencidas viejas | Aplica solo a "sin primer contacto" |
| 5 | "Llamar a…" quedaba afuera (se filtraba por título) y "Llamada N" salía del título | Se filtra por tipo `llamada`; N = llamadas registradas + 1 |
| 6 | Una fuente de la cartera que fallaba se mostraba como vacía | Si falla o viene cortada, los bloques que dependen de ella van con error |
| 7 | Los números del día contaban referidos y llamadas anuladas, por fecha de carga | `origin='embudo'`, sin anuladas, por `occurred_at` |
| 8 | La vista del dueño incluía clases y compradores | Mismo filtro de la coordinación (`deCoordinacion`) |
| 9 | "Tareas de hoy" se cruzaba con la cola por contacto | Por proceso; por contacto solo si la tarea no tiene proceso |
| 10 | Sin plazo: una lectura colgada frenaba la pantalla | 15 s por bloque; el que vence llega con error |
| 11 | El orden visual con `order` de CSS no coincidía con el del DOM | Dos columnas reales; el DOM es principal y después lateral (en el celular, el asesor ve tareas, procesos y visitas: el orden de la spec) |
| 12 | Colegas mezclados en tasaciones y leads | Excluidos |
| 13 | El escenario "Se registró 18 nov" contradecía la regla del 26/11 | Corregido a "26 nov" |
| 14 | No decía qué ven los roles sin Inicio | Ven el Inicio de siempre (`InicioClasico`); el abogado sigue entrando a la revisión legal |
| 15 | Vacíos sin definir | "Tareas de hoy" de coordinación y dueño se esconde vacía; el asesor ve "Todo al día" |
| 16 | Admin y dueño con la misma etiqueta | Decisión: los dos leen "Inicio · vista del dueño" (mismo permiso, misma vista) |
| 17 | La prueba del cartel de avisos ya estaba rota en `main` | Alineada con `/api/consultas/avisos` y "N avisos sin propiedad" |
| 18 | Datos: `deals.origin` y `contact_activities.occurred_at` | Verificados con SELECT de solo lectura (conteos) |
| 19 | Lectura por id en la URL podía pasarse de largo | Se leen los intentos desde el 26/11 sin lista de ids (tabla chica) |
| 20 | `tasks.md` sin las tareas de corrección | Actualizado |
