import { isJsonScalar, type JsonField } from './jsonStructure.ts'
export const JSON_FIND_LIMIT = 200
export interface JsonFieldMatches { ids: number[]; total: number; truncated: boolean }
/** Literal, case-insensitive names and scalar values across every analyzed level. */
export function findJsonFields(source: string, fields: JsonField[], query: string): JsonFieldMatches {
  if (!query || query.length > 128) throw new Error('请输入 1 至 128 个字符的查找内容。')
  const needle = query.toLowerCase(), ids: number[] = []; let total = 0
  for (const field of fields) {
    const raw = isJsonScalar(field.kind) ? source.slice(field.from, field.to) : ''
    const decoded = field.kind === 'string' ? JSON.parse(raw) as string : raw
    if ((field.parent !== null && field.label.toLowerCase().includes(needle)) || raw.toLowerCase().includes(needle) || decoded.toLowerCase().includes(needle)) {
      total++; if (ids.length < JSON_FIND_LIMIT) ids.push(field.id)
    }
  }
  return { ids, total, truncated: total > ids.length }
}
