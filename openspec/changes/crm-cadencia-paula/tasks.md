# Tasks

Reglas: test primero en `lib/`; un commit por tarea como `Sujupar <redstyle50@gmail.com>`;
vitest acotado, `tsc`, `eslint`. Datos de prueba solo `[TEST]`, borrados en la misma sesión.

## 1. Preparación
- [x] 1.1 Inventario (horario, cadencia, agenda, specs) y propuesta con las recomendaciones aprobadas
- [x] 1.2 Specs y diseño; `openspec validate --strict`
- [ ] 1.3 Auditoría independiente de los artefactos; corregir y anotar en `auditoria.md`

## 2. Reglas
- [ ] 2.1 `horario-laboral.ts` a 10–14 y sus tests
- [ ] 2.2 `cadencia.ts` (D2) con sus tests; tests de agenda, inicio, cartera y métricas actualizados

## 3. Verificación
- [ ] 3.1 Suite, `tsc`, `eslint`
- [ ] 3.2 Revisión de código independiente
- [ ] 3.3 QA en la vista previa con un `[TEST]`: tres "No atendió" seguidas → Llamada 2 a las 13:30 o al otro día a las 10:00, Llamada 3, WhatsApp; avisos; borrar los datos

## 4. Cierre
- [ ] 4.1 Merge, humo en producción, `CLAUDE.md`, archivar y avisar al dueño con dónde mirarlo
