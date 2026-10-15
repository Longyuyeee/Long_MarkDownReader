import { belongsToLibrary } from './workSessions'
import { sameWorkspacePath } from './savedCollections'

// A library root is not a rendered tree node. Neither are drive/UNC prefixes.
// Logical ancestry is separate from the real scan keys resolved below.
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

interface DirectoryNode<T> { key?: string | number; isLeaf?: boolean; children?: T[] }

// Resolve through directory entries instead of synthesizing node keys from a
// route. Windows routes and native scans can spell the same path differently.
export async function resolveLibraryTreeAncestors<T extends DirectoryNode<T>>(
  root: string, target: string, nodes: T[], loadChildren: (node: T) => Promise<unknown>,
  { directory = false, isCurrent = () => true }: { directory?: boolean; isCurrent?: () => boolean } = {},
): Promise<string[]> {
  const paths = libraryTreeAncestors(root, target)
  if (directory && belongsToLibrary(root, target)) paths.push(target)
  const keys: string[] = []
  let level = nodes
  for (const parent of paths) {
    if (!isCurrent()) return []
    const node = level.find(node => !node.isLeaf && typeof node.key === 'string' && sameWorkspacePath(node.key, parent))
    if (!node) break
    if (!Array.isArray(node.children)) await loadChildren(node)
    if (!isCurrent()) return []
    if (!Array.isArray(node.children)) break // Failed reads remain retryable, not empty.
    keys.push(node.key as string)
    level = node.children
  }
  return keys
}
