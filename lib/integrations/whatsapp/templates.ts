/**
 * Plantillas de WhatsApp aprobadas por Meta — para el selector del chat del
 * Inbox que permite reabrir una conversación fuera de la ventana de 24hs
 * (task 9, "chat pro"). Reusa el mismo endpoint que ya usaba
 * `scripts/create-whatsapp-template-recorrido.ts` para consultar el estado de
 * una plantilla puntual; acá se listan TODAS las aprobadas y se cachean en
 * memoria (el catálogo de plantillas cambia poco — no hace falta pegarle a
 * Meta en cada apertura del selector).
 *
 * SIN 'server-only': mismo criterio que `./core.ts` (reusable desde scripts).
 */

export interface WhatsappTemplateSummary {
  name: string
  language: string
  category: string
  /** Texto del componente BODY, con los placeholders `{{1}}`, `{{2}}`... tal cual. */
  bodyText: string
  /** Cantidad de variables `{{n}}` distintas en el body — cuántos inputs mostrar en el selector. */
  variableCount: number
  /** true si tiene un botón URL con sufijo dinámico (`{{1}}` al final de la url) — pide un input más. */
  hasDynamicUrlButton: boolean
}

interface MetaTemplateComponent {
  type?: string
  text?: string
  buttons?: Array<{ type?: string; text?: string; url?: string }>
}

interface MetaTemplateRaw {
  name: string
  status: string
  category: string
  language: string
  components?: MetaTemplateComponent[]
}

/**
 * Parsea los `components` crudos de Meta a lo que necesita el selector. Pura
 * (sin red) — testeada en `templates.test.ts` con shapes reales documentados
 * en `docs/whatsapp-plantilla-recorrido.md`.
 */
export function parseTemplateComponents(components: MetaTemplateComponent[] | undefined): {
  bodyText: string
  variableCount: number
  hasDynamicUrlButton: boolean
} {
  const body = (components ?? []).find(c => c.type === 'BODY')
  const bodyText = body?.text ?? ''
  const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
  const variableCount = matches.length > 0 ? Math.max(...matches) : 0

  const buttons = (components ?? []).find(c => c.type === 'BUTTONS')
  const hasDynamicUrlButton = Boolean(
    buttons?.buttons?.some(b => b.type === 'URL' && typeof b.url === 'string' && /\{\{\d+\}\}\s*$/.test(b.url)),
  )

  return { bodyText, variableCount, hasDynamicUrlButton }
}

function toSummary(raw: MetaTemplateRaw): WhatsappTemplateSummary {
  const parsed = parseTemplateComponents(raw.components)
  return {
    name: raw.name,
    language: raw.language,
    category: raw.category,
    bodyText: parsed.bodyText,
    variableCount: parsed.variableCount,
    hasDynamicUrlButton: parsed.hasDynamicUrlButton,
  }
}

let cache: { data: WhatsappTemplateSummary[]; expiresAt: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min — el catálogo de plantillas cambia poco.

/**
 * Devuelve las plantillas APROBADAS de la cuenta, cacheadas en memoria del
 * proceso por `CACHE_TTL_MS`. Nunca lanza: sin credenciales o ante un error de
 * Meta devuelve `[]` (el selector se muestra vacío con un aviso, no rompe el chat).
 * `force=true` ignora el cache (botón "Actualizar" del selector).
 */
export async function fetchApprovedTemplates(opts?: { force?: boolean }): Promise<WhatsappTemplateSummary[]> {
  if (!opts?.force && cache && cache.expiresAt > Date.now()) return cache.data

  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!waba || !token) return []

  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${waba}/message_templates?limit=100&fields=name,status,category,language,components`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
    )
    const json = (await res.json().catch(() => ({}))) as { data?: MetaTemplateRaw[]; error?: unknown }
    if (!res.ok || json.error || !Array.isArray(json.data)) {
      console.warn('[whatsapp-templates] no se pudieron listar (continuando con []):', json.error ?? res.status)
      return cache?.data ?? []
    }
    const data = json.data.filter(t => t.status === 'APPROVED').map(toSummary)
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  } catch (err) {
    console.warn('[whatsapp-templates] excepción listando plantillas (continuando con []):', err)
    return cache?.data ?? []
  }
}
