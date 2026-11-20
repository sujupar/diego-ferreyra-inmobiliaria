# Métricas del video de las landings: cuánto vio cada persona, registrados vs no registrados

**Fecha:** 2026-11-20 · **Pedido del dueño:** "las métricas de video de la landing son muy imprecisas. Necesito saber cuánto vio cada persona y, en promedio, cuánto vieron los que se registraron y cuánto los que no."

## 1. Qué está mal hoy (diagnóstico con datos, últimos 30 días)

| Video | Filas con ≤ 2 s vistos | Filas que nunca se actualizaron después del primer envío |
|---|---|---|
| `hero-tasacion-neta` (VSL largo) | 85 % | 57 % |
| `hero-tasacion-neta-corto` | 75 % | 53 % |

Causas, leídas en el código (`components/funnel/FunnelClickToPlayVideo.tsx`):

1. **El primer envío sale en 0 segundos.** `handlePlaying` manda el estado apenas arranca el video, antes de que se cuente ningún segundo. El siguiente envío recién sale a los **15 s** (`timeupdate`) o al pausar / ocultar la página.
2. **El navegador de Instagram/Facebook cierra sin avisar.** El ~87 % del tráfico es celular dentro de esas apps; ahí `pagehide`/`visibilitychange` muchas veces no llegan. Quien mira 12 s y cierra queda registrado con 0–1 s.
3. **Los segundos se cuentan muestreando `timeupdate` una vez por segundo.** Si el navegador frena ese evento (pestaña en segundo plano, celular con poca batería), se pierden segundos que sí se reprodujeron.
4. **No existe el denominador.** Solo hay fila para quien tocó play, así que el panel dice "60 plays de 60 cargas (100 %)". Quien entró y no tocó play (el 0 %) no aparece en ningún lado, y no se puede comparar "los que no se registraron vieron en promedio X".

## 2. Qué se construye

### 2.1 Medición (navegador)

- **Segundos vistos = `video.played`**, el registro que lleva el propio navegador de los tramos efectivamente reproducidos. Se convierte a segundos únicos, así que adelantar o volver atrás no infla nada. Reemplaza al muestreo de `timeupdate` (que queda solo para la barra visual).
- **Latido cada 5 s mientras el video se reproduce** (`fetch` con `keepalive`). Lo peor que se pierde al cerrar de golpe son 5 s, no 15 s ni todo.
- **Copia de respaldo en el teléfono** (`localStorage`): cada envío guarda el último estado; si la persona vuelve a la landing, se reenvía. El servidor se queda con el máximo, así que reenviar no duplica.
- Se mantiene el envío al pausar, terminar, ocultar y cerrar.

### 2.2 Denominador y cruce (servidor, lógica pura testeada)

- **Visitante** = una fila de `heatmap_session_state` de esa página en el período (una por persona y página; ya la escribe cada landing al cargar, con el mismo `anon_id` que el video).
- **Video de esa página** = las claves de `lib/funnel/video-keys.ts` asignadas a esa página (se agrega el campo `pagina` al catálogo).
- **Registrado** = el visitante tiene contacto (en la sesión o en `anon_identity`) y ese contacto NO es de prueba (`contactosDePrueba`: Julián, `[TEST`, `@prueba.local`…). Los contactos de prueba se sacan del conteo entero, no se pasan a "no registrado".
- **% visto de una persona** = segundos únicos vistos ÷ duración del video, tope 100 %. Quien no tocó play = 0 %.

### 2.3 Panel en Métricas (`/metrics`, "Panel de negocio", junto a "Video de las landings")

Por cada landing, dos columnas — **Se registraron** / **No se registraron** — con:

| Fila | Qué es |
|---|---|
| Personas | n de cada grupo (siempre visible) |
| Tocó play | % del grupo |
| % del video visto, promedio de TODOS | incluye a los que no tocaron play (0 %) |
| % del video visto, promedio de los que tocaron play | la atención de quien sí lo miró |
| Segundos vistos en promedio (de los que tocaron play) | |
| Llegó al final | % de los que tocaron play |

Más la **curva de retención** de los dos grupos superpuestas: de los que tocaron play, qué % seguía mirando en cada punto del video.

Reglas: cada cifra lleva su n; con n < 20 se avisa "pocos casos, tomar con cuidado". Si el período empieza antes de la fecha de esta medición nueva, se avisa que los datos anteriores subestiman lo visto.

## 3. Criterios de aceptación

1. Mirar 12 s del video en un celular y cerrar la app sin pausar → la base registra ≥ 10 s (hoy registra 0–1).
2. Adelantar al 90 % y mirar 3 s → cuenta ~3 s, no 90 %.
3. Una visita que no toca play aparece en el panel como "no tocó play" con 0 %.
4. Los promedios por grupo del panel coinciden con un cálculo independiente hecho a mano contra la base para el mismo período.
5. Las pruebas de Julián no cuentan en ningún grupo.
6. El visor del mapa de calor (`hm_preview=1`) sigue sin registrar nada.
7. La landing no se vuelve más lenta: no se agrega nada al primer pintado; el latido solo corre mientras el video se reproduce.

## 4. Riesgos y cómo se cubren

- **Más pedidos al servidor:** ~1 cada 5 s solo mientras alguien mira. Con ~20 visitas/día y ~12 % que da play, son unos cientos de pedidos por día. Despreciable.
- **Datos viejos:** no se pueden reparar (se perdieron en el navegador). El panel lo avisa.
- **Sin migración de base:** el cruce se hace en el servidor de la app con los datos que ya existen (cientos de filas por mes), así que no hay ventana de deploy riesgosa.
- **Control cruzado externo (PostHog):** queda como paso aparte, opcional. Necesita crear una cuenta y su aviso de cookies; se le propone al dueño después de ver los primeros días de datos propios.
