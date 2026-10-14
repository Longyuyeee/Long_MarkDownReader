export interface LinkFile { name: string; path: string; is_dir: boolean }
const normalized = (path: string) => path.replace(/^\\\\\?\\UNC\\/i, '//').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '')
const stem = (value: string) => value.replace(/\.md$/i, '')

export function noteLinkTargets(target: string, files: LinkFile[], root: string, source: string): LinkFile[] {
  const library = normalized(root), note = normalized(source), link = normalized(target.trim())
  const windows = /^[a-z]:\//i.test(library) || library.startsWith('//')
  const identity = (value: string) => windows ? value.toLowerCase() : value
  const equal = (a: string, b: string) => identity(a) === identity(b)
  const parent = note.slice(0, note.lastIndexOf('/'))
  const title = stem(link.split('/').pop() || '')
  const unique = new Map<string, LinkFile>()
  for (const file of files) {
    const path = normalized(file.path)
    if (!file.is_dir && /\.md$/i.test(path) && identity(path).startsWith(identity(library + '/')) && equal(stem(path.split('/').pop() || ''), title)) unique.set(identity(path), file)
  }
  const candidates = [...unique.values()]
  if (link.includes('/')) {
    const absolute = /^[a-z]:\//i.test(link) || link.startsWith('/')
    const expected = absolute ? [stem(link)] : [stem(`${library}/${link.replace(/^\.\//, '')}`), stem(`${parent}/${link.replace(/^\.\//, '')}`)]
    return candidates.filter(file => expected.some(path => equal(stem(normalized(file.path)), path)))
  }
  const nearby = candidates.filter(file => equal(normalized(file.path).slice(0, normalized(file.path).lastIndexOf('/')), parent))
  return nearby.length === 1 ? nearby : candidates
}
