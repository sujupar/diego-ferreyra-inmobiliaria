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
- [x] 1.3 Auditoría de los artefactos por un revisor independiente: 18 hallazgos, todos corregidos (`auditoria.md`)
- [ ] 1.4 Pre-flight de choques (skill `anticipating-implementation-conflicts`); anotarlo en el PR
- [ ] 1.5 Abrir el PR en borrador; nombrarle al dueño que el asesor ve los WhatsApp de sus contactos (Risks)

## 2. Base de datos

- [x] 2.1 Migración de D1 (autor, `metadata`, trigger sobre `scheduled_date`, guarda de `completed_by`, índices)
- [x] 2.2 `scripts/apply-crm-linea-de-tiempo-pg.ts`: verifica columnas, FK, índices, triggers y, en una transacción con `ROLLBACK`, autor, sin autor, coordinar una solicitud sin día, reprogramar y `completed_by`
- [x] 2.3 Aplicada en `mncsnastmcjdjxrehdep` y vuelta a correr (idempotente); 0 filas de prueba

## 3. Autor de etapas y tareas

- [x] 3.1 `deals.autor.test.ts` (rojo, después verde) y `autorId` obligatorio en las seis funciones
- [x] 3.2 Autor desde cada llamador; `advance` y `visit-data` conservan el `user`; GHL en cuarentena y el script de reparación pasan `null` (excepción de D1)
- [x] 3.3 `created_by` en las cinco creaciones de tareas con sesión
- [x] 3.4 `completed_by` en `completeTask`, `closeTasksByActivity`, `cerrarTareasDelInforme`; `null` al reabrir

## 4. Línea de tiempo

- [x] 4.1 `lib/crm/linea-de-tiempo.ts` con sus tests
- [x] 4.2 `lib/supabase/linea-de-tiempo.ts` con sus tests (alcance del asesor, teléfonos del equipo, número único, tareas por proceso, microsegundos)
- [x] 4.3 Ruta: `items`, cursor con `antes_id`, margen de empates, `allSettled`, `fuentes_con_error`, alcance
- [x] 4.4 `use-ficha.ts`, `Actividad.tsx`, `ItemEvento.tsx` y la recarga tras acciones propias, con sus tests
- [x] 4.5 Sin consumidores de la respuesta vieja (`grep` de `actividades:`/`.actividades` en `components`, `app`, `lib`)

## 5. Verificación

- [ ] 5.1 Suite completa, `tsc` (también sobre todas las rutas y `lib/`, por las firmas nuevas) y `eslint`
- [ ] 5.2 Revisión de código independiente (permisos: que nada de un proceso ajeno llegue a un asesor)
- [ ] 5.3 QA en la vista previa a 1280 y 390 px con las vistas de coordinación, asesor y dueño, **sobre contactos reales en solo lectura** (no se insertan registros, WhatsApp ni video: alimentan métricas y la bandeja): uno del embudo con registro, video, WhatsApp y etapas; uno con teléfono del equipo; uno con teléfono compartido; uno con un proceso de otro asesor visto como asesor. Textos, filtros, "Ver más", aviso de fuente rota (bloqueando la ruta), sin desplazamiento horizontal, 0 errores de consola, tiempo del pedido
- [ ] 5.4 En la vista previa, con un contacto `[TEST]` (proceso con `origin` vacío, email suprimido): marcar perdido y deshacer, crear y completar una tarea; ver que la línea lo muestra con el nombre y que el historial guarda el autor (SELECT); borrar todo

## 6. Cierre

- [ ] 6.1 Auditoría del código por un revisor independiente; corregir y anotar en `auditoria.md`
- [ ] 6.2 Merge con `gh pr merge --rebase`, deploy y humo en producción
- [ ] 6.3 Limpieza: 0 filas de prueba, cuenta de QA en admin, navegador cerrado
- [ ] 6.4 `CLAUDE.md` (sección CRM: autor de etapas, riesgo del autor pegado, fila `scheduled → scheduled`), archivar el change y avisarle al dueño
