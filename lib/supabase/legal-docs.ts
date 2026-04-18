// lib/supabase/legal-docs.ts
import { createClient } from '@supabase/supabase-js'
import type { LegalDocsState, LegalFlags, DocItemState } from '@/types/legal-docs.types'
import { getApplicableDocs } from '@/types/legal-docs.types'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function getLegalDocs(propertyId: string) {
  const { data, error } = await getAdmin()
    .from('properties')
    .select('legal_docs, legal_flags, property_type')
    .eq('id', propertyId).single()
  if (error) throw error
  return {
    docs: (data.legal_docs as LegalDocsState) || {},
    flags: (data.legal_flags as LegalFlags) || { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false },
    propertyType: data.property_type as string,
  }
}

export async function setLegalFlags(propertyId: string, flags: Partial<LegalFlags>) {
  const { data, error } = await getAdmin().rpc('merge_property_legal_flags', {
    p_property_id: propertyId,
    p_flags_patch: flags,
  })
  if (error) throw error
  return data as LegalFlags
}

export async function upsertLegalDocItem(propertyId: string, itemKey: string, state: Partial<DocItemState>) {
  const { data, error } = await getAdmin().rpc('merge_property_legal_doc', {
    p_property_id: propertyId,
    p_item_key: itemKey,
    p_item_patch: state,
  })
  if (error) throw error
  const docs = data as LegalDocsState
  return docs[itemKey]
}

/**
 * Determina si todos los documentos obligatorios y temporales aplicables
 * están aprobados. Si sí, marca legal_status = 'approved' en properties.
 *
 * Nota semántica: los documentos temporales que APLICAN pero están faltantes
 * o pendientes BLOQUEAN la aprobación global. Solo cuenta como aprobado si
 * todos los mandatory + temporal aplicables tienen status === 'approved'.
 */
export async function checkGlobalApproval(propertyId: string) {
  const { docs, flags, propertyType } = await getLegalDocs(propertyId)
  const applicable = getApplicableDocs(flags, propertyType)
  const mustApprove = applicable.filter(d => d.category === 'mandatory' || d.category === 'temporal')
  if (mustApprove.length === 0) {
    console.warn(`checkGlobalApproval: no mandatory/temporal docs resolved for property ${propertyId} (property_type="${propertyType}"). Not escalating to approved.`)
    return false
  }
  const allApproved = mustApprove.every(d => docs[d.key]?.status === 'approved')

  if (allApproved) {
    const { error } = await getAdmin().from('properties').update({
      legal_status: 'approved',
      legal_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', propertyId)
    if (error) throw error
  }
  return allApproved
}
