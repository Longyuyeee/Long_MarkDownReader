import { belongsToLibrary } from './workSessions'

// A library root is not a rendered tree node. Neither are drive/UNC prefixes.
// Preserve the file's spelling so real directory keys still match native scans.
export function libraryTreeAncestors(root: string, file: string): string[] {
  if (!belongsToLibrary(root, file)) return []
  const result: string[] = []
  let parent = file
  for (;;) {
    const separator = Math.max(parent.lastIndexOf('/'), parent.lastIndexOf('\\'))
    if (separator < 0) break
    parent = parent.slice(0, separator)
    if (!belongsToLibrary(root, parent)) break
    result.push(parent)
  }
  return result.reverse()
}
