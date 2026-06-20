# Plan — Mapa de calor de las landings (registrados + no registrados)

## Recomendación
**Microsoft Clarity.** Gratis e ilimitado, trae heatmaps (click/scroll/área) + grabaciones de
sesión + métricas de abandono (rage/dead clicks, scroll depth, quickback) listas. Script liviano
y async (no toca LCP si carga `afterInteractive`). Segmentable por **custom tags** → separa
registrado/no-registrado con el `df_anon` que el proyecto YA tiene. PostHog solo si se exige
ownership/self-host o product-analytics avanzado (más peso + más config).

## Comparativa (resumen)
| | Clarity | PostHog | Hotjar |
|---|---|---|---|
| Precio | **Gratis ilimitado** | Free tier + por evento | Caro al escalar |
| Heatmaps click/scroll/área | Sí | Sí | Sí (su fuerte) |
| Grabaciones | Ilimitadas | Sí | Limitadas en free |
| Abandono (rage/dead/scroll) | Sí | Sí (config) | Sí |
| Segmentar registrado/no | Sí (custom tags) | Sí (potente) | Limitada |
| Peso/perf | ~10-40KB async | ~50KB+ | Medio-pesado |
| Ownership/self-host | No | **Sí** | No |

## Integración (sin tocar lo visual ni el registro — solo se AGREGAN líneas)
- **`components/funnel/FunnelHeatmap.tsx`** (NUEVO, gemelo de `FunnelMetaPixel`): `'use client'` +
  `<Script strategy="afterInteractive">` con el snippet de Clarity. Valida `projectId` (regex) →
  si inválido, `return null` (no carga nada). En `useEffect`: `clarity('identify', anonId)` +
  `clarity('set','df_anon',anonId)` + UTMs (de `readStoredAttribution()`) + `content` +
  `segment` (de `sessionStorage`).
- **Landings** (`TasacionClient`/`ClaseClient` + sus `page.tsx`): montar `<FunnelHeatmap>` junto a
  `<FunnelMetaPixel>`, `projectId` desde `process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID`.
- **`app/(funnels)/layout.tsx`**: `preconnect` a `https://www.clarity.ms` (0 impacto LCP).
- **`app/api/funnel/submit/route.ts`**: devolver `contactId` en los DOS returns de éxito (el normal
  y el de dedup) para marcar `segment='registrado'`.
- **`handleSubmit`** (ambos clients): tras éxito → `sessionStorage` + `clarity('set','segment','registrado')` antes del redirect.
- **`FunnelLeadForm.tsx`**: `data-clarity-mask="true"` en name/phone/email/propertyLocation (PII).
- Cookie liviana opcional `df_reg=1` (boolean, sin PII) para que el segmento "registrado" persista
  entre visitas (default: sessionStorage = solo la sesión).

## Segmentación registrado/no-registrado
1. Primer render → `no_registrado` (todos empiezan así, con su `df_anon`).
2. Tras submit exitoso → `registrado` (sessionStorage + tag).
3. En Clarity se filtran heatmaps/grabaciones por `segment`, `content` (Tasación/Clase) y `utm_source`.
4. El tag `df_anon` permite cruzar con el CRM (mismo id que `link_anon_to_contact`) si se quiere.

## Safeguards
- **Performance:** solo `afterInteractive` (nunca `beforeInteractive`); `preconnect`; validar projectId;
  medir Lighthouse antes/después (LCP no debe moverse). No tocar logo/poster `priority`, fuentes, modal lazy.
- **PII:** enmascarar inputs del form; nunca mandar valores de form a `clarity('set')`; solo pasar
  `df_anon`/`segment`/`content`/UTMs/`contactId` (este último como id, no como tag visible).
- **Privacidad:** mención de Clarity (Microsoft) + cookies de analítica en la política de privacidad.

## Tarea del usuario (como con R2)
Crear cuenta en clarity.microsoft.com → nuevo proyecto (URL: inmodf.com.ar) → copiar el **Project ID**
→ setearlo en Netlify como `NEXT_PUBLIC_CLARITY_PROJECT_ID`. El código degrada solo si no está seteado.

## Preguntas abiertas (para el cliente)
1. ¿Clarity (gratis, recomendada) o PostHog (ownership/self-host)?
2. Consentimiento: ¿solo tráfico Argentina (→ mención en privacidad, máxima cobertura) o UE/GDPR (→ gatear tras banner)?
3. Acceso: ¿botón "Ver mapa de calor" en el panel Embudos (link al dashboard de Clarity) o lo abrís directo en Clarity? (Clarity no tiene API para embeber heatmaps; un iframe igual exige login.)
4. ¿El segmento "registrado" debe persistir entre días (cookie df_reg) o alcanza con la sesión?
