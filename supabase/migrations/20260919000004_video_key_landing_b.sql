-- Estadísticas de video: separar las de la landing B de tasación, que quedaron
-- guardadas bajo la clave de la landing A.
--
-- Del 2026-09-14 al 2026-09-19 las landings A y B de `/tasacion-directa` registraron su
-- video con la MISMA clave (`hero-tasacion`), siendo dos videos distintos. El código ya
-- le da a la B su clave propia (`hero-tasacion-neta`, ver `lib/funnel/video-keys.ts`);
-- esto reetiqueta lo que se guardó mezclado.
--
-- CÓMO SE DISTINGUEN SIN ADIVINAR: por la DURACIÓN del video que reportó el navegador.
-- El de la A dura 196 s y el de la B 711 s. Medido antes de escribir esto: 80 filas con
-- 196 s, 9 con 711 s y 1 sin duración (nunca llegó a reproducir). El corte en 400 s deja
-- un margen enorme de los dos lados. La fila sin duración solo se mueve si esa persona
-- tiene sesión de mapa de calor en la B y NO en la A (hasta el 19/9 el A/B repartía por
-- visitante: cada persona veía una sola versión); si no se puede saber, se queda en la A.
--
-- IDEMPOTENTE y sin choques: no toca una fila si esa persona ya tiene otra con la clave
-- nueva (la tabla es UNIQUE (anon_id, video_key)). Se puede volver a correr después del
-- deploy para levantar lo que la B haya escrito con la clave vieja en esos minutos.
--
-- ACOTADA POR FECHA (`first_at < 2026-09-21`): el corte por duración vale para los dos videos
-- de HOY. Si algún día el video de la A pasara de 400 s y alguien volviera a correr esto
-- "porque se puede correr las veces que sea", reetiquetaría la A entera como B. Con la cota,
-- correrla en el futuro no hace nada.
--
-- LÍMITES CONOCIDOS (los encontró la revisión, se dejan documentados):
--  · La duración que se guarda es la ÚLTIMA que reportó el navegador, no la máxima. Una
--    persona que vio la A en julio y la B en septiembre bajo la misma fila quedó con 711 s y
--    se reetiqueta entera como B, con el avance que tenía de la A. Es 1 fila de las 9 (la
--    única de un contacto registrado: casi seguro alguien del equipo probando).
--  · Una persona ya reetiquetada que vuelva a ver la B ANTES del deploy crea otra fila con la
--    clave vieja y 711 s; el `not exists` la saltea y queda bajo la A. Se detecta con:
--      select count(*) from video_view_state where video_key='hero-tasacion' and duration_s > 400;
--    Al aplicar esto daba 0. Si diera > 0 después del deploy, esas filas se resuelven a mano.
--
-- PARA DESHACER (no borra nada, solo reetiqueta; usar la misma cota que al aplicar):
--   update public.video_view_state v set video_key = 'hero-tasacion'
--   where v.video_key = 'hero-tasacion-neta' and v.first_at < '2026-09-19 15:00+00'
--     and not exists (select 1 from public.video_view_state x
--                     where x.anon_id = v.anon_id and x.video_key = 'hero-tasacion');

update public.video_view_state v
set video_key = 'hero-tasacion-neta'
where v.video_key = 'hero-tasacion'
  and v.first_at < '2026-09-21'
  and (
    v.duration_s > 400
    or (
      v.duration_s is null
      and exists (select 1 from public.heatmap_session_state h where h.anon_id = v.anon_id and h.page = 'tasacion-neta')
      and not exists (select 1 from public.heatmap_session_state h where h.anon_id = v.anon_id and h.page = 'tasacion')
    )
  )
  and not exists (
    select 1 from public.video_view_state x
    where x.anon_id = v.anon_id and x.video_key = 'hero-tasacion-neta'
  );
