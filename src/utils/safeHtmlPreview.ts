const BLOCKED_ELEMENTS = new Set([
  'script', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'portal',
  'base', 'link', 'meta', 'foreignobject',
])
const URL_ATTRIBUTES = new Set([
  'src', 'srcset', 'href', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'cite',
])
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i
const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

const sanitizeElement = (element: Element) => {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLocaleLowerCase()
    const value = attribute.value.trim()
    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name)
      continue
    }
    if (URL_ATTRIBUTES.has(name)) {
      const keepDataImage = name === 'src' && element.tagName === 'IMG' && SAFE_DATA_IMAGE.test(value)
      const keepFragment = name === 'href' && value.startsWith('#')
      if (!keepDataImage && !keepFragment) element.removeAttribute(attribute.name)
    }
    if (name === 'style' && /(?:url\s*\(|@import|expression\s*\()/i.test(value)) {
      element.removeAttribute(attribute.name)
    }
    if (name === 'target' || name === 'download') element.removeAttribute(attribute.name)
  }
}

export const createSafeHtmlPreview = (source: string) => {
  const document = new DOMParser().parseFromString(source, 'text/html')
  document.querySelectorAll('*').forEach(element => {
    if (BLOCKED_ELEMENTS.has(element.localName.toLocaleLowerCase())) element.remove()
    else sanitizeElement(element)
  })

  const csp = document.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', PREVIEW_CSP)
  document.head.prepend(csp)

  const previewStyle = document.createElement('style')
  previewStyle.textContent = `
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; }
    html, body { min-height: 100%; margin: 0; background: #fff; color: #1f2937; }
    body { box-sizing: border-box; padding: 20px; }
    img { max-width: 100%; height: auto; }
    pre, code { font-family: "Fira Code", Consolas, monospace; }
  `
  document.head.append(previewStyle)
  return `<!doctype html>\n${document.documentElement.outerHTML}`
}
