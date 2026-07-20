export type FileFormatId = 'markdown' | 'canvas' | 'pdf' | 'table' | 'workbook' | 'diagram'
export type EditorRouteName = 'LibraryMode' | 'Canvas' | 'Pdf' | 'Table' | 'Workbook' | 'Diagram'

export interface FileFormatDefinition {
  id: FileFormatId
  label: string
  extensions: readonly string[]
  routeName: EditorRouteName
  externallyEditable: boolean
  matches: (path: string) => boolean
}

const extensionMatcher = (...extensions: string[]) => {
  const normalized = extensions.map(extension => extension.toLowerCase())
  return (path: string) => normalized.some(extension => path.toLowerCase().endsWith(extension))
}

export const FILE_FORMATS: readonly FileFormatDefinition[] = [
  { id: 'markdown', label: 'Markdown', extensions: ['.md'], routeName: 'LibraryMode', externallyEditable: true, matches: extensionMatcher('.md') },
  { id: 'canvas', label: 'JSON Canvas', extensions: ['.canvas'], routeName: 'Canvas', externallyEditable: false, matches: extensionMatcher('.canvas') },
  { id: 'pdf', label: 'PDF', extensions: ['.pdf'], routeName: 'Pdf', externallyEditable: false, matches: extensionMatcher('.pdf') },
  { id: 'table', label: 'Data table', extensions: ['.table.json', '.csv', '.tsv'], routeName: 'Table', externallyEditable: false, matches: extensionMatcher('.table.json', '.csv', '.tsv') },
  { id: 'workbook', label: 'Excel workbook', extensions: ['.xlsx'], routeName: 'Workbook', externallyEditable: false, matches: extensionMatcher('.xlsx') },
  { id: 'diagram', label: 'Mermaid diagram', extensions: ['.mmd', '.mermaid'], routeName: 'Diagram', externallyEditable: false, matches: extensionMatcher('.mmd', '.mermaid') },
]

export const findFileFormat = (path: string) => FILE_FORMATS.find(format => format.matches(path))

export const isExternallyEditable = (path: string) => findFileFormat(path)?.externallyEditable === true

export const knownFileExtension = (path: string) => {
  const lowerPath = path.toLowerCase()
  return FILE_FORMATS
    .flatMap(format => format.extensions)
    .sort((left, right) => right.length - left.length)
    .find(extension => lowerPath.endsWith(extension)) || ''
}
