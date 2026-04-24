import 'server-only'
import * as React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@supabase/supabase-js'
import { AppraisalReport } from '@/components/pdf/AppraisalReport'
import type { ScrapedProperty } from '@/lib/scraper/types'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Rebuild the ScrapedProperty shape from the persisted appraisal row.
 * The DB stores everything in flat columns; AppraisalReport needs the scraper
 * schema. This mirrors saveAppraisal's inverse mapping.
 */
function rowToSubject(a: any): ScrapedProperty {
  return {
    url: a.property_url || '',
    title: a.property_title || '',
    price: a.property_price ?? null,
    currency: a.property_currency || null,
    location: a.property_location || '',
    description: a.property_description || '',
    features: a.property_features || {},
    images: Array.isArray(a.property_images) ? a.property_images : [],
    portal: 'internal',
  }
}

function rowToComparable(c: any): ScrapedProperty {
  return {
    url: c.url || '',
    title: c.title || '',
    price: c.price ?? null,
    currency: c.currency || null,
    location: c.location || '',
    description: c.description || '',
    features: c.features || {},
    images: Array.isArray(c.images) ? c.images : [],
    portal: 'internal',
  }
}

export async function generateAppraisalPdfBuffer(appraisalId: string): Promise<{ buffer: Buffer; filename: string }> {
  const admin = getAdmin()
  const [aRes, cRes] = await Promise.all([
    admin.from('appraisals').select('*').eq('id', appraisalId).single(),
    admin.from('appraisal_comparables').select('*').eq('appraisal_id', appraisalId).order('sort_order'),
  ])
  if (aRes.error) throw aRes.error
  if (!aRes.data) throw new Error(`Appraisal ${appraisalId} not found`)

  const subject = rowToSubject(aRes.data)
  const allComparables = (cRes.data || []).map(rowToComparable)
  // Filter out overpriced/purchase (analysis.propertyType) — only include direct comps.
  const comparables = allComparables.filter((_, i) => {
    const src = cRes.data?.[i]
    const kind = src?.analysis?.propertyType
    return !kind || (kind !== 'overpriced' && kind !== 'purchase')
  })
  const valuation = aRes.data.publication_price ?? 0

  const buffer = await renderToBuffer(
    React.createElement(AppraisalReport, { subject, valuation, comparables }) as any
  )
  const safe = (aRes.data.property_location || 'tasacion').toString().replace(/[^\w-]/g, '_').slice(0, 40) || 'tasacion'
  return { buffer, filename: `tasacion-${safe}.pdf` }
}
