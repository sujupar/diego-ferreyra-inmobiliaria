-- Estadísticas de video: separar las de la landing B de tasación, que quedaron
-- guardadas bajo la clave de la landing A.
--
-- Del 2026-09-15 al 2026-09-19 las landings A y B de `/tasacion-directa` registraron su
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
-- PARA DESHACER (no borra nada, solo reetiqueta):
--   update public.video_view_state set video_key = 'hero-tasacion'
--   where video_key = 'hero-tasacion-neta' and first_at < '2026-09-20';

update public.video_view_state v
set video_key = 'hero-tasacion-neta'
where v.video_key = 'hero-tasacion'
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
