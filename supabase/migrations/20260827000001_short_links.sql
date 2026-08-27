-- =============================================================================
-- Acortador propio: `inmodf.com.ar/r/<código>`
-- =============================================================================
-- POR QUÉ EXISTE
--
-- El aviso de consulta que recibe el equipo trae un link "Responder al
-- interesado" con el saludo entero precargado. Crudo mide ~240 caracteres y en
-- el chat se ve como un bloque de texto azul de varias líneas, incómodo de
-- tocar. Hasta hoy se acortaba con TinyURL; ahora se acorta con nuestro dominio.
--
-- QUÉ NO ARREGLA ESTO: WhatsApp abre el chat sin salir de la app solo cuando el
-- link es de un dominio suyo (`wa.me`). Con cualquier otro —el nuestro incluido—
-- se abre el navegador. La ruta `/r/<código>` rebota sola al deep link
-- `whatsapp://send?...`, así que se ahorra el clic de "Continuar al chat" que
-- exigía TinyURL, pero el navegador aparece igual un instante.
--
-- SEGURIDAD: solo se acortan destinos de WhatsApp, y se valida al crear Y al
-- servir. Un acortador que redirige a donde le digan es un redirector abierto:
-- links `inmodf.com.ar/r/xxx` apuntando a phishing, con la credibilidad de
-- nuestro dominio detrás. El CHECK de abajo lo impide desde la base, no solo
-- desde el código.
--
-- 100% ADITIVA: tabla nueva, no toca nada existente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.short_links (
  -- 7 caracteres de un alfabeto sin O/0/I/l/1 (el link se dicta y se copia a
  -- mano). 56^7 ≈ 1,7 billones de combinaciones: adivinar uno es inviable.
  code TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Para saber si el equipo realmente los usa, sin tener que preguntar.
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  -- De dónde salió, para poder rastrear un link suelto ('portal_inquiry').
  source TEXT,
  -- La misma lista blanca que aplica el código, acá abajo. Defensa en
  -- profundidad: si algún día alguien inserta desde otro lado, la base dice que no.
  CONSTRAINT short_links_solo_whatsapp CHECK (
    target_url ~ '^https://(wa\.me|api\.whatsapp\.com)(/|\?)'
  )
);

CREATE INDEX IF NOT EXISTS short_links_created_at_idx ON public.short_links (created_at DESC);

-- RLS: nadie llega a esta tabla con la clave pública. La ruta `/r/<código>` y la
-- creación del link corren con la service role, que salta RLS. Sin políticas =
-- sin acceso para anon ni authenticated, que es exactamente lo que queremos:
-- listar esta tabla sería listar los teléfonos de todos los interesados.
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.short_links IS
  'Acortador propio para los links de WhatsApp del aviso de consultas. Solo destinos wa.me/api.whatsapp.com (CHECK). Se sirve en /r/<code>.';
