# Sistema de publicación automática en portales

Documentación operacional. Spec arquitectónico en
`docs/superpowers/specs/2026-05-12-portales-meta-ads-design.md`.

## Trigger

Cuando una propiedad cumple las 3 condiciones simultáneamente:

- `properties.status = 'approved'`
- `properties.legal_status = 'approved'`
- `array_length(properties.photos, 1) >= 1`

el trigger `enqueue_property_listings` inserta una fila en
`property_listings` por cada portal (`mercadolibre`, `argenprop`,
`zonaprop`) con `status='pending'`.

## Worker

`netlify/functions/publish-listings.mts` corre **cada 1 min**. Procesa:

1. Listings con `metadata.needs_unpublish = true` → `adapter.unpublish()`.
2. Listings con `metadata.needs_update = true` → `adapter.update()`.
3. Listings `status='pending'` cuyo `next_attempt_at <= NOW()` → `adapter.publish()`.

Si un portal está `enabled=false`, sus listings se quedan `pending` sin
consumir intentos (event_type='skipped_disabled' en audit log).

## Métricas

`netlify/functions/sync-portal-metrics.mts` corre **cada 6 h**. Para
cada listing `published` con adapter `enabled`, llama `fetchMetrics` y
upsert en `property_metrics_daily`.

## Activar un portal

### MercadoLibre

1. Setear `ML_APP_ID` + `ML_SECRET_KEY` en env vars de Netlify.
2. Ir a `/settings/portals` y click en "Conectar cuenta vía OAuth".
3. El callback guarda tokens en `portal_credentials` con `enabled=true`.

### Argenprop / ZonaProp

1. Recibir credenciales por email (ver instrucciones en spec).
2. Setear las 2 env vars correspondientes en Netlify
   (`ARGENPROP_API_KEY`+`ARGENPROP_CLIENT_CODE` o el equivalente ZP).
3. Ir a `/settings/portals` y activar el portal.
4. El próximo tick del worker (1 min) procesa los pending acumulados.

## Backfill de lat/lng

Las propiedades anteriores a esta feature no tienen `latitude`/`longitude`.

```bash
GOOGLE_GEOCODING_API_KEY=... npm exec tsx scripts/backfill-property-geocode.ts
```

Geocodea con Google Maps API (region=ar), rate limit 100ms/llamada.

## Endpoints relevantes

- `GET /api/properties/[id]/listings` — estado por portal.
- `GET /api/properties/[id]/portal-metrics?days=N` — agregado diario.
- `POST /api/properties/[id]/listings/[listingId]/retry` — reintento manual.
- `GET /api/admin/portal-credentials` (admin/dueno) — flags enabled.
- `PATCH /api/admin/portal-credentials` (admin/dueno) — flip enabled.
- `GET /api/admin/portal-health` — resumen 24 h de éxitos/errores.

## Edición y despublicación

- Si una propiedad ya publicada cambia precio/título/descripción/fotos/
  amenities/expensas/video/tour3d, el trigger `requeue_listings_on_update`
  marca `metadata.needs_update = true` en los listings published.
- Si la propiedad pasa a `status='sold'` o `'withdrawn'`, marca
  `metadata.needs_unpublish = true`.

El worker procesa estas actualizaciones automáticamente.

## Auditoría

Cada evento se loguea en `property_publish_events` con `event_type`:
- `published`, `updated`, `unpublished`
- `retried`, `failed`, `skipped_disabled`

Query útil:

```sql
SELECT created_at, portal, event_type, error_message
FROM property_publish_events
WHERE property_id = '...'
ORDER BY created_at DESC;
```

## Permisos

| Rol | Ver publicación | Reintento manual | Settings credenciales |
|---|---|---|---|
| admin / dueno | Todas | Todas | ✓ |
| coordinador | Todas | Todas | ✗ |
| asesor | Sus propiedades | Sus propiedades | ✗ |
| abogado | ✗ | ✗ | ✗ |
