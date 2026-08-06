-- =============================================================================
-- Seed: propiedad ficticia "captada" lista para disparar campaña Meta Ads
-- =============================================================================
--
-- USO
-- ---
-- Pegar en Supabase Dashboard → SQL Editor → Run.
-- Idempotente por hora: si la corrés dos veces en el mismo minuto, falla por
-- public_slug duplicado. Esperá 1 min o cambiá el slug manual.
--
-- QUÉ HACE
-- --------
-- 1. Crea un contacto ficticio (propietario)
-- 2. Crea una propiedad con:
--      - photos[] (3 URLs públicas de Unsplash)
--      - latitude / longitude (Palermo, CABA)
--      - status='approved' + legal_status='approved'
--      - public_slug pre-asignado (la landing /p/<slug> queda viva inmediato)
--      - legal_docs (Título + Dominio) marcados como 'approved'
--      - description >= 100 chars (requisito Meta)
-- 3. Marca los listings de Argenprop/Zonaprop como 'disabled' (no se publican
--    de verdad). MercadoLibre queda 'pending' — si no querés que el worker
--    intente publicarlo, descomentá el bloque al final.
-- 4. El trigger `enqueue_meta_campaign_on_capture` detecta status='approved'
--    + lat/lng + fotos y ENCOLA un job en `meta_provision_jobs`
--    (action='create_campaign', status='pending').
-- 5. La Netlify Function `provision-meta-campaigns.mts` corre cada 2 min,
--    lockea el job y crea la campaña en Meta (Campaign + AdSet + Ad,
--    todo en PAUSED hasta que el smoke test de la landing devuelva 200).
--
-- VERIFICAR
-- ---------
-- A los ~3 min:
--   SELECT * FROM meta_provision_jobs WHERE action='create_campaign'
--     ORDER BY created_at DESC LIMIT 5;
--   SELECT * FROM property_meta_campaigns ORDER BY created_at DESC LIMIT 5;
--
-- En Meta Ads Manager:
--   https://business.facebook.com/adsmanager/manage/campaigns
--   Buscar por nombre que arranca con "[Auto] [TEST ..."
--
-- En el navegador:
--   https://inmodf.com.ar/p/test-meta-<algo>
--
-- LIMPIEZA
-- --------
-- Al final del archivo está el bloque DELETE comentado.
-- IMPORTANTE: la propiedad real NUNCA debe matchear el prefijo [TEST.
-- =============================================================================

-- Variable: timestamp único para que slug + address no choquen.
-- Reemplazá <RUNID> manualmente si no usás psql client (Dashboard no expande \set).
-- Ej: '20260521-1530' (YYYYMMDD-HHMM)

DO $$
DECLARE
  v_runid TEXT := to_char(NOW(), 'YYYYMMDD-HH24MI');
  v_test_prefix TEXT;
  v_contact_id UUID;
  v_property_id UUID;
  v_slug TEXT;
BEGIN
  v_test_prefix := '[TEST ' || v_runid || ']';
  v_slug := 'test-meta-' || lower(v_runid);

  -- 1. Contacto ficticio (propietario)
  INSERT INTO public.contacts (full_name, phone, email, origin, notes)
  VALUES (
    v_test_prefix || ' Propietario Ficticio',
    '+541100000000',
    'test-' || v_runid || '@inmodf.test',
    'referido',
    'Contacto generado por seed-test-property.sql para probar pipeline Meta. Eliminar después de la prueba.'
  )
  RETURNING id INTO v_contact_id;

  -- 2. Propiedad captada y aprobada
  INSERT INTO public.properties (
    address, neighborhood, city, property_type,
    rooms, bedrooms, bathrooms, garages,
    covered_area, total_area, floor, age,
    asking_price, currency, commission_percentage,
    status, legal_status,
    photos,
    latitude, longitude,
    description,
    amenities,
    operation_type, title, expensas,
    public_slug,
    contact_id,
    legal_docs,
    legal_flags,
    origin
  )
  VALUES (
    v_test_prefix || ' Av Test 1234',
    'Palermo',
    'CABA',
    'departamento',
    3, 2, 1, 1,
    70, 75, 5, 10,
    180000, 'USD', 3,
    'approved', 'approved',
    ARRAY[
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1920',
      'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1920',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1920'
    ],
    -34.5810,   -- Palermo, CABA
    -58.4290,
    'PROPIEDAD DE PRUEBA INTERNA — Departamento luminoso de 3 ambientes con balcón aterrazado, vista despejada y excelente luminosidad natural durante todo el día. Cocina integrada, dormitorios amplios y baño completo. Este aviso es solo para pruebas técnicas internas — será eliminado después de la auditoría.',
    '["pileta", "parrilla", "sum", "laundry"]'::jsonb,
    'venta',
    v_test_prefix || ' Depto 3 amb Palermo',
    50000,
    v_slug,
    v_contact_id,
    -- legal_docs: Título y Dominio ya aprobados para que pase legal_status='approved'
    jsonb_build_object(
      'titulo', jsonb_build_object(
        'file_url', 'https://example.com/test-titulo.pdf',
        'file_name', 'titulo-test.pdf',
        'status', 'approved',
        'reviewer_notes', 'Aprobado por seed de prueba',
        'reviewed_at', NOW()
      ),
      'dominio', jsonb_build_object(
        'file_url', 'https://example.com/test-dominio.pdf',
        'file_name', 'dominio-test.pdf',
        'status', 'approved',
        'reviewer_notes', 'Aprobado por seed de prueba',
        'reviewed_at', NOW()
      )
    ),
    -- legal_flags: ninguna documentación condicional necesaria
    '{"has_succession": false, "has_divorce": false, "has_powers": false, "is_credit_purchase": false}'::jsonb,
    'embudo'
  )
  RETURNING id INTO v_property_id;

  -- 3. Bloquear publicación en Argenprop / Zonaprop (no querés un aviso falso
  --    visible en portales reales). Los listings los creó el trigger
  --    enqueue_property_listings cuando insertamos la property.
  UPDATE public.property_listings
  SET status = 'disabled',
      last_error = 'Bloqueado: propiedad ficticia de auditoría (seed-test-property.sql)'
  WHERE property_id = v_property_id
    AND portal IN ('argenprop', 'zonaprop')
    AND status = 'pending';

  -- (Opcional) bloquear también MercadoLibre si NO querés probar el flujo de ML
  -- Descomentar las próximas 4 líneas:
  -- UPDATE public.property_listings
  -- SET status = 'disabled',
  --     last_error = 'Bloqueado: propiedad ficticia (sin probar ML)'
  -- WHERE property_id = v_property_id AND portal = 'mercadolibre' AND status = 'pending';

  RAISE NOTICE '✅ Propiedad de prueba creada';
  RAISE NOTICE '   property_id : %', v_property_id;
  RAISE NOTICE '   contact_id  : %', v_contact_id;
  RAISE NOTICE '   slug        : %', v_slug;
  RAISE NOTICE '   landing     : https://inmodf.com.ar/p/%', v_slug;
  RAISE NOTICE '';
  RAISE NOTICE 'El trigger enqueue_meta_campaign_on_capture debería haber encolado';
  RAISE NOTICE 'un job en meta_provision_jobs. Verificar con:';
  RAISE NOTICE '  SELECT * FROM meta_provision_jobs WHERE property_id = ''%'' ORDER BY created_at DESC;', v_property_id;
END;
$$;

-- =============================================================================
-- VERIFICACIÓN INMEDIATA (correr en segundo SQL si querés)
-- =============================================================================
-- SELECT id, address, status, legal_status, public_slug, photos[1] AS first_photo,
--        latitude, longitude, created_at
-- FROM public.properties
-- WHERE address LIKE '[TEST %'
-- ORDER BY created_at DESC LIMIT 5;

-- SELECT property_id, action, status, attempts, next_attempt_at, last_error, created_at
-- FROM public.meta_provision_jobs
-- ORDER BY created_at DESC LIMIT 10;

-- A los ~3 min (después de que corra el worker):
-- SELECT property_id, campaign_id, adset_id, status, budget_daily, landing_url, last_error
-- FROM public.property_meta_campaigns
-- ORDER BY created_at DESC LIMIT 5;

-- =============================================================================
-- LIMPIEZA — DESCOMENTAR Y CORRER MANUALMENTE CUANDO TERMINES LA PRUEBA
-- =============================================================================
-- WARNING: NO ejecutar masivamente. Filtrar por prefijo [TEST.
-- Esto borra: property + (cascade) listings + meta_campaigns + meta_metrics
-- + meta_provision_jobs + property_leads + property_visits.
-- NO archiva la campaña en Meta — si querés archivarla allá, ejecutá ANTES
-- el endpoint DELETE /api/admin/pipeline-test?propertyId=<id> (loggeado como admin).
--
-- WITH test_props AS (
--   SELECT id FROM public.properties WHERE address LIKE '[TEST %'
-- )
-- DELETE FROM public.contacts
-- WHERE id IN (
--   SELECT contact_id FROM public.properties WHERE id IN (SELECT id FROM test_props)
-- );
--
-- DELETE FROM public.properties WHERE address LIKE '[TEST %';
