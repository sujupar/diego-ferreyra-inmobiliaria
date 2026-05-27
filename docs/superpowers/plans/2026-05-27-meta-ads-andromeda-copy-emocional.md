# Plan: Meta Ads Andrómeda — copy emocional, 10 ads, UTMs, CTA correcto, propiedad realista

> **Fecha:** 2026-05-27
> **Estado:** En ejecución
> **Sucede a:** `2026-05-23-meta-ads-optimizacion-profesional.md`

---

## Contexto

Tras probar la primera campaña real generada por el sistema, el usuario detectó issues serios que reducen drásticamente la performance esperada:

1. **Copy demasiado descriptivo / sin emoción** — listamos características de la propiedad cuando deberíamos vender las razones intangibles (vida, status, refugio, orgullo, inversión a largo plazo, pertenencia).
2. **Sin UTMs en la URL del ad** — no podemos atribuir leads al ad específico que los generó.
3. **Pocas variantes de ad** — Meta Andrómeda (el nuevo delivery system) recompensa MUCHA variedad creativa. Estamos creando 3 ads, hay que llegar a **10 mínimo**.
4. **CTA `SEE_MORE` quedó en inglés** — `SEE_MORE` no es un valor estándar de Meta API para link ads. Meta lo aceptó como string sin traducción → "See More". Necesitamos un valor canónico con traducción AR garantizada.
5. **Propiedad de prueba poco realista** — los datos son obvios placeholder (`Av Test 1234`, fotos Unsplash genéricas). Necesitamos un seed que parezca una propiedad real capturada por la inmobiliaria, para que las pruebas reflejen el comportamiento real del sistema.
6. **Pregunta abierta:** objetivo de la campaña actual es `OUTCOME_LEADS` + `custom_event_type=LEAD`. ¿Es correcto o deberíamos usar `COMPLETE_REGISTRATION`?

---

## Fases

| Fase | Qué incluye | Tiempo estimado |
|------|-------------|-----------------|
| **A** | Copy emocional: rewrite del system prompt + 10 variants | 1 h |
| **B** | UTMs en landing URL del ad | 30 min |
| **C** | 10 ads por campaña (Andrómeda-ready) | 1 h |
| **D** | Variedad gráfica amplia: 5 highlights × 2 estilos = 10 prompts distintos | 2 h |
| **E** | Fix CTA: usar `LEARN_MORE` ("Más información") como valor estándar | 15 min |
| **F** | Decisión LEAD vs COMPLETE_REGISTRATION + documentar | 15 min |
| **G** | Seed de propiedad realista con fotos de departamento luxury | 1 h |
| **H** | Validar todo con script E2E + reportar | 30 min |

Total: ~7 h en secuencia. Ejecuto en orden con commits intermedios.

---

## F.A — Copy emocional (no descriptivo)

### Problema actual

El system prompt actual de `lib/marketing/copy-ai-generator.ts` pide:
- 3 primary texts de 60-150 chars
- 3 headlines de ≤40 chars
- 1 description de ≤100 chars
- Tono "cálido pero claro"

El resultado son copies como:
> "Departamento de 3 ambientes en Palermo con balcón aterrazado. 70m² cubiertos. USD 180.000."

Eso es un listado de specs, no vende. El usuario quiere:
> "Algunas mañanas el ruido se queda afuera. El balcón aterrazado, el café, la luz que entra por los ventanales. Acá en Palermo, hay quien aprende que vivir tranquilo también es una decisión."

### Solución

**Nuevo system prompt para `copy-ai-generator.ts`:**
- Generar **10 variants** (no 3) — necesarias para Andrómeda + 10 ads.
- Cada variant debe tener un **ángulo emocional distinto**. 10 ángulos posibles:
  1. **Refugio** — "el lugar al que llegás cuando termina el día"
  2. **Status / orgullo** — "vivir donde otros quisieran"
  3. **Inversión** — "el barrio que va a valer más en 5 años"
  4. **Familia** — "el espacio donde crecen las próximas cenas"
  5. **Libertad** — "cerrá los ojos: estás en el centro y no se escucha nada"
  6. **Aspiracional / sueño** — "el primer día que abrís las llaves de tu casa"
  7. **Ritual / rutina** — "el balcón, el mate, la luz de las 6 de la tarde"
  8. **Comunidad** — "el barrio que elegís cada vez que volvés"
  9. **Pertenencia / identidad** — "este tipo de propiedad no aparece todos los meses"
  10. **Decisión inteligente** — "los compradores que saben buscar saben mirar acá"
- Cada copy: **abrir con escenario emocional + cerrar con call to action sutil**. Sin listar specs (esos están en la imagen).
- **Headlines (≤40 chars)** también emocionales: "Vivir con aire en Palermo", "El piso donde se respira", "Acá empieza otra rutina".
- **Anti-patrones:** prohibido "Oportunidad única", "Imperdible", "Una joya", "Departamento X en Y barrio", "X ambientes con Y m²" como apertura.

### Archivos a modificar

- [lib/marketing/copy-ai-generator.ts](lib/marketing/copy-ai-generator.ts) — system prompt + N=10 variants.
- [lib/marketing/meta-campaign-builder.ts](lib/marketing/meta-campaign-builder.ts) — usar los 10 (no solo `[0..2]`).

---

## F.B — UTMs en la URL del ad

### Solución

En `meta-campaign-builder.ts` al construir el `landingUrl`, agregar query params:

```ts
const landingUrlWithUtm = `${landingBaseUrl}?utm_source=meta&utm_medium=paid_social&utm_campaign=propiedad_${property.public_slug}&utm_content={{ad.id}}&utm_term={{adset.id}}`
```

**Importante:** Meta interpola dynamic placeholders (`{{ad.id}}`, `{{adset.id}}`, `{{campaign.id}}`, `{{placement}}`) en runtime. Eso nos da atribución exacta sin tener que hardcodear cada ad.

**Placeholders Meta soporta:**
- `{{campaign.name}}`, `{{campaign.id}}`
- `{{adset.name}}`, `{{adset.id}}`
- `{{ad.name}}`, `{{ad.id}}`
- `{{placement}}` (feed, story, reels)
- `{{site_source_name}}` (fb, ig)

**UTMs finales:**
```
utm_source=meta
utm_medium=paid_social
utm_campaign=propiedad_{public_slug}
utm_content={{ad.id}}
utm_term={{placement}}
```

Esto se aplica en:
- `link` del `link_data` del AdCreative
- `call_to_action.value.link`

Persistimos el formato del UTM en `property_meta_campaigns.metadata.utm_template` para auditar.

### Archivos a modificar

- [lib/marketing/meta-campaign-builder.ts](lib/marketing/meta-campaign-builder.ts) — construir `landingUrl` con UTMs.

---

## F.C — 10 ads por campaña (Andrómeda)

### Problema actual

`variantCount` default = 3. Andrómeda funciona mejor con 6-10+ ads creativos distintos. El usuario pidió **mínimo 10**.

### Solución

- `variantCount` default = 10.
- Si hay solo 5 highlights del vision analyzer, generamos **2 variantes gráficas por highlight** (mismo highlight, distintos prompts/composiciones) → 10 ads.
- Si hay 10+ highlights (raro), un ad por highlight directamente.
- Distribución de copy: los 10 copy variants se asignan 1:1 con los 10 ads (cada ad usa una emoción distinta).

### Trade-off de costos

- Antes: 3 imágenes × $0.04 = $0.12 por campaña.
- Ahora: 10 imágenes × $0.04 = $0.40 por campaña.
- A 50 campañas/mes ≈ $20/mes en Gemini. Aún muy razonable.

### Archivos a modificar

- [lib/marketing/meta-campaign-builder.ts](lib/marketing/meta-campaign-builder.ts) — default 10 + lógica de duplicar highlights con estilos distintos.

---

## F.D — Variedad gráfica: 5 highlights × 2 estilos = 10 prompts distintos

### Solución

Cuando hay menos de 10 highlights, generamos variaciones de **estilo gráfico** para el mismo highlight:

**Estilos disponibles:**
1. **Hero foto edge-to-edge** — foto cubre todo el frame, overlay de texto en banda inferior translúcida.
2. **Foto + banda inferior con info** — foto ocupa 65%, banda inferior 35% con precio + specs.
3. **Composición editorial** — foto + texto grande inspirado en revistas (AD, Living).
4. **Minimalista whitespace** — foto pequeña centrada + mucho espacio en blanco + tipografía editorial.
5. **Pleno color overlay** — foto + área sólida de color (paleta del mood) con texto encima.
6. **Tipografía dominante** — texto grande es el protagonista, foto en miniatura abajo a la derecha.

Cada uno mapeado en `lib/marketing/ad-image-prompts.ts` como `compositionStyle` (nuevo parámetro). El builder elige los estilos rotando para evitar piezas idénticas.

### Archivos a modificar

- [lib/marketing/ad-image-prompts.ts](lib/marketing/ad-image-prompts.ts) — agregar `compositionStyle` con 6 variantes.
- [lib/marketing/ad-image-generator.ts](lib/marketing/ad-image-generator.ts) — aceptar `compositionStyle` en input.
- [lib/marketing/meta-campaign-builder.ts](lib/marketing/meta-campaign-builder.ts) — rotar estilos al generar las 10 variantes.
- [supabase/migrations/20260527000001_ad_assets_composition.sql](supabase/migrations/20260527000001_ad_assets_composition.sql) — agregar columna `composition_style` al cache.

---

## F.E — Fix CTA: usar `LEARN_MORE`

### Investigación

Valores oficiales de `call_to_action.type` para `link_data` (Meta Marketing API v21):
- `LEARN_MORE` → **"Más información"** en es-AR ✅ (traducción garantizada por Meta)
- `BOOK_NOW`, `CONTACT_US`, `SHOP_NOW`, `SIGN_UP`, `DOWNLOAD`, `GET_OFFER`, `GET_QUOTE`, `APPLY_NOW`, `ORDER_NOW`, `MESSAGE_PAGE`, `WHATSAPP_MESSAGE`, etc.

**`SEE_MORE` no es un valor canónico de Meta API para link ads** — por eso aparece en inglés (Meta lo aceptó como string libre sin localizar). No existe un CTA estándar que diga exactamente "Ver más" en es-AR para link ads en este momento.

### Decisión

Usar **`LEARN_MORE`** que se renderiza como **"Más información"** en español. Es el CTA más sobrio y profesional para inmobiliaria.

Documentar el comportamiento en CLAUDE.md como gotcha permanente.

### Archivos a modificar

- [lib/marketing/meta-campaign-builder.ts](lib/marketing/meta-campaign-builder.ts) — `SEE_MORE` → `LEARN_MORE`.
- [CLAUDE.md](CLAUDE.md) — agregar gotcha.

---

## F.F — Decisión: LEAD vs COMPLETE_REGISTRATION

### Análisis

**`Lead`** (lo que usamos hoy):
- Se dispara cuando el visitante deja sus datos en un form de contacto.
- Es el evento "soft conversion" estándar para inmobiliaria, e-commerce, servicios.
- Meta optimiza para encontrar gente que llena formularios.
- **Es lo correcto para nuestro flow actual.**

**`CompleteRegistration`** (alternativa):
- Se dispara cuando alguien completa un registro (cuenta de usuario, suscripción a newsletter).
- Para SaaS, marketplaces, servicios suscripción.
- En inmobiliaria solo aplicaría si la landing pidiera crear cuenta (ej. "Crear cuenta para ver más propiedades").

**Recomendación:** mantener `Lead`. Es el evento estándar del sector.

**Si en el futuro la landing tiene flow de registro más profundo** (ej. "Agendá visita virtual" con form de 5 pasos + creación de cuenta), considerar bumpar a `CompleteRegistration` para que Meta optimice hacia leads más cualificados.

### Documentar

En `docs/meta-ads-setup.md` agregar sección "Eventos de conversión: Lead vs CompleteRegistration".

---

## F.G — Seed de propiedad realista

### Solución

Crear `scripts/test-data/seed-propiedad-realista.sql` con datos plausibles de una propiedad típica de Palermo:

- **Address:** `Av. Cabello 3450, 7° A` (calle real de Palermo Chico)
- **Precio:** USD 285.000 (rango medio-alto típico)
- **Ambientes:** 4 (living-comedor + 3 dormitorios)
- **Baños:** 2
- **Cocheras:** 1 (cubierta)
- **Cubierta:** 95 m²
- **Total:** 105 m²
- **Antigüedad:** 15 años
- **Piso:** 7°
- **Expensas:** ARS 95.000/mes
- **Amenities:** pileta climatizada, parrilla, SUM, lavadero, gimnasio, seguridad 24hs
- **Descripción:** rica, profesional (300+ chars), enfoque emocional.
- **Fotos:** 8 fotos de Unsplash filtradas con búsquedas específicas: "modern apartment Buenos Aires", "luxury balcony view", "modern kitchen open plan", "master bedroom modern minimalist", etc.

Las fotos de Unsplash son legalmente usables y de alta calidad (1920+ px).

### Archivos a crear

- [scripts/test-data/seed-propiedad-realista.sql](scripts/test-data/seed-propiedad-realista.sql)

---

## F.H — Validación final

1. Correr `scripts/test-meta-flow-e2e.ts` con ambos modos auto + wizard.
2. Confirmar que:
   - Se crean **10 ads** (no 3).
   - Cada ad tiene UTMs en el link.
   - El CTA renderiza "Más información" en es-AR.
   - Los copies son emocionales (revisar manualmente uno o dos en la respuesta).
3. Si falla, iterar fixes hasta verde.
4. Reportar al usuario.

---

## Anticipación de problemas (siguiendo el principio anticipativo)

| Riesgo | Mitigación |
|--------|------------|
| Meta rechaza 10 ads simultáneos (rate limit) | Insertar `await new Promise(r => setTimeout(r, 500))` entre creates para evitar burst. |
| Generar 10 imágenes con Gemini tarda 100-150s (10 × 10-15s) | Hacer en paralelo con `Promise.all` en grupos de 3 para no saturar la API. |
| Costo de Gemini sube a $0.40 por campaña | Cache agresivo en `property_ad_assets`. Reintentos no regeneran. |
| Andrómeda puede no aprobar 10 ads idénticos visualmente | Variar `compositionStyle` entre los 10 (6 estilos cubren bien). |
| UTMs con caracteres especiales rompen el parsing | `encodeURIComponent(property.public_slug)` en el utm_campaign. |
| `LEARN_MORE` no es lo que el usuario quería (quiere "Ver más" exacto) | Documentar en respuesta al usuario que Meta no tiene "Ver más" estándar para link ads — solo `LEARN_MORE` ("Más información"). Si insiste, considerar `WATCH_MORE` (típicamente para videos pero a veces aceptado). |
| Propiedad realista del seed colisiona con uno existente | Filtro `address LIKE '[REAL TEST %'` y verificar UNIQUE de public_slug. |

---

## Orden de ejecución

1. F.E (CTA fix) — 5 min, quick win.
2. F.B (UTMs) — 15 min, quick win.
3. F.A (copy emocional) — system prompt + N=10.
4. F.C (10 ads en builder).
5. F.D (estilos de composición).
6. F.G (seed realista).
7. F.F (documentación LEAD vs CompleteRegistration).
8. F.H (validación E2E).

Push intermedio después de cada fase importante (cada 1-2 fases).
