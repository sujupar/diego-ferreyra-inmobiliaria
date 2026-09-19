# Mapa propio — Plan

> Inline, TDD en `lib/`. Spec: `docs/superpowers/specs/2026-09-19-mapa-propio-design.md`.

1. **Base de datos**
   - Migración `20260919000003_mapa_lugares.sql`: PostGIS (esquema `extensions`), `mapa_lugares`, `mapa_celdas`, función `lugares_cercanos`, RLS sin políticas y permisos solo para el service role.
   - Script de aplicación con verificación.
2. **Celdas (puro)** — `lib/mapa/celdas.ts`:
   - el AMBA y la grilla de 0,05°;
   - `idCelda`, `celdaDe(lat, lng)`, `celdasCubriendo(lat, lng, metros)`, `todasLasCeldas()`.
   - Tests con puntos reales y bordes.
3. **Descarga de una celda (puro + IO)** — `lib/mapa/overpass-celda.ts`:
   - `consultaCelda(bbox)` y `filasDesdeRespuesta(json, bbox)`: estaciones con TODAS sus líneas, lugares con centro, paradas con líneas de colectivo por membresía de ruta y solo los puntos dentro de la celda;
   - `descargarCelda` con los dos servidores a la vez.
   - Tests con un JSON armado a partir de la respuesta real.
4. **Guardar una celda (IO)** — `lib/mapa/guardar-celda.ts`:
   - upsert por lotes;
   - borrar las filas propias que ya no vinieron, solo si la descarga fue buena;
   - actualizar `mapa_celdas` (estado, filas, error, fecha).
5. **Carga inicial** — `scripts/mapa-cargar.ts`:
   - todas las celdas, con reintentos y pausa;
   - informe de celdas ok / con error.
   - Correr hasta tener todas en `ok`.
6. **Consultar (IO)** — `lib/mapa/consultar.ts`:
   - `lugaresDesdeBase(lat, lng)` verifica la cobertura y llama a la RPC;
   - la selección y el tope por tipo se comparten con el camino en vivo (refactor en `zona-mapa.ts`: `seleccionarLugares`, `normalizarLineaColectivo`).
7. **Etapa de zona** — `servicio.ts`:
   - primero la base; si no hay cobertura, la consulta en vivo;
   - si el mapa o la web faltan → `ErrorDescripcion` reintentable (503);
   - sin coordenadas → 409 con instrucción.
8. **Panel**: reintento automático (2) ante 5xx o red. Test.
9. **Dormitorios**: control y prompt. Tests con la frase real.
10. **Verificación**
    - `scripts/mapa-verificar.ts`: comparación base vs. en vivo (Perón, Doblas, Hipólito), las 31 propiedades y los 1.000 puntos al azar.
11. **Actualización mensual**
    - Ruta `app/api/cron/mapa-lugares` (ping, autenticación dual, celda más vieja con más de 30 días).
    - Migración del job + script (después del deploy).
12. **Cierre**: revisión adversarial, PR, QA en la vista previa (Hipólito Yrigoyen), merge, deploy, programar el job y verificarlo, CLAUDE.md, reporte.
