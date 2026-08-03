// lib/integrations/mailchimp/client.ts
import 'server-only'
import { subscriberHash, type MergeFields } from './subscriber'

export interface MailchimpConfig { apiKey: string; server: string; audienceId: string; baseUrl: string }
export interface MailchimpResult { ok: boolean; status: number; error?: string }

/** Lee la config de env. Null si falta algo (nunca tira). */
export function getMailchimpConfig(): MailchimpConfig | null {
  const apiKey = process.env.MAILCHIMP_API_KEY
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID
  if (!apiKey || !audienceId) return null
  const server = process.env.MAILCHIMP_SERVER_PREFIX || apiKey.split('-')[1] || ''
  if (!server) return null
  return { apiKey, server, audienceId, baseUrl: `https://${server}.api.mailchimp.com/3.0` }
}

/** Interruptor maestro. Fail-closed: solo ON con exactamente 'true'. */
export function mailchimpSyncEnabled(): boolean {
  return process.env.MAILCHIMP_SYNC_ENABLED === 'true'
}

async function mcFetch(
  cfg: MailchimpConfig, path: string,
  init: { method: string; body?: string; timeoutMs?: number } = { method: 'GET' },
): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 8000)
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method,
      body: init.body,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null }
  } finally {
    clearTimeout(timer)
  }
}

export async function ping(cfg: MailchimpConfig): Promise<boolean> {
  const r = await mcFetch(cfg, '/ping', { method: 'GET' })
  return r.ok
}

/** Upsert idempotente. status_if_new (NUNCA status) para no resucitar bajas. */
export async function upsertMember(cfg: MailchimpConfig, email: string, merge: MergeFields): Promise<MailchimpResult> {
  const r = await mcFetch(cfg, `/lists/${cfg.audienceId}/members/${subscriberHash(email)}`, {
    method: 'PUT',
    body: JSON.stringify({ email_address: email, status_if_new: 'subscribed', merge_fields: merge }),
  })
  return { ok: r.ok, status: r.status, error: r.ok ? undefined : (r.body?.detail || `HTTP ${r.status}`) }
}

/** Pone un tag active y una lista de tags inactive. Idempotente. */
export async function setMemberTags(cfg: MailchimpConfig, email: string, activate: string | null, deactivate: string[]): Promise<MailchimpResult> {
  const tags = [
    ...(activate ? [{ name: activate, status: 'active' }] : []),
    ...deactivate.map(name => ({ name, status: 'inactive' })),
  ]
  if (tags.length === 0) return { ok: true, status: 204 }
  const r = await mcFetch(cfg, `/lists/${cfg.audienceId}/members/${subscriberHash(email)}/tags`, {
    method: 'POST', body: JSON.stringify({ tags }),
  })
  return { ok: r.ok, status: r.status, error: r.ok ? undefined : (r.body?.detail || `HTTP ${r.status}`) }
}

/** Crea un merge field si no existe (idempotente por tag). */
export async function ensureMergeField(cfg: MailchimpConfig, tag: string, name: string): Promise<void> {
  const list = await mcFetch(cfg, `/lists/${cfg.audienceId}/merge-fields?count=100`, { method: 'GET' })
  const exists = (list.body?.merge_fields || []).some((m: any) => m.tag === tag)
  if (exists) return
  await mcFetch(cfg, `/lists/${cfg.audienceId}/merge-fields`, {
    method: 'POST', body: JSON.stringify({ tag, name, type: 'text', public: false }),
  })
}
