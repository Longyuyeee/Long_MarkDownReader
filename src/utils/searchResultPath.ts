export const searchResultPath = (path: string, libraryRoot: string): string => {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '')
  const normalized = normalize(path)
  const root = normalize(libraryRoot).replace(/\/+$/, '')
  const windows = /^[a-z]:\//i.test(root) || root.startsWith('//')
  const prefix = `${root}/`
  const inside = root && (windows
    ? normalized.toLowerCase().startsWith(prefix.toLowerCase())
    : normalized.startsWith(prefix))
  return inside ? normalized.slice(prefix.length) : normalized
}
