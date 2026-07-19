export type DiagramBackground = 'transparent' | 'theme' | 'white'

export interface PreparedDiagramSvg {
  content: string
  width: number
  height: number
}

const numericAttribute = (value: string | null) => {
  const parsed = Number.parseFloat(value || '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const backgroundColor = (background: DiagramBackground, dark: boolean) => {
  if (background === 'transparent') return ''
  if (background === 'white') return '#ffffff'
  return dark ? '#1f2028' : '#ffffff'
}

const sanitizeCssReferences = (value: string) => value
  .replace(/@import\s+[^;]+;/gi, '')
  .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (match, _quote, target: string) => target.startsWith('#') ? match : 'none')

export const prepareDiagramSvg = (
  source: string,
  options: { background: DiagramBackground; dark: boolean },
): PreparedDiagramSvg => {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (document.querySelector('parsererror')) throw new Error('SVG 预览无法解析，不能导出')
  const root = document.documentElement
  if (root.localName !== 'svg') throw new Error('当前预览不是有效 SVG')

  root.querySelectorAll('script,foreignObject,iframe,object,embed,audio,video,image').forEach(element => element.remove())
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (name.startsWith('on')) element.removeAttribute(attribute.name)
      if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#')) element.removeAttribute(attribute.name)
      if (value.toLowerCase().includes('url(')) element.setAttribute(attribute.name, sanitizeCssReferences(value))
    }
    if (element.localName === 'style' && element.textContent) element.textContent = sanitizeCssReferences(element.textContent)
  }

  const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  const validViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
  const width = Math.ceil(validViewBox ? viewBox[2] : numericAttribute(root.getAttribute('width')))
  const height = Math.ceil(validViewBox ? viewBox[3] : numericAttribute(root.getAttribute('height')))
  if (!width || !height || width > 16_384 || height > 16_384) throw new Error('图表尺寸无效或超过 16384 像素导出上限')
  if (!validViewBox) root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))

  const fill = backgroundColor(options.background, options.dark)
  if (fill) {
    const rectangle = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    const [x, y, boxWidth, boxHeight] = validViewBox ? viewBox : [0, 0, width, height]
    rectangle.setAttribute('data-longedit-export-background', 'true')
    rectangle.setAttribute('x', String(x))
    rectangle.setAttribute('y', String(y))
    rectangle.setAttribute('width', String(boxWidth))
    rectangle.setAttribute('height', String(boxHeight))
    rectangle.setAttribute('fill', fill)
    root.insertBefore(rectangle, root.firstChild)
  }

  return {
    content: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`,
    width,
    height,
  }
}

export const diagramSvgToPng = async (svg: PreparedDiagramSvg, scale: number) => {
  if (![1, 2, 3].includes(scale)) throw new Error('PNG 倍率必须为 1×、2× 或 3×')
  const width = Math.round(svg.width * scale)
  const height = Math.round(svg.height * scale)
  if (width > 8192 || height > 8192 || width * height > 32_000_000) {
    throw new Error(`所选倍率将生成 ${width}×${height} PNG，超过安全导出上限`)
  }
  const url = URL.createObjectURL(new Blob([svg.content], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建 PNG 画布')
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNG 编码失败')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}
