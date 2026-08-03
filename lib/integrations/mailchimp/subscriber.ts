import 'server-only'
import { createHash } from 'node:crypto'
import { firstName } from '@/lib/email/format'

/** subscriber_hash = MD5 del email en minúsculas (contrato Mailchimp). */
export function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex')
}

export interface MergeFields {
  FNAME: string
  CRM_STAGE: string
}

/** Merge fields que mandamos en cada upsert. CRM_STAGE alimenta las condiciones de salida. */
export function mergeFieldsFor(fullName: string | null, crmStage: string): MergeFields {
  return { FNAME: firstName(fullName), CRM_STAGE: crmStage }
}
