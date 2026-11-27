# Tasks

Reglas para todos los grupos: un commit y un push por tarea (autor `Sujupar <redstyle50@gmail.com>`);
en `lib/` el test se escribe primero y se lo ve fallar; pruebas con
`npx vitest run -c vitest.crm.config.ts`, tipos con `npx tsc --noEmit -p tsconfig.crm.json`
y `npx eslint <archivos tocados>`. Firmas, SQL y nombres de archivo: `design.md`. Escenarios:
`specs/`. Se trabaja en `~/Dev/crm-cartera` (iCloud vacía los archivos de `~/Documents`).

Datos de prueba: todo con `[TEST]` en el nombre, proceso con `origin` vacío, email suprimido
en Mailchimp antes de crear un proceso, nunca "Guardar" en el formulario de coordinar, y se
borra en la misma sesión antes de las 09:00 UTC. La base de la vista previa es la de
producción: en la investigación, solo SELECT.

## 1. Preparación

- [x] 1.1 Propuesta con las cinco decisiones del dueño ("ok a las 5", 2026-11-27)
- [x] 1.2 Specs y diseño; `openspec validate crm-linea-de-tiempo --strict` pasa
- [ ] 1.3 Auditoría de los artefactos por un revisor independiente; corregir y anotar en `auditoria.md`
- [ ] 1.4 Pre-flight de choques (skill `anticipating-implementation-conflicts`); anotarlo en el PR
- [ ] 1.5 Abrir el PR en borrador con los documentos; nombrarle al dueño la exposición de WhatsApp al asesor (Risks)

## 2. Base de datos

- [ ] 2.1 Escribir la migración de D1 (prefijo libre, todo repetible)
- [ ] 2.2 Escribir `scripts/apply-crm-linea-de-tiempo-pg.ts` con las verificaciones de D1 y la prueba del trigger dentro de una transacción con `ROLLBACK`
- [ ] 2.3 Aplicar dos veces seguidas en `mncsnastmcjdjxrehdep`; pegar las salidas en el PR

## 3. Autor de etapas y tareas

- [ ] 3.1 Test `deals.autor.test.ts` (rojo) y parámetro `autorId` obligatorio en las seis funciones de D1
- [ ] 3.2 Pasar el autor desde cada llamador (con sesión: `user.id`; sistema: `null`); `advance` y `visit-data` conservan el `user`
- [ ] 3.3 `created_by` en las cinco creaciones de tareas con sesión (D2)
- [ ] 3.4 `completed_by` en `completeTask`, `closeTasksByActivity`, `cerrarTareasDelInforme`; `null` al reabrir en `undoTasksOfActivity`

## 4. Línea de tiempo

- [ ] 4.1 `lib/crm/linea-de-tiempo.ts` con sus tests (D3), una función por vez
- [ ] 4.2 `lib/supabase/linea-de-tiempo.ts` con sus tests (D4)
- [ ] 4.3 Ruta `GET /api/contacts/[id]/activities`: `items`, cursor con `antes_id`, `allSettled`, `fuentes_con_error`; tests de la ruta
- [ ] 4.4 `use-ficha.ts`, `Actividad.tsx` e `ItemEvento.tsx` (D5) con sus tests
- [ ] 4.5 `grep -rn "\.actividades\b\|actividades:" components app lib` sin consumidores viejos

## 5. Verificación

- [ ] 5.1 Pruebas completas, `tsc` y `eslint` en verde
- [ ] 5.2 Revisión de código independiente (permisos: que ningún evento llegue a quien no puede abrir la ficha)
- [ ] 5.3 QA en la vista previa a 1280 y 390 px, con las vistas de coordinación, asesor y dueño, sobre un contacto `[TEST]` con registro, etapas, tareas, WhatsApp y video, y sobre contactos reales en solo lectura: textos de cada evento, filtros, "Ver más", aviso de fuente rota (bloqueando la ruta), teléfono del equipo y compartido, sin desplazamiento horizontal, 0 errores de consola, tiempo del pedido
- [ ] 5.4 Un cambio de etapa y una tarea completada en la vista previa guardan el autor (SELECT al historial)

## 6. Cierre

- [ ] 6.1 Auditoría del código por un revisor independiente; corregir y anotar en `auditoria.md`
- [ ] 6.2 Merge con `gh pr merge --rebase`, deploy y humo en producción
- [ ] 6.3 Limpieza: 0 filas de prueba, cuenta de QA en admin, navegador cerrado
- [ ] 6.4 `CLAUDE.md` (sección CRM: autor de etapas y riesgo del autor pegado), archivar el change y avisarle al dueño
