# Mapa propio para las descripciones: que la zona funcione 1.000 de 1.000 veces

- **Fecha:** 2026-09-19 · **Tamaño:** grande (PostGIS, ~30.000 filas, tarea programada). OK del dueño: "Si, avanza".
- **Rama:** `feat/mapa-propio`

## Problema (investigado, con evidencia)

Al regenerar Hipólito Yrigoyen 1550, la descripción salió sin distancias ni colectivos ("El mapa no respondió") y con un aviso falso de dormitorios.

1. **El mapa depende de servidores públicos gratuitos de OpenStreetMap, consultados en vivo.**
   - En producción falló 1 de 5 investigaciones de zona.
   - Reproducido con las coordenadas de la propiedad (5 rondas): el servidor principal tardó 6–9 s y una vez devolvió 429 ("demasiados pedidos"); el de respaldo devolvió 504 dos veces, no respondió en 30 s una vez y tardó 14 s cuando respondió. En la ronda 4 fallaron los dos a la vez.
   - Esos servidores limitan por IP y Netlify comparte IP con miles de sitios.
   - Reintentar mejora la probabilidad pero nunca llega al 100 %.
2. **El control de dormitorios da un falso positivo con 1 dormitorio.** "El dormitorio principal…" no contaba (solo aceptaba "1 dormitorio"/"un dormitorio"), así que pidió una corrección de más y dejó un aviso falso.

## Solución

### Mapa propio (PostGIS)

- **Datos:** los lugares del AMBA se guardan en nuestra base, desde OpenStreetMap, la misma fuente de hoy:
  - estaciones de subte y tren con sus líneas;
  - paradas de colectivo con sus líneas;
  - **tramos de recorrido de colectivo** con su trazado y las líneas que pasan por él (agregado en la verificación, ver Riesgos);
  - plazas y parques, colegios, universidades y hospitales.

  Medido: 65.252 filas (28.065 lugares y paradas + 37.187 tramos de recorrido).
- **Tablas:**
  - `mapa_lugares`: tipo, nombre, líneas, ubicación `geography` (punto, o línea para los tramos) con índice GiST, celda y fecha;
  - `mapa_celdas`: grilla de 0,05° del AMBA con su estado y fecha de actualización.
- **Consulta:** `lugares_cercanos(lat, lng, radios)` devuelve lo que hay dentro de los radios de siempre (estaciones 1.500 m, plazas 1.000, colegios y universidades 600, hospitales 500, paradas y tramos de recorrido 400), con la distancia calculada. Sin servicios externos, en milisegundos.
- **Carga inicial: desde el archivo de OpenStreetMap de Geofabrik**, no desde Overpass. La carga celda por celda contra Overpass terminó con la IP bloqueada. El archivo de Argentina (430 MB) se baja entero y sin límites: `scripts/mapa-extraer-osm.py` (4 min) + `scripts/mapa-cargar-archivo.ts` (~15 min). Es también la **actualización completa y confiable**.
- **Actualización mensual automática (un extra):** pg_cron → `POST /api/cron/mapa-lugares`, una celda por corrida, la más vieja primero. Solo toca celdas con más de 30 días.
  - Verificado: para una misma celda, Overpass y el archivo dan exactamente las mismas filas (3.145 en la celda más densa, en los 8 tipos).
  - Pero Overpass tarda 15–23 s en esa celda (y 11–19 s con un cuarto de celda: es la lentitud del servidor, no el tamaño), así que las celdas densas a veces no llegan en el tiempo de Netlify.
  - Si Overpass falla, la celda conserva sus datos anteriores y se reintenta a la hora. Nunca empeora los datos.
  - Una celda solo borra las filas propias que dejaron de existir, y solo después de descargar bien.
- **Cobertura:** antes de consultar se verifica que las celdas alrededor de la propiedad estén cargadas.
  - Con celdas sin cargar (hoy no hay), se consulta en vivo, con la regla nueva de abajo.
  - **Pin fuera del AMBA → error claro que pide corregir la ubicación.** En la práctica es un pin mal puesto: Almafuerte 2500 (San Martín) lo tiene en Junín, y el texto habría descrito otra ciudad.
  - **La zona guardada se rehace si cambia el pin** (`firmaZona` = dirección + pin). Antes solo miraba la dirección: corregir el pin y regenerar reusaba el mapa del pin viejo.

### Nunca un texto sin mapa en silencio

- **Si el mapa no está:** la etapa de zona devuelve error y NO escribe texto sin distancias.
- **Si la búsqueda web no responde:** también devuelve error. Antes se seguía sin ella.
- **Propiedad sin coordenadas:** error claro que pide cargar la ubicación en la ficha, en vez de escribir sin distancias.
- **Reintento automático:** el panel reintenta solo los pasos que fallan por corte momentáneo (502, 503, 504 o red), dos veces con espera (2 s y 5 s), antes de mostrar "Reintentar". Los errores de datos (409, 403) no se reintentan.

### Dormitorios

- **Control:** con 1 dormitorio, "el dormitorio", "un dormitorio" o "1 dormitorio" cuentan como dicho.
- **Prompt:** con 1 dormitorio se escribe "el dormitorio", nunca "el dormitorio principal".

## Criterios de aceptación

1. `mapa_lugares` cargada en todo el AMBA y `mapa_celdas` con todas las celdas en `ok`.
2. Para Perón 4227, Doblas 248 y Hipólito Yrigoyen 1550, los lugares y colectivos del mapa propio coinciden con los de la consulta en vivo (mismas estaciones y distancias ±5 m; colectivos iguales o con diferencias explicadas).
3. Zona de las 31 propiedades activas desde el mapa propio: 31 de 31 con lugares, sin llamar a Overpass.
4. 1.000 consultas de puntos al azar del AMBA: 1.000 de 1.000 respondidas; se informan el tiempo medio y el peor.
5. La etapa de zona nunca devuelve "sin mapa" dentro del AMBA; con el pin fuera del AMBA da un error que pide corregir la ubicación (no un texto sobre otra ciudad).
6. El panel reintenta solo ante 5xx o red, y no ante 4xx (test).
7. El control de dormitorios acepta "el dormitorio" con 1 dormitorio (test con la frase real).
8. La actualización mensual: la ruta con `?ping=1`, autenticación dual, una celda por corrida; job programado y verificado en 3 capas.
9. **Prueba real:** Hipólito Yrigoyen 1550 regenerada en la vista previa, con distancias y colectivos, sin avisos.

## Riesgos

- 🔴 **Orden de despliegue:** activar PostGIS, crear las tablas y hacer la carga inicial ANTES del deploy. Con el código nuevo y las celdas vacías, la zona caería a la consulta en vivo (con el error reintentable), no a texto sin mapa. El job mensual se programa DESPUÉS del deploy.
- 🟡 **Tamaño:** 65.000 filas con índice GiST, trivial para Postgres (medido: 529 ms promedio por consulta desde acá, incluida la red).
- 🟡 **Diferencias de colectivos (resuelto en la verificación):** la primera versión contaba solo las líneas con una parada a 400 m. Contra la consulta en vivo le faltaban líneas (Perón 4227: 19 y 109; Doblas 248: 25 y 145) porque a muchas rutas les faltan las paradas en OpenStreetMap. Se sumaron los tramos de recorrido: ahora cuenta, como en vivo, toda línea con una parada o un tramo a 400 m, y PostGIS mide la distancia a la calle por donde pasa (migración `20260919000004`).
- 🟢 **RLS:** tablas sin políticas (solo el servidor); la consulta es una función `SECURITY DEFINER` ejecutable solo por el service role.
