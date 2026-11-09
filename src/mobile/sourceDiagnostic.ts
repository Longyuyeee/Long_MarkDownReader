export interface SourceDiagnosticLine { number: number; text: string; current: boolean }

/** A bounded display excerpt; offsets always refer to the untouched source. */
export function sourceDiagnosticLines(source: string, offset: number, characterBudget: number, fillWindow = false): SourceDiagnosticLine[] {
  if (source.length > characterBudget || !Number.isInteger(offset) || offset < 0 || offset > source.length) return []
  const bom = source.startsWith('\uFEFF') ? 1 : 0, text = source.slice(bom), at = Math.max(0, offset - bom)
  const prefix = text.slice(0, at).split(/\r\n|\r|\n/), current = prefix.length - 1, column = Array.from(prefix[prefix.length - 1]!).length
  const lines = text.split(/\r\n|\r|\n/)
  const start = fillWindow ? Math.max(0, Math.min(current - 1, lines.length - 3)) : Math.max(0, current - 1), end = fillWindow ? Math.min(lines.length, start + 3) : Math.min(lines.length, current + 2)
  return lines.slice(start, end).map((line, index) => {
    const number = start + index, points = Array.from(line), from = number === current ? Math.max(0, column - 80) : 0, to = Math.min(points.length, from + 160)
    return { number: number + 1, current: number === current, text: (from ? '…' : '') + points.slice(from, to).join('') + (to < points.length ? '…' : '') }
  })
}
