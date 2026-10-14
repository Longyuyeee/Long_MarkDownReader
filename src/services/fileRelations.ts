import { clearLibraryRelationCache } from './relationContextCache'
export interface FileRelation { id: string; sourcePath: string; targetPath: string; relationType: string; note: string }
export const fileRelationTypes = [
  { value: 'related', label: '相关资料', description: '两份资料讨论同一件事，便于一起查看', directed: false },
  { value: 'links-to', label: '引用', description: '当前文件引用或指向另一份资料', directed: true },
  { value: 'cites', label: '参考依据', description: '另一份资料为当前文件提供依据', directed: true },
  { value: 'depends-on', label: '依赖', description: '当前文件的工作依赖另一份资料', directed: true },
  { value: 'derived-from', label: '整理自', description: '当前文件由另一份资料整理、改写而来', directed: true },
  { value: 'supports', label: '支持', description: '当前文件支持另一份资料的结论', directed: true },
  { value: 'parent', label: '父级', description: '当前文件是另一份资料的上层主题', directed: true },
  { value: 'child', label: '子级', description: '当前文件是另一份资料的下层主题', directed: true },
  { value: 'contains', label: '包含', description: '当前文件包含另一份资料的内容', directed: true },
]
export const requestFileRelation = (sourcePath?: string) => window.dispatchEvent(new CustomEvent('longedit:add-file-relation', { detail: { sourcePath } }))
export const announceFileRelationsChanged = (libraryRoot: string) => {
  clearLibraryRelationCache(libraryRoot)
  window.dispatchEvent(new CustomEvent('longedit:file-relations-changed', { detail: { libraryRoot } }))
}
export const onFileRelationsChanged = (listener: (root: string) => void) => {
  const handle = (event: Event) => listener((event as CustomEvent<{ libraryRoot: string }>).detail.libraryRoot)
  window.addEventListener('longedit:file-relations-changed', handle)
  return () => window.removeEventListener('longedit:file-relations-changed', handle)
}
