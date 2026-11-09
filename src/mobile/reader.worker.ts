import { marked } from 'marked'
import { previewWithinBudget } from './documentBudget'
import {escapeCode,renderMarkdownCode} from './markdownCode'
import {renderSourceCode} from './codePresentation'
import type {CodeLanguage} from './codeFormats'

self.onmessage = (event: MessageEvent<{ content: string; markdown: boolean;code?:CodeLanguage }>) => {
  try {
    const { content, markdown,code } = event.data
    // The UTF-8 BOM is part of the preserved source, not Markdown syntax.
    let remaining=65536
    const renderer=new marked.Renderer()
    renderer.code=({text,lang})=>{const rendered=renderMarkdownCode(text,lang||'',remaining);remaining-=rendered.used;return `<pre><code${lang?` class="language-${escapeCode(lang.trim().split(/\s+/)[0]!.slice(0,32))}"`:''}>${rendered.html}</code></pre>\n`}
    const html = markdown ? String(marked.parse(content.replace(/^\uFEFF/, ''), { async: false,renderer })) : code ? renderSourceCode(content,code) : `<pre>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
    self.postMessage(previewWithinBudget(html) ? { html } : { reason: '文稿排版较密集' })
  } catch { self.postMessage({ reason: '暂时无法完成排版' }) }
}
