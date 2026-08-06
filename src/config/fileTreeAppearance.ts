import type { Component } from 'vue'
import {
  Archive,
  Bookmark,
  Braces,
  BriefcaseBusiness,
  CircleAlert,
  CircleCheck,
  Database,
  FileCode2,
  FileCog,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType2,
  Flag,
  Heart,
  Image,
  Lightbulb,
  NotebookText,
  Presentation,
  ScrollText,
  Star,
  Table2,
  Workflow,
} from 'lucide-vue-next'

export type FileMarkerIconId = 'auto' | 'star' | 'flag' | 'bookmark' | 'briefcase' | 'idea' | 'alert' | 'check' | 'heart' | 'archive'

export interface FileDisplayStyle {
  backgroundColor: string
  textColor: string
  icon: FileMarkerIconId
}

export interface FileTreeVisual {
  icon: Component
  color: string
}

export const FILE_MARKER_ICON_OPTIONS: { id: FileMarkerIconId; label: string; icon: Component }[] = [
  { id: 'auto', label: '按文件格式', icon: FileText },
  { id: 'star', label: '重点', icon: Star },
  { id: 'flag', label: '待处理', icon: Flag },
  { id: 'bookmark', label: '书签', icon: Bookmark },
  { id: 'briefcase', label: '工作', icon: BriefcaseBusiness },
  { id: 'idea', label: '灵感', icon: Lightbulb },
  { id: 'alert', label: '注意', icon: CircleAlert },
  { id: 'check', label: '已完成', icon: CircleCheck },
  { id: 'heart', label: '喜爱', icon: Heart },
  { id: 'archive', label: '归档', icon: Archive },
]

const customIconMap = new Map(FILE_MARKER_ICON_OPTIONS.map(option => [option.id, option.icon]))
const visual = (icon: Component, color: string): FileTreeVisual => ({ icon, color })

const FORMAT_VISUALS: Record<string, FileTreeVisual> = {
  markdown: visual(NotebookText, '#d79a16'),
  'plain-text': visual(FileText, '#64748b'),
  log: visual(ScrollText, '#c56b16'),
  env: visual(FileCog, '#64748b'), ini: visual(FileCog, '#64748b'), properties: visual(FileCog, '#64748b'),
  editorconfig: visual(FileCog, '#64748b'), gitignore: visual(FileCog, '#64748b'),
  javascript: visual(FileCode2, '#d4a900'), typescript: visual(FileCode2, '#2878c7'), python: visual(FileCode2, '#2d8a58'),
  rust: visual(FileCode2, '#b45309'), go: visual(FileCode2, '#0891b2'), 'jvm-code': visual(FileCode2, '#dc2626'),
  'c-family': visual(FileCode2, '#6d5bd0'), shell: visual(FileCode2, '#3f8f5f'), 'web-source': visual(FileCode2, '#e05d44'),
  sql: visual(Database, '#7c3aed'), json: visual(FileJson, '#0f9f75'), jsonc: visual(FileJson, '#0f9f75'),
  yaml: visual(Braces, '#c2415d'), xml: visual(Braces, '#2563a8'), toml: visual(Braces, '#9a5b13'),
  svg: visual(Image, '#c0268c'), canvas: visual(Workflow, '#8b5cf6'), drawio: visual(Workflow, '#f97316'),
  diagram: visual(Workflow, '#0e7490'), opml: visual(Workflow, '#4f46a5'), pdf: visual(FileType2, '#dc3c30'),
  table: visual(Table2, '#0891b2'), workbook: visual(FileSpreadsheet, '#16834f'), ods: visual(FileSpreadsheet, '#45a049'),
  'legacy-xls': visual(FileSpreadsheet, '#2f855a'), 'wps-spreadsheet': visual(FileSpreadsheet, '#22a060'),
  docx: visual(FileType2, '#2563c7'), 'legacy-doc': visual(FileType2, '#3b67a8'), 'wps-document': visual(FileType2, '#2563c7'),
  pptx: visual(Presentation, '#df6b25'), odp: visual(Presentation, '#f28c28'), 'legacy-ppt': visual(Presentation, '#c65d25'),
  'wps-presentation': visual(Presentation, '#e4572e'),
}

export const resolveFileTreeVisual = (formatId?: string, markerIcon: FileMarkerIconId = 'auto'): FileTreeVisual => {
  const formatVisual = formatId ? FORMAT_VISUALS[formatId] : undefined
  if (markerIcon !== 'auto') return visual(customIconMap.get(markerIcon) || FileText, formatVisual?.color || '#64748b')
  return formatVisual || visual(FileText, '#64748b')
}
