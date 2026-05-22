-- =============================================================================
-- Seed: propiedad ficticia "captada" para probar el flujo MANUAL F0–F4
-- =============================================================================
--
-- Esta propiedad queda en estado 'approved' (captada) pero SIN encolar nada
-- en property_listings ni meta_provision_jobs — porque los triggers de
-- auto-publicación ya están dropeados (migración 20260522000001).
--
-- Vos vas a ir a /properties, vas a verla, vas a entrar al detalle, y vas a
-- ver la tarjeta "Propiedad captada ✓" con los dos botones grandes para
-- decidir manualmente publicar en MercadoLibre o lanzar Meta Ads.
--
-- USO
-- ---
-- Pegar TODO el bloque DO $$ ... END $$; en Supabase Dashboard → SQL Editor
-- → Run. Idempotente por minuto: si lo corrés dos veces seguidas falla por
-- public_slug duplicado. Esperá 1 min o cambiá manualmente el slug.
--
-- LIMPIEZA (al final del archivo, COMENTADA por seguridad).
-- =============================================================================

DO $$
DECLARE
  v_runid TEXT := to_char(NOW(), 'YYYYMMDD-HH24MI');
  v_property_id UUID;
  v_admin_id UUID;
BEGIN
  -- Asignamos la propiedad al primer admin/dueño disponible, así el flow de
  -- email de lead nuevo tiene a quién mandarle.
  SELECT id INTO v_admin_id
  FROM public.profiles
  WHERE role IN ('admin', 'dueno')
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  INSERT INTO public.properties (
    address, neighborhood, city, property_type,
    rooms, bedrooms, bathrooms, garages,
    covered_area, total_area, floor, age,
    asking_price, currency, commission_percentage,
    status, legal_status,
    photos, latitude, longitude,
    description, amenities, operation_type, title, expensas,
    public_slug, origin,
    assigned_to,
    legal_docs, legal_flags
  )
  VALUES (
    '[PRUEBA ' || v_runid || '] Av Santa Fe 1234',
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
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1920',
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1920'
    ],
    -34.5810,
    -58.4290,
    'PROPIEDAD DE PRUEBA INTERNA — Departamento luminoso de 3 ambientes con balcón aterrazado, vista despejada y excelente luminosidad natural durante todo el día. Cocina integrada, dormitorios amplios y baño completo. Edificio con pileta, parrilla y SUM. Este aviso es solo para pruebas técnicas internas y va a ser eliminado después de la auditoría.',
    '["pileta", "parrilla", "sum", "laundry"]'::jsonb,
    'venta',
    '[PRUEBA ' || v_runid || '] Depto 3 amb Palermo',
    50000,
    'prueba-' || lower(v_runid),
    'embudo',
    v_admin_id,
    -- legal_docs vacíos pero la propiedad ya está aprobada (saltea el flow legal)
    jsonb_build_object(
      'titulo', jsonb_build_object(
        'status', 'approved',
        'reviewer_notes', 'Aprobado para prueba interna',
        'reviewed_at', NOW()
      )
    ),
    '{"has_succession": false, "has_divorce": false, "has_powers": false, "is_credit_purchase": false}'::jsonb
  )
  RETURNING id INTO v_property_id;

  RAISE NOTICE '✅ Propiedad de prueba creada';
  RAISE NOTICE '   ID interno      : %', v_property_id;
  RAISE NOTICE '   Dirección       : [PRUEBA %] Av Santa Fe 1234, Palermo, CABA', v_runid;
  RAISE NOTICE '   Asignada a      : % (admin/dueño)', v_admin_id;
  RAISE NOTICE '   Slug            : prueba-%', lower(v_runid);
  RAISE NOTICE '   Landing pública : https://inmodf.com.ar/p/prueba-%', lower(v_runid);
  RAISE NOTICE '';
  RAISE NOTICE 'Ahora andá a https://inmodf.com.ar/properties y abrí esta propiedad.';
  RAISE NOTICE 'Vas a ver la tarjeta "Propiedad captada ✓" con los 2 botones grandes.';
END;
$$;

-- =============================================================================
-- LIMPIEZA — descomentar y correr cuando termines las pruebas.
-- =============================================================================
-- Borra TODAS las propiedades de prueba (las que arrancan con "[PRUEBA ").
-- CASCADE borra automáticamente sus listings, métricas, campañas, leads.
-- IMPORTANTE: el filtro de prefijo es estricto — no toca propiedades reales.
-- -----------------------------------------------------------------------------
-- DELETE FROM public.properties WHERE address LIKE '[PRUEBA %';
