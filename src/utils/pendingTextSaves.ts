// Component instances can be replaced while the native write is still running.
// A new instance must not restore an obsolete dirty tab before that write settles.
const pending = new Map<string, Promise<void>>()

export function runTextSave(path: string, save: () => Promise<void>): Promise<void> {
  const previous = pending.get(path)
  const result = (previous ?? Promise.resolve()).then(save)
  const settled = result.then(() => {}, () => {})
  pending.set(path, settled)
  void settled.then(() => { if (pending.get(path) === settled) pending.delete(path) })
  return result
}

export async function waitForTextSave(path: string): Promise<void> {
  while (pending.has(path)) await pending.get(path)
}
