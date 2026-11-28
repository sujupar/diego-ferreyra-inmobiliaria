# Tasks

Reglas: test primero en `lib/`; un commit por tarea como `Sujupar <redstyle50@gmail.com>`;
vitest acotado, `tsc`, `eslint`. Datos de prueba solo `[TEST]`, borrados en la misma sesión.

## 1. Preparación
- [x] 1.1 Inventario (horario, cadencia, agenda, specs) y propuesta con las recomendaciones aprobadas
- [x] 1.2 Specs y diseño; `openspec validate --strict`
- [x] 1.3 Auditoría independiente de los artefactos; corregir y anotar en `auditoria.md`

## 2. Reglas
- [x] 2.1 `horario-laboral.ts` a 10–14 con `enHorarioOProximo` (movida de agenda) y `HORA_AVISO_TODO_EL_DIA`; sus tests
- [x] 2.2 `cadencia.ts` (D2) con sus tests
- [x] 2.3 Aviso "para hoy 13:30" y "para ahora" (`aviso-guardado.ts`, `ItemActividad.tsx`) con tests
- [x] 2.4 Tests y textos que dependían del 9:00 / 9 a 18: `horario-laboral.test`, `cadencia.test`, `aviso-guardado.test`, `AvisoGuardado.test`, `side-effect-handlers.test`, agenda, inicio, cartera, métricas; textos de `SeccionLlamadas.tsx`, `Inicio.tsx`; comentarios en `horario-laboral.ts`, `agenda.ts`, `cartera.ts`, `cartera-trabado.ts`, `side-effect-handlers.ts`

## 3. Verificación
- [x] 3.1 Suite, `tsc`, `eslint`
- [x] 3.2 Revisión de código independiente
- [ ] 3.3 QA en la vista previa con un `[TEST]`: tres "No atendió" seguidas → Llamada 2 a las 13:30 o al otro día a las 10:00, Llamada 3, WhatsApp; avisos; borrar los datos

## 4. Cierre
- [ ] 4.1 Merge, humo en producción, `CLAUDE.md`, archivar y avisar al dueño con dónde mirarlo
