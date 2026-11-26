# Plan: lista "Pidieron tasación" actualizada sola

Spec: `docs/superpowers/specs/2026-11-25-lista-exclusion-pidieron-tasacion-design.md` (aprobada por el dueño el 2026-11-26).

**Riesgo principal ya despejado (2026-11-26):** `POST /{público}/usersreplace` con el token de la plataforma y los mismos 393 datos →
`num_received: 393`, `num_invalid_entries: 0`. El plan B (agregar + sacar) no hace falta.

## Tareas

1. **Regla pura** — `lib/marketing/exclusion-pidieron-tasacion.ts` + `.test.ts` (TDD):
   quién es prueba, cómo se normaliza y cifra cada contacto, deduplicado, y el freno del 80 %.
   Prueba: `npx vitest run -c vitest.exclusion-meta.config.ts`.
2. **Llamada a Meta** — `reemplazarListaDeClientes()` en `lib/marketing/meta-custom-audiences.ts` (una llamada, techo de 20 s, errores con el cuerpo de Meta).
   Cubierta por la prueba real de la tarea 5.
3. **Ruta** — `app/api/cron/meta-exclusion-sync/route.ts`: `?ping=1`, secreto (env o `cron_config('meta_exclusion_sync')`), `?simular=1`,
   lectura paginada de `deals` + `contacts`, freno, reemplazo y fila en `funnel_meta_sync_log` (también ante error o freno).
   Verificación: tsc acotado + `curl` en la vista previa (403 sin secreto, simular con secreto).
4. **Job** — migración `20261126000001_cron_meta_exclusion_sync.sql` + `scripts/apply-cron-meta-exclusion-sync-pg.ts`
   (patrón de visit-reminders: reusa el secreto de `send_report`, verifica `?ping=1`, se aplica DESPUÉS del deploy). 06:30 UTC.
5. **Verificación en producción** — corrida forzada con el secreto: `num_received` = cantidad calculada, fila en el log,
   `net._http_response` al día siguiente.

Sin migraciones de tablas (se reusa `funnel_meta_sync_log`), sin variables de entorno nuevas, sin pantalla.
Consumidores: ninguno (ruta y etapa de log nuevas).
