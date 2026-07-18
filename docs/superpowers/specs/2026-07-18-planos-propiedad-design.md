# Planos de propiedad en captación — Diseño (2026-07-18)

## Objetivo

Al captar una propiedad (y después, desde su ficha), el asesor puede subir los
**planos**: uno o varios archivos, PDF (incluso grandes) o imágenes. No cambia
ningún proceso existente (estados, auto-avance, notificaciones, portales).

## Decisiones

- **Modelo:** columna `properties.plans TEXT[]` (URLs públicas), espejo exacto de
  `photos`. Migración aditiva `20260718000001_property_plans.sql`.
- **Subida:** patrón existente de URL firmada directa a Storage
  (`upload-init` → PUT → `commit`), bucket `property-files`, carpeta
  `properties/{id}/plans/`. Por eso los PDFs grandes suben sin comprimir: nunca
  pasan por el body de Next.js. Límite **100 MB** por archivo (el video ya
  permite 200 MB por el mismo camino).
- **Nombre legible:** el path incluye el nombre original saneado
  (`{uuid}-{nombre-saneado}.{ext}`); la UI deriva la etiqueta con
  `planLabelFromUrl()`.
- **Formatos:** `pdf` + los mismos de foto (`jpg jpeg png webp heic heif`).
- **Sin efectos secundarios:** el commit de planos NO llama a
  `checkAndAdvanceProperty` (los planos no cuentan para completar la captación)
  y el POST de creación de propiedad no se toca.
- **Permisos:** idénticos a fotos/video — `requireAuth` + `canAccessProperty`,
  rol abogado bloqueado.

## Componentes

1. `lib/properties/media.ts` — `PLAN_EXTS`, `MAX_PLAN_BYTES`,
   `sanitizeFileBase()`, `planLabelFromUrl()` (puros, con tests).
2. Rutas media: `upload-init` acepta `kind:'plan'`; `commit` agrega
   `kind:'plan'` (append con validación de prefijo); `PATCH media` acepta
   `deletePlan` (saca del array + borra de Storage).
3. `lib/properties/upload-plans.ts` — helper cliente init→PUT→commit con
   progreso agregado, reusado por ambas UIs.
4. `PropertyMediaCard` — pestaña nueva **Planos** (lista con etiqueta, Ver,
   Quitar; subida múltiple con progreso). La ficha pasa `plans` como prop.
5. `properties/new` — card **Planos (opcional)**: se eligen archivos localmente
   y se suben inmediatamente después de crear la propiedad, antes del redirect.
   Si la subida falla, la propiedad ya existe y se avisa que se pueden subir
   desde la ficha.

## Fuera de alcance

Publicación de planos en portales/landing pública, compresión de archivos,
orden/portada de planos, visor PDF embebido.
