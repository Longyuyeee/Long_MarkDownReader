export interface ExcerptSource { path: string; title: string; page?: number; annotationId?: string }
const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')
export function sourceExcerpt(text: string, source: ExcerptSource, libraryRoot: string) {
  const root = normalize(libraryRoot), path = normalize(source.path)
  const insensitive = /^[a-z]:/i.test(root)
  if (!(insensitive ? path.toLowerCase().startsWith(root.toLowerCase() + '/') : path.startsWith(root + '/'))) throw new Error('来源不在当前知识库中')
  const relative = path.slice(root.length + 1)
  const params = new URLSearchParams({ path: relative })
  if (source.page) params.set('page', String(source.page))
  if (source.annotationId) params.set('annotation', source.annotationId)
  const label = (source.title + (source.page ? ` · 第 ${source.page} 页` : '')).replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')
  const quote = text.trim().split(/\r?\n/).map(line => `> ${line}`).join('\n')
  return `${quote}\n\n来源：[${label}](longedit://source?${params})\n`
}
export function parseSourceReference(href: string, libraryRoot: string) {
  try {
    const url = new URL(href)
    if (url.protocol !== 'longedit:' || url.hostname !== 'source') return null
    const relative = (url.searchParams.get('path') || '').replace(/\\/g, '/')
    if (!relative || relative.startsWith('/') || relative.includes(':') || relative.split('/').some(part => !part || part === '.' || part === '..')) return null
    const root = normalize(libraryRoot)
    if (!root) return null
    const page = url.searchParams.get('page') || undefined
    if (page && (!/^\d+$/.test(page) || Number(page) < 1)) return null
    const separator = libraryRoot.includes('\\') ? '\\' : '/'
    return { path: `${libraryRoot.replace(/[\\/]+$/, '')}${separator}${relative.replace(/\//g, separator)}`, page, annotation: url.searchParams.get('annotation') || undefined }
  } catch { return null }
}
