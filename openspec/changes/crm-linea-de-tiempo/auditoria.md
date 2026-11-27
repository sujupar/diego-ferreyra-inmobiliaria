# Auditoría

## Ronda 1: artefactos (auditor independiente, 2026-11-27)

Revisó proposal, design, tasks y las dos specs contra el código y contra la base de
producción (solo SELECT, solo conteos). Cuando auditó, ya estaban hechas las tareas 4.1 a 4.3,
así que también miró ese código. Encontró 18 hallazgos: 4 ALTA, 9 MEDIA, 4 BAJA y la lista de
tareas que faltaban. Todos quedaron corregidos en `e318f2d4`, `e985ce82` y en los documentos.

| # | Sev. | Hallazgo | Corrección |
|---|---|---|---|
| 1 | ALTA | Coordinar una solicitud que ya estaba en `scheduled` sin día no escribía historial (de 1.140 filas, 1 sola hacia `scheduled`); 76 aperturas sin día se leerían "Coordinada" | El trigger escucha `scheduled_date`, escribe `scheduled → scheduled` y guarda el día en `metadata`; Solicitud/Coordinada según el día. Verificado en la base con el script de aplicación |
| 2 | ALTA | Empates perdidos: la base guarda microsegundos y el corte era `<=` al milisegundo | `<` al milisegundo siguiente en todas las fuentes, también en `contact_activities`; prueba con microsegundos |
| 3 | ALTA | La spec vigente de la ficha no deja que un asesor vea lo del proceso de otro asesor | Requisito nuevo "Un asesor no ve lo de los procesos de otro asesor": historial, registro y tareas de esos procesos ni se consultan. Prueba de lectura y de ruta |
| 4 | ALTA | 79 plantillas automáticas llevan `ai_generated` y salían como "Le respondió el asistente" | Con plantilla, siempre "automático" |
| 5 | MEDIA | El número de copia de las consultas no está en `profiles` | Equipo = `profiles` + variables de entorno + números que recibieron `consulta_portal*` |
| 6 | MEDIA | 17 tareas tienen proceso sin contacto | `contact_id OR deal_id IN (procesos)` |
| 7 | MEDIA | El colapso de copias era más laxo que el de la cartera | Misma regla: coordinadores, mismo tipo, título y proceso |
| 8 | MEDIA | 533 aperturas con fecha falsa (datos cargados después) | Fecha del proceso; sin etapa ni autor si difiere más de un día |
| 9 | MEDIA | `autorId` obligatorio obliga a tocar GHL y un script | Excepción de una línea documentada en D1 |
| 10 | MEDIA | `completed_by` falsificable desde una sesión | Trigger `trg_tasks_completed_by_de_la_sesion` |
| 11 | MEDIA | Los eventos no se refrescan tras una acción propia | La ficha vuelve a pedir la línea; prueba que falla sin el arreglo |
| 12 | MEDIA | `limit(51)` con corte inclusivo daba "no hay más" de más | Margen de 20 por fuente; escenario de 120 WhatsApp |
| 13 | MEDIA | El QA insertaría en tablas de producción que alimentan métricas | QA sobre contactos reales en solo lectura; las fuentes sin datos reales, con la base simulada |
| 14 | BAJA | Excluir `consulta_sin_enlace`/`consulta_plano` partía de una premisa falsa | Solo se excluye `consulta_portal*`; el resto lo corta el teléfono del equipo |
| 15 | BAJA | Coincidencia por sufijo con números de otro país | Si hay más de un número completo, ningún WhatsApp. Los 6 teléfonos con "15" quedan en Risks |
| 16 | BAJA | Textos y escenarios (orden del video, "clase completa", `first_at`) | Escenario con horas, "Vio el video de la clase completa", fecha = apertura de la página; diferencia 7 |
| 17 | BAJA | Diseño desactualizado e índices duplicados | Design reescrito en D1, D3 y D4; índices existentes no se vuelven a crear |
| 18 | — | Tareas faltantes | Sumadas en `tasks.md` |

Lo que confirmó como correcto: las seis funciones que escriben `deals.stage`, las cinco
creaciones de tareas con sesión y los cierres; los conteos del diseño; las FK con `ON DELETE
SET NULL`; y que hoy no se le manda email al lead (Mailchimp apagado: 69 de 69 sincronizaciones
`skipped_disabled`).

## Ronda 2: revisión de código (revisor independiente, sobre `e985ce82`)

Sin fugas de permisos ni de privacidad. 2 MEDIA y 5 BAJA, corregidas en `2520d34d`:

1. MEDIA — las aperturas con fecha falsa se perdían entre páginas (consulta cortada por `changed_at`, evento en `created_at`) → se leen sin corte.
2. MEDIA — "Pasó de Solicitud a Coordinada" heredaba el autor anterior: `updateDealSchedule` no escribía `stage_changed_by` → recibe el autor (`PUT /api/deals/[id]` pasa `user.id`).
3. BAJA — filas leídas y descartadas podían dejar huecos entre páginas → piso por fuente cortada.
4. BAJA — "Ver más" durante una recarga hacía descartar la recarga → contadores separados.
5. BAJA — tarea del contacto con proceso de otro contacto → para el asesor, todo proceso ajeno es oculto.
6. BAJA — detección del equipo frágil si aparece otra plantilla interna → anotado en Risks.
7. BAJA — el camino viejo (solo `antes`) no cortaba los eventos del sistema → corta con clave vacía.

## QA en la vista previa (2026-11-27)

Sobre 5 contactos reales en solo lectura y un contacto `[TEST]` con dos procesos (borrado al final, 0 filas):

- **Textos:** registro con anuncio, etapas, tareas (copias de la coordinación juntas), WhatsApp automático y "no se pudo enviar", y video.
- **Exclusiones:** el número interno (746 mensajes), un teléfono del equipo y un número compartido no muestran ningún WhatsApp.
- **Asesor:** no recibe nada del proceso de otro asesor, ni por la red ni en la página. La coordinación ve todo.
- **Autor:**
  - Marcar perdido, deshacerlo, completar la tarea desde la casilla y poner el día a una solicitud guardan a quien lo hizo.
  - La línea lo muestra sin recargar.
  - Reprogramar no agrega nada.
- **Pantalla:** 1280 y 390 px sin desplazamiento horizontal. El renglón alterna la fecha exacta y los eventos no tienen menú.
- **Consola:** 0 errores.
- **Tiempo:** el pedido tardaba 0,9–1,6 s; se redujo a 0,6–0,8 s (`6a9fe28c`).
- **Datos:** se encontró un anuncio "{{ad.name}}" (plantilla de Meta sin completar), que ya no se muestra.

## Ronda 3: auditoría de cierre (revisor independiente, sobre `2520d34d`)

Sin fugas. Verificó las FK, el trigger AFTER, los siete escritores con autor y los arreglos de la ronda 2. 1 MEDIA y 6 BAJA, todas corregidas:

1. MEDIA — un "Ver más" tocado durante la carga de la página 1 salteaba un renglón → no sale hasta que llega la página 1. Prueba que falla sin el arreglo.
2. BAJA — empates en el milisegundo del piso → ese milisegundo espera si hay algo más nuevo; con piso, `hay_mas` siempre es verdadero.
3. BAJA — `get_funnel_stage_timings` contaría la fila `scheduled → scheduled` → anotado en Risks; la función no tiene uso.
4. BAJA — documentos atrasados → actualizados.
5. BAJA — `scripts/_qa-tareas-cadencia.ts` tenía la firma vieja → pasa `null`.
6. BAJA — el escenario del asesor contradecía "tarea propia en proceso ajeno" → aclarado.
7. BAJA (previo) — completar dos veces reescribía el autor → `completeTask` solo toca pendientes.
