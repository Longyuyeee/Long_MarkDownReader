// Keep the sidebar's draft labels aligned with commands/search.rs.
const tagPattern = /(?:^|\s)#([^\s#`\[\](){}.,;:!?，。；：！？、"'<>]+)/g
const validTag = /^[^\s#`\[\](){}.,;:!?，。；：！？、"'<>]+$/

export function inlineTags(content: string): string[] {
  return [...new Set([...content.matchAll(tagPattern)].map(match => match[1]))]
}

export function normalizeInlineTag(input: string): string {
  const tag = input.trim().replace(/^#+/, '')
  if (!tag || !validTag.test(tag)) throw new Error('请填写一个标签名，不要包含空格或句子标点。')
  return tag
}

export function appendInlineTag(content: string, input: string): string {
  const tag = normalizeInlineTag(input)
  if (inlineTags(content).includes(tag)) throw new Error(`当前笔记已经有 #${tag}。`)
  return `${content}${content ? content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n' : ''}#${tag}\n`
}
