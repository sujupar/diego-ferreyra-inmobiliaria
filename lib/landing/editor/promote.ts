/**
 * E1.6 Editor — decide qué documento publicar: el borrador (draft_content) si existe,
 * si no el content actual. `promoteDraft` indica si hay que promover el borrador a
 * `content`. Pura y sin imports (testeable con tsx sin arrastrar supabase/@-alias).
 */
export function pickPublishSource(row: { content: unknown; draft_content: unknown | null }): {
  source: unknown
  promoteDraft: boolean
} {
  const hasDraft = row.draft_content != null
  return { source: hasDraft ? row.draft_content : row.content, promoteDraft: hasDraft }
}
