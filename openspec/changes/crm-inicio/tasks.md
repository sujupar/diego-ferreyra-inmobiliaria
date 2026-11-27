# Tasks

Reglas: un commit y un push por tarea (autor `Sujupar <redstyle50@gmail.com>`); en `lib/` el
test primero y verlo fallar; `npx vitest run -c vitest.crm.config.ts`, `tsc` y `eslint`.
Datos de prueba solo `[TEST]`, procesos con `origin` vacío, email suprimido, borrados en la
misma sesión. Se trabaja en `~/Dev/crm-cartera`.

## 1. Preparación
- [x] 1.1 Inventario de la maqueta, las specs, el código y la base; propuesta con 4 recomendaciones
- [x] 1.2 Specs y diseño; `openspec validate --strict`
- [x] 1.3 Auditoría independiente de los artefactos; corregir y anotar en `auditoria.md`
- [ ] 1.4 PR en borrador

## 2. Reglas y lecturas
- [x] 2.1 `lib/crm/inicio.ts` (D1) con sus tests
- [x] 2.2 `lib/supabase/inicio.ts` (D2) con sus tests
- [x] 2.3 `GET /api/inicio` (D3) con sus tests

## 3. Pantalla
- [x] 3.1 Ficha con `?registrar=1` (D4) y su test
- [x] 3.2 `components/inicio/` y la página (D5) con sus tests; reescribir los tests viejos del Inicio
- [x] 3.3 Correcciones de la auditoría de artefactos (cola única, sin próximo paso, fuentes, números, plazo, dos columnas)

## 4. Verificación
- [ ] 4.1 Suite, `tsc` de toda la app, `eslint`, `next build` local
- [ ] 4.2 Revisión de código independiente
- [ ] 4.3 QA en la vista previa a 390, 1024 y 1280 px como coordinación, asesor y dueño, con datos `[TEST]` (una solicitud que espera, una con llamada vencida, una sin respuesta tras WhatsApp, una tasación de mañana, una visita de hoy, procesos del asesor), "Registrar" abre la ficha con el formulario, tilde y "Deshacer", permisos por la red, tiempos, 0 errores de consola

## 5. Cierre
- [ ] 5.1 Auditoría de cierre; corregir y anotar
- [ ] 5.2 Merge con `--rebase`, deploy (reintentar si Netlify falla sin causa) y humo en producción
- [ ] 5.3 Limpieza, `CLAUDE.md`, archivar y avisar al dueño
