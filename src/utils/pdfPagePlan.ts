export type PdfPageRotation = 0 | 90 | 180 | 270

export interface PdfPagePlanEntry {
  id: string
  sourcePage: number
  rotation: PdfPageRotation
  removed: boolean
}

export interface PdfPagePlanSummary {
  rotated: number
  moved: number
  removed: number
  changed: number
}

export const createPdfPagePlan = (pageCount: number): PdfPagePlanEntry[] => Array.from(
  { length: Math.max(0, Math.floor(pageCount)) },
  (_, index) => ({
    id: `pdf-source-page-${index + 1}`,
    sourcePage: index + 1,
    rotation: 0,
    removed: false,
  }),
)

export const clonePdfPagePlan = (plan: PdfPagePlanEntry[]) => plan.map(entry => ({ ...entry }))

export const parsePdfPageRange = (value: string, pageCount: number): number[] => {
  const source = value.trim()
  const limit = Math.max(0, Math.floor(pageCount))
  if (!source) throw new Error('请输入要提取的页码范围')
  if (source.length > 512) throw new Error('页码范围表达式过长')
  if (limit < 2) throw new Error('PDF 至少需要两页才能提取页面')

  const pages: number[] = []
  const seen = new Set<number>()
  for (const rawSegment of source.split(',')) {
    const segment = rawSegment.trim()
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(segment)
    if (!match) throw new Error(`页码范围格式无效：${segment || '空项'}`)
    const start = Number(match[1])
    const end = Number(match[2] || match[1])
    if (start < 1 || end < 1 || start > limit || end > limit) {
      throw new Error(`页码必须在 1-${limit} 之间`)
    }
    if (start > end) throw new Error(`页码范围必须按升序填写：${segment}`)
    for (let page = start; page <= end; page += 1) {
      if (seen.has(page)) throw new Error(`页码重复：${page}`)
      seen.add(page)
      pages.push(page)
    }
  }
  if (pages.length === limit && pages.every((page, index) => page === index + 1)) {
    throw new Error('提取范围必须排除至少一页，完整复制请使用页面整理')
  }
  return pages
}

export const createPdfExtractionPlan = (
  pageCount: number,
  selectedPages: number[],
): PdfPagePlanEntry[] => {
  const original = createPdfPagePlan(pageCount)
  const byPage = new Map(original.map(entry => [entry.sourcePage, entry]))
  const selected = selectedPages.map(page => {
    const entry = byPage.get(page)
    if (!entry) throw new Error(`源第 ${page} 页不存在`)
    return { ...entry }
  })
  const selectedSet = new Set(selectedPages)
  return [
    ...selected,
    ...original.filter(entry => !selectedSet.has(entry.sourcePage)).map(entry => ({ ...entry, removed: true })),
  ]
}

export const rotatePdfPage = (
  plan: PdfPagePlanEntry[],
  id: string,
  delta: -90 | 90,
): PdfPagePlanEntry[] => plan.map(entry => entry.id === id
  ? { ...entry, rotation: ((entry.rotation + delta + 360) % 360) as PdfPageRotation }
  : { ...entry })

export const movePdfPage = (
  plan: PdfPagePlanEntry[],
  id: string,
  offset: -1 | 1,
): PdfPagePlanEntry[] => {
  const next = clonePdfPagePlan(plan)
  const index = next.findIndex(entry => entry.id === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export const setPdfPageRemoved = (
  plan: PdfPagePlanEntry[],
  id: string,
  removed: boolean,
): PdfPagePlanEntry[] => plan.map(entry => entry.id === id ? { ...entry, removed } : { ...entry })

export const summarizePdfPagePlan = (plan: PdfPagePlanEntry[]): PdfPagePlanSummary => {
  let rotated = 0
  let moved = 0
  let removed = 0
  plan.forEach((entry, index) => {
    if (entry.rotation !== 0) rotated += 1
    if (entry.sourcePage !== index + 1) moved += 1
    if (entry.removed) removed += 1
  })
  return { rotated, moved, removed, changed: rotated + moved + removed }
}
