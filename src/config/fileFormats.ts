import registrySource from '../../shared/file-formats.json'

export type CapabilityLevel = 'supported' | 'planned' | 'unsupported'
export type ExternalFilePolicy = 'none' | 'import' | 'edit'
export type EditorRouteName = 'LibraryMode' | 'TextEditor' | 'JsonEditor' | 'YamlEditor' | 'XmlEditor' | 'DrawioEditor' | 'TomlEditor' | 'LogViewer' | 'DocxEditor' | 'OdtReader' | 'OdfReader' | 'PptxReader' | 'ExternalOffice' | 'LegacyOffice' | 'Canvas' | 'Pdf' | 'Table' | 'Workbook' | 'Diagram' | 'MindMap'
export type UserCapabilityLevel = 'complete-edit' | 'basic-edit' | 'read-annotate' | 'preview-only' | 'external-open' | 'unsupported'
export type SaveMode = 'overwrite' | 'bounded-overwrite' | 'sidecar' | 'copy' | 'none'

export interface FileFormatCapabilities {
  read: CapabilityLevel
  edit: CapabilityLevel
  create: CapabilityLevel
  index: CapabilityLevel
}

export interface FileFormatAdapters {
  reader: string | null
  writer: string | null
  creator: string | null
  indexer: string | null
}

export interface FileFormatCreation {
  defaultExtension: string
  defaultContent: string | null
  defaultName: string
}

export interface FileFormatUserCapability {
  level: UserCapabilityLevel
  label: string
  saveMode: SaveMode
  description: string
}

export interface FileFormatDefinition {
  id: string
  label: string
  extensions: readonly string[]
  mimeTypes: readonly string[]
  routeName: EditorRouteName
  maxBytes: number
  capabilities: FileFormatCapabilities
  userCapability: FileFormatUserCapability
  externalPolicy: ExternalFilePolicy
  adapters: FileFormatAdapters
  creation: FileFormatCreation | null
}

interface FileFormatRegistry { schemaVersion: number; formats: FileFormatDefinition[] }

const registry = registrySource as FileFormatRegistry
const supported = (level: CapabilityLevel) => level === 'supported'
const userCapabilityLevels = new Set<UserCapabilityLevel>(['complete-edit', 'basic-edit', 'read-annotate', 'preview-only', 'external-open', 'unsupported'])
const saveModes = new Set<SaveMode>(['overwrite', 'bounded-overwrite', 'sidecar', 'copy', 'none'])

const validateRegistry = () => {
  if (registry.schemaVersion !== 2) throw new Error(`Unsupported file format registry schema ${registry.schemaVersion}`)
  const ids = new Set<string>()
  const extensions = new Set<string>()
  for (const format of registry.formats) {
    if (ids.has(format.id)) throw new Error(`Duplicate file format id ${format.id}`)
    ids.add(format.id)
    if (!format.extensions.length || !format.routeName || format.maxBytes <= 0 || !format.userCapability) throw new Error(`Incomplete file format ${format.id}`)
    if (!userCapabilityLevels.has(format.userCapability.level) || !saveModes.has(format.userCapability.saveMode) || !format.userCapability.label) {
      throw new Error(`Invalid user capability contract ${format.id}`)
    }
    for (const extension of format.extensions) {
      if (!extension.startsWith('.') || extension !== extension.toLowerCase()) throw new Error(`Invalid extension ${extension}`)
      if (extensions.has(extension)) throw new Error(`Duplicate extension ${extension}`)
      extensions.add(extension)
    }
    if (supported(format.capabilities.edit) !== Boolean(format.adapters.writer)) throw new Error(`Invalid edit contract ${format.id}`)
    if (supported(format.capabilities.create) !== Boolean(format.creation && format.adapters.creator)) throw new Error(`Invalid creation contract ${format.id}`)
    if (supported(format.capabilities.index) !== Boolean(format.adapters.indexer)) throw new Error(`Invalid index contract ${format.id}`)
  }
}

validateRegistry()

export const FILE_FORMAT_SCHEMA_VERSION = registry.schemaVersion
export const FILE_FORMATS: readonly FileFormatDefinition[] = Object.freeze(registry.formats)
export const LIBRARY_EMBEDDED_EDITOR_ROUTES: readonly EditorRouteName[] = Object.freeze([
  'TextEditor',
  'JsonEditor',
  'YamlEditor',
  'XmlEditor',
  'DrawioEditor',
  'TomlEditor',
  'LogViewer',
  'DocxEditor',
  'OdtReader',
  'OdfReader',
  'PptxReader',
  'ExternalOffice',
  'LegacyOffice',
])
const libraryEmbeddedEditorRoutes = new Set<EditorRouteName>(LIBRARY_EMBEDDED_EDITOR_ROUTES)

export const isLibraryEmbeddedEditorRoute = (routeName: EditorRouteName) => libraryEmbeddedEditorRoutes.has(routeName)
export const opensInLibraryShell = (format: FileFormatDefinition | undefined) => Boolean(
  format && (format.routeName === 'LibraryMode' || isLibraryEmbeddedEditorRoute(format.routeName)),
)
export const SORTED_FILE_FORMATS: readonly FileFormatDefinition[] = Object.freeze(
  [...registry.formats].sort((left, right) => {
    const leftLongest = Math.max(...left.extensions.map(extension => extension.length))
    const rightLongest = Math.max(...right.extensions.map(extension => extension.length))
    return rightLongest - leftLongest || left.id.localeCompare(right.id)
  }),
)
export const CREATABLE_FILE_FORMATS = FILE_FORMATS.filter(format => supported(format.capabilities.create))

export const findFileFormat = (path: string) => {
  const lowerPath = path.toLowerCase()
  return SORTED_FILE_FORMATS.find(format => format.extensions.some(extension => lowerPath.endsWith(extension)))
}

export const findFileFormatById = (id: string) => FILE_FORMATS.find(format => format.id === id)
export const isExternallyEditable = (path: string) => findFileFormat(path)?.externalPolicy === 'edit'
export const isFormatCapabilitySupported = (format: FileFormatDefinition, capability: keyof FileFormatCapabilities) => supported(format.capabilities[capability])

export const knownFileExtension = (path: string) => {
  const lowerPath = path.toLowerCase()
  return FILE_FORMATS.flatMap(format => format.extensions)
    .sort((left, right) => right.length - left.length)
    .find(extension => lowerPath.endsWith(extension)) || ''
}

export const fileDisplayName = (path: string) => {
  const name = path.split(/[\\/]/).pop() || path
  const extension = knownFileExtension(name)
  return extension ? name.slice(0, -extension.length) : name
}

export const routeForFile = (path: string) => {
  const format = findFileFormat(path)
  return format ? { name: format.routeName, query: { path } } : null
}
