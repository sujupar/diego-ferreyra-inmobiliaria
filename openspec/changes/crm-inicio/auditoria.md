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

## Revisión de código independiente (tarea 4.2)

Sin fugas de datos: el asesor filtra por su id en todas las lecturas; la coordinación recibe solo los bloques de coordinación.

| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1–3 | Tareas pendientes, intentos y llamadas de la semana se leían en una sola página: PostgREST corta en 1000 sin avisar | `todas()`: de a 1000 con orden por id, tope 20.000 y error al pasarlo. Prueba con 1.501 tareas |
| 4 | "Deshacer" dejaba la tarea tachada y sin poder tildarse | Se la saca de las hechas. Prueba |
| 5 | La lectura de perfiles corría también para el asesor, sin nadie que la esperara | Solo en coordinación y dueño |
| 6 | Las visitas de hoy dejaban afuera 23:59 | Hasta las 00:00 del día siguiente. `status` nunca es nulo (verificado) |
| 7 | Una recarga fallida dejaba datos viejos sin avisar | Aviso "No se pudo actualizar" con "Reintentar". Prueba |
| 8 | Llamadas sin proceso no cuentan | Verificado: la ficha guarda el proceso activo de la persona; sin proceso no hay nada que contar |
| 9 | "Tasaciones" se escondía vacía sin estar en la spec | Agregado a la spec |
| 10 | "Registrar" sin contacto no abría el formulario | Sin contacto no se ofrece. Prueba |
| 11 | `?registrar=1` volvía a abrir el formulario al recargar | Se saca de la dirección al abrirlo. Prueba |

## QA en la vista previa (tarea 4.3)

Seis casos `[TEST]` (origin vacío, emails suprimidos, borrados al terminar: 0 filas). 3 roles × 390/1024/1280 px.

- Cada caso cae en su bloque: "Llamada 2 · Vencida hace 1 h" con la tarea a nombre de la OTRA coordinadora; "Llamada 1 · Espera"; "WhatsApp enviado hace 3 h · 2 llamadas sin atender"; "Sin tarea pendiente · … · 1 llamada"; tasación "Mañana 10:00"; "Entregar la tasación: la visita fue hace 4 días."; visita de hoy.
- Dos columnas desde 1024 px, una en el celular, sin desborde. Orden del DOM = orden de lectura.
- Dueño: 0 botones de llamar, registrar o tildar. Asesor: por la red solo `procesos, tareas, visitas`. Abogado: Inicio de siempre y 403 en `/api/inicio`.
- Tildar → "Tarea completada · Deshacer" → la tarea vuelve habilitada y `pending` en la base.
- `/api/inicio`: 0,9–1,6 s. Consola: sin errores (solo el 403 provocado con el abogado).
- Encontrado y corregido en el QA: en el celular "Registrar" abría la hoja con el foco en la página (defecto previo de la hoja, también desde la ficha); teléfonos guardados con `+549` se veían crudos; iniciales "[I"; el tiempo medio sin promedio no decía cuántos esperan.

## Auditoría de cierre (tarea 5.1)

Escenario por escenario de la spec, con su evidencia:

| Requisito | Evidencia |
|---|---|
| Un Inicio para cada rol (saludo, abogado, bloque que falla) | QA en vivo + `Inicio.test`, `page.test`, `inicio.test` (fuente que falla) |
| Para llamar ahora (fila, espera, antes del registro, otra coordinadora, vacío) | QA en vivo + `lib/crm/inicio.test` |
| Registrar abre la ficha con el formulario (compu y celular) | QA en vivo (foco en "No atendió" en los dos) |
| Sin respuesta tras WhatsApp / Sin próximo paso | QA en vivo + pruebas de reglas y de lectura (tarea solo del contacto) |
| Tareas de hoy y para mañana (completar, Deshacer, asesor sin tareas) | QA en vivo + `Inicio.test` |
| Tasaciones y números del día | QA en vivo + `inicio.test` (origin `embudo`, anuladas fuera) |
| Lo del asesor (visita sin entregar, solo lo suyo) | QA en vivo (por la red) + `inicio.test` |
| Lo del dueño (pocos casos, sin datos, solo lectura) | QA en vivo + `Inicio.test` |
| Aviso de consultas sin propiedad | QA en vivo ("39 avisos sin propiedad") + `InicioClasico.test` |

Sin pendientes que bloqueen. Queda para vigilar: si la cartera completa supera 3000 procesos, la coordinación y el dueño ven sus bloques con error (no cortados); hoy no se alcanza.
