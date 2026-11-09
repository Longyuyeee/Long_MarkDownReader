import { DOMParser, type Node, type Element } from '@xmldom/xmldom'
import { parser } from '@lezer/xml'
import { XML_SOURCE_BUDGET } from './xmlBudget.ts'

export interface XmlCheck { valid: boolean; complete: boolean; message: string; offset?: number; line?: number; column?: number; elements?: number; attributes?: number }
export function xmlPosition(source: string, offset: number) {
  const lines = source.slice(0, offset).split(/\r\n|\r|\n/)
  return { line: lines.length, column: Array.from(lines[lines.length - 1]!.replace(/^\uFEFF/, '')).length + 1 }
}
const validCharacter = (cp: number) => cp === 9 || cp === 10 || cp === 13 || cp >= 0x20 && cp <= 0xd7ff || cp >= 0xe000 && cp <= 0xfffd || cp >= 0x10000 && cp <= 0x10ffff
class CheckStopped extends Error { readonly result: XmlCheck; constructor(result: XmlCheck) { super(result.message); this.result = result } }

/** Isolated source inspection: no browser DOM, serialization, execution or external resource loading. */
export function checkXmlSource(source: string): XmlCheck {
  const at = (message: string, offset: number, complete = true): XmlCheck => ({ valid: false, complete, message, offset, ...xmlPosition(source, offset) })
  const budget = (): XmlCheck => ({ valid: false, complete: false, message: '这份 XML 超过检查预算，已停止；全文仍可阅读、查找、编辑和保存。' })
  if (source.length > XML_SOURCE_BUDGET.characters) return budget()
  const bom = source.startsWith('\uFEFF') ? 1 : 0, text = source.slice(bom), starts = [bom]
  for (const match of source.matchAll(/\r\n|\r|\n/g)) starts.push(match.index! + match[0].length)
  const offsetAt = (line = 1, column = 1) => Math.min(source.length, (starts[Math.max(0, line - 1)] ?? bom) + Math.max(0, column - 1))
  let reported: XmlCheck | undefined
  try {
    for (let i = 0; i < source.length;) {
      const cp = source.codePointAt(i)!
      if (!validCharacter(cp)) return at('XML 1.0 不允许这个字符，请定位后核对；当前原文仍可保存。', i)
      i += cp > 0xffff ? 2 : 1
    }
    const declaration = /^<\?xml\s+([\s\S]*?)\?>/.exec(text)?.[1]
    if (declaration) {
      const version = /\bversion\s*=\s*(['"])(.*?)\1/.exec(declaration)?.[2]
      if (version && version !== '1.0') return at('本轮检查 XML 1.0；此版本请在源码中核对，全文与草稿继续保留。', bom, false)
      const encoding = /\bencoding\s*=\s*(['"])(.*?)\1/.exec(declaration)?.[2]
      if (encoding && !/^utf-8$/i.test(encoding)) return at('文件声明了其他编码；本机按 UTF-8 保存，请先在源码中核对声明。全文仍保留。', bom, false)
    }
    let tokens = 0, depth = 0
    const openingTags: { offset: number; attributes: number }[] = []
    parser.parse(text).iterate({
      enter(node) {
        if (++tokens > XML_SOURCE_BUDGET.nodes) throw new CheckStopped(budget())
        const offset = node.from + bom
        if (node.name === 'OpenTag' || node.name === 'SelfClosingTag') openingTags.push({ offset, attributes: 0 })
        if (node.name === 'Attribute') openingTags[openingTags.length - 1]!.attributes++
        if (node.name === 'Element' && ++depth > XML_SOURCE_BUDGET.depth) throw new CheckStopped(budget())
        if (node.name === 'DoctypeDecl') throw new CheckStopped(at('这份 XML 含有 DOCTYPE，本轮不解析 DTD 或自定义实体；请在源码中核对，仍可编辑和保存。', offset, false))
        if (node.type.isError || node.name === 'MissingCloseTag' || node.name === 'MismatchedCloseTag') throw new CheckStopped(at('XML 在这段源码附近有语法问题，请核对标签、引号和结束位置。', offset))
        if (node.name === 'CharacterReference') {
          const raw = text.slice(node.from, node.to), match = /^&#(x[\da-fA-F]+|\d+);$/.exec(raw)
          const cp = match ? match[1]!.startsWith('x') ? parseInt(match[1]!.slice(1), 16) : Number(match[1]) : -1
          if (!validCharacter(cp)) throw new CheckStopped(at('这处字符引用不是有效的 XML 1.0 字符，请核对后修改。', offset))
        }
      },
      leave(node) { if (node.name === 'Element') depth-- }
    })
    const document = new DOMParser({
      normalizeLineEndings: value => value.replace(/\r\n?/g, '\n'),
      onError(_level, message, context) {
        // Even parser recovery warnings stop the check; never report a repaired DOM as valid source.
        reported = at('XML 源码需核对：' + message.slice(0, 250), offsetAt(context.locator?.lineNumber, context.locator?.columnNumber))
        throw new Error('stop XML check')
      }
    }).parseFromString(text, 'application/xml')
    if (!document.documentElement) return at('XML 需要一个根元素；当前未完成的内容仍可保存。', source.length)
    const pending: Node[] = [document], XML = 'http://www.w3.org/XML/1998/namespace', XMLNS = 'http://www.w3.org/2000/xmlns/'
    let nodes = 0, elements = 0, attributes = 0
    while (pending.length) {
      const node = pending.pop()!
      if (++nodes > XML_SOURCE_BUDGET.nodes) return budget()
      if (node.nodeType === 1) {
        const element = node as Element, tag = openingTags[elements++], seen = new Set<string>()
        // NamedNodeMap may silently replace duplicate expanded names. Compare lexical counts too.
        if (!tag || tag.attributes !== element.attributes.length) return at('同一元素存在重复的命名空间属性，请核对源码。', tag?.offset ?? offsetAt(node.lineNumber, node.columnNumber))
        for (let i = 0; i < element.attributes.length; i++) {
          const attribute = element.attributes.item(i)!, key = `${attribute.namespaceURI || ''}\u0000${attribute.localName}`
          attributes++
          if (seen.has(key)) return at('同一元素存在重复的命名空间属性，请核对源码。', offsetAt(node.lineNumber, node.columnNumber))
          seen.add(key)
          if (attribute.namespaceURI === XMLNS) {
            const prefix = attribute.name === 'xmlns' ? '' : attribute.localName, uri = attribute.value
            if (prefix === 'xmlns' || uri === XMLNS || (prefix === 'xml' ? uri !== XML : uri === XML) || !!prefix && !uri) return at('这处命名空间声明不符合 XML 1.0 约束，请核对源码。', offsetAt(node.lineNumber, node.columnNumber))
          }
        }
      }
      for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child)
    }
    return { valid: true, complete: true, elements, attributes, message: `XML 源码检查通过（${elements} 个元素）；未验证 DTD / Schema。` }
  } catch (error) {
    if (reported) return reported
    if (error instanceof CheckStopped) return error.result
    return { valid: false, complete: false, message: '暂时无法完成 XML 检查，源文与草稿继续保留。' }
  }
}
