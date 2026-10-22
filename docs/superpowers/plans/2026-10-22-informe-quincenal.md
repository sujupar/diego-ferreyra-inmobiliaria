# Informe quincenal — plan

Spec: `docs/superpowers/specs/2026-10-22-informe-quincenal-design.md` (aprobado por el dueño el 2026-10-22).
Rama `feat/informe-quincenal`. Dos entregas, cada una con su PR, QA en la vista previa y merge.

## Entrega 1 — El informe, armado a mano (selector de fechas) con todo lo automático y el PDF

| # | Tarea | Archivos | Prueba |
|---|---|---|---|
| 1 | **Base de datos.** `property_reports` (período, origen ciclo/manual, estado borrador/listo, `fuentes` jsonb por fuente con estado ok/error/sin_datos/pendiente, `manual` jsonb, `competidoras` jsonb, `capturas` jsonb, `pdf_path`), UNIQUE `(property_id, desde, hasta)`, RLS (lectura: operaciones o asesor de la propiedad; escritura solo servidor). Bucket privado `property-reports` (png/jpg/webp ≤ 5 MB, pdf ≤ 20 MB). | `supabase/migrations/20261022000001_informes_quincenales.sql`, `scripts/apply-informes-pg.ts` | El script aplica en transacción y verifica (CHECK, UNIQUE, RLS, bucket) |
| 2 | **Períodos (puro).** Quincena fija que cerró (el 1 → 16 a fin de mes anterior; el 16 → 1 al 15), ciclo de la propiedad desde `captured_at` (bloques de 15 días), validación de rango libre (máx. 120 días, no futuro). | `lib/informes/periodo.ts` + test | TDD, casos de fin de mes, febrero, bisiesto, captación a mitad de quincena |
| 3 | **Resumen y secciones (puro).** Totales con la regla de los ejemplos (vieron = exposición ZP + vistas AP + visitas ML; entraron = visualizaciones ZP + AP + ML), ✅/❌, qué páginas salen (canal sin datos no sale), qué falta completar, valor del m² de competidoras. Una fuente con error NO cuenta como 0. | `lib/informes/resumen.ts`, `secciones.ts` + tests | TDD con los números de Roque Pérez (1.139 / 271) y Entre Ríos |
| 4 | **Fuentes automáticas, una por función** (cada una devuelve `{estado, datos, error}` y nunca lanza): consultas por portal (`portal_inquiries` + leads de redes), visitas + ficha de visitas (`todasLasVisitas` + `opinionesPorPropiedad`), reserva (`property_status_events`), MercadoLibre visitas por rango (`/items/visits?date_from&date_to`), Meta Ads (insights por campaña y rango + desgloses edad/sexo y plataforma), Instagram (insights del reel, rotulado "acumulado"). | `lib/informes/fuentes/*.ts` + tests con fetch simulado | Probe contra la base y las APIs reales (`scripts/informes-sondeo.ts`, solo lectura) |
| 5 | **Datos y servicio.** Crear borrador (todas las fuentes en `pendiente`), refrescar UNA fuente por pedido (regla dura de Netlify), guardar lo manual, competidoras, capturas, marcar listo. | `lib/informes/datos.ts`, `servicio.ts`, `acceso.ts` + tests | Permisos: asesor solo sus propiedades, abogado nada |
| 6 | **Rutas.** `GET/POST /api/properties/[id]/informes` (listar / nuevo con rango), `GET/PATCH /api/informes/[id]`, `POST /api/informes/[id]/fuentes/[fuente]`, capturas (`subida` firmada + confirmar por bytes + quitar), `POST /api/informes/[id]/pdf` (subida firmada) y `/listo`. | `app/api/...` + tests de ruta | 401/403/404, validación Zod, rango inválido |
| 7 | **PDF.** `@react-pdf` con las imágenes originales de `public/informe-quincenal/`: portada, resumen, embudo, divisores, portales (números + capturas), Meta (cifras + barras edad/sexo y plataforma), orgánico, consultas, ficha de visitas (tortas y barras) o "Aún no han completado…", competidoras (2 por página), análisis final, gracias, contacto. Se genera en el navegador (como el de tasación) y se sube. | `components/informes/pdf/*` | Render a archivo con `scripts/render-informe-test.tsx` y MIRAR cada página contra los ejemplos |
| 8 | **Pantallas.** Pestaña "Informes" en la ficha (lista + "Nuevo informe" con atajos "Última quincena" / "Ciclo de la propiedad" / fechas libres). Editor `/informes/[id]` por secciones: lo automático a la vista (con "Reintentar" si falló), números y capturas de Zonaprop/Argenprop/TikTok, links de competidoras (completa con el scraper), información de acciones/consultas/análisis, faltantes en naranja, vista previa y "Marcar como listo". | `components/informes/*`, `app/(dashboard)/informes/[id]` | Tests de componente + QA en vista previa (celular incluido) |

## Entrega 2 — El ciclo automático y el aviso a Paula

| # | Tarea | Archivos | Prueba |
|---|---|---|---|
| 9 | Tipo de tarea `informe_quincenal` (CHECK de `tasks` + `TaskType` + `TYPE_CONFIG`). La tarea apunta al listado de informes pendientes; si ya hay una abierta no se duplica. | migración `20261022000002`, `lib/supabase/tasks.ts`, `app/(dashboard)/tasks/page.tsx` | Verificación del CHECK en la base |
| 10 | Listado `/informes` (pendientes y listos, filtro por período) para Paula. | `app/(dashboard)/informes/page.tsx` | Test de componente + QA |
| 11 | Cron `/api/cron/informes-quincenales` (pg_cron, cada 10 min los días 1 y 16, y el 2 y 17 como repechaje): crea los borradores de la quincena que cerró y completa sus fuentes de a pocas por corrida (presupuesto 10 s); al terminar una tanda, tarea + email a Paula con la lista. | ruta + migración del job (DESPUÉS del deploy) + `scripts/apply-cron-informes-pg.ts` | Tests de la ruta + 3 capas (job, `net._http_response`, borradores creados) |
| 12 | Email "Informes quincenales listos para completar" (Resend). | `emails/InformesQuincenalesEmail.tsx`, `lib/email/notifications/informes-quincenales.ts` | Probe de render + modo prueba de email |

## Riesgos que vigila el plan

- Una fuente por pedido; el cron con presupuesto. Ninguna cifra caída se muestra como 0.
- Migración ANTES del deploy de cada entrega; job de pg_cron DESPUÉS.
- Nada se manda al propietario (afuera de alcance).
- Datos de prueba con `[TEST` y borrados al terminar.
