// Window-local, deliberately outside component scope. Route recreation must not
// create another writer while the previous instance still owns a save receipt.
// Paths are the store's document paths; native path leases remain authoritative.
const owners = new Map<string, symbol>()

export function tryAcquireMainTextSave(path: string): (() => void) | undefined {
  if (owners.has(path)) return undefined
  const owner = Symbol('main text save')
  owners.set(path, owner)
  return () => {
    if (owners.get(path) === owner) owners.delete(path)
  }
}
