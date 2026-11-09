export type PdfPasswordPhase = 'idle' | 'required' | 'incorrect' | 'checking'

/** One-shot PDF.js challenge. The gate keeps a callback, never the submitted password. */
export function createPdfPasswordGate(changed: (phase: PdfPasswordPhase) => void) {
  let pending: ((password: string) => void) | undefined
  return {
    request(update: (password: string) => void, reason: number) {
      pending = update
      changed(reason === 2 ? 'incorrect' : 'required')
    },
    submit(password: string) {
      if (!pending || password.length === 0) return false
      const update = pending
      pending = undefined
      changed('checking')
      update(password)
      return true
    },
    clear() { pending = undefined; changed('idle') },
  }
}
