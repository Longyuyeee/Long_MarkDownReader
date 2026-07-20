export type FileFormatId = 'markdown' | 'canvas' | 'pdf' | 'table' | 'workbook' | 'diagram'
export type EditorRouteName = 'LibraryMode' | 'Canvas' | 'Pdf' | 'Table' | 'Workbook' | 'Diagram'

export interface FileFormatDefinition {
  id: FileFormatId
  label: string
  extensions: readonly string[]
  routeName: EditorRouteName
  readable: boolean
  editable: boolean
  creatable: boolean
  indexable: boolean
  externallyEditable: boolean
  matches: (path: string) => boolean
}

const extensionMatcher = (...extensions: string[]) => {
  const normalized = extensions.map(extension => extension.toLowerCase())
  return (path: string) => normalized.some(extension => path.toLowerCase().endsWith(extension))
}

export const FILE_FORMATS: readonly FileFormatDefinition[] = [
  { id: 'markdown', label: 'Markdown', extensions: ['.md'], routeName: 'LibraryMode', readable: true, editable: true, creatable: true, indexable: true, externallyEditable: true, matches: extensionMatcher('.md') },
  { id: 'canvas', label: 'JSON Canvas', extensions: ['.canvas'], routeName: 'Canvas', readable: true, editable: true, creatable: true, indexable: true, externallyEditable: false, matches: extensionMatcher('.canvas') },
  { id: 'pdf', label: 'PDF', extensions: ['.pdf'], routeName: 'Pdf', readable: true, editable: false, creatable: false, indexable: true, externallyEditable: false, matches: extensionMatcher('.pdf') },
  { id: 'table', label: 'Data table', extensions: ['.table.json', '.csv', '.tsv'], routeName: 'Table', readable: true, editable: true, creatable: true, indexable: true, externallyEditable: false, matches: extensionMatcher('.table.json', '.csv', '.tsv') },
  { id: 'workbook', label: 'Excel workbook', extensions: ['.xlsx'], routeName: 'Workbook', readable: true, editable: false, creatable: false, indexable: true, externallyEditable: false, matches: extensionMatcher('.xlsx') },
  { id: 'diagram', label: 'Mermaid diagram', extensions: ['.mmd', '.mermaid'], routeName: 'Diagram', readable: true, editable: true, creatable: true, indexable: true, externallyEditable: false, matches: extensionMatcher('.mmd', '.mermaid') },
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
