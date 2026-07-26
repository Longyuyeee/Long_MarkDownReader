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
