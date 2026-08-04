import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Diagnostic } from '@codemirror/lint'

const MAX_COMPLETION_SCAN_CHARS = 512 * 1024
export const MAX_DIAGNOSTIC_SCAN_CHARS = 1024 * 1024
const MAX_DOCUMENT_COMPLETIONS = 120
const MAX_DIAGNOSTICS = 80

const COMMON_KEYWORDS = ['TODO', 'FIXME', 'true', 'false', 'null']
const KEYWORDS: Record<string, string[]> = {
  javascript: ['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'static', 'switch', 'this', 'throw', 'try', 'typeof', 'undefined', 'var', 'while', 'yield'],
  typescript: ['abstract', 'any', 'as', 'asserts', 'boolean', 'declare', 'enum', 'implements', 'infer', 'interface', 'keyof', 'namespace', 'never', 'number', 'private', 'protected', 'public', 'readonly', 'satisfies', 'string', 'type', 'unknown', 'void'],
  python: ['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield'],
  rust: ['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'],
  go: ['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var'],
  'jvm-code': ['abstract', 'break', 'case', 'catch', 'class', 'continue', 'data', 'default', 'else', 'enum', 'extends', 'final', 'finally', 'for', 'fun', 'if', 'implements', 'import', 'interface', 'new', 'null', 'object', 'override', 'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'try', 'val', 'var', 'when', 'while'],
  'c-family': ['auto', 'bool', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'extern', 'false', 'float', 'for', 'if', 'inline', 'int', 'namespace', 'new', 'nullptr', 'private', 'protected', 'public', 'return', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'using', 'virtual', 'void', 'while'],
  shell: ['case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'function', 'if', 'in', 'then', 'until', 'while'],
  sql: ['ALTER', 'AND', 'AS', 'ASC', 'BEGIN', 'BETWEEN', 'BY', 'CASE', 'CREATE', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'END', 'EXISTS', 'FROM', 'GROUP', 'HAVING', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTO', 'IS', 'JOIN', 'LEFT', 'LIKE', 'LIMIT', 'NOT', 'NULL', 'ON', 'OR', 'ORDER', 'OUTER', 'PRIMARY', 'RIGHT', 'SELECT', 'SET', 'TABLE', 'THEN', 'UNION', 'UNIQUE', 'UPDATE', 'VALUES', 'WHEN', 'WHERE', 'WITH'],
  'web-source': ['align-items', 'background', 'border', 'color', 'display', 'flex', 'font-family', 'font-size', 'gap', 'grid', 'height', 'justify-content', 'margin', 'max-width', 'min-height', 'overflow', 'padding', 'position', 'transform', 'transition', 'width'],
}

const HTML_TAGS = ['a', 'article', 'aside', 'blockquote', 'body', 'button', 'canvas', 'code', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'html', 'img', 'input', 'label', 'li', 'main', 'nav', 'ol', 'option', 'p', 'picture', 'pre', 'section', 'select', 'small', 'span', 'strong', 'style', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul']

const documentWords = (source: string, prefix: string) => {
  const values = new Set<string>()
  const pattern = /[A-Za-z_$][\w$-]{2,}/g
  for (const match of source.matchAll(pattern)) {
    const value = match[0]
    if (value !== prefix && value.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) values.add(value)
    if (values.size >= MAX_DOCUMENT_COMPLETIONS) break
  }
  return [...values]
}

export const codeCompletionSource = (formatId: string, isHtml: boolean) => (
  context: CompletionContext,
): CompletionResult | null => {
  const token = context.matchBefore(/[\w$-]*/)
  if (!token || (token.from === token.to && !context.explicit)) return null
  const prefix = token.text
  const before = context.state.sliceDoc(Math.max(0, token.from - 2), token.from)
  const tagContext = isHtml && /<\/?$/.test(before)
  const languageKeywords = formatId === 'typescript'
    ? [...KEYWORDS.javascript, ...KEYWORDS.typescript]
    : (KEYWORDS[formatId] || [])
  const staticValues = tagContext
    ? HTML_TAGS
    : [...COMMON_KEYWORDS, ...languageKeywords]
  const options: Completion[] = [
    ...staticValues.map(label => ({ label, type: tagContext ? 'type' : 'keyword' })),
    ...documentWords(
      context.state.sliceDoc(0, Math.min(context.state.doc.length, MAX_COMPLETION_SCAN_CHARS)),
      prefix,
    ).map(label => ({ label, type: 'variable' })),
  ]
  const deduplicated = [...new Map(options.map(option => [option.label, option])).values()]
  return { from: token.from, options: deduplicated, validFor: /^[\w$-]*$/ }
}

export const collectBasicSourceDiagnostics = (source: string, isHtml: boolean): Diagnostic[] => {
  const diagnostics: Diagnostic[] = []
  const boundedSource = source.slice(0, MAX_DIAGNOSTIC_SCAN_CHARS)
  let offset = 0
  for (const line of boundedSource.split('\n')) {
    const trailing = line.match(/[\t ]+$/)
    if (trailing && diagnostics.length < MAX_DIAGNOSTICS) {
      diagnostics.push({
        from: offset + line.length - trailing[0].length,
        to: offset + line.length,
        severity: 'info',
        message: '行尾包含多余空白',
      })
    }
    if (line.length > 200 && diagnostics.length < MAX_DIAGNOSTICS) {
      diagnostics.push({
        from: offset + 200,
        to: offset + line.length,
        severity: 'info',
        message: '该行超过 200 个字符，可能影响阅读',
      })
    }
    offset += line.length + 1
    if (diagnostics.length >= MAX_DIAGNOSTICS) break
  }
  if (!isHtml) return diagnostics

  for (const pattern of [
    { regex: /<\s*(?:script|iframe|frame|frameset|object|embed|portal|base|link)\b/gi, message: '安全预览会移除此元素' },
    { regex: /\son[a-z]+\s*=/gi, message: '安全预览会移除内联事件处理器' },
    { regex: /\s(?:src|srcset|href|action|formaction|poster)\s*=\s*["']?(?:https?:|\/\/)/gi, message: '安全预览不会请求外部资源' },
  ]) {
    for (const match of boundedSource.matchAll(pattern.regex)) {
      if (match.index === undefined || diagnostics.length >= MAX_DIAGNOSTICS) break
      diagnostics.push({ from: match.index, to: match.index + match[0].length, severity: 'warning', message: pattern.message })
    }
  }
  return diagnostics
}
