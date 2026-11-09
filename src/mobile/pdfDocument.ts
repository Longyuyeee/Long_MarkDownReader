import type { Identity } from './storage'

export interface PdfSource extends Identity { base64: string; signature: string; bytes: number; modified: number }
export const pdfLimit = 20 * 1024 * 1024
export const pdfSupported = (name: string) => /\.pdf$/i.test(name)
export function pdfScrollFraction(top: number, height: number, visible: number) {
  if (![top,height,visible].every(Number.isFinite)) throw new Error('页面位置无效。')
  const maximum = height - visible
  return maximum > 0 ? Math.max(0, Math.min(1, top / maximum)) : 0
}
export function validatePdfBytes(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > pdfLimit) throw new Error('当前支持 20 MiB 以内的 PDF。')
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('这个文件没有可识别的 PDF 文件头，请重新选择。')
}
export function pdfPageNumber(value: string, count: number) {
  if (!/^[1-9]\d{0,5}$/.test(value.trim())) throw new Error('请输入有效页码。')
  const page = Number(value)
  if (page > count) throw new Error(`页码应在 1 到 ${count} 之间。`)
  return page
}
export function pdfCanvasSize(width: number, height: number, available: number, zoom: number, ratio: number) {
  if (![width,height,available,zoom,ratio].every(v => Number.isFinite(v) && v > 0)) throw new Error('这页 PDF 的尺寸无法显示。')
  const scale = Math.min(available / width, 2) * Math.min(3, Math.max(1, zoom))
  const cssWidth = width * scale, cssHeight = height * scale
  const dpr = Math.min(ratio, 2, 8192 / cssWidth, 8192 / cssHeight, Math.sqrt(4_000_000 / (cssWidth * cssHeight)))
  // CSS may still show an unusually large page; its backing surface is bounded.
  return { scale, dpr, width: Math.max(1, Math.floor(cssWidth * dpr)), height: Math.max(1, Math.floor(cssHeight * dpr)) }
}
export interface PdfPoint { fingerprint: string; page: number; fraction: number; horizontal?: number; mode?: 'single'|'continuous'; rotation?: 0|90|180|270; pageOffset?: number; pageInset?: number; zoom: number; updated: number }
export const pdfPointKey = 'longedit-mobile-pdf-reading-v1'
const key = pdfPointKey
export const validPdfPoint = (p: unknown): p is PdfPoint => {
  const v = p as PdfPoint | null
  return !!v && typeof v.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(v.fingerprint) && Number.isInteger(v.page) && v.page > 0 && v.page <= 1_000_000 && Number.isFinite(v.fraction) && v.fraction >= 0 && v.fraction <= 1 && (v.horizontal === undefined || (Number.isFinite(v.horizontal) && v.horizontal >= 0 && v.horizontal <= 1)) && Number.isFinite(v.zoom) && v.zoom >= 1 && v.zoom <= 3 && (v.rotation===undefined||v.rotation===0||v.rotation===90||v.rotation===180||v.rotation===270) && (v.mode===undefined||v.mode==='single'||v.mode==='continuous') && (v.pageOffset===undefined||(Number.isFinite(v.pageOffset)&&v.pageOffset>=0&&v.pageOffset<=1)) && (v.pageInset===undefined||(Number.isFinite(v.pageInset)&&Math.abs(v.pageInset)<=4096)) && Number.isFinite(v.updated)
}
export function readPdfPoint(id: string): PdfPoint | null {
  try { const v = JSON.parse(localStorage.getItem(key) || '{}')[id]; return validPdfPoint(v) ? v : null } catch { return null }
}
export function savePdfPoint(id: string, point: PdfPoint) {
  if (!validPdfPoint(point)) throw new Error('阅读位置无效，未覆盖此前记录。')
  const values = JSON.parse(localStorage.getItem(key) || '{}')
  if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error('阅读位置记录无法读取，原记录仍保留。')
  const entries = Object.entries(values).filter(([k]) => k !== id)
  entries.push([id, point])
  entries.sort((a,b) => Number((b[1] as PdfPoint)?.updated || 0) - Number((a[1] as PdfPoint)?.updated || 0))
  localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries.slice(0, 100))))
}

export interface PdfSearchResult { page: number; excerpt: string; count: number }
/** Sequential, cancellable extraction. Never claims pages beyond the checked prefix. */
export async function searchPdfPages(count: number, query: string, text: (page: number) => Promise<string>, cancelled: () => boolean, progress: (checked: number) => void) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle || needle.length > 120) throw new Error('查找词应为 1 到 120 个字符。')
  let checked = 0, matches = 0, characters = 0
  const results: PdfSearchResult[] = []
  for (let page = 1; page <= Math.min(count, 500); page++) {
    if (cancelled()) break
    const source = await text(page)
    if (cancelled()) break
    const lower = source.toLocaleLowerCase(), first = lower.indexOf(needle)
    let n = 0, at = 0
    while (n < 1000 && (at = lower.indexOf(needle, at)) !== -1) { n++; at += needle.length }
    if (n) { results.push({ page, count: n, excerpt: source.slice(Math.max(0,first - 30),first + needle.length + 80) }); matches += n }
    checked = page; characters += source.length; progress(checked)
    if (matches >= 1000 || characters >= 2 * 1024 * 1024) break
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return { results, checked, matches, partial: checked < count || matches >= 1000, cancelled: cancelled() }
}
