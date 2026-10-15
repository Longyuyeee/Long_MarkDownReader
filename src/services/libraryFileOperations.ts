import { ref } from 'vue'
import { fileStylePathKey } from '../utils/fileDisplayStyles'
export interface PathChange { oldPath: string; newPath: string }
export interface FileOperationResult { items: PathChange[]; errors: { path: string; message: string }[] }
export interface TrashEntry { id: string; originalPath: string; name: string; deletedAt: number; isDir: boolean }
export type FileOperation = 'move' | 'copy' | 'trash' | 'restore' | 'undo'
export const fileOperationBusy = ref(false)
export const libraryFileClipboard = ref<{ root: string; paths: string[]; operation: 'move' | 'copy' } | null>(null)
export const lastLibraryMove = ref<{ root: string; items: PathChange[] } | null>(null)
export const sameLibrary = (a: string, b: string) => fileStylePathKey(a) === fileStylePathKey(b)
export const fileParent = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
export const topLevelPaths = (paths: string[]) => [...new Set(paths)].filter(path => !paths.some(parent => !sameLibrary(path, parent) && fileStylePathKey(path).startsWith(fileStylePathKey(parent) + '/')))
