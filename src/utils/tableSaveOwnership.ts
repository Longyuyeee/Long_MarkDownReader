// Window-local ownership survives TableView destruction. This is coordination,
// not a replacement for the native signature checks and filesystem leases.
const owners = new Map<string, { token: symbol; settled: Promise<void> }>()

export const tableSaveKey = (root: string, path: string, external: boolean) =>
  JSON.stringify([external ? '' : root, path, external])

export const hasPendingTableSave = (key: string) => owners.has(key)

export async function waitForTableSave(key: string): Promise<void> {
  while (owners.has(key)) await owners.get(key)!.settled
}

export function tryAcquireTableSave(key: string): (() => void) | undefined {
  if (owners.has(key)) return undefined
  const token = Symbol('table save')
  let resolve!: () => void
  const settled = new Promise<void>(done => { resolve = done })
  owners.set(key, { token, settled })
  return () => {
    if (owners.get(key)?.token !== token) return
    owners.delete(key)
    resolve()
  }
}
