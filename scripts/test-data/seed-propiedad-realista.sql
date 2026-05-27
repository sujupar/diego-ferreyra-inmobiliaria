-- =============================================================================
-- Seed: propiedad ficticia REALISTA para test del wizard Meta Ads
-- =============================================================================
-- Datos plausibles de una propiedad típica de Palermo Chico (CABA):
-- 4 ambientes, 95 m² cubiertos, USD 285.000, edificio premium con amenities,
-- piso 7° A, antigüedad 15 años, descripción profesional, 8 fotos de
-- departamento moderno luxury en Buenos Aires (Unsplash, free-license).
--
-- USO:
-- Pegar el bloque DO $$ ... END $$; en Supabase Dashboard → SQL Editor → Run.
-- Idempotente por minuto (slug usa timestamp). Si lo corrés dos veces
-- seguidas falla por public_slug — esperá 1 min.
--
-- LIMPIEZA al final (comentada por seguridad).
-- =============================================================================

DO $$
DECLARE
  v_runid TEXT := to_char(NOW(), 'YYYYMMDD-HH24MI');
  v_property_id UUID;
  v_admin_id UUID;
BEGIN
  -- Buscar primer admin/dueño activo para asignarle la propiedad
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
    -- Dirección real-style de Palermo Chico (sin número real para privacidad)
    '[REAL TEST ' || v_runid || '] Av. Cabello 3450, Piso 7° A',
    'Palermo',
    'CABA',
    'departamento',
    -- 4 ambientes, 3 dormitorios, 2 baños, 1 cochera
    4, 3, 2, 1,
    -- 95 m² cubiertos, 105 m² totales (con balcón aterrazado), piso 7, 15 años
    95, 105, 7, 15,
    -- USD 285.000 a 3% comisión
    285000, 'USD', 3,
    -- Captada y aprobada
    'approved', 'approved',
    -- 8 fotos de departamento moderno luxury Buenos Aires (Unsplash, free-license)
    ARRAY[
      -- Living amplio con luz natural
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=85',
      -- Cocina integrada con isla moderna
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1920&q=85',
      -- Dormitorio principal con ventanal
      'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1920&q=85',
      -- Balcón aterrazado con vista verde
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1920&q=85',
      -- Baño moderno con detalles premium
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1920&q=85',
      -- Pileta climatizada del edificio
      'https://images.unsplash.com/photo-1582610116397-edb318620f90?w=1920&q=85',
      -- Vista panorámica desde el piso
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1920&q=85',
      -- SUM con parrilla del edificio
      'https://images.unsplash.com/photo-1565183997392-2f6f122e5912?w=1920&q=85'
    ],
    -- Coordenadas Palermo Chico (Av. Cabello y Salguero approx)
    -34.5775,
    -58.4090,
    -- Descripción profesional con foco en lifestyle, no en specs
    'Departamento de 4 ambientes en planta alta de un edificio de categoría sobre la Av. Cabello, una de las arterias más tranquilas de Palermo Chico. El living-comedor tiene doble orientación con ventanales del piso al techo que dan al balcón aterrazado de uso exclusivo —el espacio donde el departamento realmente se vive— con vista al verde del parque y orientación norte que entrega luz natural durante todo el día. La cocina es integrada con isla y bachas dobles, terminaciones en granito gris y muebles de melamina blanca. Tres dormitorios amplios, el principal en suite con baño completo, vestidor y placards a medida. Dependencia de servicio con lavadero independiente. El edificio cuenta con seguridad 24hs, pileta climatizada, SUM con parrilla cubierta, gimnasio totalmente equipado y bauleras. Cochera fija cubierta incluida. Una propiedad pensada para quien busca el equilibrio entre la calma residencial y la cercanía a los polos gastronómicos y comerciales de Palermo.',
    -- Amenities completos
    '["pileta", "parrilla", "sum", "gimnasio", "seguridad_24hs", "baulera", "lavadero", "balcon_aterrazado", "vestidor", "cocina_integrada", "ventanales_piso_techo"]'::jsonb,
    'venta',
    -- Título comercial sin clichés
    'Departamento 4 amb en Palermo Chico con balcón aterrazado',
    -- Expensas típicas de edificio premium Palermo
    95000,
    -- Slug para landing pública
    'real-test-' || lower(v_runid),
    -- Origen del embudo
    'embudo',
    v_admin_id,
    -- Legal docs marcados como aprobados (saltea flow legal)
    jsonb_build_object(
      'titulo', jsonb_build_object(
        'status', 'approved',
        'reviewer_notes', 'Aprobado para prueba interna',
        'reviewed_at', NOW()
      ),
      'dominio', jsonb_build_object(
        'status', 'approved',
        'reviewer_notes', 'Aprobado para prueba interna',
        'reviewed_at', NOW()
      ),
      'planos', jsonb_build_object(
        'status', 'approved',
        'reviewer_notes', 'Aprobado para prueba interna',
        'reviewed_at', NOW()
      )
    ),
    -- Sin flags legales especiales
    '{"has_succession": false, "has_divorce": false, "has_powers": false, "is_credit_purchase": false}'::jsonb
  )
  RETURNING id INTO v_property_id;

  RAISE NOTICE '✅ Propiedad de prueba REALISTA creada';
  RAISE NOTICE '   ID interno      : %', v_property_id;
  RAISE NOTICE '   Dirección       : Av. Cabello 3450, Piso 7° A, Palermo Chico';
  RAISE NOTICE '   Precio          : USD 285.000';
  RAISE NOTICE '   Tipo            : 4 amb, 3 dorm, 2 baños, 1 cochera, 95 m²';
  RAISE NOTICE '   Asignada a      : %', v_admin_id;
  RAISE NOTICE '   Slug            : real-test-%', lower(v_runid);
  RAISE NOTICE '   Landing pública : https://inmodf.com.ar/p/real-test-%', lower(v_runid);
  RAISE NOTICE '';
  RAISE NOTICE 'Esta propiedad simula una captación real para que el wizard Meta Ads';
  RAISE NOTICE 'tenga datos comerciales plausibles: precio en rango Palermo, descripción';
  RAISE NOTICE 'rica, fotos de departamentos modernos, amenities completos, antigüedad';
  RAISE NOTICE 'realista. La generación de copy + imágenes con Gemini va a salir más';
  RAISE NOTICE 'representativa que con el seed básico de "[PRUEBA Av Test 1234]".';
END;
$$;

-- =============================================================================
-- LIMPIEZA — descomentar y correr manualmente cuando termines las pruebas.
-- =============================================================================
-- Borra TODAS las propiedades REAL TEST (prefijo "[REAL TEST ").
-- CASCADE borra automáticamente sus listings, métricas, campañas, leads,
-- ad_assets. No toca propiedades reales (filtro estricto por prefijo).
-- -----------------------------------------------------------------------------
-- DELETE FROM public.properties WHERE address LIKE '[REAL TEST %';
