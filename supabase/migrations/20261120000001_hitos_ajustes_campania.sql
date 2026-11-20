-- Tablero de /metrics: los "cambios" (hitos) se usan también como AJUSTES DE
-- CAMPAÑA, con lo que se busca, la meta de costo por registro y cuándo se decide.
-- Spec: docs/superpowers/specs/2026-11-20-metricas-pantalla-a-design.md
--
-- Solo agrega columnas opcionales: el código viejo no las usa y el nuevo
-- funciona aunque esta migración todavía no se haya aplicado.

ALTER TABLE public.hitos_metricas
  ADD COLUMN IF NOT EXISTS resultado_buscado        text,
  ADD COLUMN IF NOT EXISTS meta_costo_registro_ars  numeric CHECK (meta_costo_registro_ars IS NULL OR meta_costo_registro_ars > 0),
  ADD COLUMN IF NOT EXISTS fecha_decision           date;

COMMENT ON COLUMN public.hitos_metricas.resultado_buscado IS 'Qué se espera que pase con el ajuste (texto libre).';
COMMENT ON COLUMN public.hitos_metricas.meta_costo_registro_ars IS 'Costo por registro (ARS) que se busca después del ajuste.';
COMMENT ON COLUMN public.hitos_metricas.fecha_decision IS 'Día en que se mira el resultado y se decide si el ajuste queda.';
