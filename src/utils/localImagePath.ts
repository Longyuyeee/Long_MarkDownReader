/** Resolve the resource name before native reference and library checks. */
export function resolveLocalImagePath(documentPath: string, source: string): string | null {
  const clean = (path: string) => path.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '')
  let reference = clean(source)
  if (/^misty-img:/i.test(reference)) reference = reference.replace(/^misty-img:\/\/localhost/i, '').replace(/^misty-img:/i, '')
  else reference = reference.split(/[?#]/, 1)[0]
  try { reference = decodeURIComponent(reference) } catch { return null }
  if (!reference) return null
  reference = clean(reference)
  if (/^\/[a-z]:\//i.test(reference)) reference = reference.slice(1)
  if (/^[a-z][a-z\d+.-]*:/i.test(reference) && !/^[a-z]:\//i.test(reference)) return null
  const document = clean(documentPath), directory = document.slice(0, document.lastIndexOf('/') + 1)
  const path = /^(?:[a-z]:\/|\/)/i.test(reference) ? reference : directory + reference
  const prefix = path.match(/^[a-z]:\//i)?.[0] || path.match(/^\/\/[^/]+\/[^/]+\//)?.[0] || (path.startsWith('/') && !path.startsWith('//') ? '/' : '')
  if (!prefix) return null
  const parts: string[] = []
  for (const part of path.slice(prefix.length).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return null; parts.pop() }
    else parts.push(part)
  }
  return prefix + parts.join('/')
}
