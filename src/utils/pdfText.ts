import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

export interface PdfTextSegment { index: number; start: number; end: number; text: string }
export interface PdfPageText { text: string; segments: PdfTextSegment[] }
export interface PdfSearchMatch { id: string; page: number; start: number; end: number }

const isTextItem = (item: TextContent['items'][number]): item is TextItem => 'str' in item

export const buildPdfPageText = (content: TextContent): PdfPageText => {
  const segments: PdfTextSegment[] = []
  let text = ''
  for (const item of content.items) {
    if (!isTextItem(item)) continue
    if (text) text += ' '
    const start = text.length
    text += item.str
    segments.push({ index: segments.length, start, end: text.length, text: item.str })
  }
  return { text, segments }
}

export const findPdfPageMatches = (page: number, pageText: string, query: string): PdfSearchMatch[] => {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const haystack = pageText.toLocaleLowerCase()
  const matches: PdfSearchMatch[] = []
  let offset = 0
  while (offset <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, offset)
    if (start < 0) break
    matches.push({ id: `${page}-${start}-${start + needle.length}`, page, start, end: start + needle.length })
    offset = start + Math.max(1, needle.length)
  }
  return matches
}
