-- Corrige zonaprop_slug de Nueva Pompeya: el seed original (20260701000010) usó
-- 'nueva-pompeya' (= slug normalizado por defecto), pero la URL real de Zonaprop
-- es https://www.zonaprop.com.ar/barrios/capital-federal/pompeya (sin el prefijo
-- "nueva-"). Verificado 2026-07-02 extrayendo el link real desde
-- https://www.zonaprop.com.ar/barrios/ (href="capital-federal/pompeya") y
-- confirmando que esa URL devuelve conteos válidos vía fetchZonapropTipos.
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta). Idempotente.
UPDATE public.neighborhoods
SET zonaprop_slug = 'pompeya', updated_at = now()
WHERE slug = 'nueva-pompeya' AND zonaprop_slug <> 'pompeya';
