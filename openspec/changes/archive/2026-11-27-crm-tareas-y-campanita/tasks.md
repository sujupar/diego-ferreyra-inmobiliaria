# Tasks

Reglas: un commit y un push por tarea (autor `Sujupar <redstyle50@gmail.com>`); en `lib/` el
test primero y verlo fallar; `npx vitest run -c vitest.crm.config.ts`,
`npx tsc --noEmit -p tsconfig.crm.json` y `npx eslint` sobre lo tocado. Datos de prueba solo
`[TEST]`, a cuentas de prueba, borrados en la misma sesión. Se trabaja en `~/Dev/crm-cartera`.

## 1. Preparación

- [x] 1.1 Inventario del código, la maqueta y la base; propuesta con las 4 recomendaciones
- [x] 1.2 Specs y diseño; `openspec validate --strict`
- [x] 1.3 Auditoría independiente de los artefactos: 22 hallazgos, corregidos (`auditoria.md`)
- [x] 1.4 PR en borrador con los documentos y el pre-flight

## 2. Reglas

- [x] 2.1 `lib/tareas/agenda.ts` (D1) con sus tests
- [x] 2.2 `lib/tareas/enlace.ts` (`getTaskLink` movido; la entrada abre la ficha)
- [x] 2.3 La cartera usa la misma regla de entrada y conserva la espera con fecha

## 3. Lecturas y rutas

- [x] 3.1 `lib/supabase/agenda-tareas.ts` (`leerAgenda`, `leerAvisos`, `leerPersonas`) con sus tests
- [x] 3.2 `GET /api/tasks/agenda` y `GET /api/tasks/avisos` con sus tests (permisos incluidos)
- [x] 3.3 `PUT /api/tasks/[id]`: `reopen` y `posponer` con sus guardas, copias de la entrada; `POST /api/tasks`: Argentina, sin fecha, hora pasada, 120
- [x] 3.4 Tarea de entrada con fecha (D4): `construirTrabajos` + `tareaDeCoordinacion` y sus tests
- [x] 3.5 Migración `20261127000003` (cierre al salir de Solicitud) aplicada y verificada dos veces

## 4. Pantalla

- [x] 4.1 `NuevaTarea` y `AddTaskDialog` como envoltorio
- [x] 4.2 `HojaPosponer`
- [x] 4.3 `Campanita` + `PanelAvisos` en la barra
- [x] 4.4 `/tasks` con la maqueta
- [x] 4.5 "Deshacer" y espera en la ficha; evento `tareas:cambio` en todos los emisores de D5
- [x] 4.6 "Seguimiento" de `pipeline/[id]`: hoy en Argentina, sin "Correo", título 120

## 5. Verificación

- [x] 5.1 Suite, `tsc` (también sobre todas las rutas y `lib/`) y `eslint`
- [x] 5.2 Revisión de código independiente
- [x] 5.3 QA en la vista previa a 1280 y 390 px, como coordinación, asesor y dueño, con tareas `[TEST]`: grupos, resumen exacto, filtros, "Sin fecha" paginado, crear (con y sin día, a la noche), completar y deshacer, posponer (las tres opciones) y deshacer, campanita (número, panel, "Lo que viene", se actualiza sola), permisos por la red, 0 errores de consola

## 6. Cierre

- [x] 6.1 Auditoría de cierre; corregir y anotar
- [x] 6.2 Fijar `INICIO_AVISOS`, merge con `--rebase`, deploy y humo en producción
- [x] 6.3 Limpieza (0 filas de prueba, cuenta de QA en admin, navegador cerrado)
- [x] 6.4 `CLAUDE.md`, archivar y avisar al dueño
