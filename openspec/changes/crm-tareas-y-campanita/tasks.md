# Tasks

Reglas: un commit y un push por tarea (autor `Sujupar <redstyle50@gmail.com>`); en `lib/` el
test primero y verlo fallar; `npx vitest run -c vitest.crm.config.ts`,
`npx tsc --noEmit -p tsconfig.crm.json` y `npx eslint` sobre lo tocado. Datos de prueba solo
`[TEST]`, a cuentas de prueba, borrados en la misma sesión. Se trabaja en `~/Dev/crm-cartera`.

## 1. Preparación

- [x] 1.1 Inventario del código, la maqueta y la base; propuesta con las 4 recomendaciones
- [x] 1.2 Specs y diseño; `openspec validate --strict`
- [ ] 1.3 Auditoría independiente de los artefactos; corregir y anotar en `auditoria.md`
- [ ] 1.4 PR en borrador con los documentos y el pre-flight

## 2. Reglas

- [ ] 2.1 `lib/tareas/agenda.ts` (D1) con sus tests
- [ ] 2.2 `lib/tareas/enlace.ts` (`getTaskLink` movido, mismos tests)

## 3. Lecturas y rutas

- [ ] 3.1 `lib/supabase/agenda-tareas.ts` (`leerAgenda`, `leerAvisos`) con sus tests
- [ ] 3.2 `GET /api/tasks/agenda` y `GET /api/tasks/avisos` con sus tests (permisos incluidos)
- [ ] 3.3 `PUT /api/tasks/[id]`: `reopen` y `posponer`; `POST /api/tasks`: Argentina, sin fecha, 120
- [ ] 3.4 Tarea de entrada con fecha (D4) y su test

## 4. Pantalla

- [ ] 4.1 `NuevaTarea` y `AddTaskDialog` como envoltorio
- [ ] 4.2 `HojaPosponer`
- [ ] 4.3 `Campanita` + `PanelAvisos` en la barra
- [ ] 4.4 `/tasks` con la maqueta
- [ ] 4.5 "Deshacer" al completar en la ficha; evento `tareas:cambio` en todas las mutaciones

## 5. Verificación

- [ ] 5.1 Suite, `tsc` (también sobre todas las rutas y `lib/`) y `eslint`
- [ ] 5.2 Revisión de código independiente
- [ ] 5.3 QA en la vista previa a 1280 y 390 px, como coordinación, asesor y dueño, con tareas `[TEST]`: grupos, resumen exacto, filtros, "Sin fecha" paginado, crear (con y sin día, a la noche), completar y deshacer, posponer (las tres opciones) y deshacer, campanita (número, panel, "Lo que viene", se actualiza sola), permisos por la red, 0 errores de consola

## 6. Cierre

- [ ] 6.1 Auditoría de cierre; corregir y anotar
- [ ] 6.2 Fijar `INICIO_AVISOS`, merge con `--rebase`, deploy y humo en producción
- [ ] 6.3 Limpieza (0 filas de prueba, cuenta de QA en admin, navegador cerrado)
- [ ] 6.4 `CLAUDE.md`, archivar y avisar al dueño
