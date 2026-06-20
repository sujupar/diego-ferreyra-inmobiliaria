# Plan — Curva de retención de video detallada (dónde abandona la audiencia)

## Problema
El panel Embudos muestra la retención solo en buckets gruesos (25/50/75/95/100%).
Si alguien ve el 7%, aparece "0 personas en 25%" y no se ve **dónde** abandonó.
El cliente quiere pinpoint exacto: *"la mayoría deja de ver en el 17%"*.

## Insight
Ya guardamos `video_view_state.max_percent` por espectador con **precisión del 1%**
(el punto más lejano alcanzado). La data fina YA EXISTE — solo falta visualizarla.
`watch_seconds` (atención real) sigue siendo el número honesto del promedio.

## v1 — Curva de retención + punto de abandono (desde data existente) ⭐ recomendado
Sin tocar el tracking. Responde exactamente "dónde abandonan".

**Backend:**
- RPC `funnel_video_retention(p_from, p_to)` → por (funnel, video_key, segmento, etapa)
  devuelve el **histograma de `max_percent`** (cuántos espectadores tienen max_percent = N,
  para N en 0..100). Compacto (≤101 filas por grupo) y escalable.

**Frontend (EmbudosClient, reemplaza/expande el bloque de cuartiles):**
1. **Curva de retención** (Recharts AreaChart, estilo YouTube): para cada punto X del
   video (0→100%), % de espectadores que llegó **al menos** a X (curva acumulada
   descendente desde 100%). El "codo" = caída masiva.
2. **Punto de abandono** (BarChart): histograma de dónde dejó de ver cada uno → muestra
   el % más común de abandono.
3. **Métricas destacadas:** abandono mediano ("el 50% abandona antes del X%"), % que pasó
   hitos clave configurables.
4. **Resolución ajustable** en el panel: cada 10% / 5% / 1% (toggle), porque la data es 1%.
5. Respeta los filtros actuales (segmento `no_registrado`/`registrado` + etapa del deal),
   para correlacionar "los captados retienen hasta el 80%".

**Migración:** `2026XXXX_funnel_video_retention.sql` (solo la RPC nueva, aditiva).

## v2 — Retención segundo a segundo (opcional, futuro)
Mapa de calor real de qué momentos del video se ven / saltan / re-ven (como el "audience
retention" de YouTube). Más preciso para "qué partes aburren", pero requiere:
- Cliente: enviar el **bitmap de segundos vistos** (no solo el tamaño).
- Backend: tabla de retención por bucket de tiempo + agregación.
Más trabajo y más data. Solo si se quiere granularidad por momento, no solo por profundidad.

## Qué NO cambia
- El tracking, el endpoint, el stitching, la atribución, /metrics. Todo aditivo.
- `max_percent` puede inflarse levemente con seeks; para visionado lineal (caso real) es
  preciso. La atención (`watch_seconds`) sigue siendo el promedio honesto.
