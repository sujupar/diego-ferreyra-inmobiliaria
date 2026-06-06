const YT_PATTERNS: RegExp[] = [
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/watch\?[^#]*\bv=([A-Za-z0-9_-]{11})/,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
]

/** Extrae el ID de un video de YouTube de cualquier formato de URL. null si no es YouTube. */
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  for (const re of YT_PATTERNS) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}
