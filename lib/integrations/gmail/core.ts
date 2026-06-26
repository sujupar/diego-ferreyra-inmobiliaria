import crypto from 'node:crypto'

/**
 * Núcleo del cliente Gmail (sin 'server-only') para poder usarlo tanto desde
 * rutas server como desde scripts de diagnóstico (npx tsx). El wrapper
 * `client.ts` re-exporta esto con el guard 'server-only' para la app.
 *
 * Lectura de solo lectura vía cuenta de servicio con domain-wide delegation
 * (Google Workspace). Firma el JWT con el `crypto` nativo de Node (RS256), sin
 * sumar dependencias (googleapis / google-auth-library).
 *
 * Requisitos (env vars):
 *   GMAIL_SA_CLIENT_EMAIL   — email de la service account (...@...iam.gserviceaccount.com)
 *   GMAIL_SA_PRIVATE_KEY    — private key PEM (los \n pueden venir escapados)
 *   GMAIL_IMPERSONATE_EMAIL — casilla a leer (ej. contacto@diegoferreyrainmobiliaria.com)
 */

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export class GmailError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'GmailError'
  }
}

/**
 * Soporta DOS métodos de autenticación:
 *  - OAuth (refresh token): NO requiere key de cuenta de servicio → esquiva la
 *    org policy `iam.disableServiceAccountKeyCreation`. Recomendado.
 *      GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN
 *  - Cuenta de servicio + domain-wide delegation (si la org permite crear keys).
 *      GMAIL_SA_CLIENT_EMAIL, GMAIL_SA_PRIVATE_KEY, GMAIL_IMPERSONATE_EMAIL
 * Si ambos están presentes, gana OAuth.
 */
export function oauthConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID &&
      process.env.GMAIL_OAUTH_CLIENT_SECRET &&
      process.env.GMAIL_OAUTH_REFRESH_TOKEN,
  )
}

export function serviceAccountConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_SA_CLIENT_EMAIL &&
      process.env.GMAIL_SA_PRIVATE_KEY &&
      process.env.GMAIL_IMPERSONATE_EMAIL,
  )
}

/** True si hay algún método de autenticación configurado. */
export function gmailConfigured(): boolean {
  return oauthConfigured() || serviceAccountConfigured()
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function normalizePrivateKey(raw: string): string {
  // Las env vars suelen traer los saltos de línea escapados como \n literales.
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

// Cache del access token en memoria del módulo (cold start lo regenera).
let cachedToken: { value: string; expiresAt: number } | null = null

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !json.access_token) {
    throw new GmailError(
      `No se pudo obtener access token de Gmail: ${json.error ?? res.status} ${json.error_description ?? ''}`.trim(),
      res.status,
    )
  }
  return json
}

/** OAuth: intercambia el refresh token por un access token. */
async function getAccessTokenViaOAuth(): Promise<TokenResponse> {
  return postToken({
    client_id: process.env.GMAIL_OAUTH_CLIENT_ID!,
    client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET!,
    refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  })
}

/** Cuenta de servicio: firma un JWT (RS256) e impersona la casilla (DWD). */
async function getAccessTokenViaServiceAccount(): Promise<TokenResponse> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: process.env.GMAIL_SA_CLIENT_EMAIL,
      sub: process.env.GMAIL_IMPERSONATE_EMAIL,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  )
  const signingInput = `${header}.${claims}`
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(normalizePrivateKey(process.env.GMAIL_SA_PRIVATE_KEY!), 'base64url')
  return postToken({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${signingInput}.${signature}`,
  })
}

async function getAccessToken(): Promise<string> {
  if (!gmailConfigured()) {
    throw new GmailError('Gmail no configurado: definí OAuth (GMAIL_OAUTH_*) o cuenta de servicio (GMAIL_SA_*).')
  }
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.value
  }
  // OAuth tiene prioridad (no requiere key de SA → esquiva la org policy).
  const json = oauthConfigured() ? await getAccessTokenViaOAuth() : await getAccessTokenViaServiceAccount()
  cachedToken = { value: json.access_token!, expiresAt: now + (json.expires_in ?? 3600) }
  return json.access_token!
}

async function gmailFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new GmailError(`Gmail ${res.status} ${path}: ${text}`, res.status)
  }
  return res.json() as Promise<T>
}

// --- Tipos crudos de la Gmail API (subset que usamos) ----------------------
interface GmailListResponse {
  messages?: { id: string; threadId: string }[]
  nextPageToken?: string
  resultSizeEstimate?: number
}
interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
interface GmailMessageRaw {
  id: string
  threadId: string
  snippet?: string
  internalDate?: string
  payload?: GmailPart
}

/** Mensaje normalizado y listo para parsear. */
export interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  date: Date | null
  snippet: string
  text: string
  html: string
}

/**
 * Lista IDs de mensajes que matchean el query de búsqueda de Gmail.
 * Ej: `from:(noreply@mercadolibre.com OR noreply@zonaprop.com.ar) newer_than:2d`
 */
export async function listMessages(query: string, maxResults = 50): Promise<{ id: string; threadId: string }[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) })
  const data = await gmailFetch<GmailListResponse>(`/messages?${params.toString()}`)
  return data.messages ?? []
}

function decodePart(data?: string): string {
  if (!data) return ''
  try {
    return Buffer.from(data, 'base64url').toString('utf-8')
  } catch {
    return ''
  }
}

function walkParts(part: GmailPart | undefined, acc: { text: string[]; html: string[] }): void {
  if (!part) return
  const mime = part.mimeType ?? ''
  if (mime === 'text/plain') acc.text.push(decodePart(part.body?.data))
  else if (mime === 'text/html') acc.html.push(decodePart(part.body?.data))
  if (part.parts) for (const p of part.parts) walkParts(p, acc)
}

function headerValue(payload: GmailPart | undefined, name: string): string {
  const h = payload?.headers?.find(x => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

/** Trae un mensaje completo y lo normaliza (subject, from, date, text, html). */
export async function getMessage(id: string): Promise<GmailMessage> {
  const raw = await gmailFetch<GmailMessageRaw>(`/messages/${id}?format=full`)
  const acc = { text: [] as string[], html: [] as string[] }
  walkParts(raw.payload, acc)
  // Mensajes single-part: el body cuelga directo de payload.body
  if (acc.text.length === 0 && acc.html.length === 0 && raw.payload?.body?.data) {
    const body = decodePart(raw.payload.body.data)
    if ((raw.payload.mimeType ?? '').includes('html')) acc.html.push(body)
    else acc.text.push(body)
  }
  const internal = raw.internalDate ? Number(raw.internalDate) : NaN
  return {
    id: raw.id,
    threadId: raw.threadId,
    subject: headerValue(raw.payload, 'Subject'),
    from: headerValue(raw.payload, 'From'),
    date: Number.isFinite(internal) ? new Date(internal) : null,
    snippet: raw.snippet ?? '',
    text: acc.text.join('\n').trim(),
    html: acc.html.join('\n').trim(),
  }
}
