// Window-local, deliberately outside component scope. Route recreation must not
// create another writer while the previous instance still owns a save receipt.
// Paths are the store's document paths; native path leases remain authoritative.
const owners = new Map<string, { token: symbol; settled: Promise<void> }>()

export function hasPendingMainTextSave(path: string): boolean {
  return owners.has(path)
}

export async function waitForMainTextSave(path: string): Promise<void> {
  while (owners.has(path)) await owners.get(path)!.settled
}

export function tryAcquireMainTextSave(path: string): (() => void) | undefined {
  if (owners.has(path)) return undefined
  const owner = Symbol('main text save')
  let resolve!: () => void
  const settled = new Promise<void>(done => { resolve = done })
  owners.set(path, { token: owner, settled })
  return () => {
    if (owners.get(path)?.token !== owner) return
    owners.delete(path)
    resolve()
  }
}
