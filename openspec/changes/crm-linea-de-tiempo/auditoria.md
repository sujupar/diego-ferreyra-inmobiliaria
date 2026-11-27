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
