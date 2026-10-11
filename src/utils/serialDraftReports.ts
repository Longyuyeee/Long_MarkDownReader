export interface DraftReport {
  session: string
  sequence: number
  dirty: boolean
}

// Retain each transition in order; a failed report must not strand later ones.
export function createSerialDraftReporter(send: (report: DraftReport) => Promise<void>) {
  let tail = Promise.resolve()
  return (report: DraftReport): Promise<void> => {
    const snapshot = { ...report }
    const result = tail.then(() => send(snapshot))
    tail = result.catch(() => {})
    return result
  }
}
