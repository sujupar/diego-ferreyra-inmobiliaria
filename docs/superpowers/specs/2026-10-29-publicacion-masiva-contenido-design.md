# Publicación masiva de contenido orgánico — diseño

Fecha: 2026-10-29 · Tamaño: **grande** (4 integraciones externas, módulo nuevo, publica en
cuentas reales) → requiere OK explícito del dueño antes de codear.

## 1. Qué y para qué

**Qué:** una sección de la plataforma donde se cargan muchos videos de una vez (desde la
computadora o desde un enlace de Google Drive). El sistema le escribe a cada uno su
descripción con el estilo de Diego y propone un calendario de publicación según el ritmo
que se elija. Después los publica solo en Instagram, Facebook, YouTube Shorts y TikTok
(en TikTok, como borrador).

**Para qué:** el volumen de orgánico va de 5 a 30 videos por semana y hoy cada video se
sube a mano, red por red, con su texto. Eso consume horas y hace que se publique menos y
con menos constancia de lo que se graba. El objetivo de esta etapa del negocio es justamente
el volumen (ver memoria "sistema de contenido").

**Problema en una frase:** subir y describir cada video en cuatro redes a mano no escala a
30 videos por semana.
**Resultado en una frase:** cargar 30 videos, elegir el ritmo, revisar y confirmar toma
minutos, y el resto ocurre solo, con registro de qué salió y qué falló.

## 2. Principio rector: que sea fácil

El dueño lo marcó como **absolutamente fundamental**: la potencia (ritmos, horarios,
redes por video) no puede volver la pantalla complicada. Reglas de diseño que se derivan:

- **Un solo camino lineal de 3 pasos visibles** (Cargar → Ritmo → Revisar y confirmar),
  con el paso actual siempre claro. Nada de configuraciones escondidas en menús.
- **Valores por defecto que ya sirven:** si nadie toca nada, sale "1 por día a las 19:00,
  arrancando mañana, en las 4 redes". Elegir otro ritmo es un toque.
- **La decisión difícil se pregunta con una sola pregunta y botones grandes**, no con un
  formulario: "¿Cómo querés repartir estos 20 videos?" → tarjetas animadas.
- **Se puede cerrar la pestaña en cualquier momento** sin perder nada (todo se guarda
  solo, a cada acción). Al volver, la tanda aparece donde quedó.
- **Todo se puede editar después de confirmar**, mientras el video no haya salido.

## 3. Qué ve el usuario

### 3.1 Dónde
Nueva entrada **"Publicaciones"** en el menú lateral (grupo de marketing/contenido), ruta
`/publicaciones`. La ven **admin, dueño y coordinador** (mismo criterio que `/contenido`);
asesor y abogado no la ven y las rutas les responden 403.
*(Llamada mía: va en el menú porque es una herramienta de uso diario; la Central
`/contenido` sigue fuera del menú como está.)*

Tres pestañas arriba: **Nueva tanda** · **Programado** · **Publicado**. Y un botón
**Conexiones** (engranaje) arriba a la derecha.

### 3.2 Paso 1 — Cargar
- Zona grande "Arrastrá los videos acá o **elegilos de la computadora**" (uno o varios,
  mp4/mov, hasta 200 MB cada uno).
- Debajo: "¿Están en Google Drive? **Pegá el enlace**" (de una carpeta o de un archivo).
  Si es carpeta, lista los videos que encontró y se pueden destildar antes de traerlos.
- Apenas entra cada video aparece **una fila**: miniatura a la izquierda (vertical 9:16),
  nombre, duración y una barra de estado en palabras:
  `Subiendo 42 %` → `Escuchando el audio` → `Escribiendo la descripción` → `Listo`.
  Los videos se procesan de a varios en paralelo; el usuario puede seguir al paso 2 sin
  esperar a que terminen todos.
- Si un video falla, la fila lo dice en castellano ("No se pudo escuchar el audio") con
  un botón **Reintentar**. Nunca un error técnico crudo.

### 3.3 Paso 2 — Ritmo (la pregunta animada)
Una pregunta: **"¿Cómo querés repartir estos N videos?"**, con tarjetas grandes:
- **Todos ya** (salen en la próxima corrida, escalonados cada 10 min)
- **1 por día**
- **2 por día**
- **3 por día**
- **1 por semana**
- **A mi manera** → abre un panel chico: cuántos por día, qué días de la semana
  (chips L M X J V S D), en qué horarios, desde qué fecha.

Al elegir una tarjeta, debajo aparece la consecuencia en una frase: *"20 videos, 1 por
día a las 19:00 → del jueves 30/10 al martes 18/11"*, con un mini-calendario animado que
se llena. Opcional: "Solo días hábiles" (un interruptor). Fecha de inicio: mañana por
defecto, editable.

Horarios por defecto según el ritmo (editables en Conexiones → Ajustes):
1/día 19:00 · 2/día 12:30 y 19:00 · 3/día 09:00, 13:00 y 19:00 · 1/semana el mismo día de
la semana que la fecha de inicio a las 19:00. Zona horaria: Argentina (America/Argentina/Buenos_Aires).
*(Llamada mía: horarios iniciales razonables; se ajustan en Ajustes cuando haya datos.)*

### 3.4 Paso 3 — Revisar y confirmar
Lista de los videos **en el orden en que van a salir**, cada fila con:
- Miniatura (a la izquierda; al tocarla se reproduce el video en un visor).
- **Fecha y hora** previstas (se tocan para cambiarlas: selector de día y hora).
- **Íconos de las 4 redes** (Instagram, Facebook, YouTube, TikTok) que se encienden o
  apagan con un toque. Apagado = no se publica en esa red. Si una red no está conectada,
  el ícono aparece gris con "Conectar".
- **Descripción** (expandible, editable en el lugar, con contador de caracteres) y el
  **título para YouTube** (máximo 100 caracteres).
- Arrastrar una fila para cambiar el orden **reasigna los horarios** (los horarios quedan
  fijos, los videos se mueven entre ellos). Cambiar la hora de una fila a mano la saca
  del calendario automático (queda marcada "hora manual").
- Avisos en la fila cuando aplica, en palabras: "TikTok: este día ya hay 5 borradores,
  pasa al siguiente", "YouTube: el video dura más de 3 minutos, no va como Short".

Abajo, un botón único: **"Programar N videos"**. Antes de ejecutar muestra un resumen
("20 videos · 74 publicaciones · del 30/10 al 18/11") y confirma.

### 3.5 Programado
La misma lista, de todas las tandas confirmadas, ordenada por fecha. Se puede editar
descripción, hora y redes de lo que todavía no salió, **pausar** un video o **sacarlo**
del calendario. Cada red muestra su estado: Programado / Subiendo / Publicado / Falló.

### 3.6 Publicado
Historial: miniatura, fecha real de salida, y por red un enlace al post (o "Borrador en
TikTok — terminá la publicación desde la app"). Filtros por red y por fecha. Lo que falló
queda acá con el motivo legible y **Reintentar**.

### 3.7 Conexiones y ajustes
- Estado de cada red: Instagram y Facebook (ya conectadas por el token de Meta de la
  empresa), **Conectar YouTube y Drive** (un solo botón de Google), **Conectar TikTok**.
  Cada una muestra la cuenta conectada y "Desconectar".
- **Interruptor general "Publicación automática"** — apagado de fábrica. Mientras esté
  apagado se puede cargar, describir y programar todo, pero nada sale. Lo cambian solo
  admin y dueño, con confirmación.
- **Estilo de las descripciones** (ver §4.3): el documento de referencia, editable, y el
  botón "Volver a aprender del Instagram".
- Horarios por defecto de cada ritmo.

### 3.8 Estados vacíos y errores
- Sin tandas: ilustración simple + "Cargá tus primeros videos".
- Red caída o token vencido: banner arriba "TikTok se desconectó — volvé a conectarlo"
  y los envíos de esa red quedan en espera (no se pierden, no se marcan como fallidos).

## 4. Qué pasa por detrás

### 4.1 Entrada de los videos
- **Desde la computadora:** subida directa del navegador a Storage con URL firmada
  (patrón existente `upload-init`), bucket público nuevo `contenido-videos` (las redes
  descargan el video desde su URL pública; hace falta que sea público).
- **Desde Drive:** dos formas, sin que el usuario tenga que elegir: si la carpeta está
  compartida como "cualquier persona con el enlace", se lee con una clave de API de Google
  (sirve aunque la carpeta sea de un editor con otra cuenta); si es privada, se lee con la
  cuenta de Google conectada (solo lectura). Si ninguna de las dos la ve, el mensaje dice
  exactamente qué hacer ("Compartí la carpeta como 'cualquier persona con el enlace'").
  Cada archivo se copia a Storage **por partes** (~8 MB por llamada), guardando el avance.
  Ninguna llamada pasa del límite de tiempo de Netlify; si se corta, sigue desde el
  último pedazo. *(Llamada mía: así no importa quién sea el dueño de la carpeta.)*
- **Tamaño máximo por video: 200 MB** (verificado 2026-10-29: Storage ya guarda archivos
  de 203 MB en `property-files`; no se probó más arriba). Un reel de 90 s en 1080p pesa
  30–120 MB.
- **Limpieza:** el archivo de video se borra de Storage **30 días después** de que todas
  sus redes terminaron (publicado o descartado); la miniatura, la transcripción y los
  enlaces quedan para siempre. *(Llamada mía, para que 30 videos/semana no acumulen
  ~10 GB por mes.)*
- La miniatura y el audio se sacan **en el navegador** (con el propio reproductor de
  video del navegador): no hay ffmpeg en el servidor de Netlify. El audio se reduce a una
  pista liviana (mono, 16 kHz) y se sube aparte para transcribir.
  Consecuencia aceptada: esa etapa necesita la pestaña abierta; si se cierra, al volver
  retoma sola los videos que quedaron sin preparar.

### 4.2 Transcripción con tiempos
Se usa la transcripción de OpenAI (ya tenemos `OPENAI_API_KEY`), que devuelve el texto
con marcas de tiempo por frase. El dueño mencionó "Wispr Flow": Wispr Flow es una app de
dictado y no ofrece transcribir archivos de video por API, así que el equivalente que
cumple lo pedido ("ver el timestamp de todo") es este. *(Llamada mía, a confirmar.)*
La transcripción se guarda con el video (sirve también para buscar y para futuros usos).

### 4.3 Descripciones con el estilo de Diego
1. **Aprender el estilo (una vez, y cuando se quiera refrescar):** se leen los últimos
   reels de `@inmobiliariadiegoferreyra` por la API de Meta (verificado el 2026-10-29: el
   token lee las 1.202 publicaciones con su descripción). La IA separa los **videos de
   Diego hablando** de los **recorridos de propiedades** (un filtro por palabras no
   alcanza: hay avisos como "RESERVADA: …" que se cuelan) y se queda con los **últimos
   100 de Diego hablando**.
2. Con esos 100 se arma el **documento de referencia**: una guía de estilo (largo típico,
   cómo arranca, uso de emojis, pregunta final para comentarios, hashtags que repite)
   **más los 100 ejemplos reales**. Queda guardado y visible/editable en Ajustes.
3. **Por cada video:** una llamada a la IA con la transcripción + el documento de
   referencia → propone **descripción** (para Instagram/Facebook/TikTok) y **título de
   YouTube**. Una sola llamada por pedido (regla dura del proyecto).
- Reglas en código, no en el prompt: largo máximo por red (IG/TikTok 2.200, FB 2.200,
  título YouTube 100), máximo 30 hashtags en Instagram, sin teléfonos ni precios
  inventados. Si la IA devuelve algo que no cumple, se recorta o se reintenta.

### 4.4 Publicación automática (lo que corre solo)
Un proceso programado (pg_cron cada 2 minutos, mismo patrón que `reels-publish`) avanza
**una etapa por envío y por corrida** (un envío = un video × una red). Cada red tiene su
máquina de etapas:

| Red | Cómo | Cuándo arranca |
|---|---|---|
| Instagram | Contenedor REELS con la URL pública → esperar que Meta lo procese → publicar. Reusa `lib/integrations/instagram/publicar.ts`. | A la hora programada. |
| Facebook | Reel de la Página (`video_reels`: iniciar → subir por URL → publicar), con el token de la página. | A la hora programada. |
| YouTube | Subida reanudable por partes; título + descripción; se sube antes y queda **programado en YouTube** para la hora exacta (`publishAt`). | 3 h antes de la hora. |
| TikTok | Envío a la **bandeja de borradores** (subida por partes). El usuario lo termina desde la app. | A la hora programada. |

- **Ningún envío se duplica:** antes de reintentar, cada máquina verifica si el paso ya
  ocurrió (ej. contenedor ya publicado → se marca publicado sin volver a publicar).
- **Fallos:** errores transitorios (red, 5xx, límite de velocidad) se reintentan con
  espera creciente hasta 5 veces; errores definitivos (video rechazado) se marcan
  "Falló" con el motivo legible. Un envío que falla **no frena** a los demás.
- **Límites de cada red que el sistema respeta solo:** TikTok máximo 5 borradores
  pendientes cada 24 h (si se pasa, corre el siguiente al día siguiente y lo avisa en la
  revisión); YouTube cuota diaria de subidas; Instagram 50 publicaciones por API cada 24 h.
- **Interruptor general apagado → no sale nada.** Además cada video valida que su URL sea
  del bucket propio (prefijo exacto), para que nadie pueda hacer publicar un archivo ajeno.

### 4.5 Guardado automático
Cada acción se persiste al instante: la tanda (`borrador` mientras se arma), cada video
con su etapa de preparación, cada cambio de descripción (guardado con espera de 800 ms
como el editor de landings), redes y horarios. Una tanda en borrador aparece en
"Nueva tanda" como **"Seguir con la tanda del 29/10 (20 videos)"**.

### 4.6 Datos (tablas nuevas, ninguna existente se modifica)
- `publicacion_tandas` — estado (borrador/confirmada), ritmo elegido, creada por.
- `publicacion_videos` — tanda, origen (subida/drive + id del archivo), ruta en Storage,
  avance de la copia, miniatura, duración, transcripción con tiempos, descripción,
  título YouTube, fecha/hora programada, hora manual sí/no, orden, estado de preparación.
- `publicacion_envios` — video × red: activo, estado, etapa, ids externos (contenedor,
  post, video), enlace, intentos, próximo intento, último error. Único por (video, red).
- `publicacion_conexiones` — red, cuenta, tokens. **Solo accesible por el servidor**
  (RLS sin políticas para usuarios); los tokens nunca viajan al navegador.
- `publicacion_ajustes` — fila única: interruptor general, horarios por defecto,
  documento de referencia de estilo y fecha en que se aprendió.
- RLS: lectura para admin/dueño/coordinador; todas las escrituras pasan por el servidor.
- Ningún trigger, ningún cambio en `content_pieces`. *(Vincular un video con su pieza de
  la Central queda para después, ver §6.)*

### 4.7 Lo que se dispara hacia afuera
Solo publicaciones en las cuentas conectadas, y solo con el interruptor general prendido.
No se mandan emails ni WhatsApp. No toca campañas de Meta Ads.

## 5. Qué necesita del dueño (para que funcione en producción)
1. **TikTok:** el *client key* y *client secret* de la app (están en TikTok Developers;
   la app vive hoy en el proyecto ContentHub) y agregar en esa app la dirección de
   retorno `https://inmodf.com.ar/api/oauth/tiktok/callback`. Después, Diego toca
   "Conectar TikTok" una vez.
2. **Google:** el *client id* y *secret* del proyecto de Google Cloud que ya tiene YouTube
   (el de ContentHub), habilitar ahí **Google Drive API**, agregar la dirección de retorno
   `https://inmodf.com.ar/api/oauth/google/callback` y confirmar que la pantalla de
   consentimiento está **publicada** (en modo prueba la conexión se cae cada 7 días).
   Después, Diego toca "Conectar YouTube y Drive" una vez con la cuenta dueña del canal.
3. Crear en ese mismo proyecto una **clave de API** restringida a Drive API (para leer
   carpetas compartidas por enlace) y cargar las 5 variables en Netlify
   (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`).

Instagram y Facebook no necesitan nada nuevo si el token de Meta ya tiene permiso de
publicar en la Página (se verifica en la Etapa 2 con una prueba; si falta, se agrega el
permiso al usuario de sistema).

## 6. Qué queda afuera
- Publicar directo (público) en TikTok: requiere que TikTok audite la app. Hasta entonces,
  borrador, como pidió el dueño.
- Google Business Profile (perfil de Google Maps): fuera, salvo que "Google" lo signifique.
- Edición de video, subtítulos, portadas personalizadas: no; se publica el archivo tal cual.
- Métricas de rendimiento por video (vistas, retención): no en esta etapa.
- Vincular cada video con su pieza de la Central `/contenido`: después.
- Respuestas automáticas a comentarios (eso ya existe para reels de propiedades).
- Borrar los videos de Storage después de publicados: no en esta etapa (se anota el costo).

## 7. Criterios de aceptación
1. En `/publicaciones`, admin/dueño/coordinador ven la sección; asesor y abogado no la
   ven en el menú y la ruta les da 403.
2. Al elegir 3 videos de la computadora aparecen 3 filas con miniatura y barra de
   progreso, y en la base quedan 3 `publicacion_videos` de una tanda `borrador`.
3. Al pegar un enlace de carpeta de Drive con 2 videos, se listan, se traen, y quedan en
   Storage con el mismo tamaño que en Drive.
4. Cada video termina en "Listo" con transcripción con tiempos guardada y una descripción
   propuesta que sigue el documento de referencia (sin precios ni teléfonos inventados).
5. En Ajustes se ve el documento de referencia con 100 ejemplos de Diego hablando y
   ningún recorrido de propiedad entre ellos.
6. Elegir "2 por día" con 6 videos desde el jueves muestra la frase y el calendario
   jueves-viernes-sábado con 12:30 y 19:00, y las filas quedan con esas horas.
7. Cambiar la hora de una fila, apagar TikTok en otra y editar una descripción se
   guardan solos: al recargar la página, los cambios siguen.
8. Cerrar la pestaña a mitad de la carga y volver: la tanda aparece como "Seguir con la
   tanda…" y los videos pendientes se retoman.
9. "Programar N videos" pasa la tanda a confirmada y crea un envío por cada red encendida
   de cada video (verificable en `publicacion_envios`).
10. Con el interruptor general apagado, llegada la hora no sale nada y la fila dice
    "Esperando: publicación automática apagada".
11. Con el interruptor prendido, un video `[TEST` programado sale en Instagram, Facebook y
    YouTube (no listado/privado durante el QA) y llega como borrador a TikTok; en
    "Publicado" aparecen los enlaces.
12. Un envío que falla muestra el motivo en castellano y "Reintentar"; los demás envíos del
    mismo video salen igual.
13. Ninguna corrida del proceso automático supera el tiempo de Netlify (se verifica en
    `net._http_response`: todas 200).

## 8. Riesgos (pre-flight)
- **Tiempo de Netlify:** cada llamada hace UNA cosa (un pedazo de copia, una
  transcripción, una descripción, una etapa de una red). Respuestas leídas con helper
  tolerante a HTML de error.
- **pg_cron:** job nuevo, se programa DESPUÉS del deploy, timeout 30 s, verificación por
  `net._http_response`.
- **Migración antes del deploy:** las tablas nuevas deben existir antes del código.
- **Publica en cuentas reales:** interruptor general apagado de fábrica; QA con videos
  `[TEST` y en YouTube como privado; Instagram/Facebook de prueba se borran a mano después
  (se avisa antes de publicar nada real).
- **Tokens:** tabla sin acceso para usuarios; nunca en logs ni en el navegador.
- **Seguridad de URLs:** prefijo exacto del bucket; enlaces de Drive validados por host
  exacto (`drive.google.com`).
- **Permiso de Meta para publicar en la Página:** no verificado todavía; se prueba primero.
- **YouTube:** la documentación oficial (leída el 2026-10-29) dice que los videos de
  proyectos sin verificar **ya no quedan forzados a privado** y que el tope es de 100
  subidas por día (más que suficiente). Se confirma igual con la primera subida privada
  del QA. Un video de más de 3 minutos se sube como video común (no Short) y la revisión
  lo avisa. *(Llamada mía.)*
- **TikTok:** el envío a borradores necesita el permiso `video.upload` aprobado en la app.
  La documentación de ContentHub registra que la app ya respondió desde una cuenta real
  (error de "app sin auditar", que solo da una app en producción), así que se asume
  aprobado; se confirma al conectar la cuenta. La subida es por partes desde el servidor
  (la opción "TikTok baja el archivo de una URL" exige verificar el dominio de Storage,
  que no es nuestro).
- **Memoria del navegador:** sacar el audio de un video de 200 MB carga el archivo en
  memoria; se procesa de a 2 videos a la vez para no trabar la computadora.

## 9. Lo que dejo al plan
Nombres exactos de archivos y rutas, la máquina de etapas de cada red, el formato del
documento de referencia, la animación concreta de las tarjetas, y el orden de entrega por
fases (se propone: 1) carga + descripciones + calendario con guardado; 2) Instagram y
Facebook; 3) YouTube y Drive; 4) TikTok), de modo que cada fase se pueda desplegar y usar
sin esperar a la siguiente.
