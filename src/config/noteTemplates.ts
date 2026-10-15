/** Shared Markdown templates for library creation and quick capture. */
export const NOTE_TEMPLATES: Record<string, string> = {
  '空白笔记': '',
  '会议纪要': `# 会议纪要\n\n**日期**：\n**参会人**：\n**主题**：\n\n## 讨论内容\n\n\n## 决议事项\n\n- \n\n## 待办事项\n\n- [ ] \n`,
  '周报': `# 周报\n\n**周期**：\n\n## 本周完成\n\n- \n\n## 下周计划\n\n- \n\n## 遇到的问题\n\n`,
  '读书笔记': `# 读书笔记\n\n**书名**：\n**作者**：\n\n## 核心观点\n\n\n## 摘录\n\n> \n\n## 个人感悟\n\n`,
}

export interface NoteTemplate {
  id: string
  name: string
  content: string
}

export const BLANK_NOTE_TEMPLATE = 'builtin:blank'
export const BUILTIN_NOTE_TEMPLATES: NoteTemplate[] = Object.entries(NOTE_TEMPLATES).map(([name, content], index) => ({
  id: index === 0 ? BLANK_NOTE_TEMPLATE : `builtin:${index}`,
  name,
  content,
}))
export const MAX_NOTE_TEMPLATES = 64
export const MAX_TEMPLATE_BYTES = 256 * 1024

/** Replacements are not expanded recursively; unrecognized variables stay literal. */
export function renderNoteTemplate(content: string, title: string, now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const values = {
    title,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
  return content.replace(/\{\{\s*(title|date|time)\s*\}\}/g, (_, key: keyof typeof values) => values[key])
}

export function validateNoteTemplate(template: NoteTemplate, others: NoteTemplate[]) {
  const name = template.name.trim()
  if (!name || [...name].length > 80) throw new Error('模板名称需要 1–80 个字')
  if (others.some(item => item.id !== template.id && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('已有同名模板，请换一个名称')
  if (new TextEncoder().encode(template.content).length > MAX_TEMPLATE_BYTES) throw new Error('模板正文不能超过 256 KiB')
  return { ...template, name }
}
