export interface PortableChapterTarget { path: string; fragment: string; title: string }
const clean = (path: string) => path.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '')
const absolute = (path: string) => /^(?:[a-z]:\/|\/)/i.test(path)
const bounded = (value: string) => value.length > 0 && value.length <= 4096 && new TextEncoder().encode(value).length <= 4096
const relative = (path: string) => bounded(path) && /\.(md|markdown)$/i.test(path)
  && !/[\\:\u0000-\u001f\u007f-\u009f]/.test(path) && !path.split('/').some(part => !part || part === '.' || part === '..')
export const isPortableChapterLink = (href: string) => /^longedit:\/\/chapter(?:[/?#]|$)/i.test(href)
export function portableChapterUri(libraryRoot: string, documentPath: string, title: string, fragment: string): string {
  const root = clean(libraryRoot), document = clean(documentPath), prefix = root.replace(/\/+$/, '') + '/'
  const key = (path: string) => /^(?:[a-z]:|\/\/)/i.test(root) ? path.toLowerCase() : path
  const path = document.slice(prefix.length)
  if (!absolute(root) || !key(document).startsWith(key(prefix)) || !relative(path) || !bounded(title) || !bounded(fragment) || /[\u0000-\u001f\u007f-\u009f]/.test(title + fragment)) throw Error('标题或位置过长，或不属于当前资料库；可选择“复制本机章节链接”。')
  return `longedit://chapter?path=${encodeURIComponent(path)}&title=${encodeURIComponent(title)}#${encodeURIComponent(fragment)}`
}
export function parsePortableChapterLink(href: string, libraryRoot: string): PortableChapterTarget | null {
  if (!isPortableChapterLink(href) || href.length > 65536 || /%(?![\da-f]{2})/i.test(href)) return null
  try {
    decodeURIComponent(href)
    const uri = new URL(href), root = clean(libraryRoot), pairs = [...uri.searchParams], path = uri.searchParams.get('path') || '', title = uri.searchParams.get('title') || '', fragment = decodeURIComponent(uri.hash.slice(1))
    if (!absolute(root) || uri.protocol !== 'longedit:' || uri.hostname !== 'chapter' || uri.username || uri.password || uri.port || uri.pathname || pairs.length !== 2 || uri.searchParams.getAll('path').length !== 1 || uri.searchParams.getAll('title').length !== 1 || !relative(path) || !bounded(title) || !bounded(fragment) || /[\u0000-\u001f\u007f-\u009f]/.test(title + fragment)) return null
    return {path: root.replace(/\/+$/, '') + '/' + path, title, fragment}
  } catch { return null }
}
export function chapterHeadingTarget<T extends {slug: string; text: string}>(headings: readonly T[], fragment: string, title: string): T | undefined {
  return headings.find(item => item.slug === fragment && item.text === title)
}
