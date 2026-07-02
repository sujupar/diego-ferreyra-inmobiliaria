-- Catálogo canónico de barrios (fuente para el combobox del wizard y FK de snapshots).
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta). Idempotente.

CREATE TABLE IF NOT EXISTS public.neighborhoods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  zonaprop_slug text,
  zone        text NOT NULL DEFAULT 'caba',   -- 'caba' | 'gba_norte' (2ª ola)
  partido     text,                            -- solo GBA
  is_general  boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed: 48 barrios CABA (nombres EXACTOS del JSON de Monitor Inmobiliario) + General.
INSERT INTO public.neighborhoods (slug, name, zonaprop_slug, sort_order) VALUES
  ('agronomia','Agronomía','agronomia',1),('almagro','Almagro','almagro',2),
  ('balvanera','Balvanera','balvanera',3),('barracas','Barracas','barracas',4),
  ('belgrano','Belgrano','belgrano',5),('boedo','Boedo','boedo',6),
  ('caballito','Caballito','caballito',7),('chacarita','Chacarita','chacarita',8),
  ('coghlan','Coghlan','coghlan',9),('colegiales','Colegiales','colegiales',10),
  ('constitucion','Constitución','constitucion',11),('flores','Flores','flores',12),
  ('floresta','Floresta','floresta',13),('la-boca','La Boca','la-boca',14),
  ('la-paternal','La Paternal','la-paternal',15),('liniers','Liniers','liniers',16),
  ('mataderos','Mataderos','mataderos',17),('monserrat','Monserrat','monserrat',18),
  ('monte-castro','Monte Castro','monte-castro',19),('nueva-pompeya','Nueva Pompeya','nueva-pompeya',20),
  ('nunez','Núñez','nunez',21),('palermo','Palermo','palermo',22),
  ('parque-avellaneda','Parque Avellaneda','parque-avellaneda',23),
  ('parque-chacabuco','Parque Chacabuco','parque-chacabuco',24),
  ('parque-chas','Parque Chas','parque-chas',25),('parque-patricios','Parque Patricios','parque-patricios',26),
  ('puerto-madero','Puerto Madero','puerto-madero',27),('recoleta','Recoleta','recoleta',28),
  ('retiro','Retiro','retiro',29),('saavedra','Saavedra','saavedra',30),
  ('san-cristobal','San Cristóbal','san-cristobal',31),('san-nicolas','San Nicolás','san-nicolas',32),
  ('san-telmo','San Telmo','san-telmo',33),('velez-sarsfield','Vélez Sarsfield','velez-sarsfield',34),
  ('versalles','Versalles','versalles',35),('villa-crespo','Villa Crespo','villa-crespo',36),
  ('villa-del-parque','Villa del Parque','villa-del-parque',37),('villa-devoto','Villa Devoto','villa-devoto',38),
  ('villa-general-mitre','Villa General Mitre','villa-general-mitre',39),
  ('villa-lugano','Villa Lugano','villa-lugano',40),('villa-luro','Villa Luro','villa-luro',41),
  ('villa-ortuzar','Villa Ortúzar','villa-ortuzar',42),('villa-pueyrredon','Villa Pueyrredón','villa-pueyrredon',43),
  ('villa-real','Villa Real','villa-real',44),('villa-riachuelo','Villa Riachuelo','villa-riachuelo',45),
  ('villa-santa-rita','Villa Santa Rita','villa-santa-rita',46),('villa-soldati','Villa Soldati','villa-soldati',47),
  ('villa-urquiza','Villa Urquiza','villa-urquiza',48)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.neighborhoods (slug, name, zonaprop_slug, is_general, sort_order)
VALUES ('general','CABA','',true,0)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (catálogo no sensible). Escritura: solo service_role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='neighborhoods'
                 AND policyname='neighborhoods_select_all') THEN
    CREATE POLICY neighborhoods_select_all ON public.neighborhoods
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
