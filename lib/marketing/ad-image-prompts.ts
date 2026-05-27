/**
 * Generador de prompts estructurados para Gemini 2.5 Flash Image.
 *
 * Cada prompt se construye con bloques temáticos:
 *  1. Brief de la propiedad (datos objetivos)
 *  2. Highlight a destacar + mood
 *  3. Composición exacta requerida (overlay, tipografía, jerarquía visual)
 *  4. Estética premium objetivo
 *  5. Anti-patrones (qué evitar)
 *  6. Especificaciones técnicas (resolución, color, formato)
 *
 * Cada prompt resultante tiene entre 1000-3000 palabras. Esto NO es por
 * costumbre de "más prompt = mejor output" — es deliberado: Gemini Image
 * responde mucho mejor cuando le especificás composición, tipografía,
 * paleta, mood y referencias en lugar de pedir "haceme un anuncio
 * inmobiliario premium" en una línea.
 */
import type { Property } from '@/lib/portals/types'
import type { PropertyHighlight } from './property-vision-analyzer'

export type AdFormat = 'feed_square' | 'feed_vertical' | 'story_vertical'

/**
 * Estilo de composición de la pieza gráfica. Variar entre las 10 generaciones
 * para que Meta Andrómeda tenga variedad creativa real, no clones.
 */
export type CompositionStyle =
  | 'hero_full_bleed' // foto cubre todo el frame, overlay translúcida en bottom
  | 'split_photo_info' // foto 65% + banda inferior 35% con info
  | 'editorial_magazine' // estilo revista AD/Living
  | 'minimalist_whitespace' // foto pequeña + mucho aire + tipo editorial
  | 'color_overlay_solid' // foto + área sólida de color paleta del mood
  | 'typography_dominant' // texto grande hero, foto en miniatura abajo

interface FormatSpec {
  width: number
  height: number
  aspect: string
  placement: string
  composition: string
}

const FORMAT_SPECS: Record<AdFormat, FormatSpec> = {
  feed_square: {
    width: 1080,
    height: 1080,
    aspect: '1:1',
    placement: 'Facebook Feed, Instagram Feed',
    composition:
      'Composición cuadrada. La foto principal ocupa el 65-70% superior del cuadro. Banda inferior del 30-35% contiene el overlay con texto: precio (grande), barrio + tipo (medio), specs (pequeño).',
  },
  feed_vertical: {
    width: 1080,
    height: 1350,
    aspect: '4:5',
    placement: 'Instagram Feed (formato más alto = más real estate visual)',
    composition:
      'Composición vertical 4:5. La foto principal ocupa el 65% superior. Banda inferior del 35% con overlay de texto en 3 niveles: precio (hero), barrio + tipo, specs (m², ambientes).',
  },
  story_vertical: {
    width: 1080,
    height: 1920,
    aspect: '9:16',
    placement: 'Instagram Stories, Reels, Facebook Stories',
    composition:
      'Composición vertical full-screen 9:16. Foto principal full-bleed en el centro (zona safe entre 20% y 80% vertical). Top 20%: título o highlight overlay sutil. Bottom 25%: precio + CTA.',
  },
}

interface BuildPromptInput {
  property: Property
  highlight: PropertyHighlight
  format: AdFormat
  copyHeadline: string
  /** Estilo gráfico — default 'split_photo_info' si no se especifica. */
  compositionStyle?: CompositionStyle
}

export function buildAdImagePrompt(input: BuildPromptInput): string {
  const { property, highlight, format, copyHeadline } = input
  const compositionStyle = input.compositionStyle ?? 'split_photo_info'
  const spec = FORMAT_SPECS[format]
  const compositionGuidance = buildCompositionGuidance(compositionStyle, format)
  const operation = (property.operation_type ?? 'venta').toLowerCase()
  const operationLabel = operation === 'venta' ? 'Venta' : operation === 'alquiler' ? 'Alquiler' : 'Temporario'
  const amenities = Array.isArray(property.amenities)
    ? (property.amenities as string[]).slice(0, 8).join(', ')
    : ''
  const moodGuidance = buildMoodGuidance(highlight.mood ?? 'luminoso')
  const photoGuidance = buildPhotoGuidance(highlight)
  const typographyGuidance = buildTypographyGuidance(format)
  const paletteGuidance = buildPaletteGuidance(highlight.mood ?? 'luminoso')
  const formattedPrice = formatPriceForOverlay(property.asking_price, property.currency)
  const specSummary = buildSpecSummary(property)

  return `
# BRIEF DE GENERACIÓN — Pieza publicitaria inmobiliaria premium

Sos un director creativo senior de una agencia de publicidad inmobiliaria de alta gama en Argentina. Tu cliente es Diego Ferreyra Inmobiliaria, una inmobiliaria boutique especializada en propiedades de segmento medio-alto y premium en CABA y GBA Norte. Necesitamos una pieza gráfica de calidad editorial para publicar como anuncio en Meta Ads (Facebook + Instagram).

La pieza tiene que parecerse a los avisos que sacan inmobiliarias top como Toribio Achával, Caputo Hnos, o IBS — sobrias, claras, con jerarquía tipográfica clara, sin ruido visual y sin clichés gráficos de cartel barato.

## SOBRE LA PROPIEDAD

Estos son los datos concretos. No inventes nada que no esté acá:

- **Tipo:** ${property.property_type}
- **Operación:** ${operationLabel}
- **Dirección:** ${property.address}
- **Barrio:** ${property.neighborhood}
- **Ciudad:** ${property.city}
- **Precio público:** ${formattedPrice}
- **Ambientes:** ${property.rooms ?? 'no especificado'}
- **Dormitorios:** ${property.bedrooms ?? 'no especificado'}
- **Baños:** ${property.bathrooms ?? 'no especificado'}
- **Cocheras:** ${property.garages ?? 'no especificadas'}
- **Superficie cubierta:** ${property.covered_area ? property.covered_area + ' m²' : 'no especificada'}
- **Superficie total:** ${property.total_area ? property.total_area + ' m²' : 'no especificada'}
- **Piso:** ${property.floor != null ? property.floor : 'no especificado'}
- **Expensas:** ${property.expensas ? '$' + property.expensas.toLocaleString('es-AR') : 'no informadas'}
- **Amenities del edificio:** ${amenities || 'no especificados'}
- **Antigüedad:** ${property.age != null ? property.age + ' años' : 'no informada'}

Si un dato no está, NO lo inventes. Mejor omitirlo del aviso que mentir.

## ANGULAR DE VENTA DE ESTE AVISO

Esta pieza va a destacar **un único argumento de venta principal**:

- **Highlight:** ${highlight.label}
- **Por qué es el ángulo elegido:** ${highlight.reasoning}
- **Datos concretos que respaldan el highlight:** ${(highlight.copyHooks ?? []).join(' · ') || 'usar la descripción anterior'}
- **Mood/estética objetivo:** ${highlight.mood ?? 'luminoso'}
- **Score de impacto comercial:** ${highlight.impactScore ?? 'no calificado'}

El aviso completo debe respirar este angular. Cada elemento gráfico debe reforzar este argumento de venta, no diluirlo con otros features de la propiedad. Si el highlight es "balcón aterrazado", no quiero que el aviso muestre la cocina ni el living. Si el highlight es "vista panorámica", la foto principal debe SER la vista.

## FOTO DE BASE

Te paso una foto de referencia de la propiedad. Esta foto:

${photoGuidance}

**Crítico sobre la foto:**
- NO le cambies el contenido. No agregues ni quites muebles, no muevas elementos, no alteres la arquitectura.
- SÍ podés mejorar luz, contraste, claridad, saturación natural — el estándar de cualquier post-procesado profesional inmobiliario.
- SÍ podés corregir distorsión de lente leve si la foto la tiene.
- NO inviertas la imagen ni hagas mirror.
- La foto es real, de una propiedad real. Mantenerla creíble.

## MOOD Y ATMÓSFERA

${moodGuidance}

## COMPOSICIÓN REQUERIDA (formato ${spec.aspect})

Esta pieza es para **${spec.placement}**, resolución final ${spec.width}×${spec.height}.

### Estilo de composición elegido para esta pieza: ${compositionStyle}

${compositionGuidance}

### Composición base del formato

${spec.composition}

**Jerarquía visual de elementos sobre la foto:**

1. **Foto principal** — el elemento dominante. La foto de la propiedad procesada (mejorada según el mood) ocupa la mayoría del espacio visual.

2. **Headline destacado** — UN titular comercial corto que comunique el argumento de venta principal. Para esta pieza:

   > "${copyHeadline}"

   Este titular tiene que aparecer en la pieza con peso visual fuerte pero sin tapar la foto. Tipografía sans-serif con tracking ligeramente amplio. Tamaño grande pero no abusivo.

3. **Precio** — el segundo elemento más importante visualmente. El precio formateado:

   > **${formattedPrice}**

   Tipografía igual que el headline pero MAYOR peso visual. El precio cierra el deal: la persona que mira la pieza tiene que entender en 1 segundo que la propiedad cuesta esto.

4. **Specs compactos** — línea sobria con los datos clave separados por un separador delicado (punto medio · o pipe |). Para esta propiedad:

   > **${specSummary}**

5. **Sello/identidad** — espacio sutil reservado abajo a la derecha para el logo de la inmobiliaria (NO lo dibujes vos — dejá un placeholder rectangular discreto donde después se aplica el logo real).

NO PONGAS:
- Email, teléfono o WhatsApp en la pieza (el CTA del ad ya lleva al landing).
- Direcciones específicas o número de calle visible (privacidad del propietario).
- Marcas de agua o copyrights visibles que no sean los nuestros.
- Texto en otro idioma. Todo en español rioplatense.

## TIPOGRAFÍA

${typographyGuidance}

## PALETA DE COLORES

${paletteGuidance}

## ESTÉTICA PREMIUM — REGLA GENERAL

La pieza tiene que parecer un aviso de revista AD o Architectural Digest, no un cartel de plaza pública. Específicamente:

- Whitespace generoso. El espacio en blanco entre elementos es lo que comunica "lujo".
- Tipografía sans-serif moderna con peso variado para crear jerarquía.
- Cero tipografías de fantasía, cero scripts cursivos, cero rounded blocky.
- Cero elementos decorativos fuera de lugar: nada de íconos de casita, nada de gráficos de "venta", nada de banners ondulados, nada de marcos con esquinas redondeadas exageradas.
- Si usás una línea decorativa, debe ser delgada (1-2px) y discreta.
- Si usás un fondo de color para una sección de texto, debe ser sólido y de la paleta neutra (off-white, charcoal, etc).

## ANTI-PATRONES — qué NO hacer

Esta es una lista negra explícita. Cualquiera de estos elementos hace que el aviso parezca de inmobiliaria de barrio y arruina la percepción de premium:

- Emojis (ningún 🏡 ni ✨ ni 📍 ni 🌟). Cero emojis.
- Texto inclinado o curvado innecesariamente.
- Efectos de neón, glow, shine, brillos.
- Borders/marcos con esquinas redondeadas exageradas (más de 20px de radius).
- Gradientes de colores brillantes (oro/violeta/celeste neón).
- Stickers o badges tipo "OFERTA", "IMPERDIBLE", "GRAN OPORTUNIDAD".
- Fotos con filtros Instagram saturados (vivid, lomo, etc).
- Tipografías Comic Sans, Papyrus, Brush Script, Lobster, Pacifico, o cualquier display-script.
- Marcos de fotos vintage o polaroid.
- Texto sobre la foto sin contraste suficiente (siempre con overlay/sombra controlada o en zona de fondo limpio).
- Más de 3 niveles tipográficos. La jerarquía debe ser limpia.
- Iconografía de "casa+llave+sol" tipo cliparts.
- Logos invasivos. El logo va sutil en una esquina.

## ESPECIFICACIONES TÉCNICAS DE OUTPUT

- **Dimensiones exactas:** ${spec.width} × ${spec.height} píxeles.
- **Aspect ratio:** ${spec.aspect}.
- **Color space:** sRGB (Meta Ads no soporta otros).
- **Calidad:** alta. La foto se va a ver en mobile retina — cada pixel cuenta.
- **Formato:** JPG o PNG. JPG si la pieza es predominantemente fotográfica (menor peso). PNG si tiene áreas de texto extensas (mejor renderizado tipográfico).
- **Peso máximo objetivo:** 1.5 MB (Meta acepta hasta 8 MB pero piezas livianas cargan más rápido).

## REFERENCIAS MENTALES (sin copiar)

Pensá en la estética de:
- Avisos impresos de Engel & Völkers a nivel global (sobriedad + tipografía elegante).
- Composiciones de The Modern House (Reino Unido) — fotografía editorial + tipografía mínima.
- Newsletters de Sotheby's International Realty.
- Avisos de revistas LIVING o DECO.

NO te inspires en:
- Avisos de portales tipo ZonaProp o MercadoLibre con texto invasivo.
- Carteles físicos en vidrieras de inmobiliarias de barrio.
- Promociones de Meta de chiringuitos turísticos.

## OUTPUT ESPERADO

Devolveme la imagen final. La pieza tiene que poder publicarse tal cual en Meta Ads sin retocar nada. Si por alguna razón no podés generar la imagen exacta requerida, devolveme la mejor aproximación al brief manteniendo:

1. La foto de la propiedad fiel al original (mejorada pero no alterada).
2. El precio claramente visible.
3. El headline destacado.
4. La jerarquía visual descrita.
5. Cero anti-patrones de la lista negra.

Trabajemos.
`.trim()
}

function buildMoodGuidance(mood: NonNullable<PropertyHighlight['mood']>): string {
  const guides: Record<NonNullable<PropertyHighlight['mood']>, string> = {
    luminoso:
      'Atmósfera luminosa y abierta. Luz natural fría-neutra dominante. La foto debe respirar claridad, espacios abiertos y aire. Sin sombras dramáticas. Saturación natural pero contraste limpio. Comunica claridad, frescura, aspiracional sin pretensión.',
    cálido:
      'Atmósfera cálida y acogedora. Temperatura de color hacia los ámbar/dorados suaves (sin caer en naranja saturado). La foto debe transmitir confort, hogar, momentos compartidos. Sombras suaves, sin frío. Comunica calidez, familia, refugio.',
    moderno:
      'Estética moderna y minimalista. Líneas limpias, paleta sobria (blancos, grises, negro). Espacios despejados, mobiliario contemporáneo. Sin elementos vintage. Comunica diseño contemporáneo, sofisticación, vida actual.',
    clásico:
      'Estética clásica y elegante. Materiales nobles (madera, mármol, bronce sutil). Composición simétrica. Tonos tierra equilibrados. Comunica trayectoria, valor consolidado, calidad atemporal.',
    amplio:
      'Sensación de amplitud y respiración. Composición con mucho aire, líneas largas. Pocos elementos compitiendo. Comunica espacio generoso, libertad, escala.',
    industrial:
      'Estética industrial-moderna. Materiales auténticos (hormigón, acero, ladrillo visto). Paleta de grises y carbón con un acento cálido sutil. Comunica diseño autoral, urbano, contemporáneo.',
    aspiracional:
      'Estética aspiracional editorial. Composición de revista, fotografía cuidada, atmósfera de propiedad excepcional. Comunica "este es el lugar al que quiero llegar", sin caer en exageración.',
    familiar:
      'Atmósfera familiar y cálida pero contemporánea. Espacios pensados para compartir, sin caer en cliché de "casa de revista de decoración hogareña". Comunica plan de vida en familia, estabilidad, calidad de vida.',
  }
  return guides[mood] ?? guides.luminoso
}

function buildPhotoGuidance(highlight: PropertyHighlight): string {
  return `Es la foto del feature destacado (${highlight.label}). La idea es que esa foto sea la protagonista de la pieza: la persona que mira el ad tiene que ver INMEDIATAMENTE el argumento de venta (la pileta, el balcón, la vista, la cocina — según corresponda). Si la foto requiere algún recorte para que el highlight quede mejor enmarcado, hacelo. Si requiere ajuste de luz o contraste, hacelo. Pero la foto sigue siendo la foto real de esta propiedad real.`
}

function buildTypographyGuidance(format: AdFormat): string {
  const sizeBase = format === 'story_vertical' ? '72px' : '48px'
  return `Familia tipográfica: sans-serif neutra moderna. Si tu sistema soporta nombres específicos, usá: Inter, Helvetica Neue, Söhne, Aktiv Grotesk, Untitled Sans, Plus Jakarta Sans, o Geist. NO uses: Comic Sans, Papyrus, Lobster, Pacifico, Brush Script, Allura, Great Vibes, ni ninguna script.

Pesos a usar (en orden de jerarquía):
- Headline / titular: peso 600-700 (Semibold a Bold). Tracking +0.5 a +1.5.
- Precio: peso 700-800 (Bold a Black). Tracking neutral o ligeramente abierto.
- Specs (ambientes, m², barrio): peso 400-500 (Regular a Medium). Tracking neutral.
- Disclaimer/credit (si hay): peso 400 (Regular). Tamaño 40-50% del de specs.

Tamaño base de referencia para los specs en este formato: ${sizeBase}. Headline y precio escalan hacia arriba con ratio 1.5x-2.5x respectivamente.

Alineación: izquierda en el bloque de texto inferior, salvo que la composición requiera centrado por razones específicas. Los specs van en una sola línea separados por · o |.`
}

function buildPaletteGuidance(mood: NonNullable<PropertyHighlight['mood']>): string {
  const palettes: Record<NonNullable<PropertyHighlight['mood']>, string> = {
    luminoso: `Paleta principal de blancos cálidos y off-whites (#FAFAF8, #F4F2EE). Texto en charcoal (#1B1F2A) o azul muy oscuro casi negro (#0F1729). Acento opcional: brand color de la inmobiliaria (azul navy #2A3B84) usado mínimamente en una línea decorativa o en el precio.`,
    cálido: `Paleta principal de cremas y arenas (#F7F2EA, #EDE5D6). Texto en marrón profundo (#3B2C20) o charcoal cálido (#28201A). Acento sutil: terracota apagada o dorado mate (#B8956A) en una línea fina.`,
    moderno: `Paleta principal de blancos crudo y grises claros (#FFFFFF, #F5F5F4, #E7E5E4). Texto en negro casi puro (#0A0A0A). Acento: nada o un azul navy técnico sutil.`,
    clásico: `Paleta principal de cremas tierra (#F2EDE3, #E8DFCC). Texto en chocolate oscuro (#2D2317) o negro tinta (#1A1612). Acento sutil: dorado mate antiguo (#A38851) en una línea fina o el precio.`,
    amplio: `Paleta principal de blancos puros (#FFFFFF) con grises claros (#F5F5F5). Texto en azul muy oscuro (#0F1729). Cero acentos saturados — el "lujo" viene del espacio en blanco.`,
    industrial: `Paleta principal de grises medios y cementos (#A8A8A6, #6B6B68). Texto en negro pleno (#000000) o blanco puro (#FFFFFF) según fondo. Acento sutil: rojo profundo (#7A1F22) o ámbar industrial (#C26F1F).`,
    aspiracional: `Paleta principal de blancos cremoso (#F8F5EE) y tonos camel suaves (#D4B896). Texto en charcoal premium (#1B1F2A). Acento: dorado champagne (#D4AF7A) usado MUY mínimamente.`,
    familiar: `Paleta principal de blancos cálidos (#F9F6F0) y cremas (#EAE3D2). Texto en marrón medio cálido (#5A4632) o charcoal (#1B1F2A). Sin acentos saturados — la calidez viene del propio color base.`,
  }
  return palettes[mood] ?? palettes.luminoso
}

function buildSpecSummary(property: Property): string {
  const parts: string[] = []
  if (property.rooms) parts.push(`${property.rooms} amb`)
  if (property.bedrooms) parts.push(`${property.bedrooms} dorm`)
  if (property.covered_area) parts.push(`${property.covered_area} m²`)
  if (property.floor != null) parts.push(`piso ${property.floor}`)
  if (property.neighborhood) parts.push(property.neighborhood)
  return parts.join(' · ')
}

function formatPriceForOverlay(price: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

function buildCompositionGuidance(
  style: CompositionStyle,
  format: AdFormat,
): string {
  const guides: Record<CompositionStyle, string> = {
    hero_full_bleed:
      'Foto edge-to-edge ocupando el 100% del frame. Sobre ella, en la zona inferior (último 30% vertical), aplicar un degradé sutil de negro al 40% opacidad para que el texto se lea sin tapar la foto. El precio y el headline van centrados-izquierda sobre ese degradé. Sin bandas ni cajas con bordes. Tipografía blanca pura. La estética es de editorial fotográfico — foto siendo la protagonista absoluta. Cero elementos decorativos. Solo: foto + texto sutil + logo discreto en esquina inferior derecha.',
    split_photo_info:
      'División horizontal 65/35. Top 65%: foto de la propiedad mejorada (luz, contraste, claridad — sin alterar el contenido). Bottom 35%: panel sólido de color (paleta del mood) con texto en 3 niveles jerárquicos: 1) precio en grande, 2) headline a la izquierda, 3) specs compactos en una línea separados por · o |. Layout limpio, asimétrico hacia la izquierda. Sin marcos ni borders. Es el formato más conservador y profesional — el que usa Engel & Völkers, Sotheby\'s.',
    editorial_magazine:
      'Composición tipo revista AD o Living. Foto de la propiedad ocupa la mitad izquierda o el centro (depende del formato). El otro lado contiene tipografía editorial: título grande (puede ser serif elegante tipo Söhne, Tiempos, Adelle), bajada en sans-serif. Estilo "spread de revista". Whitespace generoso. Numeración o detalle de página opcional ("Casa Nº 042") como elemento de identidad. Cero ruido. Es la opción más sofisticada — para propiedades premium.',
    minimalist_whitespace:
      'Foto pequeña (50% del ancho máximo) centrada o ligeramente desplazada hacia un cuadrante. El resto del frame es whitespace puro (paleta blanca/off-white). Tipografía minimalista en una esquina o en bloque centrado. Mucho aire. Es la estética más "less is more" — usado por marcas como Aesop, COS, Apple en sus avisos. Comunica calma absoluta y precisión. Para propiedades en barrios premium tranquilos.',
    color_overlay_solid:
      'Foto de la propiedad ocupa la mayoría del frame. Sobre ella, una superposición sólida de UN color de la paleta del mood (no semi-transparente — sólido, en una zona definida) que cubre 30-40% del frame y donde va el texto. Por ejemplo, un rectángulo de color crema (#F2EDE3) que ocupa el cuarto inferior izquierdo con todo el texto encima. La división color/foto es nítida, geométrica. Es la estética más contemporánea — usado por brands tipo Aman Resorts, Hermès.',
    typography_dominant:
      'El texto es el elemento protagonista, no la foto. Tipografía display grande que ocupa el 60-70% del frame con el headline. La foto va como mini-imagen (200-300px) en una esquina o en el bottom. Es la estética más "design forward" — para llamar la atención por el copy y la tipografía. Apropiado para los ángulos emocionales (refugio, ritual, pertenencia) donde la palabra importa más que el feature visual.',
  }
  const note = format === 'story_vertical'
    ? '\n\nAJUSTE PARA STORY 9:16: en formato story vertical, todos los elementos deben respetar la zona safe (entre 250px del top y 250px del bottom). El bottom 25% suele ser tapado por la UI de Instagram (link sticker, perfil). El top 15% por la barra de progreso. Mantené texto importante en el centro vertical (zona 30%-75%).'
    : ''
  return guides[style] + note
}
