-- =============================================================================
-- Panel de métricas de negocio
-- =============================================================================
-- Spec: docs/superpowers/specs/2026-11-04-panel-metricas-negocio-design.md
--
-- Lo que la plataforma NO tenía y el panel necesita: las ventas con su reparto,
-- los gastos fijos, los hitos (cambios que movieron la conversión) y un caché
-- del alcance de Meta (que no se puede sumar por día: una persona que vio el
-- anuncio lunes y martes es UNA persona alcanzada).
--
-- Solo crea tablas nuevas y dos funciones de lectura: no toca nada existente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ventas: una fila por operación (reservada o vendida).
-- ---------------------------------------------------------------------------
-- Reparto (regla del dueño, 2026-11-04): TODAS las partes salen del mismo
-- honorario cobrado y cada una aplica solo si corresponde (asesor 20% si
-- muestra / 50% si capta; Julián 20% si el dueño llegó por embudo; referidor
-- 20%). Lo limpio de Diego se CALCULA en lib/metrics/panel/reparto.ts: no se
-- guarda, así nunca queda desincronizado de los porcentajes.
CREATE TABLE IF NOT EXISTS public.ventas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id             uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  direccion               text NOT NULL,
  estado                  text NOT NULL DEFAULT 'reservada'
                          CHECK (estado IN ('reservada', 'vendida', 'caida')),
  captada_en              date,
  reservada_en            date,
  escriturada_en          date,
  precio                  numeric CHECK (precio IS NULL OR precio > 0),
  moneda                  text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'ARS')),
  pct_vendedor            numeric CHECK (pct_vendedor IS NULL OR pct_vendedor BETWEEN 0 AND 20),
  pct_comprador           numeric CHECK (pct_comprador IS NULL OR pct_comprador BETWEEN 0 AND 20),
  otra_inmobiliaria_usd   numeric NOT NULL DEFAULT 0 CHECK (otra_inmobiliaria_usd >= 0),
  honorario_cobrado_usd   numeric CHECK (honorario_cobrado_usd IS NULL OR honorario_cobrado_usd >= 0),
  capto                   text,
  vendio                  text,
  asesor_pct              numeric NOT NULL DEFAULT 0 CHECK (asesor_pct BETWEEN 0 AND 100),
  julian_pct              numeric NOT NULL DEFAULT 0 CHECK (julian_pct BETWEEN 0 AND 100),
  referidor_nombre        text,
  referidor_pct           numeric NOT NULL DEFAULT 0 CHECK (referidor_pct BETWEEN 0 AND 100),
  gastos_propiedad_usd    numeric NOT NULL DEFAULT 0 CHECK (gastos_propiedad_usd >= 0),
  origen_dueno            text CHECK (origen_dueno IS NULL OR origen_dueno IN
                          ('referido', 'embudo', 'clase', 'portal', 'redes', 'otro')),
  a_confirmar             boolean NOT NULL DEFAULT false,
  notas                   text,
  created_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ventas_partes_no_superan_100 CHECK (asesor_pct + julian_pct + referidor_pct <= 100)
);

CREATE INDEX IF NOT EXISTS ventas_reservada_en_idx ON public.ventas (reservada_en);
-- Una sola operación abierta por propiedad: es la que edita la ficha.
CREATE UNIQUE INDEX IF NOT EXISTS ventas_una_abierta_por_propiedad
  ON public.ventas (property_id) WHERE property_id IS NOT NULL AND estado <> 'caida';

-- ---------------------------------------------------------------------------
-- Gastos fijos: el monto mensual vigente de cada concepto.
-- ---------------------------------------------------------------------------
-- Un cambio de monto = cerrar la fila (hasta) y abrir otra (desde): así el
-- margen de un mes viejo no cambia cuando sube el alquiler.
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto    text NOT NULL,
  tipo        text NOT NULL DEFAULT 'fijo' CHECK (tipo IN ('fijo', 'impuesto')),
  monto_usd   numeric NOT NULL CHECK (monto_usd >= 0),
  desde       date NOT NULL,
  hasta       date,
  a_confirmar boolean NOT NULL DEFAULT false,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gastos_fijos_rango CHECK (hasta IS NULL OR hasta >= desde)
);

-- ---------------------------------------------------------------------------
-- Hitos: lo que cambió (landing nueva, A/B, anuncio, presupuesto).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hitos_metricas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha       date NOT NULL,
  embudo      text CHECK (embudo IS NULL OR embudo IN ('tasacion', 'clase')),
  titulo      text NOT NULL,
  detalle     text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hitos_metricas_fecha_idx ON public.hitos_metricas (fecha);

-- ---------------------------------------------------------------------------
-- Caché del alcance de Meta por rango y embudo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_reach_cache (
  embudo         text NOT NULL,
  desde          date NOT NULL,
  hasta          date NOT NULL,
  alcance        bigint NOT NULL,
  impresiones    bigint,
  consultado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (embudo, desde, hasta)
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.panel_metricas_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ventas_touch ON public.ventas;
CREATE TRIGGER ventas_touch BEFORE UPDATE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.panel_metricas_touch();

DROP TRIGGER IF EXISTS gastos_fijos_touch ON public.gastos_fijos;
CREATE TRIGGER gastos_fijos_touch BEFORE UPDATE ON public.gastos_fijos
  FOR EACH ROW EXECUTE FUNCTION public.panel_metricas_touch();

-- ---------------------------------------------------------------------------
-- RLS: plata = solo operaciones (admin, dueño, coordinador). Las rutas usan
-- service role y chequean permisos; esto es la defensa en profundidad.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ventas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos_fijos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitos_metricas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_reach_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ventas_ops ON public.ventas;
CREATE POLICY ventas_ops ON public.ventas FOR ALL TO authenticated
  USING (public.is_operations_user()) WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS gastos_fijos_ops ON public.gastos_fijos;
CREATE POLICY gastos_fijos_ops ON public.gastos_fijos FOR ALL TO authenticated
  USING (public.is_operations_user()) WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS hitos_metricas_ops ON public.hitos_metricas;
CREATE POLICY hitos_metricas_ops ON public.hitos_metricas FOR ALL TO authenticated
  USING (public.is_operations_user()) WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS meta_reach_cache_ops ON public.meta_reach_cache;
CREATE POLICY meta_reach_cache_ops ON public.meta_reach_cache FOR SELECT TO authenticated
  USING (public.is_operations_user());

-- ---------------------------------------------------------------------------
-- Lecturas agregadas (las tablas crudas tienen miles de filas y el cliente
-- de Supabase corta en 1000).
-- ---------------------------------------------------------------------------

-- Visitas humanas a las landings, por día, embudo y versión A/B.
-- Cuenta PERSONAS por día (misma IP el mismo día = una), no cargas de página:
-- una recarga o volver atrás no es otra visita. La landing "alto valor" queda
-- afuera: no tuvo campaña activa desde mayo y no trajo ninguna solicitud, pero
-- suma ~1.000 cargas desde agosto que inflaban el embudo de tasación.
DROP FUNCTION IF EXISTS public.get_panel_visitas(date, date);
CREATE OR REPLACE FUNCTION public.get_panel_visitas(p_desde date, p_hasta date)
RETURNS TABLE (dia date, embudo text, variante text, visitas bigint)
LANGUAGE sql STABLE AS $$
  SELECT (v.visited_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
         CASE WHEN v.funnel_type = 'tasacion' THEN 'tasacion' ELSE 'clase' END,
         coalesce(v.landing_variant, '-'),
         count(DISTINCT coalesce(v.ip_hash, v.id::text))
    FROM public.landing_page_visits v
   WHERE NOT coalesce(v.is_bot, false)
     AND v.funnel_type IN ('tasacion', 'clase_gratuita')
     AND (v.visited_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN p_desde AND p_hasta
   GROUP BY 1, 2, 3;
$$;

-- Video de cada landing: cuántos le dieron play y hasta dónde llegaron.
DROP FUNCTION IF EXISTS public.get_panel_video(date, date);
CREATE OR REPLACE FUNCTION public.get_panel_video(p_desde date, p_hasta date)
RETURNS TABLE (video_key text, embudo text, cargas bigint, reproducciones bigint,
               llegan_25 bigint, llegan_50 bigint, llegan_75 bigint, completan bigint,
               segundos_promedio numeric)
LANGUAGE sql STABLE AS $$
  SELECT s.video_key,
         s.funnel,
         count(*),
         count(*) FILTER (WHERE s.playback_started),
         count(*) FILTER (WHERE s.playback_started AND s.max_percent >= 25),
         count(*) FILTER (WHERE s.playback_started AND s.max_percent >= 50),
         count(*) FILTER (WHERE s.playback_started AND s.max_percent >= 75),
         count(*) FILTER (WHERE s.playback_started AND (s.completed OR s.max_percent >= 95)),
         round(avg(s.watch_seconds) FILTER (WHERE s.playback_started)::numeric, 0)
    FROM public.video_view_state s
   WHERE (s.first_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN p_desde AND p_hasta
   GROUP BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.get_panel_visitas(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_panel_video(date, date) TO authenticated;
