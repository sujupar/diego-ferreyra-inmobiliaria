import { createAdminClient } from '@/lib/supabase/admin'

export interface FunnelTestimonialRow {
  id: string
  key: string
  client_name: string
  location: string
  title: string
  result_badge: string | null
  quote: string
  video_url: string
  poster_url: string
  is_vertical: boolean
  sort_order: number
  active: boolean
}

export interface FunnelTestimonial {
  key: string
  clientName: string
  location: string
  title: string
  resultBadge: string | null
  quote: string
  videoUrl: string
  posterUrl: string
  isVertical: boolean
}

export function mapTestimonialRow(r: FunnelTestimonialRow): FunnelTestimonial {
  return {
    key: r.key,
    clientName: r.client_name,
    location: r.location,
    title: r.title,
    resultBadge: r.result_badge,
    quote: r.quote,
    videoUrl: r.video_url,
    posterUrl: r.poster_url,
    isVertical: r.is_vertical,
  }
}

/** Lee los testimonios activos ordenados. Devuelve [] ante cualquier error (la página no debe romper). */
export async function getActiveTestimonials(): Promise<FunnelTestimonial[]> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('funnel_testimonials')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error || !data) return []
    return (data as unknown as FunnelTestimonialRow[]).map(mapTestimonialRow)
  } catch {
    return []
  }
}
