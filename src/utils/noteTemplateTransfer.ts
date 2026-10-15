import { BUILTIN_NOTE_TEMPLATES, MAX_NOTE_TEMPLATES, MAX_TEMPLATE_BYTES, type NoteTemplate } from '../config/noteTemplates'

export interface PortableNoteTemplate { name: string; content: string }
export interface NoteTemplateBundle { kind: 'longedit-note-templates'; schemaVersion: 1; templates: PortableNoteTemplate[] }
export type TemplateConflictMode = 'keep-both' | 'skip'
export interface TemplateImportEntry extends PortableNoteTemplate { sourceIndex: number; skipped: boolean; renamed: boolean }

export function validateTemplateBundle(value: unknown): NoteTemplateBundle {
  const bundle = value as Partial<NoteTemplateBundle> | null
  if (!bundle || bundle.kind !== 'longedit-note-templates' || bundle.schemaVersion !== 1 || !Array.isArray(bundle.templates)) throw new Error('这不是支持的 Long编辑笔记模板文件')
  if (!bundle.templates.length || bundle.templates.length > MAX_NOTE_TEMPLATES) throw new Error('模板文件需要包含 1–64 个模板')
  const templates = bundle.templates.map(item => {
    if (!item || typeof item.name !== 'string' || typeof item.content !== 'string') throw new Error('模板文件中的名称或正文不完整')
    const name = item.name.trim()
    if (!name || [...name].length > 80 || new TextEncoder().encode(item.content).length > MAX_TEMPLATE_BYTES) throw new Error('模板名称过长、为空或正文超过 256 KiB')
    return { name, content: item.content }
  })
  return { kind: 'longedit-note-templates', schemaVersion: 1, templates }
}

/** Build names before saving; importing never overwrites a local template or its defaults. */
export function planTemplateImport(entries: PortableNoteTemplate[], selected: number[], existing: NoteTemplate[], mode: TemplateConflictMode): TemplateImportEntry[] {
  const names = new Set([...BUILTIN_NOTE_TEMPLATES, ...existing].map(item => item.name.trim().toLocaleLowerCase()))
  const selectedSet = new Set(selected)
  return entries.flatMap<TemplateImportEntry>((item, sourceIndex) => {
    if (!selectedSet.has(sourceIndex)) return []
    const original = item.name.trim(), duplicate = names.has(original.toLocaleLowerCase())
    if (duplicate && mode === 'skip') return [{ ...item, name: original, sourceIndex, skipped: true, renamed: false }]
    let name = original, count = 1
    while (names.has(name.toLocaleLowerCase())) {
      const suffix = ` (${++count})`
      name = [...original].slice(0, 80 - suffix.length).join('') + suffix
    }
    names.add(name.toLocaleLowerCase())
    return [{ name, content: item.content, sourceIndex, skipped: false, renamed: name !== original }]
  })
}
