interface SearchMatch {
  path: string
  matchKind: string
  objectType: string
  page?: number
  annotationId?: string
  locatorKind?: string
  locatorObjectId?: string
  context: string
}

// Keep exact paths: case folding would merge different files on case-sensitive volumes.
export function searchMatchKey(result: SearchMatch): string {
  return JSON.stringify([result.path, result.objectType, result.matchKind, result.page,
    result.annotationId, result.locatorKind, result.locatorObjectId, result.context])
}

export function groupSearchResults<T extends SearchMatch>(results: readonly T[]) {
  const groups: Array<{ path: string; results: T[] }> = []
  const byPath = new Map<string, { path: string; results: T[] }>()
  const seen = new Set<string>()
  for (const result of results) {
    const key = searchMatchKey(result)
    if (seen.has(key)) continue
    seen.add(key)
    let group = byPath.get(result.path)
    if (!group) {
      group = { path: result.path, results: [] }
      byPath.set(result.path, group)
      groups.push(group)
    }
    group.results.push(result)
  }
  return groups
}
