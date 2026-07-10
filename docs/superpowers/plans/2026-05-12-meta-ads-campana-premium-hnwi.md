# Meta Ads — Campaña Premium HNWI (Tasación Directa) — Implementation Plan

> Fecha: 2026-05-12
> Cliente: Diego Ferreyra Inmobiliaria
> Skill operativo: `montar-campana-meta` (adaptado a conversiones a landing, no Instant Form)

## Goal

Duplicar la campaña activa `🟡 CONV: [Tasación Gratuita] | Primer Nivel` como nueva campaña enfocada **exclusivamente en barrios premium de CABA con segmentación de 1km de radio**, usando videos nuevos de una propiedad vendida en USD 600k (Calle Quesada, Núñez) como ángulo principal. La campaña fuente **no se toca**.

## Filosofía operativa

> "Francotirador, no ametralladora." — Apuntar a 13-15 pin-drops de 1km en barrios premium en vez de 20 pin-drops cubriendo CABA completa.

- Público HNWI: dueños de propiedades USD 600k-3M+, perfil profesional/empresarial alto.
- Hook: "vendimos esta propiedad en Quesada por USD 600k. Conocé cuánto vale realmente la tuya."
- Calidad sobre cantidad: mejor 5 leads premium/semana que 50 sin capital.

## Estado de la campaña fuente — NO TOCAR

| Asset | ID | Acción |
|---|---|---|
| Campaña fuente | `120233817515020656` | ❌ NO modificar |
| Ad set "Públicos Propios RMKN 02" | `120233817515080656` | ❌ NO modificar |
| Ad set "Público Similar" | `120233817515010656` | ❌ NO modificar |
| Páginas, Instagram, Pixel, Landing | varios | ✅ Reusar |
| Audiencias custom existentes (11) | varios | ✅ Reusar |

## Inputs confirmados

| Input | Valor |
|---|---|
| Token Meta | En `.env.local` del proyecto (`META_ACCESS_TOKEN`, user-token, expira ~2026-06-15) |
| Ad Account | `act_853173985153585` (ARS, GMT-3) |
| Page ID | `103823292484521` (Diego Ferreyra Inmobiliaria) |
| Instagram ID | `17841421542114621` (@inmobiliariadiegoferreyra) |
| Pixel ID | `589579724932979` |
| Landing | `https://inmobiliariadiegoferreyra.com/tasacion-directa` |
| Presupuesto diario | USD 2/día → ARS 2.400/día (CBO) |
| Anclaje propiedad vendida | Calle Quesada, Núñez (~ARS 600.000 USD) |
| Videos | Pendientes de subir a `marketing-assets/campana-premium-2026-05/videos-propiedad-600k/` |

## Estructura propuesta

```
Campaña: 🟢 CONV PREMIUM: [Tasación Directa] | HNWI Barrios Alto Valor
├── CBO, OUTCOME_SALES, $2.400 ARS/día, status=PAUSED
│
├── Ad Set 1: 🟢 PP PREMIUM: Frío Geo + Intereses HNWI
│   ├── Geo: 13 pin-drops 1km (todos los barrios premium)
│   ├── Edad 30-65
│   ├── Intereses HNWI (real estate, inversiones, lujo)
│   ├── Optimization: OFFSITE_CONVERSIONS / COMPLETE_REGISTRATION
│   └── Excluye: audiencias de exclusión existentes + nuevos converters
│
├── Ad Set 2: 🟢 PP PREMIUM: Públicos Propios + Lookalikes
│   ├── Geo: mismos 13 pin-drops
│   ├── Edad 30-65
│   ├── Custom audiences: reusa las 11 existentes + lookalikes nuevos
│   └── Optimization: OFFSITE_CONVERSIONS / COMPLETE_REGISTRATION
│
└── 3-4 ads (uno por cada video clave) en PAUSED, con Advantage+ Creative
    └── Copies premium: ángulo "USD 600k vendido en Quesada — tu propiedad también vale"
```

## Pin-drops barrios premium (13 ubicaciones, 1km radio c/u)

| # | Zona | Lat | Lng | Notas |
|---|---|---|---|---|
| 1 | **Núñez (Quesada / Libertador)** | -34.5435 | -58.4595 | ⭐ ANCLAJE — propiedad vendida 600k |
| 2 | Palermo Chico (Plaza Mafalda) | -34.5778 | -58.4117 | Núcleo premium |
| 3 | Palermo Botánico (Salguero) | -34.5826 | -58.4178 | |
| 4 | Palermo Hollywood (Honduras) | -34.5856 | -58.4347 | |
| 5 | Palermo Soho (Plaza Serrano) | -34.5895 | -58.4307 | |
| 6 | Las Cañitas (Báez) | -34.5642 | -58.4302 | |
| 7 | Barrio Parque (Castex 3300) | -34.5728 | -58.4053 | Casonas más caras |
| 8 | Recoleta (Alvear 1800) | -34.5897 | -58.3920 | |
| 9 | Barrio Norte (Callao y Santa Fe) | -34.5946 | -58.3905 | |
| 10 | Puerto Madero (Cossettini) | -34.6133 | -58.3625 | Torres premium |
| 11 | Belgrano R (Sucre y Cuba) | -34.5615 | -58.4665 | Casonas |
| 12 | Belgrano Barrancas | -34.5614 | -58.4501 | |
| 13 | Belgrano Plaza | -34.5630 | -58.4567 | |

> Coordenadas se geocodifican y verifican en Fase 3 antes de aplicar al ad set.

## Audiencias custom — qué reusar, qué crear nuevas

### Reusar (ya existen, no se tocan):

| ID | Nombre |
|---|---|
| `120227925650020656` | PP: Seguidores de Instagram |
| `120227925656150656` | PP: Seguidores de Facebook |
| `120227925867520656` | PP: Page view - Diego Ferreyra |
| `120228810703670656` | PP: 95% Video - Conversión [CLASE GRATUITA] |
| `23850231137970655` | IG - Las personas que VISITARON mi Perfil |
| `23850234615090655` | IG - Personas que GUARDARON un Post o Anuncio |
| `23852418767460655` | IG - Personas que comenzar a SEGUIR la cuenta |
| `23852441267820655` | IG - Personas que interactuaron 365 días |
| `120228527071240656` | Público similar (AR, 2%) - V2 |
| `120228527090210656` | Público similar (AR, 3%) - V2 |
| `120228579276380656` | Público similar (AR, 2%) - LISTA 100 |
| `120228330630050656` | EXCL: Registrado Clase Gratuita |
| `120228579173930656` | EXCL: Registros de Alta Calidad LISTA 100 |

### Crear nuevas (gaps detectados):

1. **`PP: Page View Tasación Directa - 30d`** — visitantes de `/tasacion-directa` últimos 30 días (rule-based pixel URL contains).
2. **`PP: Page View Tasación Directa - 90d`** — mismo, 90 días.
3. **`PP: Page View Tasación Directa - 180d`** — mismo, 180 días → para lookalike.
4. **`PP: Convertidores COMPLETE_REGISTRATION - 180d`** — eventos pixel últimos 180 días → semilla lookalike valiosa.
5. **`PP: 95% Video Tasación - 90d`** — viewers 95% de videos de tasación específicamente (cuando los nuevos videos lleven >7 días corriendo).
6. **`PP: Engagers FB Página - 90d`** — engagement de la página últimos 90 días (genérico, no solo seguidores).
7. **`PP: Engagers IG - 90d`** — engagement IG últimos 90 días.
8. **`PP: Lookalike 1% - Convertidores COMPLETE_REGISTRATION`** — lookalike al 1% sobre la audiencia #4 (cuando #4 alcance umbral ≥100).

> Notas: Las audiencias 1-4 son creables vía API ahora. Las #5-8 son derivadas (video / lookalike) — se crean después de que la nueva campaña tenga ≥7 días de datos.

## Copy strategy

### Ángulos premium derivados del existente + caso 600k Quesada

**Ángulo 1: Caso de éxito hyperlocal (HOOK PRINCIPAL)**
> Acabamos de vender un departamento en Calle Quesada por USD 600.000. 🔑
>
> Sin remates. Sin "ofertas express". Con la estrategia correcta y un comprador calificado de nuestra base.
>
> Si vivís en [Palermo / Núñez / Belgrano / Recoleta], tu propiedad probablemente vale más de lo que pensás — y mucho más de lo que te diría una tasación automática.

**Ángulo 2: Patrimonio, no rentabilidad rápida**
> Si construiste un patrimonio, no podés improvisar al venderlo.
>
> Esto NO es una inmobiliaria que cuelga el cartel y espera. Es un equipo que:
> ✅ Analiza tu propiedad con datos reales del barrio.
> ✅ Optimiza tu fiscalidad para que no pierdas en escritura.
> ✅ Negocia con compradores calificados, no curiosos.

**Ángulo 3: El error del 20% (heredado de la campaña fuente, adaptado)**
> En propiedades de USD 500k+, una mala negociación te puede costar USD 100.000.
>
> No es exageración: impuestos mal calculados, cláusulas leoninas, precio mal posicionado.
>
> Pedí el Análisis de Precio Estratégico y conocé el valor real de tu propiedad antes de salir a vender.

**Ángulo 4: Servicio invisible para clientes que no tienen tiempo**
> Sabemos que no tenés tiempo para mostrarle el departamento a 20 curiosos.
>
> Por eso filtramos antes. Mostramos solo a compradores precalificados con capital disponible. Vos te enterás cuando hay una oferta firme sobre la mesa.

### Headlines premium (4 variantes Advantage+):
- "Vendimos un depto en Quesada por USD 600.000 🔑"
- "Tu propiedad vale más de lo que una tasación automática te dice 📊"
- "Patrimonios de USD 500k+ no se venden improvisando 🛡️"
- "Análisis de Precio Estratégico — para propiedades premium 🏛️"

### CTA: `WATCH_MORE` (igual que la fuente, va con videos), link a la landing existente con UTMs nuevos.

UTM pattern: `?utm_source=fb_ad&utm_medium={{adset.name}}&utm_campaign=premium_hnwi&utm_content={{ad.name}}&campaign_id={{campaign.id}}`

## Pasos de ejecución (en orden)

### Step 1 — Crear audiencias custom nuevas vía API
- Crear las 4 audiencias rule-based (Page View 30/90/180d + Convertidores 180d).
- Las basadas en video/lookalike esperan datos (Step 9).

### Step 2 — Recibir + procesar videos
- Usuario sube videos a `marketing-assets/campana-premium-2026-05/videos-propiedad-600k/`.
- Por cada video: extraer thumbnail con ffmpeg (frame en ~1s), guardar en `thumbnails/`.
- Validar duración (Meta recomienda 15-60s para video lead ads), aspect ratio (1:1 o 4:5 preferido).

### Step 3 — Upload videos + thumbnails a Meta
- Videos <100 MB: upload simple `POST /act_853173985153585/advideos`.
- Videos >100 MB: chunked upload (start/transfer/finish).
- Thumbnails como `adimage` para obtener `image_hash`.
- Esperar status `ready` antes de continuar (poll cada 10s).

### Step 4 — Crear la nueva campaña en PAUSED
```python
POST /act_853173985153585/campaigns
{
  "name": "🟢 CONV PREMIUM: [Tasación Directa] | HNWI Barrios Alto Valor",
  "objective": "OUTCOME_SALES",
  "buying_type": "AUCTION",
  "status": "PAUSED",
  "special_ad_categories": [],
  "daily_budget": 240000,    # 2400 ARS en centavos
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
}
```

### Step 5 — Crear los 2 ad sets en PAUSED con pin-drops + targeting
- Ad Set 1 (Frío + Intereses):
  - geo_locations.custom_locations = [13 pin-drops]
  - age_min=30, age_max=65 (subir de 25 a 30, más HNWI)
  - flexible_spec con intereses: Bienes raíces, Inversiones inmobiliarias, Banca privada, Artículos de lujo, Empresarios, Inversionistas
  - excluded_custom_audiences = [registrados + LISTA 100 + nuevos convertidores]
  - optimization_goal=OFFSITE_CONVERSIONS, custom_event=COMPLETE_REGISTRATION
- Ad Set 2 (PP + LAL):
  - Mismos pin-drops, edad, optimización
  - custom_audiences = [11 existentes + nuevas Page View + LAL nuevo]
  - excluded_custom_audiences = mismas exclusiones

> Nota: con presupuesto total CBO de $2.400 ARS/día, los ad sets reciben asignación automática.

### Step 6 — Crear 3-4 video creatives con Advantage+ Creative
- Por cada video: POST `/adcreatives` con `object_story_spec.video_data` y `asset_feed_spec` (4 bodies + 4 titles).
- `image_hash` del thumbnail subido en Step 3.
- `call_to_action.type=WATCH_MORE`, link a landing existente con UTMs.

### Step 7 — Crear ads en PAUSED
- Por cada creative: POST `/ads` con `adset_id` (los 2 ad sets), `creative.creative_id`, `status=PAUSED`.

### Step 8 — Reporte final
- Tabla IDs (campaign, ad sets, audiencias nuevas, creatives, ads).
- Link Ads Manager.
- Checklist pre-activación para Julián/Diego.
- Recomendación de upgrade de presupuesto cuando validen creatives.

### Step 9 — Post-validación (después de 7-14 días corriendo)
- Crear audiencias derivadas (#5-8): 95% video viewers nuevos + lookalike 1% de convertidores nuevos.
- Si hooks funcionan: escalar presupuesto.

## Gotchas y precauciones

- **Token USER expira ~2026-06-15**. Si la campaña debe quedar en mantenimiento autónomo, el cliente tiene que renovarlo o convertirlo a System User antes.
- **CABA y `special_ad_categories`**: el real estate en Argentina **NO está en SAC** (eso aplica solo a US Housing). Mantener `special_ad_categories: []`. La campaña fuente está así, no hay riesgo.
- **Pin-drops < 25 km**: si Meta auto-flagea como SAC HOUSING (improbable porque LATAM), avisarme y subir radio a 5 km como fallback.
- **Budget USD 2/día**: el algoritmo necesita ~50 eventos COMPLETE_REGISTRATION/semana por ad set para salir de learning phase. Con ese budget, probablemente nunca lo alcance. La campaña sirve para validar hooks/creatives, no como motor de conversión productivo. Recomendar al cliente subir a USD 30-50/día apenas valide.
- **Naming**: respetamos la convención de emojis del cliente (🟡 fuente activa → 🟢 nueva premium).
- **Catalogo `{{product.name}}` en nombres de la fuente**: el cliente no tiene catálogo real, son nombres residuales. En la nueva NO se usan placeholders, se usan titulares fijos.
- **CTA `WATCH_MORE`**: la fuente usa este CTA con videos. Lo mantenemos por consistencia (es el que Meta sugiere cuando el destino es página externa y el creative es video). Si Meta rechaza, fallback a `LEARN_MORE`.

## Output esperado tras ejecución completa

1. 1 campaña nueva en PAUSED + 2 ad sets + 3-4 ads en PAUSED.
2. 4 audiencias custom nuevas creadas y disponibles para reusar.
3. State final en `marketing-assets/campana-premium-2026-05/state/campaign-state.json` con todos los IDs.
4. Reporte con link a Ads Manager para revisión del cliente.
5. La campaña fuente sigue **intacta**.
