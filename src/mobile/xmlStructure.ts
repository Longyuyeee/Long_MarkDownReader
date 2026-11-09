import { parser } from '@lezer/xml'
import { DOMParser, type Element } from '@xmldom/xmldom'
import { checkXmlSource } from './xmlSource.ts'
import { XML_STRUCTURE_BUDGET } from './xmlStructureBudget.ts'

export interface XmlAttribute { name: string; value: string; from: number; to: number; editable: boolean; reason?: string }
export interface XmlElement { id: number; parent: number | null; children: number[]; name: string; occurrence: number; from: number; to: number; line: number; column: number; attributes: XmlAttribute[]; preview: string; textPreview?:string }
export interface XmlStructure { elements?: XmlElement[]; message: string; offset?: number }
export interface XmlAttributePatch { source: string; from: number; to: number; text: string }
const validCharacter = (cp: number) => cp === 9 || cp === 10 || cp === 13 || cp >= 0x20 && cp <= 0xd7ff || cp >= 0xe000 && cp <= 0xfffd || cp >= 0x10000 && cp <= 0x10ffff

/** Lexical ranges and qualified names are matched to a separately validated, decoded DOM. Never serialize it. */
export function inspectXmlStructure(source: string): XmlStructure {
  const check = checkXmlSource(source)
  if (!check.valid || !check.complete) return { message: check.message, offset: check.offset }
  const declined = { message: '这份 XML 超过结构浏览预算，请使用源码查找；全文与草稿继续保留。' }
  if (check.elements! > XML_STRUCTURE_BUDGET.elements || check.attributes! > XML_STRUCTURE_BUDGET.attributes) return declined
  try {
    const bom = source.startsWith('\uFEFF') ? 1 : 0, text = source.slice(bom)
    const elements: XmlElement[] = [], stack: number[] = [], counts = new Map<number | null, Map<string, number>>()
    let position = bom, line = 1, column = 1
    // Element starts occur in source order. Advance once, including Unicode and original mixed line endings.
    const at = (offset: number) => {
      while (position < offset) {
        const cp = source.codePointAt(position)!
        if (cp === 13) { line++; column = 1; position += source[position + 1] === '\n' ? 2 : 1 }
        else if (cp === 10) { line++; column = 1; position++ }
        else { column++; position += cp > 0xffff ? 2 : 1 }
      }
      return { line, column }
    }
    parser.parse(text).iterate({
      enter(node) {
        if (node.name === 'Element') {
          const opening = node.node.getChild('OpenTag') || node.node.getChild('SelfClosingTag'), tag = opening?.getChild('TagName')
          if (!tag) throw new Error('missing opening')
          const name = text.slice(tag.from, tag.to), parent = stack[stack.length - 1] ?? null, id = elements.length
          const siblings = counts.get(parent) || new Map<string, number>(), occurrence = (siblings.get(name) || 0) + 1
          siblings.set(name, occurrence); counts.set(parent, siblings)
          elements.push({ id, parent, name, occurrence, children: [], from: node.from + bom, to: node.to + bom, ...at(node.from + bom), attributes: [], preview: '' })
          if (parent !== null) elements[parent]!.children.push(id)
          stack.push(id)
        } else if (node.name === 'Attribute') {
          const name = node.node.getChild('AttributeName'), value = node.node.getChild('AttributeValue')
          if (!name || !value) throw new Error('missing attribute')
          const from = value.from + bom + 1, to = value.to + bom - 1, quote = source[from - 1]
          if ((quote !== '"' && quote !== "'") || source[to] !== quote || from > to) throw new Error('unproven range')
          elements[stack[stack.length - 1]!]!.attributes.push({ name: text.slice(name.from, name.to), from, to, value: '', editable: false })
        }
      },
      leave(node) { if (node.name === 'Element') stack.pop() }
    })
    if (elements.some(e => e.attributes.length > XML_STRUCTURE_BUDGET.attributesPerElement)) return declined
    const document = new DOMParser({ normalizeLineEndings: value => value.replace(/\r\n?/g, '\n'), onError() { throw new Error('XML parse changed') } }).parseFromString(text, 'application/xml')
    const pending: Element[] = [document.documentElement!]; let index = 0
    while (pending.length) {
      const dom = pending.pop()!, element = elements[index++]
      if (!element || element.name !== dom.tagName || element.attributes.length !== dom.attributes.length) throw new Error('unaligned element')
      element.attributes.forEach((attribute, i) => {
        const decoded = dom.attributes.item(i)!
        if (decoded.name !== attribute.name) throw new Error('unaligned attribute')
        attribute.value = decoded.value
        attribute.reason = attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:') ? '命名空间声明请在源码中修改。' : attribute.value.length > XML_STRUCTURE_BUDGET.valueCharacters ? '这个属性值较长，请在源码中修改。' : undefined
        attribute.editable = !attribute.reason
      })
      element.preview = element.attributes.filter(a => a.name !== 'xmlns' && !a.name.startsWith('xmlns:')).slice(0, 3).map(a => `${a.name}=${a.value.slice(0, 60)}`).join(' · ')
      const children: Element[] = []
      for (let child = dom.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) children.push(child as Element)
      if (children.length !== element.children.length) throw new Error('unaligned children')
      if(!children.length)element.textPreview=Array.from((dom.textContent||'').slice(0,322)).slice(0,160).join('')
      for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]!)
    }
    if (index !== elements.length) throw new Error('unaligned document')
    return { elements, message: `${elements.length} 个元素。可定位元素和属性；文字、注释与 CDATA 请在源码中修改。` }
  } catch { return { message: '无法确认这份 XML 的属性位置，请使用源码；全文与草稿继续保留。' } }
}

export function prepareXmlAttribute(source: string, id: number, attributeIndex: number, input: string): XmlStructure & { patch?: XmlAttributePatch; error?: string } {
  const original = inspectXmlStructure(source), selected = original.elements?.[id], attribute = selected?.attributes[attributeIndex]
  const fail = (error: string) => ({ message: error, error })
  if (!Number.isInteger(id) || !Number.isInteger(attributeIndex) || !attribute) return fail('属性位置已过期，请重新浏览结构。')
  if (!attribute.editable) return fail(attribute.reason || '这个属性请在源码中修改。')
  if (typeof input !== 'string' || input.length > XML_STRUCTURE_BUDGET.valueCharacters) return fail('属性值超过编辑上限，请缩短输入；当前草稿未变。')
  for (const character of input) if (!validCharacter(character.codePointAt(0)!)) return fail('属性值含 XML 1.0 不支持的字符，请删除后重试；当前草稿未变。')
  const quote = source[attribute.from - 1]
  // No change must retain the literal entities and normalized whitespace exactly as written.
  const text = input === attribute.value ? source.slice(attribute.from, attribute.to) : Array.from(input, character => {
    if (character === '&') return '&amp;'
    if (character === '<') return '&lt;'
    if (character === '>') return '&gt;'
    if (character === quote) return quote === '"' ? '&quot;' : '&apos;'
    const cp = character.codePointAt(0)!
    if (cp === 9 || cp === 10 || cp === 13 || cp >= 0x7f && cp <= 0x9f || cp === 0x2028) return `&#x${cp.toString(16).toUpperCase()};`
    return character
  }).join('')
  const candidate = source.slice(0, attribute.from) + text + source.slice(attribute.to), checked = inspectXmlStructure(candidate)
  const changed = checked.elements?.[id]?.attributes[attributeIndex]
  if (!checked.elements || checked.elements.length !== original.elements!.length || !changed?.editable || changed.from !== attribute.from || changed.to !== attribute.from + text.length || changed.value !== input) return fail('无法完整保留这个属性值，请在源码中修改；当前草稿未变。')
  for (let i = 0; i < original.elements!.length; i++) {
    const before = original.elements![i]!, after = checked.elements[i]!
    if (before.name !== after.name || before.parent !== after.parent || before.attributes.length !== after.attributes.length || before.children.join(',') !== after.children.join(',')) return fail('元素结构已有变化，请重新浏览；当前草稿未变。')
    for (let a = 0; a < before.attributes.length; a++) if (before.attributes[a]!.name !== after.attributes[a]!.name || (i !== id || a !== attributeIndex) && before.attributes[a]!.value !== after.attributes[a]!.value) return fail('其他属性无法保持原值，请使用源码；当前草稿未变。')
  }
  return { message: '修改已准备好，请核对后应用。', patch: { source, from: attribute.from, to: attribute.to, text } }
}
