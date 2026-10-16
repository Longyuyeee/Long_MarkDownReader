import { ref } from 'vue'
import { fileStylePathKey } from '../utils/fileDisplayStyles'
export interface PathChange { oldPath: string; newPath: string }
export interface FileOperationError { path: string; message: string; disposition?: 'notExecuted' | 'needsReview'; recoveryId?: string }
export interface FileOperationResult { items: PathChange[]; errors: FileOperationError[] }
export interface TrashEntry { id: string; originalPath: string; name: string; deletedAt: number; isDir: boolean }
export type FileOperation = 'move' | 'copy' | 'trash' | 'restore' | 'undo' | 'rename'
export const fileOperationBusy = ref(false)
export const libraryFileClipboard = ref<{ root: string; paths: string[]; operation: 'move' | 'copy' } | null>(null)
export const lastLibraryMove = ref<{ root: string; items: PathChange[] } | null>(null)
export const sameLibrary = (a: string, b: string) => fileStylePathKey(a) === fileStylePathKey(b)
export const fileParent = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
export const topLevelPaths = (paths: string[]) => [...new Set(paths)].filter(path => !paths.some(parent => !sameLibrary(path, parent) && fileStylePathKey(path).startsWith(fileStylePathKey(parent) + '/')))
// No disposition (e.g. a lost IPC reply) is not proof that a move never ran.
export const isPathMutation = (operation: FileOperation) => operation === 'move' || operation === 'rename' || operation === 'undo'
export const canRetryFileError = (error: FileOperationError, operation: FileOperation) => !isPathMutation(operation) || error.disposition === 'notExecuted'
export const mergeFileErrors = (previous: FileOperationError[], next: FileOperationError[]) => {
  const result = [...previous]
  for (const error of next) {
    const index = result.findIndex(item => sameLibrary(item.path, error.path))
    if (index < 0) result.push(error)
    else result[index] = error
  }
  return result
}
