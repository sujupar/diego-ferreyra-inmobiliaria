-- Candado de corta duración para el envío de la encuesta por WhatsApp (ronda 1 de revisión,
-- Tarea 8 de la Entrega 3). Sin esto, un doble toque del botón "Reenviar" o dos personas
-- distintas reenviando casi al mismo tiempo disparan DOS llamadas a Meta en paralelo: las dos
-- pasan la misma decisión ("se puede mandar") porque todavía no hay nada escrito que la frene,
-- y el cliente recibe el WhatsApp dos veces.
--
-- `send_lock_until`: mientras tenga una fecha futura, el servicio NO vuelve a mandar (se toma
-- con un UPDATE condicional en `datos.ts`, no acá). Columna nullable, sin default: no cambia el
-- comportamiento de ninguna fila existente ni de ningún lector que no la conozca.
--
-- Aditiva: no toca RLS ni los GRANT/REVOKE que ya dejó 20261015000002_encuesta_de_visita.sql
-- (la tabla sigue sin permiso de escritura para anon/authenticated; esto lo escribe el
-- servidor con la clave de servicio, igual que el resto de `visit_surveys`).

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.visit_surveys
  ADD COLUMN IF NOT EXISTS send_lock_until timestamptz;

COMMENT ON COLUMN public.visit_surveys.send_lock_until IS
  'Candado de corta duración (segundos) para que un reenvío/envío automático no se dispare dos veces en paralelo. NULL o vencido = libre.';
