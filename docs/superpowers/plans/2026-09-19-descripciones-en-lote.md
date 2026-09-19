# Descripciones para todas las propiedades — Plan

> Ejecución inline, TDD en `lib/`. Spec: `docs/superpowers/specs/2026-09-19-descripciones-en-lote-design.md`.

## Tarea 1 — Terrenos (puro, TDD)

- [ ] `faltanParaGenerar`: un terreno pide `total_area` ("superficie del lote") en vez de ambientes y superficie cubierta.
- [ ] `tipologiaDiego('terreno') = 'TERRENO'` (hoy devuelve CASA).
- [ ] `armarEntradaEscritura`: en un terreno la superficie va como "Superficie del lote" y no se escriben ambientes, dormitorios ni baños aunque vengan en 0.
- [ ] `promptEscritura`: sección "TERRENO (adaptación de la estructura de casa)" con los 5 puntos del spec.
- [ ] `controlarTexto`: el control de dormitorios no aplica a terrenos (no tienen).
- [ ] Tests: terreno completo no falta nada; terreno sin `total_area`; depto y casa igual que antes; la entrada de terreno dice "Superficie del lote"; el prompt trae la estructura TERRENO; la descripción actual nunca llega a la entrada.

## Tarea 2 — Índice

- [ ] Migración `20260919000002_deals_property_id_idx.sql` (`CREATE INDEX IF NOT EXISTS … WHERE property_id IS NOT NULL`), script que la aplica y verifica con `pg_indexes` y con `EXPLAIN` de la consulta de la ficha.

## Tarea 3 — Prueba real y cierre

- [ ] `scripts/descripcion-probar.ts` sobre los 2 terrenos, sin guardar: tiempos, inventario, zona, texto. Auditoría frase por frase.
- [ ] Tipos, lint y suite; revisión adversarial; PR; QA en la vista previa (el botón del terreno habilitado; generar sin guardar); merge y deploy; verificación en producción; CLAUDE.md.
