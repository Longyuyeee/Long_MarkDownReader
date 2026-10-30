import { resolveLocalImagePath } from './localImagePath.ts'

export function localMarkdownLink(documentPath: string, href: string) {
  if (!href || (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) || href.startsWith('//')) return null
  const destination = href.split(/[?#]/, 1)[0]
  let fragment = href.includes('#') ? href.slice(href.indexOf('#') + 1) : ''
  try { fragment = decodeURIComponent(fragment) } catch { return { path: null, fragment: '' } }
  return { path: resolveLocalImagePath(documentPath, destination || documentPath), fragment }
}

export function markdownAnchorTarget(root: HTMLElement, fragment: string): HTMLElement | undefined {
  const wanted = fragment.replace(/^user-content-/, '')
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[id],[data-id],[data-block="0"]'))
  const exact = nodes.find(node => node.id === fragment || node.getAttribute('data-id') === fragment)
  if (exact) return exact
  const seen = new Map<string, number>()
  return nodes.find(node => {
    const text = node.textContent?.trim() || ''
    if (!/^H[1-6]$/.test(node.tagName) && !/^#{1,6}\s/.test(text)) return false
    const heading = text.replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '')
    const slug = heading.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-')
    const index = seen.get(slug) || 0; seen.set(slug, index + 1)
    return heading === wanted || (index ? `${slug}-${index}` : slug) === wanted
  })
}
