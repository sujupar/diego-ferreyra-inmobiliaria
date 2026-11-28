# Tasks

Reglas: un commit y un push por tarea (autor `Sujupar <redstyle50@gmail.com>`); en `lib/` el
test primero y verlo fallar; `npx vitest run -c vitest.crm.config.ts`, `tsc` y `eslint`.
Datos de prueba solo `[TEST]`, procesos con `origin` vacío, email suprimido, borrados en la
misma sesión. Se trabaja en `~/Dev/crm-cartera`.

## 1. Preparación
- [x] 1.1 Inventario del Tablero, permisos, la base y las specs; propuesta corregida (lugar, roles, datos)
- [x] 1.2 Specs y diseño; `openspec validate --strict`
- [x] 1.3 Auditoría independiente de los artefactos; corregir y anotar en `auditoria.md`
- [x] 1.4 PR en borrador

## 2. Reglas y lectura
- [x] 2.1 `lib/crm/metricas-llamadas.ts` (D1) con sus tests
- [x] 2.2 Armado en `armarTablero` (D2) con sus tests

## 3. Pantalla
- [x] 3.1 `SeccionLlamadas` (D3) con sus tests, como sección 5

## 4. Verificación
- [x] 4.1 Suite, `tsc` de toda la app, `eslint`
- [x] 4.2 Revisión de código independiente
- [x] 4.3 Script de las reglas sobre filas `[TEST]` reales; QA en la vista previa a 390, 1024 y 1280 px como admin (estado real de la sección, resto del Tablero intacto, tiempo de respuesta) y rechazo como coordinación y asesor; 0 errores de consola

## 5. Cierre
- [x] 5.1 Auditoría de cierre; corregir y anotar
- [x] 5.2 Merge con `--rebase`, deploy y humo en producción
- [x] 5.3 Limpieza, `CLAUDE.md`, archivar y avisar al dueño
