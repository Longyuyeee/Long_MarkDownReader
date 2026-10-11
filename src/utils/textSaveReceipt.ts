// A native write acknowledges the submitted snapshot, not subsequent typing.
export function reconcileTextSaveReceipt(submitted: string, current: string, saved: string) {
  const changed = current !== submitted
  return { content: changed ? current : saved, isDirty: changed }
}
