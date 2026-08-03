import 'server-only'

/** true si el tag que corresponde HOY difiere del último sincronizado (ledger). */
export function needsResync(targetTag: string | null, ledgerTag: string | null): boolean {
  return targetTag !== ledgerTag
}
