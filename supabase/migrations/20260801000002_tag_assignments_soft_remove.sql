-- Quitar una etiqueta NO destruye la fila.
--
-- La revisión adversarial encontró que el DELETE de una etiqueta borraba
-- físicamente la asignación, en contra de la regla del proyecto ("ningún dato se
-- borra"). Más allá de la regla: saber que a alguien lo marcaron "Caliente" en
-- julio y se lo sacaron en agosto ES información del negocio.
ALTER TABLE lead_tag_assignments ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE lead_tag_assignments ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
COMMENT ON COLUMN lead_tag_assignments.removed_at IS 'NULL = la etiqueta está puesta. Con fecha = se la quitaron, pero queda el registro de que la tuvo.';

-- Las consultas de etiquetas vigentes filtran por este índice.
CREATE INDEX IF NOT EXISTS lead_tag_assignments_vigentes_idx
  ON lead_tag_assignments (lead_id) WHERE removed_at IS NULL;
