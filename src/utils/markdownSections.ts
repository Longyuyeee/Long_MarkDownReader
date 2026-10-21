import { Lexer, Tokenizer, type Tokens, type Token } from 'marked'
import { portableChapterUri } from './portableChapterLinks.ts'

export type SectionAction = 'up' | 'down' | 'promote' | 'demote'
export interface MarkdownSection {
  id: string; start: number; headingEnd: number; end: number; line: number
  level: number; text: string; slug: string; syntax: 'atx' | 'setext'
}
export interface SectionDocument { content: string; sections: MarkdownSection[]; reason: string }
export interface SectionChange { content: string; start: number; title: string; destination: string; headings: number }

export function headingSlug(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-')
}
export function markdownChapterLink(documentPath: string, text: string, slug: string, libraryRoot?: string) {
  if (libraryRoot) return `[${text.replace(/([\\\[\]])/g, '\\$1')}](<${portableChapterUri(libraryRoot, documentPath, text, slug)}>)`
  const local = documentPath.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '')
  const destination = encodeURI(local).replace(/[()#?]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase()).replace(/^\/\//, '%2F%2F')
  return `[${text.replace(/([\\\[\]])/g, '\\$1')}](<${destination}#${encodeURIComponent(slug)}>)`
}
function plain(tokens: Token[]): string {
  return tokens.map(token => {
    if ('tokens' in token && token.tokens) return plain(token.tokens)
    if (token.type === 'br') return ' '
    return 'text' in token ? String(token.text).replace(/<[^>]*>/g, '') : ''
  }).join('').replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi, (_, code, name) => {
    if (code) { const n = parseInt(code[0].toLowerCase() === 'x' ? code.slice(1) : code, code[0].toLowerCase() === 'x' ? 16 : 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '' }
    return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[name.toLowerCase()]
  }).replace(/\s+/g, ' ').trim()
}

// Capture positions while the block lexer consumes the original top-level
// source. Searching for token.raw would select the wrong occurrence when a
// definition, fence or HTML block contains identical heading text.
export function markdownSections(content: string): SectionDocument {
  const result: SectionDocument = { content, sections: [], reason: '' }
  if (content.length > 2 * 1024 * 1024) return {...result, reason:'正文较大，仍可阅读；章节整理支持 2 MiB 以内的正文。'}
  const normalized = content.replace(/\r\n?/g,'\n'), offsets = content.includes('\r') ? new Uint32Array(normalized.length + 1) : null
  if(offsets){let cursor=0;for(let i=0;i<content.length;i++){offsets[cursor++]=i;if(content[i]==='\r'&&content[i+1]==='\n')i++}offsets[cursor]=content.length}
  const originalOffset=(offset:number)=>offsets?offsets[offset]:offset
  const front = normalized.match(/^(?:\uFEFF)?(---|\+\+\+)\n[\s\S]*?\n(?:\1|\.\.\.)[ \t]*(?:\n|$)/)
  const source = front ? front[0].replace(/[^\n]/g, ' ') + normalized.slice(front[0].length) : normalized
  const tokenizer = new Tokenizer(), lexer = new Lexer({gfm:true, tokenizer})
  let nesting = 0
  const block = lexer.blockTokens.bind(lexer)
  lexer.blockTokens = ((...args: any[]) => { nesting++; try { return Reflect.apply(block, lexer, args) } finally { nesting-- } }) as typeof lexer.blockTokens
  const located: {token: Tokens.Heading; offset: number}[] = []
  for (const method of ['heading','lheading'] as const) {
    const original = tokenizer[method].bind(tokenizer)
    tokenizer[method] = (rest: string) => {
      const token = original(rest)
      if (token && nesting === 1) located.push({token, offset:source.length - rest.length})
      return token
    }
  }
  try { lexer.lex(source) } catch { return {...result, reason:'这篇文档的章节暂时无法准确解析，正文仍可继续编辑。'} }
  if (located.length > 4000) return {...result, reason:'标题较多，章节整理暂时不可用；正文仍可继续编辑。'}
  const slugs = new Set<string>()
  let lineCursor = 0, line = 1
  for (const {token, offset} of located) {
    while (lineCursor < offset) if (source[lineCursor++] === '\n') line++
    const text = plain(token.tokens), base = headingSlug(text) || 'section'
    let slug = base, suffix = 0
    while (slugs.has(slug)) slug = `${base}-${++suffix}`
    slugs.add(slug)
    const syntax = /^ {0,3}#{1,6}(?:\s|$)/.test(token.raw) ? 'atx' : 'setext'
    const header = token.raw.replace(/\n+$/, '')
    const headingLength = syntax === 'atx' ? (token.raw.indexOf('\n') < 0 ? token.raw.length : token.raw.indexOf('\n')) : header.length
    result.sections.push({id:`section-${offset}`,start:originalOffset(offset),headingEnd:originalOffset(offset + headingLength),end:content.length,line,level:token.depth,text:text || '未命名标题',slug,syntax})
  }
  const stack: MarkdownSection[] = []
  for (const section of result.sections) { while (stack.length && stack[stack.length - 1].level >= section.level) stack.pop()!.end = section.start; stack.push(section) }
  return result
}

export function sectionNeighbor(model: SectionDocument, section: MarkdownSection, direction: 'up'|'down') {
  const index = model.sections.indexOf(section)
  if (index < 0) return undefined
  if (direction === 'down') { const next = model.sections.find(item => item.start === section.end); return next?.level === section.level ? next : undefined }
  for (let i = index - 1; i >= 0; i--) { const previous = model.sections[i]; if(previous.level < section.level) return; if(previous.level === section.level) return previous }
}

export function changeMarkdownSection(model: SectionDocument, id: string, action: SectionAction): SectionChange {
  if (model.reason) throw Error(model.reason)
  const section = model.sections.find(item => item.id === id)
  if (!section) throw Error('章节已变化，请重新选择标题。')
  const content = model.content, children = model.sections.filter(item => item.start >= section.start && item.start < section.end)
  if (action === 'up' || action === 'down') {
    const other = sectionNeighbor(model, section, action)
    if (!other) throw Error(action === 'up' ? '已经是本级的第一个章节。' : '已经是本级的最后一个章节。')
    const first = action === 'up' ? other : section, second = action === 'up' ? section : other
    let a = content.slice(first.start, second.start), b = content.slice(second.start, second.end)
    // Never concatenate an EOF heading with the preceding section's last line.
    // A newly needed separator is part of this single undoable change.
    const newline = content.includes('\r\n') ? '\r\n' : '\n'
    if (!b.endsWith('\n') && !b.endsWith('\r')) b += newline
    const moved = content.slice(0,first.start) + b + a + content.slice(second.end)
    return {content:moved,start:action === 'up' ? first.start : first.start + b.length,title:section.text,destination:other.text,headings:children.length}
  }
  const delta = action === 'promote' ? -1 : 1
  if (children.some(item => item.level + delta < 1 || item.level + delta > 6)) throw Error('本章节及子标题需要保持在 H1 到 H6 之间。')
  let changed = content
  for (const heading of [...children].reverse()) {
    const raw = content.slice(heading.start,heading.headingEnd), level = heading.level + delta
    let replacement: string
    if (heading.syntax === 'atx') replacement = raw.replace(/^( {0,3})#{1,6}/, '$1' + '#'.repeat(level))
    else {
      const lines = raw.split(/\r\n|\r|\n/)
      if (level < 3) replacement = raw.replace(/(\r\n|\r|\n)( {0,3})[=-]+([ \t]*)$/, (_,nl,space,tail) => nl + space + (level === 1 ? '=' : '-').repeat(3) + tail)
      else { if(lines.length !== 2) throw Error('多行下划线标题暂不调整层级，仍可移动整个章节。'); replacement = '#'.repeat(level) + ' ' + lines[0].trim() }
    }
    changed = changed.slice(0,heading.start) + replacement + changed.slice(heading.headingEnd)
  }
  return {content:changed,start:section.start,title:section.text,destination:`H${section.level + delta}`,headings:children.length}
}
