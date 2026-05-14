# Remotion — Video tour de propiedades

## Qué hace

Genera automáticamente un video tipo slideshow con las fotos de una propiedad,
highlights extraídos de los datos, CTA y branding. Útil para:
- Posts en redes sociales (1:1 feed o 9:16 stories/reels)
- Campañas Meta Ads (creative video además de imagen)
- Material para WhatsApp

Dos composiciones disponibles:
- `PropertyTour`: 1080×1080 (Instagram/Facebook feed, square)
- `PropertyTourVertical`: 1080×1920 (Stories, Reels, TikTok)

## Preview local (sin renderizar)

```bash
npx remotion preview remotion/index.ts
```

Abre Remotion Studio en `http://localhost:3000` con preview en vivo
de las 2 composiciones. Editás los props en la UI, ves cambios al instante.

## Render local (genera MP4)

Cuando el asesor clickea "Generar video" en la app y no hay servidor de
render configurado, devuelve un comando CLI para correr localmente:

```bash
npx remotion render remotion/index.ts PropertyTour out.mp4 --props='{"title":"...","photos":[...]}'
```

Requiere:
- Chrome / Chromium instalado (Remotion lo usa headless)
- ffmpeg en el PATH del sistema
- 30s-2min de proceso según fotos y composition

## Render en producción — 3 opciones

### Opción 1: Servidor de render dedicado (recomendado)

Deploy un servicio simple en Cloud Run / Render.com / Railway con
`@remotion/renderer`. Es un HTTP server que recibe POST con
`{ compositionId, inputProps }` y devuelve `{ url }` apuntando al MP4
(subido a R2/S3/Supabase Storage).

Configurar en Netlify env:
```
REMOTION_RENDER_URL=https://render.tu-servicio.com/render
REMOTION_RENDER_TOKEN=secret-shared-token   # opcional
```

El endpoint `/api/properties/[id]/render-video` detecta esa env var y
proxyea automáticamente.

### Opción 2: Remotion Lambda (serverless)

Mejor para tráfico irregular y volumen alto. Setup:

```bash
npm install @remotion/lambda
npx remotion lambda functions deploy
npx remotion lambda sites create remotion/index.ts --site-name=property-tours
```

Después configurás credenciales AWS en Netlify y modificás el endpoint para
usar `renderMediaOnLambda` de `@remotion/lambda`. Costo aprox: USD 0.20-0.50
por video según duración.

### Opción 3: Render manual desde la terminal del equipo

El asesor clickea "Generar video" en la app, copia el comando CLI que
aparece, lo corre desde su máquina. Tarda ~30s. Después sube el MP4
manualmente a Supabase Storage y pega la URL en
`properties.video_url`.

Esta es la opción "manual" — funciona sin infra extra pero requiere
intervención del asesor.

## Customizar el template

El template está en `remotion/PropertyTour.tsx`. Editás libremente:
- Colores y tipografía
- Duración por foto (default 3s)
- Animaciones (ken burns scale, fades)
- Cards de intro y outro
- Posiciones de overlays

Cada cambio se ve en vivo en `npx remotion preview`.

## Props que recibe el template

Generados por `buildPropertyTourProps()` a partir de un `Property`:

```ts
{
  title: string         // Título arriba en intro y outro
  subtitle: string      // Operación + barrio + city
  price: string         // Formateado, ej "USD 180.000"
  highlights: string[]  // 3-4 bullets que rotan en cada foto
  photos: string[]      // Hasta 8 URLs (las primeras 8 de property.photos)
  ctaText: string       // "Más info en inmodf.com.ar/p/[slug]"
  brandName: string     // "Diego Ferreyra Inmobiliaria"
}
```

## Permisos

| Rol | Puede generar video |
|---|---|
| Admin / Dueño / Coordinador | ✅ todos |
| Asesor | ✅ solo sus propiedades |
| Abogado | ❌ |
