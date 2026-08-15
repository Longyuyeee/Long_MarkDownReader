import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PdfRasterizedRedactionPage, PdfRedactionOverlay } from '../types/pdfRedaction'

export const MAX_PDF_REDACTION_PAGES = 64
export const MAX_PDF_REDACTION_SOURCE_BYTES = 128 * 1024 * 1024
export const MAX_PDF_REDACTION_DIMENSION = 4096
export const MAX_PDF_REDACTION_TOTAL_PIXELS = 120_000_000
export const MAX_PDF_REDACTION_RECTS = 256
const TARGET_RENDER_SCALE = 2

const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')

export const digestPdfDocument = async (document: PDFDocumentProxy) => {
  const bytes = await document.getData()
  return toHex(await crypto.subtle.digest('SHA-256', bytes))
}

const canvasPng = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('浏览器未能编码脱敏页面 PNG')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('浏览器未能读取脱敏页面 PNG'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
  const marker = 'base64,'
  const offset = dataUrl.indexOf(marker)
  if (offset < 0) throw new Error('浏览器返回的脱敏页面 PNG 编码无效')
  return dataUrl.slice(offset + marker.length)
}

const validateRedactions = (redactions: PdfRedactionOverlay[]) => {
  if (!redactions.length) throw new Error('请至少框选一个需要永久移除的区域')
  if (redactions.length > MAX_PDF_REDACTION_RECTS) throw new Error(`永久脱敏区域不能超过 ${MAX_PDF_REDACTION_RECTS} 个`)
  for (const rect of redactions) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) {
      throw new Error(`第 ${rect.page} 页包含无效的脱敏区域`)
    }
  }
}

export const renderPdfRedactionPages = async (
  document: PDFDocumentProxy,
  redactions: PdfRedactionOverlay[],
  onProgress?: (page: number, total: number) => void,
): Promise<PdfRasterizedRedactionPage[]> => {
  validateRedactions(redactions)
  if (document.numPages < 1 || document.numPages > MAX_PDF_REDACTION_PAGES) {
    throw new Error(`永久脱敏只支持 1-${MAX_PDF_REDACTION_PAGES} 页的 PDF`)
  }

  const baseSizes: Array<{ width: number; height: number }> = []
  let basePixels = 0
  let maxWidth = 1
  let maxHeight = 1
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const width = Math.max(1, viewport.width)
    const height = Math.max(1, viewport.height)
    baseSizes.push({ width, height })
    basePixels += width * height
    maxWidth = Math.max(maxWidth, width)
    maxHeight = Math.max(maxHeight, height)
  }
  let renderScale = Math.min(
    TARGET_RENDER_SCALE,
    MAX_PDF_REDACTION_DIMENSION / maxWidth,
    MAX_PDF_REDACTION_DIMENSION / maxHeight,
    Math.sqrt((MAX_PDF_REDACTION_TOTAL_PIXELS * 0.98) / basePixels),
  )
  if (!Number.isFinite(renderScale) || renderScale <= 0) throw new Error('PDF 页面尺寸无法进入安全栅格预算')
  const totalPixels = () => baseSizes.reduce((sum, size) => sum + Math.ceil(size.width * renderScale) * Math.ceil(size.height * renderScale), 0)
  while (totalPixels() > MAX_PDF_REDACTION_TOTAL_PIXELS) renderScale *= 0.99

  const result: PdfRasterizedRedactionPage[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    onProgress?.(pageNumber, document.numPages)
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: renderScale })
    const width = Math.max(1, Math.ceil(viewport.width))
    const height = Math.max(1, Math.ceil(viewport.height))
    if (width > MAX_PDF_REDACTION_DIMENSION || height > MAX_PDF_REDACTION_DIMENSION) throw new Error(`第 ${pageNumber} 页超过安全栅格尺寸`)
    const canvas = window.document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
    if (!context) throw new Error(`第 ${pageNumber} 页无法创建不透明栅格画布`)
    context.save()
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.restore()
    await page.render({ canvas, canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise

    const pageRedactions = redactions.filter(rect => rect.page === pageNumber)
    for (const rect of pageRedactions) {
      const x0 = Math.ceil(rect.x * width)
      const y0 = Math.ceil(rect.y * height)
      const x1 = Math.floor((rect.x + rect.width) * width)
      const y1 = Math.floor((rect.y + rect.height) * height)
      if (x1 <= x0 || y1 <= y0 || x1 > width || y1 > height) throw new Error(`第 ${pageNumber} 页脱敏区域小于一个可验证像素`)
      context.save()
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      context.fillStyle = rect.color === 'white' ? '#ffffff' : '#000000'
      context.fillRect(x0, y0, x1 - x0, y1 - y0)
      context.restore()
    }
    result.push({
      page: pageNumber,
      pngBase64: await canvasPng(canvas),
      redactions: pageRedactions.map(({ x, y, width: rectWidth, height: rectHeight, color }) => ({ x, y, width: rectWidth, height: rectHeight, color })),
    })
    canvas.width = 1
    canvas.height = 1
  }
  return result
}
