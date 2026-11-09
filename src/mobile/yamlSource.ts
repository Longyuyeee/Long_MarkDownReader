import { isAlias, isCollection, isNode, isPair, parseAllDocuments } from 'yaml'

export const YAML_SOURCE_BUDGET = { characters: 256 * 1024, nodes: 40000, depth: 64, documents: 128, diagnostics: 20, milliseconds: 1800 } as const
export interface YamlDiagnostic { severity: 'error' | 'warning'; code: string; message: string; offset: number; line: number; column: number }
export interface YamlCheck { valid: boolean; complete: boolean; message: string; documents: number; diagnostics: YamlDiagnostic[]; truncated: boolean }

// Source offsets stay in UTF-16, matching CodeMirror. Columns count Unicode code points.
export function yamlPosition(source: string, offset: number) {
  const before = source.slice(0, offset), lines = before.split(/\r\n|\r|\n/)
  return { line: lines.length, column: Array.from(lines[lines.length - 1]!.replace(/^\uFEFF/, '')).length + 1 }
}
export function checkYamlSource(source: string): YamlCheck {
  const declined = (): YamlCheck => ({ valid: false, complete: false, message: '这份 YAML 超过检查预算，已停止；全文仍可阅读、查找、编辑和保存。', documents: 0, diagnostics: [], truncated: false })
  if (source.length > YAML_SOURCE_BUDGET.characters) return declined()
  const diagnostics: YamlDiagnostic[] = []
  let total = 0, nodes = 0
  const add = (severity: YamlDiagnostic['severity'], code: string, message: string, offset: number) => {
    total++
    // Keep the bounded list actionable when early warnings precede a later error.
    let replaceWarning = -1
    if (severity === 'error' && diagnostics.length >= YAML_SOURCE_BUDGET.diagnostics) {
      for (let index = diagnostics.length - 1; index >= 0; index--) {
        if (diagnostics[index]?.severity === 'warning') { replaceWarning = index; break }
      }
    }
    if (diagnostics.length >= YAML_SOURCE_BUDGET.diagnostics && replaceWarning < 0) return
    const diagnostic = { severity, code, message: message.slice(0, 300), offset, ...yamlPosition(source, offset) }
    if (replaceWarning >= 0) diagnostics[replaceWarning] = diagnostic
    else diagnostics.push(diagnostic)
  }
  try {
    // Never call toJS/toJSON/stringify: aliases are not expanded and source is never regenerated.
    const docs = parseAllDocuments(source, { strict: true, uniqueKeys: true, version: '1.2', intAsBigInt: true, prettyErrors: false, logLevel: 'silent' })
    if (docs.length > YAML_SOURCE_BUDGET.documents) return declined()
    let errors = false
    const collect = (list: { code: string; message: string; pos: [number, number] }[], severity: YamlDiagnostic['severity']) => {
      for (const value of list) { if (severity === 'error') errors = true; add(severity, value.code, value.message, value.pos[0]) }
    }
    if ('empty' in docs) { collect(docs.errors, 'error'); collect(docs.warnings, 'warning') }
    for (const doc of docs) {
      collect(doc.errors, 'error'); collect(doc.warnings, 'warning')
      const anchors = new Set<string>(), pending: { node: unknown; depth: number }[] = [{ node: doc.contents, depth: 0 }]
      while (pending.length) {
        const { node, depth } = pending.pop()!
        if (!node) continue
        if (++nodes > YAML_SOURCE_BUDGET.nodes || depth > YAML_SOURCE_BUDGET.depth) return declined()
        if (isPair(node)) { pending.push({ node: node.value, depth }, { node: node.key, depth }); continue }
        if (!isNode(node)) continue
        if (isAlias(node)) {
          if (!anchors.has(node.source)) { errors = true; add('error', 'UNRESOLVED_ALIAS', '这处别名引用的锚点尚未定义。', node.range?.[0] || 0) }
        } else {
          if (node.anchor) anchors.add(node.anchor)
          if (isCollection(node)) for (let i = node.items.length - 1; i >= 0; i--) pending.push({ node: node.items[i], depth: depth + 1 })
        }
      }
    }
    diagnostics.sort((a, b) => a.offset - b.offset)
    const message = errors ? 'YAML 检查发现问题，可定位后修改；仍可保存当前原文。' : total ? 'YAML 检查完成，有提示需要核对；自定义标签等含义由使用此配置的应用判断。' : `YAML 语法检查通过（${docs.length} 份文档）。配置是否可用仍由使用它的应用判断。`
    return { valid: !errors, complete: true, message, documents: docs.length, diagnostics, truncated: total > diagnostics.length }
  } catch {
    return { valid: false, complete: false, message: '暂时无法完成 YAML 检查，源文与草稿继续保留。', documents: 0, diagnostics: [], truncated: false }
  }
}
