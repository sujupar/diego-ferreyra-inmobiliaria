# Radar de referencias de Instagram — Documento de diseño

**Fecha:** 2026-11-27
**Estado:** BORRADOR revisado (builder-check 2026-11-27) — pendiente de aprobación de Julian.
**Reemplaza:** la alimentación de "Referencias" por OpenClaw/Bruno (`docs/superpowers/specs/2026-11-04-referencias-video-design.md`, sección "Alimentación").

## Intención y el porqué

La sección **Referencias** existe para que Diego y Julian vean, sin tener que buscarlos, los reels que **rindieron muy por encima de lo normal** y entiendan **por qué funcionaron**, para adaptarlos y producir contenido de alto rendimiento. Hoy la alimenta "Bruno", un agente de OpenClaw que escribe fichas a mano y las sube con un script de Python: trae videos que no tienen nada que ver ("Am I going to regret this glow up"), no mide de forma uniforme (la mitad de las tarjetas dice "sin medición") y no detecta antes que el feed de Julian lo que está funcionando.

Lo que se quiere: un **sistema propio**, que corre **todos los días en la Mac de Julian** con la **sesión de Instagram ya iniciada** (cuenta de Arc "Julian Parra"), que encuentre los reels destacados, los mida contra el promedio de su cuenta, lea los comentarios, guarde el video y explique **qué funcionó y cómo adaptarlo**. No se trata de pasar el video a guion tal cual: se trata de entender el mecanismo. Ejemplo que lo motivó: una inmobiliaria que explicó un concepto con una animación; la plataforma tendría que haberlo visto antes que Julian.

## Goals

- Corrida **diaria y automática** en la Mac de Julian que llena `video_refs` con reels **de Instagram** destacados.
- **Mezcla 80/20:** al menos el 80 % de lo que se publica es del rubro inmobiliario argentino (noticias, impuestos, datos de mercado, créditos hipotecarios, temas del gobierno, inmobiliarias/martilleros). Hasta el 20 % son **formatos** de otros rubros que pueden servir (la animación explicativa, un tipo de gancho), siempre con la adaptación al propietario.
- **"Destacado" se mide, no se opina:** vistas del reel ÷ **mediana** de vistas de los últimos reels de esa misma cuenta (el *multiplicador*). Se acompaña de los comentarios (cantidad y qué dicen) y de la relación interacción/vistas.
- **El porqué, con evidencia:** por cada reel, un análisis que mira el video real (imagen + audio) y los comentarios y responde: qué tema tocó, cómo arranca (gancho), qué formato usa (a cámara, animación, pizarra, texto en pantalla…), qué emoción o necesidad activa y qué dicen los comentarios que lo confirma, y **cómo lo haría Diego** (para el propietario y en su voz).
- **Ver el video adentro de la plataforma:** el archivo se guarda en nuestro Storage y se reproduce en el detalle, sin salir a Instagram.
- **Se aprende solo:** las cuentas que dan destacados se suman a la lista vigilada; las que nunca rinden se dejan de revisar.
- **Visible si se cae:** cada corrida deja registro (cuándo corrió, cuántos reels revisó, cuántos publicó, si falló y en qué paso). La sección muestra "última búsqueda: hoy 08:10, 6 nuevas" o "no corre desde el martes".
- Se mantiene el botón actual **"Guionizar en la voz de Diego"** (motor ya en producción).

## Non-goals

- TikTok, YouTube u otras redes (se puede sumar después; el diseño no lo impide).
- Servicios pagos de lectura de redes (Apify y similares) — decisión de Julian.
- Correr en la nube o en Netlify: la búsqueda vive en la Mac.
- Publicar, comentar, dar "me gusta" o seguir cuentas desde el robot. **Solo lee.**
- Rediseñar la plataforma: se tocan solo la sección Referencias y lo que la alimenta.

## Anti-goals (fracaso aunque "funcione")

- Que siga apareciendo contenido que no sirve. **Una tarjeta irrelevante es peor que ninguna.** Si un día no hay nada bueno, se publican 0.
- Que la IA invente números o comentarios. Toda cifra viene de Instagram; si falta, se muestra que falta.
- Que se **bloquee o restrinja la cuenta de Instagram** de Julian por actividad automática agresiva.
- Que falle en silencio durante semanas (pasó con las funciones programadas de Netlify).
- Romper el Reportero de noticias, `news_scans`/`news_scripts` o el guionizado de referencias que ya existe.

## Restricciones (verificadas)

- **Sesión de Instagram:** el único navegador con sesión vigente es **Arc, perfil "Julian Parra"** (`~/Library/Application Support/Arc/User Data/Profile 1`, cookie `sessionid` usada por última vez el 2026-11-25). El robot **no maneja Arc** (se pelearía con Julian mientras lo usa): usa **su propio perfil de navegador persistente** con la **misma cuenta**, en el que Julian inicia sesión **una sola vez** (comando `login`, abre la ventana visible).
- **Instagram sin servicios pagos** = navegador real con sesión. El recolector navega con Playwright (Chromium) y lee los datos que Instagram ya le manda a la página (respuestas JSON de la propia web: perfil, reels de la cuenta, búsqueda, comentarios) en lugar de "mirar la pantalla". Nada de llamadas sin navegador ni contraseñas guardadas.
- **Ritmo humano:** tope diario configurable (de entrada ~25 cuentas y ~300 reels mirados por corrida), pausas aleatorias entre páginas y nunca más de una corrida por día. Si Instagram muestra un desafío o un aviso de "intentá más tarde", **se frena la corrida entera**, se registra y no se reintenta ese día.
- **La Mac tiene que estar prendida.** Se programa con `launchd` (LaunchAgent) a una hora fija; si la Mac estaba dormida o apagada, corre al despertar. Un candado impide dos corridas simultáneas.
- **iCloud vacía archivos** de la carpeta del proyecto (memoria `icloud_vacia_archivos_del_proyecto`): el programa y su perfil de navegador viven **fuera de iCloud** (`~/Dev/...` y `~/.radar-referencias/`), no en la carpeta de Documentos.
- **Análisis de video:** Gemini acepta video con audio de forma nativa (`gemini-2.5-flash`, ya usado en el repo). Corre **en la Mac**, sin el techo de ~26 s de Netlify, así que la "REGLA DURA" de una llamada de IA por request no aplica a este proceso (no es un request web). Requiere `GEMINI_API_KEY` en el `.env` local del radar (hoy no está en `.env.local`).
- **Datos:** Supabase con service_role (mismo patrón que el resto de los scripts locales). Migraciones aplicables desde acá por el pooler (`CLAUDE.md` § Supabase). Videos y portadas en un bucket de Storage.
- **Menú:** no cambia (Referencias ya existe en `lib/nav/sections.ts`).

## Enfoques considerados

- **A — Recolector fijo + IA solo para filtrar y explicar (ELEGIDO por Julian, 2026-11-27).** Un programa determinista hace siempre los mismos pasos (descubrir → medir → filtrar → bajar → analizar → publicar). La IA solo se usa para decidir si un reel es relevante y para explicar por qué funcionó. Predecible, barato, cada falla se ubica en un paso.
- **B — Agente de IA que navega libremente** (lo que hacía Bruno). Más flexible, pero caro, distinto cada día y es la causa de los resultados irrelevantes de hoy. Descartado.
- **C — Servicio pago de lectura (Apify).** Descartado por Julian: nada externo.

## El cómo (lo decidido)

### 1. Dónde vive
Un paquete nuevo **dentro del repo**, `radar/` (TypeScript, corre con `node --import tsx`), para reutilizar tipos y la conexión a Supabase. Se ejecuta desde un clon de trabajo fuera de iCloud. Estado local en `~/.radar-referencias/` (perfil de navegador, candado, logs, videos temporales).

Comandos:
- `radar login` — abre la ventana del navegador del robot para que Julian inicie sesión en Instagram una vez.
- `radar correr` — la corrida diaria (la que dispara `launchd`).
- `radar correr --seco` — hace todo menos escribir en Supabase (para probar).
- `radar instalar` / `radar desinstalar` — registra o quita el LaunchAgent.

### 2. Las fuentes (de dónde salen los candidatos)
1. **Cuentas vigiladas** (tabla `radar_cuentas`): semilla inicial de cuentas inmobiliarias argentinas (martilleros, inmobiliarias, divulgadores de mercado/créditos/impuestos) + las cuentas de otros rubros con formatos fuertes que ya están en `_creadores-referencia.md` de OpenClaw (filtradas: solo las que sirven).
2. **Búsquedas por tema** (tabla `radar_busquedas`): términos en castellano rioplatense — "crédito hipotecario", "comprar departamento", "alquileres", "ley de alquileres", "impuesto a las ganancias inmueble", "escritura", "inmobiliaria", "tasación", "dólar inmuebles", "propietarios", "martillero", etc. De los resultados se toman **cuentas nuevas** para medir.
3. **El Explorar de la cuenta de Julian**: el algoritmo ya le sirve contenido inmobiliario; se leen los reels que aparecen ahí.

Las cuentas encontradas por 2 y 3 entran a `radar_cuentas` como `descubierta` y se miden igual que las demás.

### 3. La medición (qué es "destacado")
Por cada cuenta revisada se leen sus **últimos ~24 reels** con vistas, me gusta, comentarios y fecha.
- **Línea de base** = mediana de vistas de esos reels, excluyendo los de menos de 3 días (todavía no maduraron). Se guarda en `radar_cuentas` con la fecha.
- **Multiplicador** = vistas del reel ÷ línea de base.
- **Candidato** si: multiplicador ≥ **3**, publicado en los **últimos 30 días**, al menos **20.000 vistas** (evita que una cuenta de 300 vistas de promedio "explote" con 1.000), y que no se haya publicado antes (`radar_vistos`).
- Los umbrales viven en una tabla de configuración (`radar_config`), no en el código.

### 4. El filtro de relevancia (la IA decide si sirve)
Para cada candidato, **una llamada barata** a Gemini (texto: descripción del reel, hashtags, cuenta, transcripción si Instagram la trae, 10 comentarios principales) clasifica:
- `inmobiliario_ar` (cuenta para el 80 %), `inmobiliario_otro_pais`, `formato_otro_rubro` (cuenta para el 20 %) o `no_sirve`.
- Un tema (`noticias`, `impuestos`, `datos_mercado`, `creditos`, `gobierno_normativa`, `inmobiliarias`, `otro`).
- Un puntaje de 0 a 10 de **utilidad para Diego** (¿se puede voltear al propietario?, ¿Diego lo puede grabar?).
`no_sirve` o puntaje < 6 → se descarta (queda en `radar_vistos` con el motivo, para auditar).

**La regla 80/20 se aplica al publicar, no al buscar:** de los aprobados del día, primero los inmobiliarios ordenados por multiplicador × puntaje, y los de otro rubro como máximo 1 cada 4 inmobiliarios. Tope de **10 publicadas por día**.

### 5. El análisis a fondo (el porqué)
Solo para los que se van a publicar:
1. Se descarga el video (el archivo MP4 que Instagram ya le sirve al navegador con sesión) y la portada.
2. Se suben a Storage, bucket **`video-refs`** (privado; la plataforma lo sirve con URL firmada).
3. Una llamada a Gemini **con el video** + métricas + comentarios devuelve un JSON fijo:
   - `gancho`: qué pasa en los primeros 3 segundos (texto en pantalla y lo que se dice).
   - `formato`: cómo está hecho (a cámara, animación, pizarra, texto, entrevista, b-roll…).
   - `por_que`: el mecanismo — qué necesidad/emoción activa y por qué esa audiencia lo vio y comentó, **citando la evidencia** (multiplicador, comentarios textuales).
   - `que_dicen_los_comentarios`: patrones (preguntas, polémica, etiquetas a otros) con 2–3 citas reales.
   - `adaptacion_diego`: cómo lo haría Diego para el propietario, en su ángulo ("lo que te queda en mano").
   - `transcripcion` resumida.
   El prompt incluye las reglas de voz de Diego (`lib/guion/voz/`) solo para la parte de adaptación.

### 6. Datos (migración nueva, aditiva)
- `video_refs` **se reutiliza** (la pantalla y el guionizado ya la usan). Columnas nuevas: `fuente` (`'radar' | 'openclaw'`, default `'openclaw'` para lo existente), `ig_shortcode` (único cuando no es nulo — clave para no duplicar), `video_storage_path`, `formato`, `comentarios_analisis` (texto), `categoria` (`inmobiliario_ar | inmobiliario_otro_pais | formato_otro_rubro`), `tema_categoria`, `puntaje`, `transcripcion`, `oculta` (bool, default false), `radar_run_id`.
  `plataforma='instagram'`, `tipo='video_cuenta'`, `ficha_slug = 'ig-' || shortcode` (la columna es NOT NULL y única).
- `radar_cuentas` (usuario, origen `semilla|busqueda|explorar`, seguidores, línea de base, fecha de medición, destacados encontrados, veces revisada, activa).
- `radar_busquedas` (término, activo).
- `radar_vistos` (shortcode único, cuenta, multiplicador, resultado `publicado|descartado_relevancia|bajo_umbral|error`, motivo, fecha) — memoria de lo ya mirado.
- `radar_corridas` (inicio, fin, estado `ok|parcial|frenada_por_instagram|error`, paso donde falló, contadores, mensaje).
- `radar_config` (umbrales y topes).
RLS: lectura para usuarios de operaciones; escritura solo service_role (el radar).

### 7. Lo que ya hay de OpenClaw
- Las ~40 tarjetas actuales quedan con `fuente='openclaw'` y **ocultas por defecto** (`oculta=true`); no se borran datos. Si alguna sirve, se puede volver a mostrar.
- Se **retiran del proceso** los scripts de alimentación de OpenClaw (`bruno_video_refs.py`, `sync_video_refs.py`, `backfill_video_refs.py`, `thumbs_video_refs.py`) y la tarea de Bruno de subir fichas. Se borran los archivos de la plataforma que solo existían para OpenClaw (si los hay en el repo). Lo que viva en `~/.openclaw` se desactiva y se documenta; no se borra el agente entero sin el OK de Julian, porque Bruno tiene otras tareas.
- Se reutiliza: la semilla de cuentas buena de `_creadores-referencia.md`, la tabla, la pantalla y el guionizado.

### 8. La pantalla (Referencias)
Se mantiene la estructura actual (grilla + detalle), con estos cambios:
- **Arriba:** estado del radar ("Última búsqueda: hoy 08:12 · revisó 280 reels de 24 cuentas · 7 nuevas" o, en ámbar, "El radar no corre desde el martes").
- **Filtros:** Hoy / Semana / Todas (como hoy) + **Inmobiliario / Otros formatos** + tema.
- **Tarjeta:** portada real, multiplicador (×N), vistas, comentarios, cuenta, fecha y **el formato** en una línea.
- **Detalle:** **reproductor del video** (desde nuestro Storage) + enlace al original; bloques "Por qué funcionó", "El gancho", "El formato", "Qué dicen los comentarios" (con citas), "Cómo lo haría Diego"; las cifras con su origen ("×6,2 sobre la mediana de 45 mil de @cuenta"); botón "Guionizar en la voz de Diego" (igual que hoy) y **"No sirve"** (la oculta y queda registrado, para ajustar el filtro).

```
┌ Referencias de video ─────────────────────────────────────────┐
│ ● Última búsqueda: hoy 08:12 · 280 reels · 7 nuevas            │
│ [Buscar…]   Hoy · Semana · Todas   Inmobiliario · Otros  Tema▾ │
│ ┌────────┐ ┌────────┐ ┌────────┐                               │
│ │ ×8,4   │ │ ×5,1   │ │ ×3,7   │                               │
│ │ portada│ │ portada│ │ portada│                               │
│ │Créditos│ │Impuest.│ │Animac. │                               │
│ │@cuenta │ │@cuenta │ │@cuenta │                               │
│ └────────┘ └────────┘ └────────┘                               │
└────────────────────────────────────────────────────────────────┘
```

### 9. Verificación
- Funciones puras con pruebas (línea de base, multiplicador, regla 80/20, parseo de las respuestas de Instagram con muestras reales guardadas, armado de filas).
- Una corrida **real en seco** con la cuenta de Julian antes de escribir en la base, revisando a mano que los candidatos tengan sentido.
- QA de la pantalla en la vista previa de Netlify (navegador de Claude) con datos reales.


## Decisiones del constructor tras la revisión (marcadas como llamadas de Claude, Julian puede corregirlas)

1. **Apagar a Bruno ANTES de la migración.** El constructor quita de `~/.openclaw/workspace/diego-data/bruno/METODO-BRUNO.md` el paso "Subir la ficha a la plataforma" y mueve a `~/.openclaw/workspace/diego-data/_retirado/` los 4 scripts de alimentación (`bruno/bruno_video_refs.py`, `formatos/sync_video_refs.py`, `formatos/backfill_video_refs.py`, `formatos/thumbs_video_refs.py`) y `video_refs_parse.py`. No se borra el agente ni sus fichas. Defensa extra: la pantalla muestra por defecto **solo `fuente='radar'`**; lo de OpenClaw queda detrás de un filtro "Archivo anterior", así una subida vieja que se escape no ensucia la vista.
2. **Desde dónde corre `launchd`:** una carpeta de instalación propia, `~/.radar-referencias/app`, que es un clon de `main` que solo el radar toca. Cada corrida empieza con `git fetch` + avance rápido a `origin/main` (nunca otra rama); si el avance falla, corre con la versión que ya tiene y lo deja anotado en la corrida. Nunca corre desde una carpeta de trabajo.
3. **Storage:** los videos se recomprimen en la Mac (ffmpeg, 720p, ~2–5 MB) antes de subirlos. Retención: se conservan los videos de las tarjetas visibles y guionizadas; los de las ocultas, "No sirve" o de más de 120 días sin usar se borran del Storage (queda la portada y el enlace al original). La limpieza la hace la propia corrida diaria. El constructor verifica el plan y el límite por archivo del proyecto antes de crear el bucket.
4. **Aviso activo si se cae:** además del cartel en la pantalla, un email (Resend, helper `sendEmail`) a Julian cuando la corrida queda `frenada_por_instagram` o `error`, y un chequeo en `pg_cron` que avisa si no hubo corrida `ok` en 36 h (la Mac apagada no puede avisar por sí misma). Un solo email por incidente.
5. **Guionizado:** `lib/video-refs/guionizar.ts` pasa a leer también `formato`, `transcripcion` y `comentarios_analisis` cuando existen (cambio aditivo; con esos campos vacíos el prompt queda igual que hoy). Pruebas de no-regresión sobre una fila vieja.
6. **Regla 80/20:** se mide sobre los **últimos 7 días** de publicadas. Un reel de otro rubro se publica solo si, sumándolo, los de otro rubro siguen siendo ≤ 20 % de la semana; como mínimo se permite 1 por día si ese día hubo al menos 1 inmobiliario. Función pura con pruebas.
7. **"No sirve":** oculta la tarjeta y guarda el motivo opcional. Las últimas 20 descartadas a mano entran al prompt del filtro como ejemplos de lo que NO sirve; una cuenta con 3 descartes a mano pasa a inactiva. Nada más automático.
8. **Quién ve Referencias:** no cambia (`video_refs` sigue legible por cualquier usuario con sesión, como hoy). Las tablas nuevas `radar_*` son solo para operaciones; el estado del radar en la pantalla se sirve por una ruta del servidor.

## Lo que queda al constructor

- Nombres finales de columnas y el detalle de las llamadas internas de la web de Instagram (se descubren con el navegador real y se guardan muestras para las pruebas).
- La semilla concreta de cuentas y términos (primer borrador del constructor; Julian lo revisa en la pantalla).
- La hora exacta de la corrida (propuesta: 08:00).
- Cómo se descarga el MP4 (interceptar la respuesta de video del navegador o `yt-dlp` con las cookies del perfil del robot, que ya está instalado).

## Pasos manuales de Julian

1. Correr `radar login` una vez e iniciar sesión en Instagram en la ventana que se abre (misma cuenta que Arc "Julian Parra").
2. Agregar `GEMINI_API_KEY` al `.env` del radar (está en Netlify).
3. Dejar la Mac prendida a la hora de la corrida (o aceptar que corra al despertar).
