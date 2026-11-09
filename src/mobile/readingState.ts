export interface ReadingPoint { block: number; fraction: number; progress: number; horizontal?:number }
export interface ReadingBookmark extends ReadingPoint { fingerprint: string; updated: number }
export const readingBookmarkKey = 'longedit-mobile-reading-v1'
const key=readingBookmarkKey
export const validReadingPoint = (value: unknown): value is ReadingPoint => {
  const point = value as ReadingPoint | null
  return !!point && Number.isInteger(point.block) && point.block >= 0 && point.block < 1000000 &&
    Number.isFinite(point.fraction) && point.fraction >= 0 && point.fraction <= 1 &&
    Number.isFinite(point.progress) && point.progress >= 0 && point.progress <= 1 && (point.horizontal===undefined||Number.isFinite(point.horizontal)&&point.horizontal>=0&&point.horizontal<=1)
}
export function readBookmark(id: string): ReadingBookmark | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')[id]
    if (!value || typeof value.fingerprint !== 'string' || !Number.isFinite(value.updated) || !validReadingPoint(value)) return null
    return value as ReadingBookmark
  } catch { return null }
}
export function saveBookmark(id: string, fingerprint: string, point: ReadingPoint) {
  if (!validReadingPoint(point)) return
  const data = JSON.parse(localStorage.getItem(key) || '{}')
  data[id] = { ...point, fingerprint, updated: Date.now() }
  const entries = Object.entries(data).sort((a, b) => Number((b[1] as ReadingBookmark).updated) - Number((a[1] as ReadingBookmark).updated)).slice(0, 100)
  localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)))
}

/** URL-decode once, then resolve inside the same granted library. */
export function relativeImagePath(documentPath: string, source: string): string | null {
  try {
    const raw = source.trim().split(/[?#]/)[0]
    const decoded = decodeURIComponent(raw)
    if (!decoded || /^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith('/') || /[\\\0]/.test(decoded)) return null
    const parts = documentPath.split('/').slice(0, -1)
    for (const part of decoded.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') { if (!parts.length) return null; parts.pop() }
      else parts.push(part)
    }
    const path = parts.join('/')
    return path.length <= 4096 && /\.(png|jpe?g|webp)$/i.test(path) ? path : null
  } catch { return null }
}
